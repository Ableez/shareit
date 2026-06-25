import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const getUserEmail = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || identity.tokenIdentifier !== args.tokenIdentifier) {
      return null;
    }
    return identity.email ?? null;
  },
});
