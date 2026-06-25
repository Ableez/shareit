"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "#/server/convex/_generated/api";
import type { Id } from "#/server/convex/_generated/dataModel";

const SCOPES = [
  { id: "files:read", label: "Read files" },
  { id: "files:write", label: "Write files" },
  { id: "mentions:read", label: "Read mentions" },
  { id: "consents:read", label: "Read consent status" },
];

export default function AgentsPage() {
  const agents = useQuery(api.agents.list, {});
  const createAgent = useMutation(api.agents.create);
  const revoke = useMutation(api.agents.revoke);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>(["files:read"]);
  const [revealedKey, setRevealedKey] = useState<{ id: string; key: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    try {
      const result = await createAgent({ name, scopes: picked });
      setRevealedKey({ id: result.agentId, key: result.apiKey });
      setName("");
      setPicked(["files:read"]);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleRevoke(id: Id<"agents">) {
    if (!confirm("Revoke this agent? It will stop working immediately.")) return;
    await revoke({ agentId: id });
  }

  function toggleScope(s: string) {
    setPicked((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Agents</h1>

      {revealedKey && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <p className="font-medium">New API key — copy it now, you won&apos;t see it again.</p>
          <code className="mt-2 block break-all rounded bg-white p-2 font-mono text-xs dark:bg-zinc-900">
            {revealedKey.key}
          </code>
          <button
            type="button"
            onClick={() => setRevealedKey(null)}
            className="mt-2 text-sm underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-lg font-medium">Connect a new agent</h2>
        <div className="mt-3 flex flex-col gap-3">
          <input
            type="text"
            placeholder="Agent name (e.g. 'Claude Code')"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <div className="flex flex-wrap gap-3">
            {SCOPES.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(s.id)}
                  onChange={() => toggleScope(s.id)}
                />
                {s.label}
              </label>
            ))}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={handleCreate}
            disabled={!name.trim() || picked.length === 0}
            className="self-start rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Create agent
          </button>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-medium">Connected agents</h2>
        {agents === undefined ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : agents.length === 0 ? (
          <p className="text-sm text-zinc-500">None yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Scopes</th>
                  <th className="px-4 py-2">Last used</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a: { _id: Id<"agents">; name: string; scopes: string[]; lastUsedAt?: number; revokedAt?: number }) => (
                  <tr
                    key={a._id}
                    className="border-t border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="px-4 py-2 font-medium">{a.name}</td>
                    <td className="px-4 py-2 text-xs">{a.scopes.join(", ")}</td>
                    <td className="px-4 py-2 text-zinc-500">
                      {a.lastUsedAt
                        ? new Date(a.lastUsedAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {a.revokedAt ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-900 dark:text-red-200">
                          revoked
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                          active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {!a.revokedAt && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(a._id)}
                          className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
