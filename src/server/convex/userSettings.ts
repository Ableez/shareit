import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUserId } from "./lib/auth";

const EXPIRATION_VALUES = new Set(["3d", "1w", "1m", "2m", "3m"]);

export const get = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    return await ctx.db
      .query("userSettings")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
  },
});

export const update = mutation({
  args: {
    defaultExpiration: v.optional(
      v.union(
        v.literal("3d"),
        v.literal("1w"),
        v.literal("1m"),
        v.literal("2m"),
        v.literal("3m"),
      ),
    ),
    mcpMaxTransferBytes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    if (
      args.defaultExpiration &&
      !EXPIRATION_VALUES.has(args.defaultExpiration)
    ) {
      throw new Error("Invalid expiration");
    }
    if (
      args.mcpMaxTransferBytes !== undefined &&
      (args.mcpMaxTransferBytes < 1024 * 1024 ||
        args.mcpMaxTransferBytes > 5 * 1024 * 1024 * 1024)
    ) {
      throw new Error("MCP max transfer bytes out of range");
    }
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        defaultExpiration: args.defaultExpiration,
        mcpMaxTransferBytes: args.mcpMaxTransferBytes,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userSettings", {
        ownerId,
        defaultExpiration: args.defaultExpiration,
        mcpMaxTransferBytes: args.mcpMaxTransferBytes,
        updatedAt: Date.now(),
      });
    }
    return { ok: true };
  },
});
