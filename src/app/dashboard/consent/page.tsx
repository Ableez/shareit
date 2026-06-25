"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "#/server/convex/_generated/api";
import { authClient } from "#/lib/auth-client";
import { formatBytes } from "#/lib/format";
import type { Id } from "#/server/convex/_generated/dataModel";

export default function ConsentPage() {
  const pending = useQuery(api.consent.listPending, {});
  const approve = useMutation(api.consent.approve);
  const deny = useMutation(api.consent.deny);
  const agentsById = useQuery(api.agents.list, {});
  const [totpFor, setTotpFor] = useState<Id<"consentRequests"> | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [revealedGrant, setRevealedGrant] = useState<{
    requestId: string;
    grantToken: string;
  } | null>(null);

  async function handleApprove(reqId: Id<"consentRequests">) {
    setError(null);
    setTotpFor(reqId);
  }

  async function submitApprove() {
    if (!totpFor) return;
    setError(null);
    const { error: totpError } = await authClient.twoFactor.verifyTotp({
      code,
    });
    if (totpError) {
      setError(totpError.message ?? "Invalid code");
      return;
    }
    try {
      const result = await approve({ consentRequestId: totpFor });
      setRevealedGrant({
        requestId: totpFor,
        grantToken: result.grantToken,
      });
      setTotpFor(null);
      setCode("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDeny(reqId: Id<"consentRequests">) {
    if (!confirm("Deny this request? It cannot be undone.")) return;
    await deny({ consentRequestId: reqId });
  }

  const agentName = (id: Id<"agents">) => {
    const a = agentsById?.find((x: { _id: Id<"agents"> }) => x._id === id);
    return a?.name ?? "(unknown agent)";
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Consent requests</h1>

      {revealedGrant && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950">
          <p className="font-medium">Grant token — give this to your agent.</p>
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
            Single-use. Expires in 5 minutes. The agent uses it to retry the
            original tool call.
          </p>
          <code className="mt-2 block break-all rounded bg-white p-2 font-mono text-xs dark:bg-zinc-900">
            {revealedGrant.grantToken}
          </code>
          <button
            type="button"
            onClick={() => setRevealedGrant(null)}
            className="mt-2 text-sm underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {pending === undefined ? (
        <p className="text-zinc-500">Loading…</p>
      ) : pending.length === 0 ? (
        <p className="text-zinc-500">No pending requests.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((r: { _id: Id<"consentRequests">; agentId: Id<"agents">; action: "upload" | "download"; size: number; createdAt: number }) => (
            <div
              key={r._id}
              className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div>
                <p className="font-medium">
                  {agentName(r.agentId)} wants to {r.action}
                </p>
                <p className="text-sm text-zinc-500">
                  Size: {formatBytes(r.size)} • Requested{" "}
                  {new Date(r.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleDeny(r._id)}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                >
                  Deny
                </button>
                <button
                  type="button"
                  onClick={() => handleApprove(r._id)}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Approve with 2FA
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {totpFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold">Confirm with 2FA</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Enter your authenticator code to issue a single-use grant.
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-3 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-center font-mono text-lg tracking-widest dark:border-zinc-700 dark:bg-zinc-800"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setTotpFor(null);
                  setCode("");
                  setError(null);
                }}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitApprove}
                disabled={code.length !== 6}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
