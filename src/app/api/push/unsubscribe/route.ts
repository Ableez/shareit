import { NextResponse } from "next/server";
import { fetchAuthMutation } from "#/lib/auth-server";
import { api } from "#/server/convex/_generated/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { endpoint?: string }
    | null;
  if (!body?.endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }
  try {
    await fetchAuthMutation(api.pushSubscriptions.removeByEndpoint, {
      endpoint: body.endpoint,
    });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as Error).message ?? "Unsubscribe failed" },
      { status: 500 },
    );
  }
}
