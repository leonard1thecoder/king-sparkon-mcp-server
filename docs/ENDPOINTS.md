# Backend endpoint map

All paths verified against `king-sparkon-tracker-backend` controllers.
Base: `{BACKEND_URL}/api`. Auth: `Authorization: Bearer <backend OAuth token>`.
New domain endpoints (notifications, directory, shifts, artist eligibility)
landed in backend migrations `V20261007`/`V20261008` — they answer once the
backend is redeployed; until then the MCP tools fail honestly with
`BACKEND_ERROR` instead of faking.

## Identity / users

| MCP use | Method + path |
|---|---|
| Identity authority | `GET /api/users/me` |
| Business workers (user tip discovery) | `GET /api/user-dashboard/businesses`, `GET /api/user-dashboard/businesses/{id}/workers` |

## Artist

| MCP use | Method + path |
|---|---|
| Profile | `GET/PUT /api/artist/profile`, `GET /api/artist/profile/{id}` |
| Directory (visible profiles only) | `GET /api/artists/directory?q=&type=&page=&size=` |
| Drafted discovery | `GET /api/artist/events/drafted`, `GET /api/artist/events/{id}` |
| Bookings | `POST /api/artist/events/{id}/request`, `GET /api/artist/bookings`, `GET /api/artist/booked`, `GET /api/artist/bookings/event/{id}/status`, `GET /api/artist/schedule`, `GET /api/artist/dashboard` |
| Earnings | `GET /api/artist/earnings/balance`, `GET /api/artist/withdrawals/eligibility`, `GET/POST /api/artist/withdrawals` |
| Mall / tickets | `GET /api/artist/mall/products`, `POST /api/artist/mall/purchases`, `GET /api/artist/mall/my-purchases`, `GET /api/artist/tickets/events`, `POST /api/artist/tickets/purchase`, `GET /api/artist/tickets/my-tickets` |
| Rider | `GET /api/artist/events/{id}/rider`, `POST /api/artist/events/{id}/rider/redeem` |

## Owner

| MCP use | Method + path |
|---|---|
| Artist events | `POST/PUT/GET /api/owner/artist/events`, `POST /api/owner/artist/events/{id}/publish`, `GET /api/owner/artist/events/{eventId}/rider` |
| Booking requests | `GET /api/owner/artist/requests`, `POST /api/owner/artist/requests/{id}/accept\|reject` |
| Artist payouts | `GET /api/owner/artist/withdrawals/pending`, `POST /api/owner/artist/withdrawals/{id}/approve\|reject\|mark-paid` |
| Workers/users | `GET /api/users`, `POST/DELETE /api/users/workers`, `PATCH /api/users/workers/{id}/staff-discount` |
| Business wallet | `GET /api/business-account/summary|wallet|ledger`, `GET/POST /api/business-account/withdrawals`, `POST /api/business-account/top-ups`, `POST /api/business-account/top-ups/{id}/confirm` |
| Owner withdrawals | `GET /api/transactions/withdrawals/eligibility`, `GET/POST /api/transactions/withdrawals`, `POST /api/transactions/withdrawals/paypal/onboarding` |
| Ticket events | `GET /api/v1/tickets/events`, `POST /api/v1/tickets/events`, `PATCH /api/v1/tickets/events/{id}`, `GET /api/v1/tickets/owner/dashboard`, `GET /api/v1/tickets/owner/events`, `GET/POST /api/v1/tickets/owner/withdrawals` |
| Event sets | `POST/GET /api/v1/tickets/events/{id}/sets`, `PATCH /api/v1/tickets/sets/{id}`, `GET /api/v1/tickets/sets/open`, `GET /api/v1/tickets/sets/{id}/applications`, `GET /api/v1/tickets/sets/{id}/bookings`, `POST /api/v1/tickets/sets/{id}/applications/{appId}/reject`, `POST /api/v1/tickets/sets/{id}/book-winner`, `POST /api/v1/tickets/sets/{id}/book-artist`, `POST /api/v1/tickets/events/{id}/complete-draft` |
| Products | `GET/POST /api/products`, `GET/PATCH/DELETE /api/products/{id}`, `GET /api/products/barcode/{barcode}` |

