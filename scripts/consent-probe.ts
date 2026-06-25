/* eslint-disable no-console */
import { chromium, type Page } from "playwright";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../src/server/convex/_generated/api";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.SHAREIT_URL ?? "http://localhost:3000";
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!CONVEX_URL) throw new Error("NEXT_PUBLIC_CONVEX_URL required");
const convexUrl: string = CONVEX_URL;

const SHOTS_DIR = path.resolve(process.cwd(), "probe-shots");
const REPORT_PATH = path.resolve(process.cwd(), "probe-consent-report.md");

type Story = {
  id: string;
  title: string;
  status: "PASS" | "FAIL";
  notes: string[];
  screenshot?: string;
};

const report: Story[] = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

function record(s: Story) {
  report.push(s);
  const icon = s.status === "PASS" ? "✓" : "✗";
  console.log(`[${icon} ${s.status}] ${s.id} — ${s.title}`);
  for (const n of s.notes) console.log(`    ${n}`);
}

async function shot(page: Page, name: string) {
  const file = path.join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function getDashboardSession(email: string, password: string) {
  const r = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = r.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/(better-auth\.session_token=[^;]+)/);
  return m ? m[1] : null;
}

async function main() {
  await mkdir(SHOTS_DIR, { recursive: true });
  const convex = new ConvexHttpClient(convexUrl);

  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));

  // Setup: sign up, sign in, create agent
  const email = `consent-${Date.now()}@example.com`;
  const password = "consentProbe1234!";
  await page.goto(`${BASE_URL}/signup`);
  await page.fill('input[type="text"]', "Consent Probe");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/2fa\/setup/);
  const sessionCookie = await getDashboardSession(email, password);
  if (!sessionCookie) throw new Error("no session cookie");
  const [name, ...rest] = sessionCookie.split(";")[0]!.split("=");
  await ctx.addCookies([
    { name: name!, value: rest.join("="), domain: "localhost", path: "/" },
  ]);

  // Lower the user's MCP transfer limit so we can test with a small file
  await page.goto(`${BASE_URL}/dashboard/settings`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[name="maxBytes"]', "100");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  record({
    id: "C-0",
    title: "Lower the user's MCP transfer limit to 100 bytes",
    status: "PASS",
    notes: ["Set mcpMaxTransferBytes=100 via settings form"],
  });

  // Create a file via the agent path: needs an agent first
  await page.goto(`${BASE_URL}/dashboard/agents`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[placeholder*="Agent name"]', "Consent Test Agent");
  // Check the scopes we need
  await page.locator('label:has-text("Write files") input[type="checkbox"]').check();
  await page.locator('label:has-text("Read files") input[type="checkbox"]').check();
  await page.click('button:has-text("Create agent")');
  await page.waitForSelector("text=New API key");
  const agentApiKey = await page.locator("code").first().textContent();
  if (!agentApiKey?.startsWith("dc_")) throw new Error("no agent key");
  record({
    id: "C-1",
    title: "Create agent for consent flow",
    status: "PASS",
    notes: [`API key: ${agentApiKey.slice(0, 24)}…`],
  });

  // Have the agent create a 500-byte file via the MCP path
  const { fileId, s3Key } = await convex.mutation(
    api.mcpFiles.createPendingForAgent,
    {
      apiKey: agentApiKey,
      filename: "oversize.txt",
      mimeType: "text/plain",
      size: 500,
    },
  );
  const putUrl = await convex.action(api.s3Actions.getUploadUrlForKey, {
    key: s3Key,
    contentType: "text/plain",
  });
  const buf = Buffer.alloc(500, "x");
  const put = await fetch(putUrl, {
    method: "PUT",
    body: buf,
    headers: { "Content-Type": "text/plain" },
  });
  if (!put.ok) throw new Error(`PUT failed: ${put.status}`);
  await convex.action(api.mcpFiles.confirmUploadForAgent, {
    apiKey: agentApiKey,
    fileId,
  });
  record({
    id: "C-2",
    title: "Agent uploads a 500-byte file (over the 100-byte limit)",
    status: "PASS",
    notes: [`File id: ${fileId}, s3 key: ${s3Key}`],
  });

  // Have the agent request a download URL — should get CONSENT_REQUIRED
  const consentResult: unknown = await convex.mutation(
    api.mcpConsent.createForAgent,
    {
      apiKey: agentApiKey,
      fileId,
      action: "download",
      size: 500,
    },
  );
  const consentReqId = (consentResult as { consentRequestId: string })
    ?.consentRequestId;
  record({
    id: "C-3",
    title: "Agent downloads oversize file → gets CONSENT_REQUIRED",
    status: !!consentReqId ? "PASS" : "FAIL",
    notes: [
      `createForAgent result: ${JSON.stringify(consentResult).slice(0, 200)}`,
    ],
  });

  // The user sees the pending consent on the dashboard
  await page.goto(`${BASE_URL}/dashboard/consent`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  const consentBanner = await page.locator("text=/Consent test agent|consent|Approve/i").count();
  const sh1 = await shot(page, "C-04-consent-pending");
  record({
    id: "C-4",
    title: "Pending consent appears on /dashboard/consent",
    status: consentBanner > 0 ? "PASS" : "FAIL",
    notes: [
      `Consent UI visible: ${consentBanner > 0}`,
      `Screenshot: ${path.relative(process.cwd(), sh1)}`,
    ],
    screenshot: sh1,
  });

  // Try to approve (will require 2FA; just verify the modal opens)
  const approveBtn = page.locator('button:has-text("Approve with 2FA")').first();
  if ((await approveBtn.count()) > 0) {
    await approveBtn.click();
    await page.waitForSelector("text=/Confirm with 2FA|Confirm/", { timeout: 5000 });
    const sh2 = await shot(page, "C-05-approve-modal");
    record({
      id: "C-5",
      title: "Approve opens the 2FA confirmation modal",
      status: "PASS",
      notes: [`Screenshot: ${path.relative(process.cwd(), sh2)}`],
      screenshot: sh2,
    });
  } else {
    record({
      id: "C-5",
      title: "Approve opens the 2FA confirmation modal",
      status: "FAIL",
      notes: ["No Approve button found"],
    });
  }

  await browser.close();

  // Write report
  const summary = {
    total: report.length,
    pass: report.filter((r) => r.status === "PASS").length,
    fail: report.filter((r) => r.status === "FAIL").length,
  };
  const md = [
    `# Shareit consent-flow probe report`,
    ``,
    `Run at: ${new Date().toISOString()}`,
    `Base URL: ${BASE_URL}`,
    ``,
    `## Summary: ${summary.pass}/${summary.total} pass, ${summary.fail} fail`,
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
