import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUserId } from "./lib/auth";

export const log = internalMutation({
  args: {
    ownerId: v.string(),
    action: v.string(),
    agentId: v.optional(v.id("agents")),
    fileId: v.optional(v.id("files")),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLog", {
      ownerId: args.ownerId,
      agentId: args.agentId,
      action: args.action,
      fileId: args.fileId,
      meta: args.meta,
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    return await ctx.db
      .query("auditLog")
      .withIndex("by_owner_created", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});
