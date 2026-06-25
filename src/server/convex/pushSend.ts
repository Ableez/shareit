"use node";

import webpush from "web-push";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

function getVapidKeys() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@shareit.app";
  if (!pub || !priv) {
    throw new Error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required");
  }
  return { pub, priv, subject };
}

export const sendToOwnerNode = internalAction({
  args: {
    ownerId: v.string(),
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
    tag: v.optional(v.string()),
    requireInteraction: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ sent: number; failed: number }> => {
    const settings = await ctx.runQuery(internal.pushSettings.get, {
      ownerId: args.ownerId,
    });
    if (settings && settings.pushEnabled === false) {
      return { sent: 0, failed: 0 };
    }
    const subs = await ctx.runQuery(internal.pushHelpers.listForOwner, {
      ownerId: args.ownerId,
    });
    if (subs.length === 0) return { sent: 0, failed: 0 };
    const { pub, priv, subject } = getVapidKeys();
    webpush.setVapidDetails(subject, pub, priv);
    const payload = JSON.stringify({
      title: args.title,
      body: args.body,
      url: args.url ?? "/dashboard",
      tag: args.tag,
      requireInteraction: args.requireInteraction,
    });
    let sent = 0;
    let failed = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { TTL: 60 * 60 },
        );
        sent += 1;
        await ctx.runMutation(internal.pushHelpers.touchLastSeen, {
          id: sub._id,
        });
      } catch (e: unknown) {
        failed += 1;
        const statusCode = (e as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await ctx.runMutation(internal.pushHelpers.deleteSub, {
            id: sub._id,
          });
          await ctx.runMutation(internal.pushHelpers.recordDeadLetter, {
            ownerId: args.ownerId,
            endpoint: sub.endpoint,
            statusCode: statusCode ?? 0,
          });
        }
      }
    }
    return { sent, failed };
  },
});
