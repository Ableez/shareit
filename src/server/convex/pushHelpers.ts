import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const listForOwner = internalQuery({
  args: { ownerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect();
  },
});

export const touchLastSeen = internalMutation({
  args: { id: v.id("pushSubscriptions") },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.id);
    if (sub) await ctx.db.patch(args.id, { lastSeenAt: Date.now() });
  },
});

export const deleteSub = internalMutation({
  args: { id: v.id("pushSubscriptions") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const recordDeadLetter = internalMutation({
  args: {
    ownerId: v.string(),
    endpoint: v.string(),
    statusCode: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushDeadLetters")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        statusCode: args.statusCode,
        lastErrorAt: Date.now(),
      });
    } else {
      await ctx.db.insert("pushDeadLetters", {
        ownerId: args.ownerId,
        endpoint: args.endpoint,
        statusCode: args.statusCode,
        lastErrorAt: Date.now(),
      });
    }
  },
});
