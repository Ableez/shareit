import { query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { ownerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userSettings")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .unique();
  },
});
