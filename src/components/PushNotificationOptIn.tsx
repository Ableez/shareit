"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "#/server/convex/_generated/api";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  return await navigator.serviceWorker.ready;
}

type State = "unsupported" | "default" | "subscribed" | "denied";

function readSnapshot(): State {
  if (typeof window === "undefined") return "default";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  if (typeof Notification !== "undefined" && Notification.permission === "denied") {
    return "denied";
  }
  return "default";
}

function subscribePermission(onChange: () => void): () => void {
  if (typeof window === "undefined" || !("permissions" in navigator)) {
    return () => {};
  }
  let status: PermissionStatus | null = null;
  let cancelled = false;
  navigator.permissions
    .query({ name: "notifications" })
    .then((p) => {
      if (cancelled) return;
      status = p;
      p.addEventListener("change", onChange);
    })
    .catch(() => {});
  return () => {
    cancelled = true;
    status?.removeEventListener("change", onChange);
  };
}

function getServerSnapshot(): State {
  return "default";
}

export function PushNotificationOptIn() {
  const setPushEnabled = useMutation(api.pushSubscriptions.setPushEnabled);
  const subscriptions = useQuery(api.pushSubscriptions.list);
  const browserState = useSyncExternalStore(
    subscribePermission,
    readSnapshot,
    getServerSnapshot,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void browserState;
  }, [browserState]);

  const state: State = (() => {
    if (browserState === "unsupported" || browserState === "denied") return browserState;
    if (subscriptions === undefined) return browserState;
    if (subscriptions.length > 0) return "subscribed";
    return browserState;
  })();

  const subscribe = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const reg = await getRegistration();
      if (!reg) throw new Error("Service worker not ready");
      const keyRes = await fetch("/api/push/vapid-public-key");
      if (!keyRes.ok) {
        throw new Error("Server is missing VAPID public key");
      }
      const { publicKey } = (await keyRes.json()) as { publicKey: string };
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        // The permission state will update via useSyncExternalStore's listener.
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Subscribe failed: ${res.status}`);
      }
      await setPushEnabled({ enabled: true });
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [setPushEnabled]);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
          credentials: "include",
        });
        await sub.unsubscribe();
      }
      await setPushEnabled({ enabled: false });
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [setPushEnabled]);

  if (state === "unsupported") {
    return (
      <p className="text-sm text-zinc-500">
        Push notifications are not supported in this browser.
      </p>
    );
  }
  if (state === "denied") {
    return (
      <p className="text-sm text-zinc-500">
        Notifications are blocked. Re-enable them in your browser settings to
        receive consent requests and expiry alerts here.
      </p>
    );
  }

  const deviceCount = subscriptions?.length ?? 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        {state === "subscribed" ? (
          <button
            type="button"
            onClick={unsubscribe}
            disabled={busy}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            {busy ? "Working…" : "Disable push"}
          </button>
        ) : (
          <button
            type="button"
            onClick={subscribe}
            disabled={busy}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {busy ? "Enabling…" : "Enable push"}
          </button>
        )}
        <span className="text-sm text-zinc-500">
          {state === "subscribed"
            ? `${deviceCount} device${deviceCount === 1 ? "" : "s"} subscribed`
            : "Allow notifications to be alerted when an agent needs consent."}
        </span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
