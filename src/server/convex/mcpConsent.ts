import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  safeEqualHash,
  hashGrantRaw,
  parseGrantToken,
} from "./lib/crypto";

const REQUEST_TTL_MS = 30 * 60 * 1000;

export const createForAgent = mutation({
  args: {
    apiKey: v.string(),
    fileId: v.optional(v.id("files")),
    action: v.union(v.literal("upload"), v.literal("download")),
    size: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ consentRequestId: Id<"consentRequests"> }> => {
    const agent: { agentId: Id<"agents">; ownerId: string; name: string } | null =
      await ctx.runQuery(internal.agentLookup.byApiKey, {
        apiKey: args.apiKey,
        requireScope: args.action === "upload" ? "files:write" : "files:read",
      });
    if (!agent) throw new Error("AGENT_NOT_AUTHORIZED");
    const requestId: Id<"consentRequests"> = await ctx.db.insert(
      "consentRequests",
      {
        ownerId: agent.ownerId,
        agentId: agent.agentId,
        fileId: args.fileId,
        action: args.action,
        size: args.size,
        status: "pending",
        createdAt: Date.now(),
        expiresAt: Date.now() + REQUEST_TTL_MS,
      },
    );
    const filename = args.fileId
      ? (await ctx.db.get(args.fileId))?.filename ?? "(unknown file)"
      : args.action === "upload"
        ? "(new upload)"
        : "(unknown file)";
    await ctx.scheduler.runAfter(0, internal.email.sendConsentRequested, {
      ownerId: agent.ownerId,
      agentName: agent.name,
      action: args.action,
      filename,
      size: args.size,
      consentRequestId: requestId,
    });
    await ctx.runMutation(internal.audit.log, {
      ownerId: agent.ownerId,
      agentId: agent.agentId,
      action: `agent.consent.requested.${args.action}`,
      fileId: args.fileId,
      meta: { consentRequestId: requestId, size: args.size },
    });
    return { consentRequestId: requestId };
  },
});

export const consumeGrant = mutation({
  args: {
    apiKey: v.string(),
    consentRequestId: v.id("consentRequests"),
    grantToken: v.string(),
    fileId: v.optional(v.id("files")),
    action: v.union(v.literal("upload"), v.literal("download")),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.runQuery(internal.agentLookup.byApiKey, {
      apiKey: args.apiKey,
      requireScope: args.action === "upload" ? "files:write" : "files:read",
    });
    if (!agent) return { ok: false as const, reason: "UNAUTHORIZED" as const };
    const req = await ctx.db.get(args.consentRequestId);
    if (!req) return { ok: false as const, reason: "NOT_FOUND" as const };
    if (req.ownerId !== agent.ownerId)
      return { ok: false as const, reason: "UNAUTHORIZED" as const };
    if (req.status === "consumed")
      return { ok: false as const, reason: "ALREADY_CONSUMED" as const };
    if (req.status === "expired")
      return { ok: false as const, reason: "EXPIRED" as const };
    if (req.status !== "approved")
      return { ok: false as const, reason: "NOT_APPROVED" as const };
    if (req.grantExpiresAt && req.grantExpiresAt < Date.now()) {
      await ctx.db.patch(args.consentRequestId, { status: "expired" });
      return { ok: false as const, reason: "EXPIRED" as const };
    }
    if (req.fileId !== args.fileId || req.action !== args.action) {
      return { ok: false as const, reason: "MISMATCH" as const };
    }
    const parsed = parseGrantToken(args.grantToken);
    if (!parsed || parsed.consentRequestId !== args.consentRequestId) {
      return { ok: false as const, reason: "INVALID" as const };
    }
    if (!req.grantTokenHash) {
      return { ok: false as const, reason: "INVALID" as const };
    }
    if (!safeEqualHash(req.grantTokenHash, hashGrantRaw(parsed.raw))) {
      return { ok: false as const, reason: "INVALID" as const };
    }
    await ctx.db.patch(args.consentRequestId, { status: "consumed" });
    await ctx.runMutation(internal.audit.log, {
      ownerId: req.ownerId,
      agentId: req.agentId,
      action: `agent.consent.consumed.${args.action}`,
      fileId: req.fileId,
      meta: { consentRequestId: args.consentRequestId },
    });
    return { ok: true as const };
  },
});

export const checkStatus = query({
  args: { consentRequestId: v.id("consentRequests") },
  handler: async (ctx, args) => {
    const req = await ctx.db.get(args.consentRequestId);
    if (!req) return null;
    return {
      consentRequestId: req._id,
      status: req.status,
      isExpired:
        req.status === "approved" &&
        !!req.grantExpiresAt &&
        req.grantExpiresAt < Date.now(),
    };
  },
});
