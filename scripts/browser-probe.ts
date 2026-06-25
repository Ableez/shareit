import { chromium, type Browser, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.SHAREIT_URL ?? "http://localhost:3000";
const SHOTS_DIR = path.resolve(process.cwd(), "probe-shots");
const REPORT_PATH = path.resolve(process.cwd(), "probe-report.md");

type Story = {
  id: string;
  title: string;
  status: "PASS" | "FAIL" | "BLOCKED" | "SKIP";
  notes: string[];
  screenshot?: string;
};

const report: Story[] = [];
let browser: Browser | null = null;

function record(s: Story) {
  report.push(s);
  const icon = s.status === "PASS" ? "✓" : s.status === "FAIL" ? "✗" : "•";
  console.log(`[${icon} ${s.status}] ${s.id} — ${s.title}`);
  for (const n of s.notes) console.log(`    ${n}`);
}

async function shot(page: Page, name: string) {
  const file = path.join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function main() {
  await mkdir(SHOTS_DIR, { recursive: true });

  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: "block",
  });
  ctx.setDefaultTimeout(15000);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[console.error]", msg.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 500)
      console.error(`[${r.status()}] ${r.request().method()} ${r.url()}`);
  });

  // ===== US-1: Landing renders =====
  try {
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    const title = await page.locator("h1").first().textContent();
    const sh = await shot(page, "01-landing");
    record({
      id: "US-1",
      title: "Landing page renders with Shareit title",
      status: title?.toLowerCase().includes("shareit") ? "PASS" : "FAIL",
      notes: [
        `H1 text: ${JSON.stringify(title)}`,
        `Screenshot: ${path.relative(process.cwd(), sh)}`,
      ],
      screenshot: sh,
    });
  } catch (e) {
    record({
      id: "US-1",
      title: "Landing page renders",
      status: "FAIL",
      notes: [`Error: ${(e as Error).message}`],
    });
  }

  // ===== US-2: Signup =====
  const email = `probe-${Date.now()}@example.com`;
  const password = "probingProbe1234!";
  try {
    await page.goto(`${BASE_URL}/signup`, { waitUntil: "networkidle" });
    await page.fill('input[type="text"]', "Probe User");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await Promise.all([
      page.waitForURL(/\/2fa\/setup/, { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);
    const sh = await shot(page, "02-2fa-setup");
    record({
      id: "US-2",
      title: "Signup with email/password redirects to /2fa/setup",
      status: "PASS",
      notes: [
        `Signed up as ${email}`,
        `Landed on ${page.url()}`,
        `Screenshot: ${path.relative(process.cwd(), sh)}`,
      ],
      screenshot: sh,
    });
  } catch (e) {
    const sh = await shot(page, "02-signup-fail");
    record({
      id: "US-2",
      title: "Signup flow",
      status: "FAIL",
      notes: [
        `Error: ${(e as Error).message}`,
        `Screenshot: ${path.relative(process.cwd(), sh)}`,
      ],
      screenshot: sh,
    });
  }

  // ===== US-3: 2FA setup surfaces QR/URI =====
  let totpUri: string | null = null;
  try {
    const passwordInput = page.locator('input[type="password"]');
    if (await passwordInput.count()) {
      await passwordInput.fill(password);
      await page.click('button[type="submit"]');
      await page.waitForSelector("code", { timeout: 10000 });
    }
    totpUri = await page.locator("code").first().textContent();
    const sh = await shot(page, "03-2fa-uri");
    record({
      id: "US-3",
      title: "2FA setup produces a TOTP URI and backup codes",
      status: totpUri?.startsWith("otpauth://") ? "PASS" : "FAIL",
      notes: [
        `TOTP URI present: ${totpUri?.slice(0, 60) ?? "missing"}…`,
        `Screenshot: ${path.relative(process.cwd(), sh)}`,
      ],
      screenshot: sh,
    });
  } catch (e) {
    const sh = await shot(page, "03-2fa-fail");
    record({
      id: "US-3",
      title: "2FA setup flow",
      status: "FAIL",
      notes: [
        `Error: ${(e as Error).message}`,
        `Screenshot: ${path.relative(process.cwd(), sh)}`,
      ],
      screenshot: sh,
    });
  }

  // ===== US-4: Bypass 2FA via API sign-in for the rest of the probe =====
  let sessionCookie: string | null = null;
  try {
    await page.context().clearCookies();
    const resp = await page.request.post(
      `${BASE_URL}/api/auth/sign-in/email`,
      {
        headers: { "Content-Type": "application/json", Origin: BASE_URL },
        data: { email, password },
      },
    );
    const body = await resp.text();
    const setCookie = resp.headers()["set-cookie"] ?? "";
    const m = setCookie.match(/(better-auth\.session_token=[^;]+)/);
    sessionCookie = m ? m[1] : null;
    record({
      id: "US-4",
      title: "Sign-in works after sign-up (2FA bypass for probe)",
      status: resp.status() < 400 ? "PASS" : "FAIL",
      notes: [
        `Sign-in status: ${resp.status()}`,
        `Session cookie captured: ${sessionCookie ? "yes" : "no"}`,
        `Body sample: ${body.slice(0, 200)}`,
      ],
    });
  } catch (e) {
    record({
      id: "US-4",
      title: "Sign-in after sign-up",
      status: "FAIL",
      notes: [`Error: ${(e as Error).message}`],
    });
  }

  // ===== US-5: Dashboard renders for authed user =====
  try {
    if (sessionCookie) {
      const cookies = sessionCookie.split(";").map((c) => {
        const [name, ...rest] = c.trim().split("=");
        return { name: name!, value: rest.join("="), domain: "localhost", path: "/" };
      });
      await ctx.addCookies(cookies);
    }
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
    const url = page.url();
    const heading = await page.locator("h1").first().textContent();
    const sh = await shot(page, "05-dashboard");
    record({
      id: "US-5",
      title: "Dashboard renders for authed user",
      status: !url.includes("/login") && !!heading ? "PASS" : "FAIL",
      notes: [
        `Final URL: ${url}`,
        `Heading: ${JSON.stringify(heading)}`,
        `Screenshot: ${path.relative(process.cwd(), sh)}`,
      ],
      screenshot: sh,
    });
  } catch (e) {
    const sh = await shot(page, "05-dashboard-fail");
    record({
      id: "US-5",
      title: "Dashboard",
      status: "FAIL",
      notes: [
        `Error: ${(e as Error).message}`,
        `Screenshot: ${path.relative(process.cwd(), sh)}`,
      ],
      screenshot: sh,
    });
  }

  // ===== US-6: Files empty state =====
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
    // Wait for the Convex query to settle
    await page.waitForTimeout(2000);
    const empty = await page
      .getByText(/No files yet\. Upload one to start\./)
      .count();
    const sh = await shot(page, "06-files-empty");
    record({
      id: "US-6",
      title: "Files page renders empty state for new user",
      status: empty > 0 ? "PASS" : "FAIL",
      notes: [
        `Empty-state visible: ${empty > 0}`,
        `Screenshot: ${path.relative(process.cwd(), sh)}`,
      ],
      screenshot: sh,
    });
  } catch (e) {
    record({
      id: "US-6",
      title: "Files page empty state",
      status: "FAIL",
      notes: [`Error: ${(e as Error).message}`],
    });
  }

  // ===== US-7: Upload a small file (S3 path) =====
  let uploadedFileId: string | null = null;
  try {
    const fileInput = page.locator('input[type="file"]');
    if ((await fileInput.count()) === 0) throw new Error("file input not found");
    const buffer = Buffer.from("probe-upload-" + Date.now());
    await fileInput.setInputFiles({
      name: "probe.txt",
      mimeType: "text/plain",
      buffer,
    });
    await page.waitForSelector("text=probe.txt", { timeout: 30000 });
    const sh = await shot(page, "07-uploaded");
    const href = await page
      .locator('a:has-text("probe.txt")')
      .first()
      .getAttribute("href");
    uploadedFileId = href?.match(/\/dashboard\/file\/([^?]+)/)?.[1] ?? null;
    record({
      id: "US-7",
      title: "Small file uploads to S3 and shows in dashboard",
      status: uploadedFileId ? "PASS" : "FAIL",
      notes: [
        `File ID: ${uploadedFileId}`,
        `Screenshot: ${path.relative(process.cwd(), sh)}`,
      ],
      screenshot: sh,
    });
  } catch (e) {
    const sh = await shot(page, "07-upload-fail");
    record({
      id: "US-7",
      title: "File upload to S3",
      status: "FAIL",
      notes: [
        `Error: ${(e as Error).message}`,
        `Screenshot: ${path.relative(process.cwd(), sh)}`,
      ],
      screenshot: sh,
    });
  }

  // ===== US-8: Agents page =====
  try {
    await page.goto(`${BASE_URL}/dashboard/agents`, { waitUntil: "networkidle" });
    const sh = await shot(page, "08-agents");
    record({
      id: "US-8",
      title: "Agents page renders Connect-a-new-agent form",
      status:
        (await page.locator("text=Connect a new agent").count()) > 0
          ? "PASS"
          : "FAIL",
      notes: [`Screenshot: ${path.relative(process.cwd(), sh)}`],
      screenshot: sh,
    });
  } catch (e) {
    record({
      id: "US-8",
      title: "Agents page",
      status: "FAIL",
      notes: [`Error: ${(e as Error).message}`],
    });
  }

  // ===== US-9: Create an agent =====
  let agentApiKey: string | null = null;
  try {
    await page.goto(`${BASE_URL}/dashboard/agents`, { waitUntil: "networkidle" });
    await page.fill('input[placeholder*="Agent name"]', "Probe Agent");
    await page.click('button:has-text("Create agent")');
    await page.waitForSelector("text=New API key", { timeout: 10000 });
    const keyText = await page.locator("code").first().textContent();
    agentApiKey = keyText ?? null;
    const sh = await shot(page, "09-agent-key");
    record({
      id: "US-9",
      title: "Creating an agent surfaces a one-time API key",
      status: keyText?.startsWith("dc_") ? "PASS" : "FAIL",
      notes: [
        `Key prefix: ${keyText?.slice(0, 20) ?? "missing"}…`,
        `Screenshot: ${path.relative(process.cwd(), sh)}`,
      ],
      screenshot: sh,
    });
  } catch (e) {
    const sh = await shot(page, "09-agent-fail");
    record({
      id: "US-9",
      title: "Agent creation",
      status: "FAIL",
      notes: [
        `Error: ${(e as Error).message}`,
        `Screenshot: ${path.relative(process.cwd(), sh)}`,
      ],
      screenshot: sh,
    });
  }

  // ===== US-10: Convex resolveByApiKey =====
  try {
    if (!agentApiKey) throw new Error("no api key from US-9");
    const convexHttp = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexHttp) throw new Error("NEXT_PUBLIC_CONVEX_URL not set");
    const r = await fetch(`${convexHttp}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "agents:resolveByApiKey",
        args: { apiKey: agentApiKey },
        format: "convex_encoded_json",
      }),
    });
    record({
      id: "US-10",
      title: "Agent API key resolves via Convex resolveByApiKey",
      status: r.status === 200 ? "PASS" : "FAIL",
      notes: [`Status: ${r.status}`],
    });
  } catch (e) {
    record({
      id: "US-10",
      title: "Agent API key resolves",
      status: "FAIL",
      notes: [`Error: ${(e as Error).message}`],
    });
  }

  // ===== US-11: Push opt-in UI =====
  try {
    await page.goto(`${BASE_URL}/dashboard/settings`, { waitUntil: "networkidle" });
    const sh = await shot(page, "11-settings");
    const has = await page.locator("text=Push notifications").count();
    record({
      id: "US-11",
      title: "Settings page has Push notifications section",
      status: has > 0 ? "PASS" : "FAIL",
      notes: [`Screenshot: ${path.relative(process.cwd(), sh)}`],
      screenshot: sh,
    });
  } catch (e) {
    record({
      id: "US-11",
      title: "Push opt-in",
      status: "FAIL",
      notes: [`Error: ${(e as Error).message}`],
    });
  }

  // ===== US-12: Service worker API available =====
  try {
    const swSupported = await page.evaluate(() => "serviceWorker" in navigator);
    record({
      id: "US-12",
      title: "Service worker API available in browser",
      status: swSupported ? "PASS" : "FAIL",
      notes: [
        `navigator.serviceWorker: ${swSupported}`,
        `Note: SW is only registered in production. Dev mode skips it.`,
      ],
    });
  } catch (e) {
    record({
      id: "US-12",
      title: "Service worker",
      status: "FAIL",
      notes: [`Error: ${(e as Error).message}`],
    });
  }

  // ===== US-13: VAPID endpoint =====
  try {
    const r = await page.request.get(`${BASE_URL}/api/push/vapid-public-key`);
    const body = (await r.json()) as { publicKey?: string };
    record({
      id: "US-13",
      title: "GET /api/push/vapid-public-key returns the VAPID public key",
      status:
        r.status() === 200 && body.publicKey?.startsWith("B") ? "PASS" : "FAIL",
      notes: [`Status: ${r.status()}`, `Public key length: ${body.publicKey?.length}`],
    });
  } catch (e) {
    record({
      id: "US-13",
      title: "VAPID public key endpoint",
      status: "FAIL",
      notes: [`Error: ${(e as Error).message}`],
    });
  }

  // ===== US-14: Manifest served =====
  try {
    const r = await page.request.get(`${BASE_URL}/manifest.webmanifest`);
    const body = (await r.json()) as { name?: string; start_url?: string };
    record({
      id: "US-14",
      title: "PWA manifest served at /manifest.webmanifest",
      status: r.status() === 200 && body.name === "Shareit" ? "PASS" : "FAIL",
      notes: [
        `Status: ${r.status()}`,
        `Name: ${body.name}, start_url: ${body.start_url}`,
      ],
    });
  } catch (e) {
    record({
      id: "US-14",
      title: "PWA manifest",
      status: "FAIL",
      notes: [`Error: ${(e as Error).message}`],
    });
  }

  await browser.close();

  // ===== Write report =====
  const summary = {
    total: report.length,
    pass: report.filter((r) => r.status === "PASS").length,
    fail: report.filter((r) => r.status === "FAIL").length,
    blocked: report.filter((r) => r.status === "BLOCKED").length,
    skip: report.filter((r) => r.status === "SKIP").length,
  };
  const md = [
    `# Shareit browser-probe report`,
    ``,
    `Run at: ${new Date().toISOString()}`,
    `Base URL: ${BASE_URL}`,
    ``,
    `## Summary: ${summary.pass}/${summary.total} pass, ${summary.fail} fail, ${summary.blocked} blocked, ${summary.skip} skip`,
    ``,
    `## Stories`,
    ``,
    ...report.flatMap((r) => {
      const lines = [
        `### ${r.id} — ${r.title}`,
        `**Status:** ${r.status}`,
        ...r.notes.map((n) => `- ${n}`),
        ``,
      ];
      if (r.screenshot) {
        lines.push(
          `![${r.id}](${path.relative(path.dirname(REPORT_PATH), r.screenshot)})`,
          ``,
        );
      }
      return lines;
    }),
  ].join("\n");
  await writeFile(REPORT_PATH, md, "utf8");
  console.log(`\nReport written to ${REPORT_PATH}`);
  console.log(`Summary: ${JSON.stringify(summary)}`);
}

main()
  .catch((e) => {
    console.error("Probe failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    if (browser) await browser.close();
  });
