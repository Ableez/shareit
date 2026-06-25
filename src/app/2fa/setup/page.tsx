"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "#/lib/auth-client";

export default function TwoFactorSetupPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"password" | "verify">("password");
  const [loading, setLoading] = useState(false);

  async function startEnable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { data, error } = await authClient.twoFactor.enable({
      password,
    });
    setLoading(false);
    if (error || !data) {
      setError(error?.message ?? "Failed to enable 2FA");
      return;
    }
    setTotpUri(data.totpURI);
    setBackupCodes(data.backupCodes);
    setStep("verify");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await authClient.twoFactor.verifyTotp({
      code,
    });
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
      <div className="flex w-full max-w-md flex-col gap-6 rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-2xl font-semibold">Set up two-factor auth</h1>

        {step === "password" && (
          <form onSubmit={startEnable} className="flex flex-col gap-3 text-sm">
            <p className="text-zinc-600 dark:text-zinc-400">
              Confirm your password to begin.
            </p>
            <input
              type="password"
              required
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-zinc-900 px-3 py-2 font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {loading ? "Working..." : "Continue"}
            </button>
          </form>
        )}

        {step === "verify" && totpUri && (
          <div className="flex flex-col gap-4 text-sm">
            <p>
              Scan this URI in your authenticator app (1Password, Authy, Google
              Authenticator, etc.):
            </p>
            <code className="break-all rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
              {totpUri}
            </code>
            {backupCodes && (
              <div className="rounded border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                <p className="mb-2 font-medium">Backup codes (save these):</p>
                <ul className="grid grid-cols-2 gap-1 text-xs">
                  {backupCodes.map((c) => (
                    <li key={c} className="font-mono">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <form onSubmit={verify} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span>Enter the 6-digit code from your app</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono dark:border-zinc-700 dark:bg-zinc-800"
                />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-zinc-900 px-3 py-2 font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {loading ? "Verifying..." : "Verify and finish"}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
