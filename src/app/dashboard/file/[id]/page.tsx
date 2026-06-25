"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { api } from "#/server/convex/_generated/api";
import type { Id } from "#/server/convex/_generated/dataModel";
import { formatBytes } from "#/lib/format";

export default function FileDetailPage() {
  const params = useParams<{ id: string }>();
  const fileId = params.id as Id<"files">;
  const router = useRouter();
  const file = useQuery(api.files.get, { fileId });
  const agents = useQuery(api.agents.list, {});
  const createMention = useMutation(api.mentions.create);
  const getDownloadUrl = useAction(api.s3Actions.getDownloadUrlForFile);
  const softDelete = useMutation(api.files.softDelete);
  const [showMention, setShowMention] = useState(false);
  const [pickedAgent, setPickedAgent] = useState<string>("");
  const [done, setDone] = useState<string | null>(null);

  if (file === undefined) return <p className="text-zinc-500">Loading…</p>;
  if (file === null)
    return <p className="text-zinc-500">File not found or deleted.</p>;

  async function handleDownload() {
    const url = await getDownloadUrl({ fileId });
    window.open(url, "_blank");
  }

  async function handleDelete() {
    if (!confirm(`Delete ${file!.filename}?`)) return;
    await softDelete({ fileId });
    router.push("/dashboard");
  }

  async function handleMention() {
    if (!pickedAgent) return;
    await createMention({
      agentId: pickedAgent as Id<"agents">,
      fileId,
    });
    setDone("Mention sent. The agent will see it on its next check.");
    setShowMention(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <a
        href="/dashboard"
        className="text-sm text-zinc-500 underline hover:text-zinc-700"
      >
        ← Back to files
      </a>
      <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold">{file.filename}</h1>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-zinc-500">Size</dt>
          <dd>{formatBytes(file.size)}</dd>
          <dt className="text-zinc-500">MIME</dt>
          <dd>{file.mimeType}</dd>
          <dt className="text-zinc-500">Status</dt>
          <dd>{file.status}</dd>
          <dt className="text-zinc-500">Uploaded by</dt>
          <dd>{file.uploadedBy}</dd>
          <dt className="text-zinc-500">Expires</dt>
          <dd>
            {file.expiresAt ? new Date(file.expiresAt).toLocaleString() : "—"}
          </dd>
          <dt className="text-zinc-500">S3 key</dt>
          <dd className="font-mono text-xs">{file.s3Key}</dd>
        </dl>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Download
          </button>
          <button
            type="button"
            onClick={() => setShowMention(true)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            Send to agent
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-zinc-800 dark:text-red-300 dark:hover:bg-red-950"
          >
            Delete
          </button>
        </div>
        {done && (
          <p className="mt-4 rounded bg-emerald-50 p-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            {done}
          </p>
        )}
      </div>

      {showMention && (
        <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
          <h2 className="text-lg font-medium">Send to agent</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Pick an active agent to mention this file to.
          </p>
          {agents === undefined ? (
            <p className="mt-2 text-sm">Loading…</p>
          ) : agents.length === 0 ? (
            <p className="mt-2 text-sm">
              No agents yet.{" "}
              <a className="underline" href="/dashboard/agents">
                Connect one
              </a>
              .
            </p>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <select
                value={pickedAgent}
                onChange={(e) => setPickedAgent(e.target.value)}
                className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="">Select an agent…</option>
                {agents
                  .filter((a: { revokedAt?: number }) => !a.revokedAt)
                  .map((a: { _id: Id<"agents">; name: string }) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={handleMention}
                disabled={!pickedAgent}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Send mention
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
