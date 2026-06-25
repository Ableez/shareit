import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { resolveExpiration, newS3Key } from "./lib/crypto";

export const get = query({
  args: { fileId: v.id("files") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const file = await ctx.db.get(args.fileId);
    if (!file || file.ownerId !== identity.tokenIdentifier || file.status === "deleted") {
      return null;
    }
    return file;
  },
});

export const list = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("active"),
        v.literal("deleted"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const ownerId = identity.tokenIdentifier;
    const files = await ctx.db
      .query("files")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(200);
    if (args.status) return files.filter((f) => f.status === args.status);
    return files.filter((f) => f.status !== "deleted");
  },
});

export const createPendingForUser = mutation({
  args: {
    filename: v.string(),
    mimeType: v.string(),
    size: v.number(),
    expiresIn: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHENTICATED");
    const ownerId = identity.tokenIdentifier;
    const expiresAt = resolveExpiration(args.expiresIn);
    const fileId = await ctx.db.insert("files", {
      ownerId,
      s3Key: "pending",
      filename: args.filename,
      mimeType: args.mimeType,
      size: args.size,
      status: "pending",
      uploadedBy: "user",
      expiresAt,
      createdAt: Date.now(),
    });
    const s3Key = newS3Key(ownerId, fileId, args.filename);
    await ctx.db.patch(fileId, { s3Key });
    return { fileId, s3Key };
  },
});

export const confirmUploadForUser = action({
  args: { fileId: v.id("files") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHENTICATED");
    const file = await ctx.runQuery(internal.s3Helpers.getFileInternal, {
      fileId: args.fileId,
    });
    if (!file || file.ownerId !== identity.tokenIdentifier) {
      throw new Error("File not found");
    }
    if (file.status === "active") {
      return { ok: true, alreadyActive: true };
    }
    if (file.status !== "pending") throw new Error("File not in pending state");
    const head = await ctx.runAction(internal.s3Actions.headObject, {
      key: file.s3Key,
    });
    if (!head.exists) throw new Error("Object missing in S3");
    if (head.size !== file.size) {
      throw new Error(
        `Size mismatch: declared ${file.size}, actual ${head.size}`,
      );
    }
    await ctx.runMutation(internal.filesHelpers.markActive, {
      fileId: args.fileId,
    });
    await ctx.runMutation(internal.audit.log, {
      ownerId: identity.tokenIdentifier,
      action: "user.upload.confirmed",
      fileId: args.fileId,
    });
    return { ok: true };
  },
});

export const softDelete = mutation({
  args: { fileId: v.id("files") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHENTICATED");
    const file = await ctx.db.get(args.fileId);
    if (!file || file.ownerId !== identity.tokenIdentifier) {
      throw new Error("File not found");
    }
    if (file.status === "deleted") return { ok: true };
    await ctx.db.patch(args.fileId, { status: "deleted" });
    await ctx.scheduler.runAfter(0, internal.s3Actions.deleteObject, {
      key: file.s3Key,
    });
    await ctx.runMutation(internal.audit.log, {
      ownerId: identity.tokenIdentifier,
      action: "user.delete",
      fileId: args.fileId,
    });
    return { ok: true };
  },
});
