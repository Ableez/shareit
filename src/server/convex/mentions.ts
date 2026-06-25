import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { hashApiKey, extractAgentIdAndSecret, safeEqualHash } from "./lib/crypto";
import { requireUserId } from "./lib/auth";

export const create = mutation({
  args: { agentId: v.id("agents"), fileId: v.id("files") },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const agent = await ctx.db.get(args.agentId);
    if (!agent || agent.ownerId !== ownerId) {
      throw new Error("Agent not found");
    }
    if (agent.revokedAt) throw new Error("Agent is revoked");
    const file = await ctx.db.get(args.fileId);
    if (!file || file.ownerId !== ownerId) throw new Error("File not found");
    if (file.status === "deleted") throw new Error("File is deleted");
    return await ctx.db.insert("mentions", {
      ownerId,
      agentId: args.agentId,
      fileId: args.fileId,
      consumed: false,
      createdAt: Date.now(),
    });
  },
});

export const listForAgent = mutation({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    const parsed = extractAgentIdAndSecret(args.apiKey);
    if (!parsed) return [];
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_key_hash", (q) =>
        q.eq("apiKeyHash", hashApiKey(parsed.rawSecret)),
      )
      .unique();
    if (!agent) return [];
    if (agent._id !== parsed.agentId) return [];
    if (agent.revokedAt) return [];
    if (!safeEqualHash(agent.apiKeyHash, hashApiKey(parsed.rawSecret))) {
      return [];
    }
    if (!agent.scopes.includes("mentions:read")) return [];
    const pending = await ctx.db
      .query("mentions")
      .withIndex("by_agent", (q) =>
        q.eq("agentId", agent._id).eq("consumed", false),
      )
      .order("asc")
      .take(50);
    await Promise.all(
      pending.map((m) => ctx.db.patch(m._id, { consumed: true })),
    );
    return pending;
  },
});

export const listOwn = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    return await ctx.db
      .query("mentions")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(50);
  },
});
