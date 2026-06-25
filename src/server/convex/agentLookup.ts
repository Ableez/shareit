import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  extractAgentIdAndSecret,
  hashApiKey,
  safeEqualHash,
} from "./lib/crypto";

export const byApiKey = internalQuery({
  args: {
    apiKey: v.string(),
    requireScope: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const parsed = extractAgentIdAndSecret(args.apiKey);
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
    if (args.requireScope && !agent.scopes.includes(args.requireScope)) {
      return null;
    }
    return { agentId: agent._id, ownerId: agent.ownerId, name: agent.name };
  },
});
