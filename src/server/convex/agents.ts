import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  extractAgentIdAndSecret,
  hashApiKey,
  mintAgentApiKey,
  safeEqualHash,
} from "./lib/crypto";
import { requireUserId } from "./lib/auth";

const VALID_SCOPES = new Set([
  "files:read",
  "files:write",
  "mentions:read",
  "consents:read",
]);

function validateScopes(scopes: string[]): void {
  for (const scope of scopes) {
    if (!VALID_SCOPES.has(scope)) {
      throw new Error(`Invalid scope: ${scope}`);
    }
  }
}

export const create = mutation({
  args: { name: v.string(), scopes: v.array(v.string()) },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    validateScopes(args.scopes);
    if (!args.name.trim()) throw new Error("Name is required");
    const placeholderId = "temp";
    const apiKey = mintAgentApiKey(placeholderId);
    const parsed = extractAgentIdAndSecret(apiKey);
    if (!parsed) throw new Error("Failed to mint key");
    const apiKeyHash = hashApiKey(parsed.rawSecret);
    const agentId = await ctx.db.insert("agents", {
      ownerId,
      name: args.name.trim(),
      apiKeyHash,
      scopes: args.scopes,
      createdAt: Date.now(),
    });
    await ctx.db.patch(agentId, { apiKeyHash });
    const finalKey = mintAgentApiKey(agentId);
    const finalParsed = extractAgentIdAndSecret(finalKey);
    if (!finalParsed) throw new Error("Failed to mint final key");
    const finalHash = hashApiKey(finalParsed.rawSecret);
    await ctx.db.patch(agentId, { apiKeyHash: finalHash });
    await ctx.scheduler.runAfter(0, internal.email.sendAgentConnected, {
      ownerId,
      agentName: args.name.trim(),
    });
    return { agentId, apiKey: finalKey };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();
    return agents.map(({ apiKeyHash: _apiKeyHash, ...rest }) => rest);
  },
});

export const revoke = mutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const agent = await ctx.db.get(args.agentId);
    if (!agent || agent.ownerId !== ownerId) {
      throw new Error("Agent not found");
    }
    if (agent.revokedAt) return { ok: true, alreadyRevoked: true };
    await ctx.db.patch(args.agentId, { revokedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.email.sendAgentRevoked, {
      ownerId,
      agentName: agent.name,
    });
    return { ok: true };
  },
});

export const resolveByApiKey = query({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    const parsed = extractAgentIdAndSecret(args.apiKey);
    if (!parsed) return null;
    const hash = hashApiKey(parsed.rawSecret);
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_key_hash", (q) => q.eq("apiKeyHash", hash))
      .unique();
    if (!agent) return null;
    if (agent._id !== parsed.agentId) return null;
    if (agent.revokedAt) return null;
    if (!safeEqualHash(agent.apiKeyHash, hash)) return null;
    return {
      agentId: agent._id,
      ownerId: agent.ownerId,
      name: agent.name,
      scopes: agent.scopes,
    };
  },
});

export const touchLastUsed = mutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent || agent.revokedAt) return;
    await ctx.db.patch(args.agentId, { lastUsedAt: Date.now() });
  },
});

export const hasScope = (scopes: string[], required: string): boolean =>
  scopes.includes(required);
