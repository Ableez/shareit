import type { GenericCtx } from "@convex-dev/better-auth/utils";
import type { DataModel } from "../_generated/dataModel";

export type AppCtx = GenericCtx<DataModel>;

function normalizeTokenIdentifier(tokenIdentifier: string): string {
  // Convex's tokenIdentifier is `<issuer>|<subject>`. We only want the
  // subject part for ownerId so that downstream storage (S3 keys, audit
  // log rows, agent lookups) is human-readable and free of URLs.
  const idx = tokenIdentifier.indexOf("|");
  if (idx < 0) return tokenIdentifier;
  const subject = tokenIdentifier.slice(idx + 1);
  return subject || tokenIdentifier;
}

export async function requireUserId(ctx: AppCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("UNAUTHENTICATED");
  }
  return normalizeTokenIdentifier(identity.tokenIdentifier);
}
