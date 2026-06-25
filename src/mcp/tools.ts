import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api } from "#/server/convex/_generated/api";
import {
  authenticateAgent,
  getConvex,
  McpError,
  requireScope,
  touchLastUsed,
} from "./lib/convex";
import { hasScope, resolveExpirationMs } from "./lib/crypto";

const DEFAULT_MAX_TRANSFER = Number(
  process.env.MCP_MAX_TRANSFER_BYTES ?? 26_214_400,
);

const LIST_PAGE_SIZE = 50;

export function registerTools(server: McpServer) {
  server.tool(
    "list_files",
    "List files owned by the agent's user, paginated.",
    {
      status: z
        .enum(["pending", "active", "deleted"])
        .optional()
        .describe("Filter by status (default: active and pending)"),
      cursor: z
        .string()
        .nullable()
        .optional()
        .describe("Opaque cursor from a previous call"),
    },
    async (args) => {
      const apiKey = serverContext(server).apiKey;
      const agent = await authenticateAgent(apiKey);
      if (!agent) throw new McpError("AGENT_NOT_AUTHORIZED");
      requireScope(agent, "files:read");
      const convex = getConvex();
      const result = await convex.query(api.mcpFiles.listForAgent, {
        apiKey,
        status: args.status,
        limit: LIST_PAGE_SIZE,
        cursor: args.cursor ?? null,
      });
      touchLastUsed(agent.agentId);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "get_file_metadata",
    "Return filename, mime, size, status, expiresAt for a file.",
    {
      fileId: z.string().describe("Convex file id"),
    },
    async (args) => {
      const apiKey = serverContext(server).apiKey;
      const agent = await authenticateAgent(apiKey);
      if (!agent) throw new McpError("AGENT_NOT_AUTHORIZED");
      requireScope(agent, "files:read");
      const file = await getConvex().query(api.mcpFiles.getForAgent, {
        apiKey,
        fileId: args.fileId as never,
      });
      if (!file) throw new McpError("NOT_FOUND");
      touchLastUsed(agent.agentId);
      return {
        content: [{ type: "text", text: JSON.stringify(file, null, 2) }],
      };
    },
  );

  server.tool(
    "request_download_url",
    "Get a presigned GET URL for a file. Returns CONSENT_REQUIRED if over the MCP size limit and no grantToken is provided, or if a grantToken is invalid/expired.",
    {
      fileId: z.string().describe("Convex file id"),
      grantToken: z
        .string()
        .optional()
        .describe("Single-use grant token from a prior approval"),
    },
    async (args) => {
      const apiKey = serverContext(server).apiKey;
      const agent = await authenticateAgent(apiKey);
      if (!agent) throw new McpError("AGENT_NOT_AUTHORIZED");
      requireScope(agent, "files:read");
      const convex = getConvex();
      const file = await convex.query(api.mcpFiles.getForAgent, {
        apiKey,
        fileId: args.fileId as never,
      });
      if (!file || file.status === "deleted")
        throw new McpError("NOT_FOUND");
      const maxBytes = await getMcpMaxBytes(convex, agent.ownerId);
      if (file.size > maxBytes) {
        if (!args.grantToken) {
          const { consentRequestId } = await convex.mutation(
            api.mcpConsent.createForAgent,
            {
              apiKey,
              fileId: args.fileId as never,
              action: "download",
              size: file.size,
            },
          );
          const out = {
            error: "CONSENT_REQUIRED" as const,
            consentRequestId,
            message: `File is ${file.size} bytes, over the ${maxBytes}-byte MCP limit. Ask the user to approve from their dashboard, then retry with the grantToken they get back.`,
          };
          return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
        }
        const consentRequestId = args.grantToken.split(":")[0]!;
        const grant = await convex.mutation(api.mcpConsent.consumeGrant, {
          apiKey,
          consentRequestId: consentRequestId as never,
          grantToken: args.grantToken,
          fileId: args.fileId as never,
          action: "download",
        });
        if (!grant.ok) {
          throw new McpError(
            "INVALID_OR_EXPIRED_GRANT",
            `Grant token rejected: ${grant.reason}`,
          );
        }
      }
      const url = await convex.action(api.s3Actions.getDownloadUrlForFile, {
        fileId: args.fileId as never,
      });
      await convex.mutation(api.mcpAudit.logAgentAction, {
        apiKey,
        action: "agent.download",
        fileId: args.fileId as never,
      });
      touchLastUsed(agent.agentId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                url,
                filename: file.filename,
                mimeType: file.mimeType,
                size: file.size,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "request_upload_url",
    "Get a presigned PUT URL for uploading a new file. Same size gate as download.",
    {
      filename: z.string().min(1).describe("Original filename"),
      mimeType: z.string().min(1).describe("MIME type, e.g. application/json"),
      size: z.number().int().positive().describe("Declared size in bytes"),
      expiresIn: z
        .enum(["3d", "1w", "1m", "2m", "3m"])
        .optional()
        .describe("How long until the file expires"),
      grantToken: z
        .string()
        .optional()
        .describe("Single-use grant token if the declared size is over the MCP limit"),
    },
    async (args) => {
      const apiKey = serverContext(server).apiKey;
      const agent = await authenticateAgent(apiKey);
      if (!agent) throw new McpError("AGENT_NOT_AUTHORIZED");
      requireScope(agent, "files:write");
      const convex = getConvex();
      const maxBytes = await getMcpMaxBytes(convex, agent.ownerId);
      if (args.size > maxBytes) {
        if (!args.grantToken) {
          const { consentRequestId } = await convex.mutation(
            api.mcpConsent.createForAgent,
            {
              apiKey,
              fileId: undefined,
              action: "upload",
              size: args.size,
            },
          );
          const out = {
            error: "CONSENT_REQUIRED" as const,
            consentRequestId,
            message: `Declared size ${args.size} bytes is over the ${maxBytes}-byte MCP limit. Ask the user to approve from their dashboard, then retry with the grantToken.`,
          };
          return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
        }
        const consentRequestId = args.grantToken.split(":")[0]!;
        const grant = await convex.mutation(api.mcpConsent.consumeGrant, {
          apiKey,
          consentRequestId: consentRequestId as never,
          grantToken: args.grantToken,
          fileId: undefined,
          action: "upload",
        });
        if (!grant.ok) {
          throw new McpError(
            "INVALID_OR_EXPIRED_GRANT",
            `Grant token rejected: ${grant.reason}`,
          );
        }
      }
      const expiresAt = args.expiresIn
        ? Date.now() + resolveExpirationMs(args.expiresIn)!
        : undefined;
      const { fileId, s3Key } = await convex.mutation(
        api.mcpFiles.createPendingForAgent,
        {
          apiKey,
          filename: args.filename,
          mimeType: args.mimeType,
          size: args.size,
          expiresAt,
        },
      );
      const url = await convex.action(api.s3Actions.getUploadUrlForKey, {
        key: s3Key,
        contentType: args.mimeType,
      });
      touchLastUsed(agent.agentId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ fileId, url, s3Key }, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "confirm_upload",
    "Server-side HEAD on S3 verifies actual size, then flips file to active. Call after PUT bytes.",
    {
      fileId: z.string().describe("Convex file id returned from request_upload_url"),
    },
    async (args) => {
      const apiKey = serverContext(server).apiKey;
      const agent = await authenticateAgent(apiKey);
      if (!agent) throw new McpError("AGENT_NOT_AUTHORIZED");
      requireScope(agent, "files:write");
      const convex = getConvex();
      const result = await convex.action(api.mcpFiles.confirmUploadForAgent, {
        apiKey,
        fileId: args.fileId as never,
      });
      if (!result.ok) {
        if (result.reason === "NOT_FOUND")
          throw new McpError("NOT_FOUND");
        throw new McpError("INTERNAL", result.reason);
      }
      touchLastUsed(agent.agentId);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "list_mentions",
    "Return unconsumed mentions for this agent, marking them consumed.",
    {
      since: z
        .number()
        .int()
        .optional()
        .describe("Only mentions created at or after this ms timestamp"),
    },
    async (args) => {
      const apiKey = serverContext(server).apiKey;
      const agent = await authenticateAgent(apiKey);
      if (!agent) throw new McpError("AGENT_NOT_AUTHORIZED");
      requireScope(agent, "mentions:read");
      const mentions = await getConvex().mutation(api.mcpMentions.listForAgent, {
        apiKey,
        since: args.since,
      });
      touchLastUsed(agent.agentId);
      return {
        content: [{ type: "text", text: JSON.stringify(mentions, null, 2) }],
      };
    },
  );

  server.tool(
    "check_consent_status",
    "Poll whether the user has approved a consent request yet.",
    {
      consentRequestId: z.string().describe("Convex consentRequests id"),
    },
    async (args) => {
      const apiKey = serverContext(server).apiKey;
      const agent = await authenticateAgent(apiKey);
      if (!agent) throw new McpError("AGENT_NOT_AUTHORIZED");
      const status = await getConvex().query(api.mcpConsent.checkStatus, {
        consentRequestId: args.consentRequestId as never,
      });
      if (!status) throw new McpError("NOT_FOUND");
      touchLastUsed(agent.agentId);
      return {
        content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
      };
    },
  );
}

async function getMcpMaxBytes(
  convex: ReturnType<typeof getConvex>,
  ownerId: string,
): Promise<number> {
  const settings = await convex.query(api.mcpUserSettings.get, { ownerId });
  return settings?.mcpMaxTransferBytes ?? DEFAULT_MAX_TRANSFER;
}

type Ctx = { apiKey: string };
const _ctxStore = new WeakMap<object, Ctx>();
export function setServerContext(server: McpServer, ctx: Ctx) {
  _ctxStore.set(server as unknown as object, ctx);
}
function serverContext(server: McpServer): Ctx {
  const ctx = _ctxStore.get(server as unknown as object);
  if (!ctx) throw new Error("Server context not set");
  return ctx;
}

void hasScope;
