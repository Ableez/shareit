import {
  action,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  newS3Key,
  extractAgentIdAndSecret,
  hashApiKey,
  safeEqualHash,
} from "./lib/crypto";

type DbCtx = QueryCtx | MutationCtx;

async function agentFromApiKey(
  ctx: DbCtx,
  apiKey: string,
  requireScope?: string,
): Promise<Doc<"agents"> | null> {
  const parsed = extractAgentIdAndSecret(apiKey);
  if (!parsed) return null;
  const presentedHash = hashApiKey(parsed.rawSecret);
  const agent = await ctx.db
    .query("agents")
    .withIndex("by_key_hash", (q) => q.eq("apiKeyHash", presentedHash))
    .unique();
  if (!agent) return null;
  if (agent._id !== parsed.agentId) return null;
  if (agent.revokedAt) return null;
  if (!safeEqualHash(agent.apiKeyHash, presentedHash)) return null;
  if (requireScope && !agent.scopes.includes(requireScope)) return null;
  return agent;
}

export const listForAgent = query({
  args: {
    apiKey: v.string(),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("active"),
        v.literal("deleted"),
      ),
    ),
    limit: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const agent = await agentFromApiKey(ctx, args.apiKey, "files:read");
    if (!agent) return { page: [], isDone: true, continueCursor: null };
    const results = await ctx.db
      .query("files")
      .withIndex("by_owner", (q) => q.eq("ownerId", agent.ownerId))
      .order("desc")
      .paginate({
        numItems: args.limit,
        cursor: args.cursor,
      });
    const filtered = args.status
      ? results.page.filter((f) => f.status === args.status)
      : results.page.filter((f) => f.status !== "deleted");
    return {
      page: filtered,
      isDone: results.isDone,
      continueCursor: results.continueCursor,
    };
  },
});

export const getForAgent = query({
  args: { apiKey: v.string(), fileId: v.id("files") },
  handler: async (ctx, args) => {
    const agent = await agentFromApiKey(ctx, args.apiKey, "files:read");
    if (!agent) return null;
    const file = await ctx.db.get(args.fileId);
    if (!file || file.ownerId !== agent.ownerId || file.status === "deleted")
      return null;
    return file;
  },
});

export const createPendingForAgent = mutation({
  args: {
    apiKey: v.string(),
    filename: v.string(),
    mimeType: v.string(),
    size: v.number(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const agent = await agentFromApiKey(ctx, args.apiKey, "files:write");
    if (!agent) throw new Error("AGENT_NOT_AUTHORIZED");
    const fileId: Id<"files"> = await ctx.db.insert("files", {
      ownerId: agent.ownerId,
      s3Key: "pending",
      filename: args.filename,
      mimeType: args.mimeType,
      size: args.size,
      status: "pending",
      uploadedBy: "agent",
      agentId: agent._id,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });
    const s3Key = newS3Key(agent.ownerId, fileId, args.filename);
    await ctx.db.patch(fileId, { s3Key });
    await ctx.runMutation(internal.audit.log, {
      ownerId: agent.ownerId,
      agentId: agent._id,
      action: "agent.upload.requested",
      fileId,
      meta: { size: args.size, mimeType: args.mimeType },
    });
    return { fileId, s3Key };
  },
});

export const confirmUploadForAgent = action({
  args: { apiKey: v.string(), fileId: v.id("files") },
  handler: async (ctx, args): Promise<
    | { ok: true; alreadyActive?: boolean }
    | { ok: false; reason: "UNAUTHORIZED" | "NOT_FOUND" | "BAD_STATE" | "MISSING_IN_S3" | "SIZE_MISMATCH" }
  > => {
    const agent = await ctx.runQuery(internal.agentLookup.byApiKey, {
      apiKey: args.apiKey,
      requireScope: "files:write",
    });
    if (!agent) return { ok: false, reason: "UNAUTHORIZED" };
    const file = await ctx.runQuery(internal.s3Helpers.getFileInternal, {
      fileId: args.fileId,
    });
    if (!file || file.ownerId !== agent.ownerId) {
      return { ok: false, reason: "NOT_FOUND" };
    }
    if (file.status === "active") {
      return { ok: true, alreadyActive: true };
    }
    if (file.status !== "pending") {
      return { ok: false, reason: "BAD_STATE" };
    }
    const head = await ctx.runAction(internal.s3Actions.headObject, {
      key: file.s3Key,
    });
    if (!head.exists) return { ok: false, reason: "MISSING_IN_S3" };
    if (head.size !== file.size) {
      return { ok: false, reason: "SIZE_MISMATCH" };
    }
    await ctx.runMutation(internal.filesHelpers.markActive, {
      fileId: args.fileId,
    });
    await ctx.runMutation(internal.audit.log, {
      ownerId: agent.ownerId,
      agentId: agent.agentId,
      action: "agent.upload.confirmed",
      fileId: args.fileId,
    });
    return { ok: true };
  },
});
