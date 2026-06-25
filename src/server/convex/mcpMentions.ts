import { mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  hashApiKey,
  extractAgentIdAndSecret,
  safeEqualHash,
} from "./lib/crypto";

export const listForAgent = mutation({
  args: {
    apiKey: v.string(),
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const parsed = extractAgentIdAndSecret(args.apiKey);
    if (!parsed) return [];
    const presentedHash = hashApiKey(parsed.rawSecret);
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_key_hash", (q) => q.eq("apiKeyHash", presentedHash))
      .unique();
    if (!agent) return [];
    if (agent._id !== parsed.agentId) return [];
    if (agent.revokedAt) return [];
    if (!safeEqualHash(agent.apiKeyHash, presentedHash)) return [];
    if (!agent.scopes.includes("mentions:read")) return [];
    let pending = await ctx.db
      .query("mentions")
      .withIndex("by_agent", (q) =>
        q.eq("agentId", agent._id).eq("consumed", false),
      )
      .order("asc")
      .take(50);
    if (args.since) {
      pending = pending.filter((m) => m.createdAt >= args.since!);
    }
    await Promise.all(pending.map((m) => ctx.db.patch(m._id, { consumed: true })));
    return pending;
  },
});
