import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const markActive = internalMutation({
  args: { fileId: v.id("files") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.fileId, { status: "active" });
  },
});

export const listExpired = internalMutation({
  args: { before: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    return await ctx.db
      .query("files")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", args.before))
      .filter((q) => q.eq(q.field("status"), "active"))
      .take(limit);
  },
});

export const markDeleted = internalMutation({
  args: { fileId: v.id("files") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.fileId, { status: "deleted" });
  },
});

export const listExpiringSoon = internalMutation({
  args: { before: v.number(), after: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 200;
    return await ctx.db
      .query("files")
      .withIndex("by_expiry", (q) =>
        q.gt("expiresAt", args.after).lt("expiresAt", args.before),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .take(limit);
  },
});
