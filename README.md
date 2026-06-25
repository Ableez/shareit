# Shareit

A multi-tenant file storage app. Humans manage files through a Next.js dashboard. AI agents reach the same files through an MCP server using per-agent API keys. Blobs live in S3 only. Metadata, auth, mentions, consent state, and cron jobs live in Convex. Auth is BetterAuth (email/password + TOTP) wired into Convex via the official `@convex-dev/better-auth` component. Resend sends all transactional email.

**Core guardrail:** any file that crosses the MCP transfer size limit cannot move through an agent tool call until the human approves it from the dashboard using their TOTP authenticator code. The agent gets back a single-use grant token to retry with — it never sees or handles the raw TOTP code itself.

## Tech stack

- **Next.js 16 (App Router)** — dashboard UI, route handlers for Better Auth
- **Convex** — database, mutations/queries/actions, cron jobs, realtime subscriptions
- **AWS S3** — blob storage only, private bucket, presigned URLs for all reads/writes
- **BetterAuth + `@convex-dev/better-auth`** — sessions, email/password, TOTP 2FA
- **Resend** — transactional email
- **MCP server (TypeScript SDK)** — tool surface for agents, runs as its own Node process

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

For Convex-managed env vars, run:

```bash
npx convex dev          # creates a project, writes CONVEX_DEPLOYMENT and NEXT_PUBLIC_CONVEX_URL
npx convex env set SITE_URL http://localhost:3000
npx convex env set BETTER_AUTH_SECRET $(openssl rand -base64 32)
npx convex env set AWS_REGION us-east-1
npx convex env set AWS_ACCESS_KEY_ID ...
npx convex env set AWS_SECRET_ACCESS_KEY ...
npx convex env set S3_BUCKET your-bucket
npx convex env set RESEND_API_KEY re_...
npx convex env set EMAIL_FROM "Shareit <notify@yourdomain.com>"
```

### 3. Generate the Better Auth schema

After you change the plugins in `src/server/convex/betterAuth/auth.ts`, regenerate the component's schema:

```bash
npx @better-auth/cli generate --config ./src/server/convex/betterAuth/auth.ts \
  --output ./src/server/convex/betterAuth/schema.ts
```

### 4. Configure S3

You can do this by hand in the AWS console, or use the bundled script that creates the bucket, locks it down, and mints a least-privilege IAM key in one shot:

```bash
./scripts/setup-aws.sh shareit-prod us-east-1
```

The script will:
- create a private S3 bucket with public access fully blocked
- enforce TLS-only access via bucket policy
- set a sensible CORS config (GET/PUT/HEAD from any origin — the dashboard uses presigned URLs)
- enable AES-256 default encryption
- add a 1-day lifecycle rule to abort incomplete multipart uploads
- tag the bucket
- create an IAM user `shareit-convex-<bucket>` with a least-privilege inline policy (`s3:ListBucket` on the bucket, `GetObject`/`PutObject`/`DeleteObject`/multipart on objects)
- create and print an access key

Then push the four values to Convex:

```bash
npx convex env set AWS_ACCESS_KEY_ID ...
npx convex env set AWS_SECRET_ACCESS_KEY ...
npx convex env set S3_BUCKET shareit-prod
npx convex env set AWS_REGION us-east-1
```

Or paste them into `.env.local` for the Next.js side.

The bucket is fully private. All reads and writes flow through short-lived presigned URLs minted by Convex actions — S3 never receives a request that wasn't first authorised by your Convex permission check.

### 5. Generate VAPID keys for push notifications

The PWA opt-in is wired into the Settings page. To enable real Web Push delivery:

```bash
npx web-push generate-vapid-keys
```

This prints a public and private key. Push them to Convex and the public one to Next.js:

```bash
npx convex env set VAPID_PUBLIC_KEY  <public>
npx convex env set VAPID_PRIVATE_KEY <private>
npx convex env set VAPID_SUBJECT     mailto:you@yourdomain.com
```

And in `.env.local`:

```bash
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public>
VAPID_PUBLIC_KEY=<public>
VAPID_PRIVATE_KEY=<private>
VAPID_SUBJECT=mailto:you@yourdomain.com
```

Users opt in from **Settings → Push notifications** in the dashboard. The SW is registered on first visit (in production) and the install prompt appears after a few seconds when the browser signals `beforeinstallprompt`.

### 6. Run

```bash
npx convex dev            # in one terminal
pnpm dev                  # in another — Next.js dashboard
pnpm mcp:stdio            # in a third — local MCP server (stdin/stdout)
# or
pnpm mcp:http             # HTTP MCP server on :8081
```

The dashboard lives at <http://localhost:3000>. Sign up, set up 2FA, and start uploading. The install banner appears once the browser fires `beforeinstallprompt`.

## How it works

### Auth

- `convex/auth.config.ts` registers Better Auth as a JWT provider for Convex.
- `src/server/convex/betterAuth/` is a locally-installed Convex component that owns the user/session/account/2FA tables.
- `src/lib/auth-client.ts` exposes `authClient` (signIn, signUp, twoFactor.enable, twoFactor.verifyTotp, signOut).
- `src/lib/auth-server.ts` exposes the Next.js helpers (`handler`, `isAuthenticated`, `getToken`, `fetchAuthQuery`, `fetchAuthMutation`, `fetchAuthAction`).
- The TOTP code never leaves the browser. The agent never sees it.

### Agents

- Each agent has an API key of the form `dc_<agentId>_<secret>`. The secret is hashed with SHA-256 before storage. The raw key is shown to the user exactly once.
- The MCP server authenticates by hashing the presented key and matching `agents.apiKeyHash`. A revoked agent (`revokedAt` set) is rejected immediately.
- Scopes: `files:read`, `files:write`, `mentions:read`, `consents:read` (gated per tool).

