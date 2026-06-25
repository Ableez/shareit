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

export const createAuthOptions = (
  ctx: GenericCtx<DataModel>,
): BetterAuthOptions => ({
  appName: "Shareit",
  baseURL: process.env.SITE_URL,
  secret: process.env.BETTER_AUTH_SECRET,
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
