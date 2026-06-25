import { ConvexHttpClient } from "convex/browser";
import { api } from "#/server/convex/_generated/api";
import {
  extractAgentIdAndSecret,
  hasScope,
  type AgentIdentity,
} from "./crypto";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!CONVEX_URL) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is required");
}

const convex = new ConvexHttpClient(CONVEX_URL, { logger: false });

export type AuthedAgent = AgentIdentity;

export async function authenticateAgent(
  apiKey: string,
): Promise<AuthedAgent | null> {
  const parsed = extractAgentIdAndSecret(apiKey);
  if (!parsed) return null;
  const agent = await convex.query(api.agents.resolveByApiKey, { apiKey });
  if (!agent) return null;
  if (agent.agentId !== parsed.agentId) return null;
  return agent;
}

export function requireScope(agent: AuthedAgent, scope: string): void {
  if (!hasScope(agent.scopes, scope)) {
    throw new McpError("FORBIDDEN", `Agent missing required scope: ${scope}`);
  }
}

export function touchLastUsed(agentId: string) {
  convex
    .mutation(api.agents.touchLastUsed, { agentId: agentId as never })
    .catch(() => {});
}

export function getConvex() {
  return convex;
}

export class McpError extends Error {
  constructor(
    public code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "INVALID_OR_EXPIRED_GRANT"
      | "BAD_REQUEST"
      | "INTERNAL"
      | "AGENT_NOT_AUTHORIZED",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export type ConsentRequired = {
  error: "CONSENT_REQUIRED";
  consentRequestId: string;
  message: string;
};

export function isConsentRequired(v: unknown): v is ConsentRequired {
  return (
    typeof v === "object" &&
    v !== null &&
    "error" in v &&
    (v as { error: unknown }).error === "CONSENT_REQUIRED"
  );
}
