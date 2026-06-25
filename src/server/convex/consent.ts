import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  hashGrantRaw,
  mintGrantToken,
  parseGrantToken,
  safeEqualHash,
} from "./lib/crypto";
import { requireUserId } from "./lib/auth";

const GRANT_TTL_MS = 5 * 60 * 1000;
const REQUEST_TTL_MS = 30 * 60 * 1000;

export const create = mutation({
  args: {
    agentId: v.id("agents"),
    fileId: v.optional(v.id("files")),
    action: v.union(v.literal("upload"), v.literal("download")),
    size: v.number(),
    apiKey: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ consentRequestId: import("./_generated/dataModel").Id<"consentRequests"> }> => {
    const agent = await ctx.runQuery(internal.agentsCore.resolveForCall, {
      agentId: args.agentId,
      apiKey: args.apiKey,
      requireScope: args.action === "upload" ? "files:write" : "files:read",
    });
    if (!agent) throw new Error("AGENT_NOT_AUTHORIZED");
    const requestId: import("./_generated/dataModel").Id<"consentRequests"> =
      await ctx.db.insert("consentRequests", {
        ownerId: agent.ownerId,
        agentId: args.agentId,
        fileId: args.fileId,
        action: args.action,
        size: args.size,
        status: "pending",
        createdAt: Date.now(),
        expiresAt: Date.now() + REQUEST_TTL_MS,
      });
    const agentName = await ctx.runQuery(internal.s3Helpers.getAgentName, {
      agentId: args.agentId,
    });
    const filename = args.fileId
      ? await ctx.runQuery(internal.s3Helpers.getFilename, {
          fileId: args.fileId,
        })
      : args.action === "upload"
        ? "(new upload)"
        : "(unknown file)";
    await ctx.scheduler.runAfter(0, internal.email.sendConsentRequested, {
      ownerId: agent.ownerId,
      agentName,
      action: args.action,
      filename,
      size: args.size,
      consentRequestId: requestId,
    });
    await ctx.runMutation(internal.audit.log, {
      ownerId: agent.ownerId,
      agentId: args.agentId,
      action: `agent.consent.requested.${args.action}`,
      fileId: args.fileId,
      meta: { consentRequestId: requestId, size: args.size },
    });
    return { consentRequestId: requestId };
  },
});

export const get = query({
  args: { consentRequestId: v.id("consentRequests") },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const req = await ctx.db.get(args.consentRequestId);
    if (!req || req.ownerId !== ownerId) return null;
    return req;
  },
});

export const listPending = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    return await ctx.db
      .query("consentRequests")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", ownerId).eq("status", "pending"),
      )
      .order("desc")
      .take(50);
  },
});

export const approve = mutation({
  args: { consentRequestId: v.id("consentRequests") },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const req = await ctx.db.get(args.consentRequestId);
    if (!req || req.ownerId !== ownerId) throw new Error("NOT_FOUND");
    if (req.status !== "pending") throw new Error("ALREADY_RESOLVED");
    if (req.expiresAt < Date.now()) {
      await ctx.db.patch(args.consentRequestId, { status: "expired" });
      throw new Error("EXPIRED");
    }
    const { token, hash } = mintGrantToken(args.consentRequestId);
    await ctx.db.patch(args.consentRequestId, {
      status: "approved",
      grantTokenHash: hash,
      grantExpiresAt: Date.now() + GRANT_TTL_MS,
    });
    await ctx.scheduler.runAfter(0, internal.email.sendConsentDecided, {
      ownerId,
      agentId: req.agentId,
      action: req.action,
      filename:
        (req.fileId
          ? (await ctx.db.get(req.fileId))?.filename
          : "(new upload)") ?? "(unknown file)",
      decision: "approved",
    });
    await ctx.runMutation(internal.audit.log, {
      ownerId,
      agentId: req.agentId,
      action: `consent.approved.${req.action}`,
      fileId: req.fileId,
      meta: { consentRequestId: args.consentRequestId },
    });
    return { grantToken: token };
  },
});

export const deny = mutation({
  args: { consentRequestId: v.id("consentRequests") },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const req = await ctx.db.get(args.consentRequestId);
    if (!req || req.ownerId !== ownerId) throw new Error("NOT_FOUND");
    if (req.status !== "pending") throw new Error("ALREADY_RESOLVED");
    await ctx.db.patch(args.consentRequestId, { status: "denied" });
    await ctx.scheduler.runAfter(0, internal.email.sendConsentDecided, {
      ownerId,
      agentId: req.agentId,
      action: req.action,
      filename:
        (req.fileId
          ? (await ctx.db.get(req.fileId))?.filename
          : "(new upload)") ?? "(unknown file)",
      decision: "denied",
    });
    await ctx.runMutation(internal.audit.log, {
      ownerId,
      agentId: req.agentId,
      action: `consent.denied.${req.action}`,
      fileId: req.fileId,
      meta: { consentRequestId: args.consentRequestId },
    });
    return { ok: true };
  },
});

export const consumeGrant = mutation({
  args: {
    consentRequestId: v.id("consentRequests"),
    grantToken: v.string(),
    fileId: v.optional(v.id("files")),
    action: v.union(v.literal("upload"), v.literal("download")),
  },
  handler: async (ctx, args) => {
    const req = await ctx.db.get(args.consentRequestId);
    if (!req) return { ok: false, reason: "NOT_FOUND" as const };
    if (req.status === "consumed") {
      return { ok: false, reason: "ALREADY_CONSUMED" as const };
    }
    if (req.status === "expired") {
      return { ok: false, reason: "EXPIRED" as const };
    }
    if (req.status !== "approved") {
      return { ok: false, reason: "NOT_APPROVED" as const };
    }
    if (req.grantExpiresAt && req.grantExpiresAt < Date.now()) {
      await ctx.db.patch(args.consentRequestId, { status: "expired" });
      return { ok: false, reason: "EXPIRED" as const };
    }
    if (req.fileId !== args.fileId || req.action !== args.action) {
      return { ok: false, reason: "MISMATCH" as const };
    }
    const parsed = parseGrantToken(args.grantToken);
    if (!parsed || parsed.consentRequestId !== args.consentRequestId) {
      return { ok: false, reason: "INVALID" as const };
    }
    const presentedHash = hashGrantRaw(parsed.raw);
    if (
      !req.grantTokenHash ||
      !safeEqualHash(req.grantTokenHash, presentedHash)
    ) {
      return { ok: false, reason: "INVALID" as const };
    }
    await ctx.db.patch(args.consentRequestId, { status: "consumed" });
    return { ok: true as const };
  },
});

export const checkStatus = query({
  args: { consentRequestId: v.id("consentRequests") },
  handler: async (ctx, args) => {
    const req = await ctx.db.get(args.consentRequestId);
    if (!req) return null;
    return {
      status: req.status,
      isExpired:
        req.status === "approved" &&
        !!req.grantExpiresAt &&
        req.grantExpiresAt < Date.now(),
    };
  },
});

export const sweepExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("consentRequests")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", now))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .take(200);
    for (const r of expired) {
      await ctx.db.patch(r._id, { status: "expired" });
    }
    return expired.length;
  },
});
