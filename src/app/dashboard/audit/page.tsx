"use client";

import { useQuery } from "convex/react";
import { api } from "#/server/convex/_generated/api";

export default function AuditPage() {
  const entries = useQuery(api.audit.list, { limit: 200 });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      {entries === undefined ? (
        <p className="text-zinc-500">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-zinc-500">No entries yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2">Time</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">File</th>
                <th className="px-4 py-2">Meta</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e: { _id: string; createdAt: number; action: string; fileId?: string; meta?: unknown }) => (
                <tr
                  key={e._id}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-4 py-2 text-zinc-500">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{e.action}</td>
                  <td className="px-4 py-2 text-xs">{e.fileId ?? "—"}</td>
                  <td className="px-4 py-2 text-xs">
                    {e.meta ? JSON.stringify(e.meta) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
