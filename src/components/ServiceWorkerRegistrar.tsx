"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && !window.location.search.includes("sw=1")) {
      // skip SW in dev unless explicitly testing
      return;
    }
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => {
        console.error("Service worker registration failed", err);
      });
  }, []);
  return null;
}
