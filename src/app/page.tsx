import Link from "next/link";
import { isAuthenticated } from "#/lib/auth-server";

export default async function Home() {
  const authed = await isAuthenticated();
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-zinc-50 px-6 dark:bg-zinc-950">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Shareit</h1>
        <p className="max-w-md text-zinc-600 dark:text-zinc-400">
          File storage for humans and agents. Upload from the dashboard, fetch
          from your agent via MCP.
        </p>
      </div>
      <div className="flex gap-3">
        {authed ? (
          <Link
            href="/dashboard"
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Open dashboard
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Create account
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
