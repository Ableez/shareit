"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "#/server/convex/_generated/api";
import type { Id } from "#/server/convex/_generated/dataModel";
import { formatBytes } from "#/lib/format";

export default function FilesPage() {
  const files = useQuery(api.files.list, {});
  const createPending = useMutation(api.files.createPendingForUser);
  const confirm = useAction(api.files.confirmUploadForUser);
  const getUploadUrl = useAction(api.s3Actions.getUploadUrlForFile);
  const getDownloadUrl = useAction(api.s3Actions.getDownloadUrlForFile);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File, expiresIn: string) {
    setError(null);
    setUploading(true);
    try {
      const { fileId } = await createPending({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        expiresIn,
      });
      const presignedUrl = await getUploadUrl({
        fileId,
        contentType: file.type || "application/octet-stream",
      });
      const put = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!put.ok) throw new Error(`S3 upload failed: ${put.status}`);
      await confirm({ fileId });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(fileId: Id<"files">) {
    const url = await getDownloadUrl({ fileId });
    window.open(url, "_blank");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Files</h1>
        <UploadControl onFile={handleFile} uploading={uploading} />
      </div>
      {error && (
        <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      {files === undefined ? (
        <p className="text-zinc-500">Loading…</p>
      ) : files.length === 0 ? (
        <p className="text-zinc-500">No files yet. Upload one to start.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Size</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Uploaded by</th>
                <th className="px-4 py-2">Expires</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f: { _id: Id<"files">; filename: string; size: number; status: "pending" | "active" | "deleted"; uploadedBy: "user" | "agent"; expiresAt?: number }) => (
                <tr
                  key={f._id}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-4 py-2">
                    <a
                      href={`/dashboard/file/${f._id}`}
                      className="font-medium underline"
                    >
                      {f.filename}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {formatBytes(f.size)}
                  </td>
                  <td className="px-4 py-2">
                    <StatusPill status={f.status} />
                  </td>
                  <td className="px-4 py-2 text-zinc-500">{f.uploadedBy}</td>
                  <td className="px-4 py-2 text-zinc-500">
                    {f.expiresAt
                      ? new Date(f.expiresAt).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleDownload(f._id)}
                      className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      Download
                    </button>
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

function StatusPill({ status }: { status: "pending" | "active" | "deleted" }) {
  const color =
    status === "active"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
      : status === "pending"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
        : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

function UploadControl({
  onFile,
  uploading,
}: {
  onFile: (f: File, expiresIn: string) => void;
  uploading: boolean;
}) {
  const [expiry, setExpiry] = useState("1w");
  return (
    <div className="flex items-center gap-2">
      <select
        value={expiry}
        onChange={(e) => setExpiry(e.target.value)}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
      >
        <option value="3d">3 days</option>
        <option value="1w">1 week</option>
        <option value="1m">1 month</option>
        <option value="2m">2 months</option>
        <option value="3m">3 months</option>
      </select>
      <label className="cursor-pointer rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
        {uploading ? "Uploading..." : "Upload"}
        <input
          type="file"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f, expiry);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
