"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "#/server/convex/_generated/api";

export function ConsentBanner() {
  const pending = useQuery(api.consent.listPending);
  if (!pending || pending.length === 0) return null;
  return (
    <div className="border-b border-amber-300 bg-amber-50 px-6 py-2 text-sm dark:border-amber-800 dark:bg-amber-950">
      <Link href="/dashboard/consent" className="font-medium underline">
        {pending.length} consent request{pending.length === 1 ? "" : "s"} waiting
        for your approval
      </Link>
    </div>
  );
}
