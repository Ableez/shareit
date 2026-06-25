"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "#/server/convex/_generated/api";
import { PushNotificationOptIn } from "#/components/PushNotificationOptIn";

const EXPIRATION_OPTIONS = [
  { value: "3d", label: "3 days" },
  { value: "1w", label: "1 week" },
  { value: "1m", label: "1 month" },
  { value: "2m", label: "2 months" },
  { value: "3m", label: "3 months" },
] as const;

type Expiration = "3d" | "1w" | "1m" | "2m" | "3m";

export default function SettingsPage() {
  const settings = useQuery(api.userSettings.get, {});
  const update = useMutation(api.userSettings.update);
  const [saved, setSaved] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const key = settings
    ? `${settings.defaultExpiration ?? "1w"}-${settings.mcpMaxTransferBytes ?? 0}`
    : "loading";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const expiry = fd.get("expiry") as Expiration;
    const maxBytes = Number(fd.get("maxBytes"));
    setSaved(false);
    await update({ defaultExpiration: expiry, mcpMaxTransferBytes: maxBytes });
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="text-lg font-medium">Push notifications</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Get notified the moment an agent asks for consent, and the day before
          a file is about to expire.
        </p>
        <div className="mt-4">
          <PushNotificationOptIn />
        </div>
      </div>

      <form
        key={key}
        ref={formRef}
        onSubmit={handleSubmit}
        className="flex flex-col gap-6"
      >
        <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
          <h2 className="text-lg font-medium">Default file expiration</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Applied to dashboard uploads. Agent uploads set their own.
          </p>
          <select
            name="expiry"
            defaultValue={settings?.defaultExpiration ?? "1w"}
            className="mt-3 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            {EXPIRATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
          <h2 className="text-lg font-medium">MCP max transfer size</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Files larger than this that go through MCP require your approval
            via 2FA. Direct dashboard uploads are not affected.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              name="maxBytes"
              min={1024 * 1024}
              max={5 * 1024 * 1024 * 1024}
              step={1024 * 1024}
              defaultValue={settings?.mcpMaxTransferBytes ?? 25 * 1024 * 1024}
              className="w-40 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
            <span className="text-sm text-zinc-500">bytes</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Save
          </button>
          {saved && (
            <span className="text-sm text-emerald-600">Settings saved.</span>
          )}
        </div>
      </form>
    </div>
  );
}
