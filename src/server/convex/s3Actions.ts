import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { bucketName, s3 } from "./lib/s3";

async function presignPut(key: string, contentType: string) {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 300 },
  );
}

async function presignGet(key: string) {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: bucketName(), Key: key }),
    { expiresIn: 300 },
  );
}

export const getUploadUrlForFile = action({
  args: { fileId: v.id("files"), contentType: v.optional(v.string()) },
  handler: async (ctx, args): Promise<string> => {
    const file = await ctx.runQuery(internal.s3Helpers.getFileInternal, {
      fileId: args.fileId,
    });
    if (!file) throw new Error("File not found");
    return await presignPut(file.s3Key, args.contentType ?? file.mimeType);
  },
});

export const getDownloadUrlForFile = action({
  args: { fileId: v.id("files") },
  handler: async (ctx, args): Promise<string> => {
    const file = await ctx.runQuery(internal.s3Helpers.getFileInternal, {
      fileId: args.fileId,
    });
    if (!file) throw new Error("File not found");
    return await presignGet(file.s3Key);
  },
});

export const getUploadUrlForKey = action({
  args: { key: v.string(), contentType: v.string() },
  handler: async (_ctx, args): Promise<string> =>
    presignPut(args.key, args.contentType),
});

export const headObject = internalAction({
  args: { key: v.string() },
  handler: async (_ctx, args) => {
    try {
      const head = await s3().send(
        new HeadObjectCommand({ Bucket: bucketName(), Key: args.key }),
      );
      return { exists: true, size: Number(head.ContentLength ?? 0) };
    } catch {
      return { exists: false, size: 0 };
    }
  },
});

export const deleteObject = internalAction({
  args: { key: v.string() },
  handler: async (_ctx, args) => {
    await s3().send(
      new DeleteObjectCommand({ Bucket: bucketName(), Key: args.key }),
    );
  },
});
