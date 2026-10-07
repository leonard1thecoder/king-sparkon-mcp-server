# Explicit backend gaps (§25)

These MCP tools exist with honest `UNSUPPORTED_OPERATION` behavior because
no backend operation backs them. Nothing is faked; implement the backend
operation first, then flip the tool to call it.

| Tool | Gap |
|---|---|
| `invite_artist` | No offer-less invite endpoint; the backend only books artists with an offer. Use `book_artist`. |
| `decline_assignment` on online orders | No decline operation for preparation orders; only refund reviews can be declined. |
| `review_payment` detail | KSC payment detail is owner-scoped server-side; admin visibility covers the linked settlement row. |
| `purchase_ticket` / `purchase_product` fulfillment | KSC authorize→capture→settle is fully backend-executed, but ticket issuance and product collection orders still go through the standard checkout/collection flows (returned as next steps in the receipt). |

## Resolved gaps (were gaps, now wired — require backend with migrations V20261007/V20261008 deployed)

| Former gap | Resolution |
|---|---|
| Artist directory search (`search_artists`, `search_artists_owner`) | New `GET /api/artists/directory` (paged, `q`/`type` filters, only `profileVisible` profiles, business-card fields only). Both tools now return normalized `{items, page, pageSize, total, hasNext}` instead of `UNSUPPORTED_OPERATION`. |
| Artist withdrawal eligibility | New `GET /api/artist/withdrawals/eligibility` (total, minimum, per-business availability); `get_withdrawal_eligibility` supports the `artist` rail. |
| Notifications | New `user_notifications` table + `GET /api/notifications/me`, `/me/unread-count`, `POST /{id}/read`, `POST /me/read-all`; backend records on withdrawal decisions, booking offers/cancellations and shift changes. MCP: `get_my_notifications`, `mark_notification_read`, `mark_all_notifications_read`. |
| Worker shift schedule | New `worker_shifts` table + owner CRUD (`/api/owner/shifts`) and worker reads (`/api/worker/shifts/me`); workers are notified on schedule/cancel. MCP: `get_my_schedule` returns real shifts; owners get `create_work_shift`, `get_work_shifts`, `cancel_work_shift`. |

| Former gap | Resolution |
|---|---|
| Affiliate role unsupported (`ROLE_NOT_ALLOWED` for all Affiliate users) | `AFFILIATE` added to the role model, permission matrix and reads; 7 affiliate tools over `/api/affiliates/me/**` and `/api/affiliate-links` (verified controller mappings). |
| No KSC payment-status read | `get_ksc_payment` reads lifecycle state + settlement (read-only). |
| No affiliate withdrawal path | `withdraw` rails `affiliate_tip` / `affiliate_commission` + `get_withdrawal_eligibility` for owner/worker/affiliate rails. |
| No MCP resources or prompts | 5 resources (`king-sparkon://me`, `me/permissions`, `me/consent`, `events/{eventId}`, `wallet`) and 4 workflow prompts, all pipeline-authorized. |

## Deliberate non-exposures (backend has the operation; MCP refuses by design)

| Capability | Reason |
|---|---|
| Standalone `ksc_authorize` / `ksc_capture` / `ksc_cancel` / `ksc_settle` / ledger writes | Money moves only through business-intent purchase flows and withdrawal rails (registry test-guards the ban). The purchase flow's capture auto-settles server-side (`KscPaymentService` → `KscSettlementService.process`), so no orphan holds arise from MCP-initiated payments. |
| Standalone KSC refund/cancel of an existing payment | Refunds and cancellations go through backend review flows (e.g. `review_refund`); no direct payment-state tools. |

`get_ksc_overview` and settlement admin reads depend on the additive
`GET /api/ksc/admin/settlements` backend endpoint (shipped alongside).
