import { NextResponse } from "next/server";
import { fetchAuthMutation } from "#/lib/auth-server";
import { api } from "#/server/convex/_generated/api";

export const dynamic = "force-dynamic";

type SubscriptionPayload = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { subscription?: SubscriptionPayload; replace?: boolean }
    | null;
  if (!body?.subscription?.endpoint || !body.subscription.keys) {
    return NextResponse.json(
      { error: "Invalid subscription payload" },
      { status: 400 },
    );
  }
  try {
    const result = await fetchAuthMutation(api.pushSubscriptions.upsertMine, {
      endpoint: body.subscription.endpoint,
      p256dh: body.subscription.keys.p256dh,
      auth: body.subscription.keys.auth,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = (e as Error).message ?? "Subscribe failed";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
