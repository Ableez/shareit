"use client";

import { useCallback, useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const STORAGE_KEY = "shareit.install.dismissedAt";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

type State = {
  installed: boolean;
  dismissed: boolean;
  event: BeforeInstallPromptEvent | null;
};

function readInitialState(): State {
  if (typeof window === "undefined") {
    return { installed: false, dismissed: false, event: null };
  }
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true;
  let dismissed = false;
  const ts = window.localStorage.getItem(STORAGE_KEY);
  if (ts) {
    const at = Number(ts);
    if (Number.isFinite(at) && Date.now() - at < COOLDOWN_MS) {
      dismissed = true;
    }
  }
  return { installed, dismissed, event: null };
}

export function InstallPrompt() {
  const [{ installed, dismissed, event }, setState] = useState(() =>
    readInitialState(),
  );

  useEffect(() => {
    if (installed || dismissed) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setState((prev) => ({ ...prev, event: e as BeforeInstallPromptEvent }));
    };
    const onInstalled = () => {
      setState((prev) => ({ ...prev, installed: true, event: null }));
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [installed, dismissed]);

  const handleInstall = useCallback(async () => {
    if (!event) return;
    setState((prev) => ({ ...prev, installing: true }));
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") {
        setState((prev) => ({ ...prev, installed: true, event: null }));
      } else {
        window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
        setState((prev) => ({
          ...prev,
          dismissed: true,
          event: null,
        }));
      }
    } finally {
      setState((prev) => ({ ...prev, installing: false }));
    }
  }, [event]);

  const handleDismiss = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setState((prev) => ({ ...prev, dismissed: true }));
  }, []);

  if (installed || dismissed || !event) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900 sm:bottom-6 sm:left-auto sm:right-6">
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-zinc-900 text-lg font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
        S
      </div>
      <div className="flex-1 text-sm">
        <p className="font-medium">Install Shareit</p>
        <p className="text-xs text-zinc-500">
          Add to your home screen for quick access and offline support.
        </p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        aria-label="Dismiss install prompt"
      >
        Later
      </button>
      <button
        type="button"
        onClick={handleInstall}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Install
      </button>
    </div>
  );
}
