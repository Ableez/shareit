import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUserId } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    return await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();
  },
});

export const removeByEndpoint = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const sub = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (sub && sub.ownerId === ownerId) {
      await ctx.db.delete(sub._id);
    }
  },
});

export const upsertMine = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    const now = Date.now();
    if (existing) {
      if (existing.ownerId !== ownerId) {
        await ctx.db.delete(existing._id);
      } else {
        await ctx.db.patch(existing._id, {
          p256dh: args.p256dh,
          auth: args.auth,
          userAgent: args.userAgent,
          lastSeenAt: now,
        });
        return { ok: true as const, replaced: true };
      }
    }
    await ctx.db.insert("pushSubscriptions", {
      ownerId,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      userAgent: args.userAgent,
      lastSeenAt: now,
      createdAt: now,
    });
    return { ok: true as const, replaced: false };
  },
});

export const setPushEnabled = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        pushEnabled: args.enabled,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userSettings", {
        ownerId,
        pushEnabled: args.enabled,
        updatedAt: Date.now(),
      });
    }
  },
});

export const sweepDeadLetters = internalMutation({
  args: {},
  handler: async (ctx) => {
    const dead = await ctx.db.query("pushDeadLetters").take(500);
    for (const d of dead) {
      const sub = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", d.endpoint))
        .unique();
      if (sub) await ctx.db.delete(sub._id);
      await ctx.db.delete(d._id);
    }
    return dead.length;
  },
});
