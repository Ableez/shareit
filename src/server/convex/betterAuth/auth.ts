import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import type { GenericCtx } from "@convex-dev/better-auth/utils";
import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import authConfig from "../auth.config";
import schema from "./schema";

export const authComponent = createClient<DataModel, typeof schema>(
  components.betterAuth,
  {
    local: { schema },
    verbose: false,
  },
);

// Build the list of origins Better Auth should accept. The browser sends
// the user's actual origin in the Origin header, which may differ from
// baseURL (e.g. shareit-seven.vercel.app, shareit-astexlabs.vercel.app,
// or a custom domain). Anything not on this list gets an
// INVALID_ORIGIN response. Patterns are supported, so a single
// "https://*.vercel.app" covers every preview + production deployment
// that proxies to the same Convex project.
const SHARED_TRUSTED_ORIGINS = [
  "http://localhost:3000",
  "https://shareit-seven.vercel.app",
  "https://shareit-astexlabs.vercel.app",
  "https://*.vercel.app",
];

function buildTrustedOrigins(): string[] {
  const fromEnv = process.env.TRUSTED_ORIGINS;
  const extras = fromEnv
    ? fromEnv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return Array.from(new Set([...SHARED_TRUSTED_ORIGINS, ...extras]));
}

export const createAuthOptions = (
  ctx: GenericCtx<DataModel>,
): BetterAuthOptions => ({
  appName: "Shareit",
  baseURL: process.env.SITE_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: buildTrustedOrigins(),
  database: authComponent.adapter(ctx),
  emailAndPassword: { enabled: true },
  plugins: [
    convex({ authConfig }),
    twoFactor({
      issuer: "Shareit",
      totpOptions: { digits: 6, period: 30 },
    }),
  ],
});

export const options = createAuthOptions(
  {} as GenericCtx<DataModel>,
);

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth(createAuthOptions(ctx));
