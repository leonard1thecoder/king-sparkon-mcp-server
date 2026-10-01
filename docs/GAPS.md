# Explicit backend gaps (§25)

These MCP tools exist with honest `UNSUPPORTED_OPERATION` behavior because
no backend operation backs them. Nothing is faked; implement the backend
operation first, then flip the tool to call it.

| Tool | Gap |
|---|---|
| `search_artists`, `search_artists_owner` | No public artist directory/search endpoint in the backend. `get_artist` / `get_artist_owner` work with a known id (role-gated server-side). |
| `invite_artist` | No offer-less invite endpoint; the backend only books artists with an offer. Use `book_artist`. |
| `decline_assignment` on online orders | No decline operation for preparation orders; only refund reviews can be declined. |
| `review_payment` detail | KSC payment detail is owner-scoped server-side; admin visibility covers the linked settlement row. |
| `purchase_ticket` / `purchase_product` fulfillment | KSC authorize→capture→settle is fully backend-executed, but ticket issuance and product collection orders still go through the standard checkout/collection flows (returned as next steps in the receipt). |
| Worker shift schedule | No schedule backend; `get_my_schedule` returns open duties instead. |

`get_ksc_overview` and settlement admin reads depend on the additive
`GET /api/ksc/admin/settlements` backend endpoint (shipped alongside).
