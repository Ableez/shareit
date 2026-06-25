import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "#/lib/auth-server";
import { SignOutButton } from "#/components/SignOutButton";
import { ConsentBanner } from "#/components/ConsentBanner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = await isAuthenticated();
  if (!authed) redirect("/login");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-lg font-semibold">
            Shareit
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/dashboard"
              className="rounded px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Files
            </Link>
            <Link
              href="/dashboard/agents"
              className="rounded px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Agents
            </Link>
            <Link
              href="/dashboard/consent"
              className="rounded px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Consent
            </Link>
            <Link
              href="/dashboard/audit"
              className="rounded px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Audit
            </Link>
            <Link
              href="/dashboard/settings"
              className="rounded px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Settings
            </Link>
          </nav>
        </div>
        <SignOutButton />
      </header>
      <ConsentBanner />
      <main className="flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
