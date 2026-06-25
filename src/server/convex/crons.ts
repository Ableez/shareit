import { internalAction } from "./_generated/server";
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const BATCH = 50;

export const sweepExpiredFiles = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let total = 0;
    while (true) {
      const expired = await ctx.runMutation(internal.filesHelpers.listExpired, {
        before: now,
        limit: BATCH,
      });
      if (expired.length === 0) break;
      for (const file of expired) {
        try {
          await ctx.runAction(internal.s3Actions.deleteObject, {
            key: file.s3Key,
          });
        } catch {
          // continue even if S3 delete fails - we still mark deleted in db
        }
        await ctx.runMutation(internal.filesHelpers.markDeleted, {
          fileId: file._id,
        });
        await ctx.runMutation(internal.audit.log, {
          ownerId: file.ownerId,
          action: "file.expired",
          fileId: file._id,
        });
        await ctx.scheduler.runAfter(0, internal.email.sendFileExpired, {
          ownerId: file.ownerId,
          filename: file.filename,
        });
        total += 1;
      }
      if (expired.length < BATCH) break;
    }
    return total;
  },
});

export const sendExpiryWarnings = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const now = Date.now();
    const in24h = now + 24 * 60 * 60 * 1000;
    const in25h = now + 25 * 60 * 60 * 1000;
    const expiring: Array<{ _id: import("./_generated/dataModel").Id<"files">; ownerId: string; filename: string; expiresAt?: number }> =
      await ctx.runMutation(
        internal.filesHelpers.listExpiringSoon,
        { before: in25h, after: in24h, limit: BATCH },
      );
    for (const f of expiring) {
      if (!f.expiresAt) continue;
      await ctx.scheduler.runAfter(0, internal.email.sendFileExpiringSoon, {
        ownerId: f.ownerId,
        filename: f.filename,
        expiresAt: f.expiresAt,
      });
    }
    return expiring.length;
  },
});

export const sweepConsents = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    return await ctx.runMutation(internal.consent.sweepExpired, {});
  },
});

export const sweepPushDeadLetters = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    return await ctx.runMutation(internal.pushSubscriptions.sweepDeadLetters, {});
  },
});

const crons = cronJobs();
crons.interval("sweep expired files", { hours: 1 }, internal.crons.sweepExpiredFiles, {});
crons.interval("send expiry warnings", { hours: 24 }, internal.crons.sendExpiryWarnings, {});
crons.interval("sweep consent requests", { minutes: 5 }, internal.crons.sweepConsents, {});
crons.interval("sweep push dead letters", { hours: 6 }, internal.crons.sweepPushDeadLetters, {});

export default crons;
