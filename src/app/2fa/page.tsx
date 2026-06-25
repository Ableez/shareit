"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "#/lib/auth-client";

export default function TwoFactorVerifyPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setLoading(false);
    if (error) {
      setError(error.message ?? "Invalid code");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h1 className="text-2xl font-semibold">Two-factor required</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Enter the 6-digit code from your authenticator app.
        </p>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-center font-mono text-lg tracking-widest dark:border-zinc-700 dark:bg-zinc-800"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {loading ? "Verifying..." : "Verify"}
        </button>
      </form>
    </main>
  );
}
