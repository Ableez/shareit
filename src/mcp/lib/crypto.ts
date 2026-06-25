const EXPIRATION_MS: Record<string, number> = {
  "3d": 3 * 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
  "2m": 60 * 24 * 60 * 60 * 1000,
  "3m": 90 * 24 * 60 * 60 * 1000,
};

export type AgentIdentity = {
  agentId: string;
  ownerId: string;
  name: string;
  scopes: string[];
};

export function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes(required);
}

import { createHash } from "node:crypto";

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function extractAgentIdAndSecret(apiKey: string): {
  agentId: string;
  rawSecret: string;
} | null {
  const parts = apiKey.split("_");
  if (parts.length !== 3 || parts[0] !== "dc") return null;
  return { agentId: parts[1]!, rawSecret: parts[2]! };
}

export function resolveExpirationMs(
  spec: string | null | undefined,
): number | undefined {
  if (!spec) return undefined;
  const ms = EXPIRATION_MS[spec];
  if (!ms) throw new Error(`Invalid expiration: ${spec}`);
  return ms;
}
