import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import {
  extractAgentIdAndSecret,
  hashApiKey,
  safeEqualHash,
} from "./lib/crypto";

export const logAgentAction = mutation({
  args: {
    apiKey: v.string(),
    action: v.string(),
    fileId: v.optional(v.id("files")),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const parsed = extractAgentIdAndSecret(args.apiKey);
    if (!parsed) throw new Error("UNAUTHORIZED");
    const presentedHash = hashApiKey(parsed.rawSecret);
    const agent: Doc<"agents"> | null = await ctx.db
      .query("agents")
      .withIndex("by_key_hash", (q) => q.eq("apiKeyHash", presentedHash))
      .unique();
    if (!agent) throw new Error("UNAUTHORIZED");
    if (agent._id !== parsed.agentId) throw new Error("UNAUTHORIZED");
    if (agent.revokedAt) throw new Error("UNAUTHORIZED");
    if (!safeEqualHash(agent.apiKeyHash, presentedHash))
      throw new Error("UNAUTHORIZED");
    await ctx.db.insert("auditLog", {
      ownerId: agent.ownerId,
      agentId: agent._id as Id<"agents">,
      action: args.action,
      fileId: args.fileId,
      meta: args.meta,
      createdAt: Date.now(),
    });
  },
});