### Size-limit guardrail

- `MCP_MAX_TRANSFER_BYTES` (default 25 MB) is the per-account threshold for MCP-mediated transfers. Direct dashboard uploads are not affected.
- When an agent calls `request_download_url` or `request_upload_url` on a file over the limit, Convex:
  1. Creates a `consentRequests` row with `status: pending`.
  2. Sends a Resend email to the user and surfaces a banner in the dashboard.
  3. Returns `{ error: "CONSENT_REQUIRED", consentRequestId }` to the agent.
- The user opens `/dashboard/consent`, clicks Approve, and re-enters their TOTP code (verified against the session-bound `authClient.twoFactor.verifyTotp`).
- Convex mints a random grant token, stores only its hash, and shows the plaintext token to the user once. The token expires in 5 minutes.
- The agent retries the original tool call with `grantToken: <requestId>:<token>`. Convex verifies the hash, the scope (`fileId` + `action`), and marks the grant consumed.
- `confirm_upload` re-checks the actual S3 object size against the declared size, so an agent can't lie about size to dodge the gate.

### MCP server

Two transports, both in `src/mcp/`:

- **stdio** (`pnpm mcp:stdio`) — for local agents (Claude Desktop, Cursor, etc.). Reads `MCP_API_KEY` from the environment.
- **HTTP** (`pnpm mcp:http`) — runs an Express server with `StreamableHTTPServerTransport` on `:8081`. Reads the API key from the `Authorization: Bearer <key>` header on `POST /mcp`.

Tools exposed:

| Tool | Required scope | Notes |
|---|---|---|
| `list_files` | `files:read` | Paginated, optional status filter |
| `get_file_metadata` | `files:read` | Filename, mime, size, status, expiresAt |
| `request_download_url` | `files:read` | Returns presigned GET or `CONSENT_REQUIRED` |
| `request_upload_url` | `files:write` | Returns presigned PUT + `fileId` |
| `confirm_upload` | `files:write` | Server-side HEAD on S3, then flips file to `active` |
| `list_mentions` | `mentions:read` | Returns unconsumed mentions, marks them consumed |
| `check_consent_status` | `consents:read` | Poll whether the user approved yet |

### Cron jobs (`src/server/convex/crons.ts`)

- Every hour: sweep expired files (delete from S3, mark `deleted` in Convex, email the user).
- Every 24 hours: email T-minus-24-hours warnings for files about to expire.
- Every 5 minutes: mark stale pending consent requests as `expired`.

### Security guardrails

- S3 bucket is fully private; every read/write is a 5-minute presigned URL.
- Agent API keys are stored as salted hashes; revocable; scoped.
- Declared file size is never trusted — `confirm_upload` re-checks against the real S3 object.
- Grant tokens are single-use, hashed at rest, scoped to one `fileId` + `action`, 5-minute TTL.
- TOTP codes never leave Better Auth's session-bound verification; the agent only ever handles the grant token.
- All agent file operations write to `auditLog`.

## File layout

```
src/
├── app/                          # Next.js dashboard
│   ├── api/auth/[...all]/        # Better Auth route handler
│   ├── dashboard/                # /dashboard, /dashboard/agents, /dashboard/consent, ...
│   ├── login/  signup/  2fa/     # Auth pages
│   ├── layout.tsx                # Root layout (Convex + Better Auth provider)
│   └── page.tsx                  # Landing
├── components/                   # Client components (ConvexClientProvider, ConsentBanner, SignOutButton)
├── lib/                          # auth-client, auth-server, format helpers
├── mcp/                          # MCP server (stdio + http) and tools
└── server/convex/                # All Convex functions
    ├── auth.config.ts            # Better Auth JWT provider
    ├── convex.config.ts          # Registers the betterAuth component
    ├── http.ts                   # HTTP routes (mounts Better Auth handler)
    ├── schema.ts                 # App tables: files, agents, mentions, consentRequests, auditLog, userSettings
    ├── betterAuth/               # Local Convex component for Better Auth
    │   ├── convex.config.ts
    │   ├── auth.ts               # Better Auth instance + adapter
    │   ├── schema.ts             # Auth tables (user, session, account, twoFactor, …)
    │   └── adapter.ts
    ├── lib/                      # crypto (sha256 sync, safe equal, token mint), s3, auth
    ├── files.ts  agents.ts  consent.ts  mentions.ts  audit.ts  userSettings.ts
    ├── email.ts  emailHelpers.ts
    ├── s3Actions.ts  s3Helpers.ts
    ├── mcpFiles.ts  mcpConsent.ts  mcpMentions.ts  mcpAudit.ts  mcpUserSettings.ts
    ├── agentLookup.ts  agentsCore.ts  filesHelpers.ts
    └── crons.ts
```

## Notes

- The Convex V8 runtime does not have Node's `crypto` module. SHA-256 hashing for grant tokens and API keys uses a pure-JS implementation in `src/server/convex/lib/sha256.ts` so it works in both the V8 and Node runtimes. The Node-only MCP server uses `node:crypto` directly in `src/mcp/lib/crypto.ts`.
- All cron `internalAction`s and the S3 helpers in `src/server/convex/s3Actions.ts` are deployed as the Node runtime (the `@aws-sdk/client-s3` calls inside them are fine because they're regular Convex actions; the AWS SDK itself is bundled).
- The Better Auth user table is owned by the component, not this app. Identity flows through the Convex JWT (`ctx.auth.getUserIdentity().tokenIdentifier`), which is the canonical user id we use as `ownerId` everywhere.
