# king-sparkon-mcp-server

Role-based MCP gateway over the King Sparkon Spring Boot backend.

```
ChatGPT / MCP Host
        ↓
King Sparkon MCP (`/api/mcp`, Streamable HTTP, stateless)
        ↓
Identity → Role → OAuth Scope → MCP Consent → Ownership → Confirmation → KSC Mandate
        ↓
King Sparkon Spring Boot (the authority for auth, money, data)
```

The backend remains the source of truth for authentication, roles,
business rules, KSC, settlement, earnings and inventory. This server
performs **no** financial math and stores **no** sessions, tokens, or
balances — every request re-resolves identity and roles live.

## Run

```bash
npm install
npm run typecheck
npm test
```

Local dev against a local backend:

```bash
cp .env.example .env   # set BACKEND_URL + MCP_CONFIRM_SECRET
npx vercel dev          # serves POST /api/mcp
```

Deploy: import the repo in Vercel (Node runtime), set `BACKEND_URL`,
`APP_URL` and `MCP_CONFIRM_SECRET` env vars. No filesystem state is used.

## Calling

`POST /api/mcp` with MCP Streamable HTTP framing and headers:

| Header | Purpose |
|---|---|
| `Authorization: Bearer <backend OAuth access token>` | Identity authority (validated against the backend every request) |
| `x-mcp-agent` | AI agent id (used for mandates + audit) |
| `x-mcp-connection` | Connection id for audit |
| `x-mcp-consent` | JSON consent `{ scopes[], expiresAt?, revoked? }` |

Sensitive writes return `{ status: "confirmation_required", confirmation: { token, action, summary } }`.
Repeat the call with `confirm: true` plus the echoed `confirmationToken` to execute.

## Tools

90+ tools across customer, KSC, artist, owner, worker, withdrawal and
admin domains — see [docs/TOOLS.md](docs/TOOLS.md). Every tool declares
`classification`, `roles`, `scopes`, `confirmation`, `financial` and
`mandate` requirements.

Key rules enforced:

- Roles re-resolve per request; multiple roles are never collapsed to ADMIN.
- Writes need consent scopes + matching role + confirmation token.
- Financial tools never compute money; the backend authorizes, captures,
  settles and ledgers. Raw ledger primitives are not exposed.
- Rider selection is company-paid via the backend rider flow — never a cart,
  never KSC.
- Known backend gaps are explicit `UNSUPPORTED_OPERATION` errors, never faked.
  See [docs/GAPS.md](docs/GAPS.md).

## Backend endpoint map

Every wired path was verified against the Spring controllers:
[docs/ENDPOINTS.md](docs/ENDPOINTS.md).
