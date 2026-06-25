import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { hashApiKey, extractAgentIdAndSecret, safeEqualHash } from "./lib/crypto";

export const resolveForCall = internalQuery({
  args: {
    agentId: v.id("agents"),
    apiKey: v.string(),
    requireScope: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) return null;
    if (agent.revokedAt) return null;
    const parsed = extractAgentIdAndSecret(args.apiKey);
    if (!parsed) return null;
    if (parsed.agentId !== args.agentId) return null;
    const presentedHash = hashApiKey(parsed.rawSecret);
    if (!safeEqualHash(agent.apiKeyHash, presentedHash)) return null;
    if (args.requireScope && !agent.scopes.includes(args.requireScope)) {
      return null;
    }
    return {
      agentId: agent._id,
      ownerId: agent.ownerId,
      scopes: agent.scopes,
    };
  },
});
