import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  files: defineTable({
    ownerId: v.string(),
    s3Key: v.string(),
    filename: v.string(),
    mimeType: v.string(),
    size: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("deleted"),
    ),
    uploadedBy: v.union(v.literal("user"), v.literal("agent")),
    agentId: v.optional(v.id("agents")),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_owner_created", ["ownerId", "createdAt"])
    .index("by_expiry", ["expiresAt"])
    .index("by_status", ["status"])
    .searchIndex("by_filename", {
      searchField: "filename",
      filterFields: ["ownerId", "status"],
    }),

  agents: defineTable({
    ownerId: v.string(),
    name: v.string(),
    apiKeyHash: v.string(),
    scopes: v.array(v.string()),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_key_hash", ["apiKeyHash"]),

  mentions: defineTable({
    ownerId: v.string(),
    agentId: v.id("agents"),
    fileId: v.id("files"),
    consumed: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_agent", ["agentId", "consumed"])
    .index("by_file", ["fileId"])
    .index("by_owner", ["ownerId"]),

  consentRequests: defineTable({
    ownerId: v.string(),
    agentId: v.id("agents"),
    fileId: v.optional(v.id("files")),
    action: v.union(v.literal("upload"), v.literal("download")),
    size: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
      v.literal("expired"),
      v.literal("consumed"),
    ),
    grantTokenHash: v.optional(v.string()),
    grantExpiresAt: v.optional(v.number()),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_agent_status", ["agentId", "status"])
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_expiry", ["expiresAt"]),

  auditLog: defineTable({
    ownerId: v.string(),
    agentId: v.optional(v.id("agents")),
    action: v.string(),
    fileId: v.optional(v.id("files")),
    meta: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_created", ["ownerId", "createdAt"]),

  userSettings: defineTable({
    ownerId: v.string(),
    defaultExpiration: v.optional(
      v.union(
        v.literal("3d"),
        v.literal("1w"),
        v.literal("1m"),
        v.literal("2m"),
        v.literal("3m"),
      ),
    ),
    mcpMaxTransferBytes: v.optional(v.number()),
    pushEnabled: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  pushSubscriptions: defineTable({
    ownerId: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
    lastSeenAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_endpoint", ["endpoint"]),

  pushDeadLetters: defineTable({
    ownerId: v.string(),
    endpoint: v.string(),
    statusCode: v.number(),
    lastErrorAt: v.number(),
  }).index("by_endpoint", ["endpoint"]),
});
