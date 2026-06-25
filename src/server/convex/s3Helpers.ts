import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const getFileInternal = internalQuery({
  args: { fileId: v.id("files") },
  handler: async (ctx, args) => ctx.db.get(args.fileId),
});

export const getAgentInternal = internalQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => ctx.db.get(args.agentId),
});

export const getConsentInternal = internalQuery({
  args: { consentRequestId: v.id("consentRequests") },
  handler: async (ctx, args) => ctx.db.get(args.consentRequestId),
});

export const getAgentName = internalQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.agentId);
    return a?.name ?? "(unknown agent)";
  },
});

export const getFilename = internalQuery({
  args: { fileId: v.id("files") },
  handler: async (ctx, args) => {
    const f = await ctx.db.get(args.fileId);
    return f?.filename ?? "(unknown file)";
  },
});