## Worker

| MCP use | Method + path |
|---|---|
| Shifts | `GET /api/worker/shifts/me?from=&to=`, owner: `POST/GET /api/owner/shifts`, `PATCH /api/owner/shifts/{id}`, `POST /api/owner/shifts/{id}/cancel`, `POST /api/owner/shifts/{id}/complete` |
| Dashboard/mall/tickets | `GET /api/worker/dashboard`, `GET /api/worker/mall/products`, `POST /api/worker/mall/staff-purchases`, `GET /api/worker/mall/my-purchases`, `GET /api/worker/tickets/events`, `GET /api/worker/tickets/my-tickets` |
| Counter/orders | `GET /api/transactions/me`, `GET /api/v1/tuck-shop/workers/online-purchases`, `POST /api/v1/tuck-shop/workers/online-purchases/{tx}/products/{product}/barcodes` |
| Gate | `POST /api/v1/tickets/verify/qr`, `POST /api/v1/tickets/verify/reference` |
| Refunds | `GET /api/v1/refunds/pending`, `POST /api/v1/refunds/{id}/approve\|reject`, `GET /api/v1/tuck-shop/returnable-refunds/pending`, `POST /api/v1/tuck-shop/returnable-refunds/{id}/approve\|reject` |
| Tips | `GET /api/tips/me`, `GET /api/tips/me/ai-confirm`, `GET/POST /api/tips/withdrawals` |

## Affiliate

| MCP use | Method + path |
|---|---|
| Profile/onboarding | `GET /api/affiliates/me`, `PATCH /api/affiliates/me/onboarding` |
| Commissions/tips | `GET /api/affiliates/me/commissions`, `POST/GET /api/affiliates/me/tips` |
| Tip withdrawals | `GET /api/affiliates/me/tip-withdrawals/eligibility`, `GET/POST /api/affiliates/me/tip-withdrawals` |
| Commission withdrawals | `GET /api/affiliates/me/withdrawals/eligibility`, `GET/POST /api/affiliates/me/withdrawals` |
| Referral links | `GET/POST /api/affiliate-links`, `PATCH /api/affiliate-links/{id}`, `GET /api/affiliate-links/random` |

## Notifications

| MCP use | Method + path |
|---|---|
| Inbox | `GET /api/notifications/me?unreadOnly=&page=&size=`, `GET /api/notifications/me/unread-count` |
| Acknowledge | `POST /api/notifications/{id}/read`, `POST /api/notifications/me/read-all` |

## Customer (any authenticated role unless noted)

| MCP use | Method + path |
|---|---|
| Mall | `GET /api/v1/tuck-shop/products`, `GET /api/v1/tuck-shop/products/{id}`, `POST /api/v1/tuck-shop/purchases`, `GET /api/v1/tuck-shop/my-purchases` |
| Tickets | `GET /api/v1/tickets/events`, `GET /api/v1/tickets/events/{id}`, `POST /api/v1/tickets/purchase`, `GET /api/v1/tickets/my-tickets` |
| Tips | `POST /api/tips`, `GET /api/tips/sent` |
| KSC | `GET /api/ksc/wallet`, `GET /api/ksc/wallet/transactions`, `POST /api/ksc/topups`, `GET /api/ksc/topups/{id}`, `POST /api/ksc/payments/authorize`, `POST /api/ksc/payments/{id}/capture\|cancel\|refund\|settle`, `GET /api/ksc/payments/{id}`, `POST/GET /api/ksc/mandates`, `DELETE /api/ksc/mandates/{id}` |

## Admin

| MCP use | Method + path |
|---|---|
| Platform | `GET /api/admin/overview`, `GET /api/admin/users`, `GET /api/admin/users/{id}`, `GET /api/admin/businesses`, `GET /api/admin/businesses/{id}` |
| KSC | `GET /api/ksc/admin/overview`, `GET /api/ksc/admin/settlements[?status=]`, `POST /api/ksc/admin/settlements/{id}/retry` |
