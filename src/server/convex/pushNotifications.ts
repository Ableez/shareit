import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const send = internalAction({
  args: {
    ownerId: v.string(),
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
    tag: v.optional(v.string()),
    requireInteraction: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ sent: number; failed: number }> => {
    return await ctx.runAction(internal.pushSend.sendToOwnerNode, args);
  },
});
