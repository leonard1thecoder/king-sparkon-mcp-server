# King Sparkon MCP — architecture

Stateless, role-aware capability layer over the Spring Boot backend
(`king-sparkon-tracker-backend`). The backend is authoritative for identity,
roles, business rules, money and data — the MCP server orchestrates intent
and enforces the authorization boundary. No business logic is duplicated
here; every mutation ends in a backend endpoint (see `docs/ENDPOINTS.md`).

```text
MCP client
   ↓  Streamable HTTP, stateless (POST /api/mcp)
King Sparkon MCP  (this repo, Vercel server mode, src/server.ts entrypoint)
   ↓  OAuth bearer → GET /api/users/me → roles → scopes → consent → tool-role
Authorization pipeline (src/auth/pipeline.ts, single code path for tools AND resources)
   ↓  backend-native DTOs + Idempotency-Key, caller token forwarded unchanged
Spring Boot backend (OAuth/JWT, roles, services, ledger, audit)
   ↓
Existing database / business logic
```

## Request lifecycle (every call, tools and resources alike)

1. `authFromHeaders` extracts bearer token, agent id, connection id, consent (`src/auth/requestStore.ts`, per-request `AsyncLocalStorage`, nothing cached).
2. `buildContext` requires a bearer token, resolves identity live via `GET /api/users/me`, re-resolves roles on **every** request.
3. `validateToolRole` intersects live roles with the tool allowlist (multi-role principals never collapse into ADMIN).
4. `validateConsent` checks revocation, expiry and required scopes; `granted: false` is rejected.
5. Tool handlers run ownership pre-checks (`assertSameBusiness`), then confirmation (`requireConfirmation`: quote → token → execute) and backend calls.
6. Every outcome is audited (`src/audit/log.ts`: in-process ring + JSON log lines, secrets redacted); raw backend errors map to safe `McpError` codes (never stack traces or tokens).

## Roles (from `PrivilegeRole`: Admin, Owner, Worker, Affiliate, Artist, User)

Normalized case-insensitively in `src/auth/identity.ts`. Permissions per role in `ROLE_PERMISSIONS` (`src/auth/consent.ts`) — a pre-gate only; the backend re-enforces everything. Key boundaries:

- Purchases and order history: USER/ARTIST/OWNER/WORKER only (affiliates use affiliate rails).
- KSC reads: all roles; KSC writes (top-up, mandates): all except AFFILIATE.
- Withdrawals route by rail with role match: artist/owner/worker/affiliate_tip/affiliate_commission.
- Admin tools: ADMIN only, reads plus settlement retry; no arbitrary execution.

## Consent (two layers)

- **Layer A (OAuth account consent):** per-request `x-mcp-consent` JSON `{ scopes[], expiresAt?, revoked?, id?, role?, granted?, grantedAt? }`. The backend has no grant storage, so consent travels with the request and is evaluated on every sensitive capability — never persisted in MCP.
- **Layer B (role consent):** the matrix above. `MCP_DEFAULT_SCOPES` is a local-dev fallback only and must stay empty in production.

## Money rules

- No financial math, no balance derivation, no floating-point currency logic in MCP; exact backend values with IDs and statuses passed through.
- Movement only via business-intent flows (`kscPurchaseFlow`: authorize→capture→backend-auto-settle) and withdrawal rails — raw ledger primitives (`ksc_authorize`, `ksc_capture`, `ksc_cancel`, `ksc_settle`) are never tools (test-guarded).
- Financial writes require confirmation tokens (HMAC over canonical args) and deterministic idempotency keys (`stableKey`), so retries cannot double-charge.
- Rider redemption is company-paid with no cart and no KSC; rider and customer carts never mix.

## Resources & prompts

- Resources (`king-sparkon://me`, `me/permissions`, `me/consent`, `events/{eventId}`, `wallet`) re-run the pipeline; `resources/list` advertises names only. The events template enumerates the public catalogue (cap 50); reads by id enforce `events.read`.
- Prompts (`event_management`, `artist_booking`, `rider_selection`, `payment_review`) are static workflow guides; they cannot bypass authorization.

## Backend-versioned capabilities

Four MCP capabilities need backend migrations `V20261007`/`V20261008`
(user notifications, artist directory, worker shifts, artist withdrawal
eligibility). Until the backend is redeployed with them, the corresponding
tools fail honestly with `BACKEND_ERROR` (timeouts/404s map there) instead
of faking — see `docs/GAPS.md`. `tools/list`, `resources/list` and
`prompts/list` always reflect the deployed MCP build, not backend state.

## Vercel / statelessness

Server mode (`src/server.ts` default export, catch-all): fresh `McpServer` + transport per request, closed afterwards. No filesystem, no sessions, no in-memory durable state, no background work. `api/mcp.ts` delegates to the same handler (functions-mode compatible).

## Environment

| Variable | Required | Notes |
|---|---|---|
| `BACKEND_URL` | yes (prod) | Spring base URL, no trailing `/api`; localhost fallback is dev-only |
| `MCP_CONFIRM_SECRET` | yes (prod) | ≥16 chars; without it each instance mints an ephemeral secret and cross-instance confirmations fail |
| `MCP_DEFAULT_SCOPES` | no | Local-dev fallback; empty in production |
| `APP_URL` | no | Reserved, currently unused by tools |

## Observability

Structured `mcp_audit` JSON lines carry userId, agentId, role, tool/resource, resourceId, action, consent (connection) id, mandate, amount/currency, result, requestId and timestamp. Backend audit (`AuditLog`, ticket observability) remains the system of record; MCP logs are the agent-facing trail.
