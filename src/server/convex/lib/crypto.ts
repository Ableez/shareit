import {
  hashApiKeySync,
  randomHex,
  safeEqualHex,
  sha256Sync,
} from "./sha256";

export function hashApiKey(rawKey: string): string {
  return hashApiKeySync(rawKey);
}

export function mintAgentApiKey(agentId: string): string {
  const raw = randomHex(32);
  return `dc_${agentId}_${raw}`;
}

export function extractAgentIdAndSecret(apiKey: string): {
  agentId: string;
  rawSecret: string;
} | null {
  const parts = apiKey.split("_");
  if (parts.length !== 3 || parts[0] !== "dc") return null;
  return { agentId: parts[1]!, rawSecret: parts[2]! };
}

export function safeEqualHash(a: string, b: string): boolean {
  return safeEqualHex(a, b);
}

export function mintGrantToken(consentRequestId: string): {
  token: string;
  hash: string;
} {
  const raw = randomHex(24);
  const token = `${consentRequestId}:${raw}`;
  const hash = sha256Sync(raw);
  return { token, hash };
}

export function parseGrantToken(grantToken: string): {
  consentRequestId: string;
  raw: string;
} | null {
  const idx = grantToken.indexOf(":");
  if (idx < 0) return null;
  return {
    consentRequestId: grantToken.slice(0, idx),
    raw: grantToken.slice(idx + 1),
  };
}

export function hashGrantRaw(raw: string): string {
  return sha256Sync(raw);
}

export function newS3Key(
  ownerId: string,
  fileId: string,
  filename: string,
): string {
  const safeName = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return `u/${ownerId}/${fileId}-${safeName}`;
}

const EXPIRATION_MS: Record<string, number> = {
  "3d": 3 * 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
  "2m": 60 * 24 * 60 * 60 * 1000,
  "3m": 90 * 24 * 60 * 60 * 1000,
};

export function resolveExpiration(spec: string | null | undefined): number | undefined {
  if (!spec) return undefined;
  const ms = EXPIRATION_MS[spec];
  if (!ms) throw new Error(`Invalid expiration spec: ${spec}`);
  return Date.now() + ms;
}
