import { Resend } from "resend";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

let _resend: Resend | null = null;
function resend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured");
  _resend = new Resend(key);
  return _resend;
}

const FROM = process.env.EMAIL_FROM ?? "Shareit <notify@shareit.app>";
const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

async function send(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  await resend().emails.send({
    from: FROM,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  });
}

export const sendConsentRequested = internalAction({
  args: {
    ownerId: v.string(),
    agentName: v.string(),
    action: v.union(v.literal("upload"), v.literal("download")),
    filename: v.string(),
    size: v.number(),
    consentRequestId: v.id("consentRequests"),
  },
  handler: async (ctx, args) => {
    const email = await ctx.runQuery(internal.emailHelpers.getUserEmail, {
      tokenIdentifier: args.ownerId,
    });
    if (!email) return;
    const url = `${SITE_URL}/dashboard/consent?focus=${args.consentRequestId}`;
    const verb = args.action === "upload" ? "upload" : "download";
    await send({
      to: email,
      subject: `${args.agentName} wants to ${verb} ${args.filename}`,
      html: `<p>${args.agentName} is requesting to ${verb} <b>${args.filename}</b> (${formatBytes(args.size)}). Approve or deny from your <a href="${url}">dashboard</a>.</p>`,
      text: `${args.agentName} is requesting to ${verb} ${args.filename} (${formatBytes(args.size)}). Approve or deny: ${url}`,
    });
    await ctx.runAction(internal.pushNotifications.send, {
      ownerId: args.ownerId,
      title: "Consent requested",
      body: `${args.agentName} wants to ${verb} ${args.filename}`,
      url,
      tag: `consent-${args.consentRequestId}`,
      requireInteraction: true,
    });
  },
});

export const sendConsentDecided = internalAction({
  args: {
    ownerId: v.string(),
    agentId: v.id("agents"),
    action: v.union(v.literal("upload"), v.literal("download")),
    filename: v.string(),
    decision: v.union(v.literal("approved"), v.literal("denied")),
  },
  handler: async (ctx, args) => {
    const email = await ctx.runQuery(internal.emailHelpers.getUserEmail, {
      tokenIdentifier: args.ownerId,
    });
    if (!email) return;
    await send({
      to: email,
      subject: `You ${args.decision} the request to ${args.action} ${args.filename}`,
      html: `<p>You ${args.decision} the request to ${args.action} <b>${args.filename}</b>.</p>`,
      text: `You ${args.decision} the request to ${args.action} ${args.filename}.`,
    });
  },
});

export const sendAgentConnected = internalAction({
  args: { ownerId: v.string(), agentName: v.string() },
  handler: async (ctx, args) => {
    const email = await ctx.runQuery(internal.emailHelpers.getUserEmail, {
      tokenIdentifier: args.ownerId,
    });
    if (!email) return;
    await send({
      to: email,
      subject: `Agent connected: ${args.agentName}`,
      html: `<p>You connected a new agent called <b>${args.agentName}</b> to your Shareit. If this wasn't you, revoke it immediately from your <a href="${SITE_URL}/dashboard/agents">dashboard</a>.</p>`,
      text: `You connected a new agent called ${args.agentName} to your Shareit. If this wasn't you, revoke it: ${SITE_URL}/dashboard/agents`,
    });
  },
});

export const sendAgentRevoked = internalAction({
  args: { ownerId: v.string(), agentName: v.string() },
  handler: async (ctx, args) => {
    const email = await ctx.runQuery(internal.emailHelpers.getUserEmail, {
      tokenIdentifier: args.ownerId,
    });
    if (!email) return;
    await send({
      to: email,
      subject: `Agent revoked: ${args.agentName}`,
      html: `<p>You revoked the agent <b>${args.agentName}</b>. It can no longer access your drive.</p>`,
      text: `You revoked the agent ${args.agentName}. It can no longer access your drive.`,
    });
  },
});

export const sendFileExpired = internalAction({
  args: { ownerId: v.string(), filename: v.string() },
  handler: async (ctx, args) => {
    const email = await ctx.runQuery(internal.emailHelpers.getUserEmail, {
      tokenIdentifier: args.ownerId,
    });
    if (!email) return;
    await send({
      to: email,
      subject: `File expired: ${args.filename}`,
      html: `<p>Your file <b>${args.filename}</b> has expired and was deleted.</p>`,
      text: `Your file ${args.filename} has expired and was deleted.`,
    });
  },
});

export const sendFileExpiringSoon = internalAction({
  args: {
    ownerId: v.string(),
    filename: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const email = await ctx.runQuery(internal.emailHelpers.getUserEmail, {
      tokenIdentifier: args.ownerId,
    });
    if (!email) return;
    const ts = new Date(args.expiresAt).toISOString();
    await send({
      to: email,
      subject: `File expiring soon: ${args.filename}`,
      html: `<p>Your file <b>${args.filename}</b> expires on ${ts}.</p>`,
      text: `Your file ${args.filename} expires on ${ts}.`,
    });
    await ctx.runAction(internal.pushNotifications.send, {
      ownerId: args.ownerId,
      title: "File expiring soon",
      body: `${args.filename} expires in 24 hours.`,
      url: "/dashboard",
      tag: `expiring-${args.filename}`,
    });
  },
});

export const sendWelcome = internalAction({
  args: { ownerId: v.string() },
  handler: async (ctx, args) => {
    const email = await ctx.runQuery(internal.emailHelpers.getUserEmail, {
      tokenIdentifier: args.ownerId,
    });
    if (!email) return;
    await send({
      to: email,
      subject: `Welcome to Shareit`,
      html: `<p>Welcome! Set up two-factor authentication to keep your account secure: <a href="${SITE_URL}/2fa/setup">${SITE_URL}/2fa/setup</a>.</p>`,
      text: `Welcome! Set up two-factor authentication: ${SITE_URL}/2fa/setup`,
    });
  },
});

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
