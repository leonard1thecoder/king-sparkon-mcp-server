# King Sparkon MCP — tool inventory (generated)

> Generated from `src/tools/registry.ts`. Do not hand-edit the tables; rerun the generator.
> Total tools: **109**

## customer (15)

| Tool | Classification | Roles | Consent scopes | Confirmation | Financial |
|---|---|---|---|---|---|
| `get_my_profile` | READ | USER, ARTIST, OWNER, WORKER, AFFILIATE | any active consent | NONE | no |
| `get_my_role` | READ | USER, ARTIST, OWNER, WORKER, AFFILIATE, ADMIN | any active consent | NONE | no |
| `get_my_permissions` | READ | USER, ARTIST, OWNER, WORKER, AFFILIATE, ADMIN | any active consent | NONE | no |
| `get_my_consent` | READ | USER, ARTIST, OWNER, WORKER, AFFILIATE, ADMIN | any active consent | NONE | no |
| `search_events` | READ | USER, ARTIST, OWNER, WORKER, AFFILIATE | `events.read` | NONE | no |
| `get_event` | READ | USER, ARTIST, OWNER, WORKER, AFFILIATE | `events.read` | NONE | no |
| `search_products` | READ | USER, ARTIST, OWNER, WORKER, AFFILIATE | `products.read` | NONE | no |
| `get_product` | READ | USER, ARTIST, OWNER, WORKER, AFFILIATE | `products.read` | NONE | no |
| `search_artists` | READ | USER, ARTIST, OWNER, WORKER, AFFILIATE | `artists.read` | NONE | no |
| `get_artist` | READ | ARTIST, OWNER, ADMIN | `artists.read` | NONE | no |
| `get_my_orders` | READ | USER, ARTIST, OWNER, WORKER | `orders.read` | NONE | no |
| `get_my_tickets` | READ | USER, ARTIST, OWNER, WORKER | `tickets.read` | NONE | no |
| `get_my_bookings` | READ | ARTIST | `bookings.read` | NONE | no |
| `purchase_ticket` | WRITE_FINANCIAL | USER, ARTIST, OWNER, WORKER | `tickets.purchase`<br>`payments.write` | REQUIRED | yes |
| `purchase_product` | WRITE_FINANCIAL | USER, ARTIST, OWNER, WORKER | `products.purchase`<br>`payments.write` | REQUIRED | yes |

## ksc (8)

| Tool | Classification | Roles | Consent scopes | Confirmation | Financial |
|---|---|---|---|---|---|
| `get_my_ksc_wallet` | READ | USER, ARTIST, OWNER, WORKER, AFFILIATE, ADMIN | `wallet.read` | NONE | no |
| `get_ksc_transactions` | READ | USER, ARTIST, OWNER, WORKER, AFFILIATE, ADMIN | `wallet.read` | NONE | no |
| `get_ksc_payment` | READ | USER, ARTIST, OWNER, WORKER, AFFILIATE, ADMIN | `wallet.read` | NONE | no |
| `ksc_topup` | WRITE_FINANCIAL | USER, ARTIST, OWNER, WORKER, ADMIN | `payments.write` | REQUIRED | yes |
| `ksc_topup_status` | READ | USER, ARTIST, OWNER, WORKER, AFFILIATE, ADMIN | `wallet.read` | NONE | no |
| `create_mandate` | WRITE_FINANCIAL | USER, ARTIST, OWNER, WORKER, ADMIN | `payments.write` | REQUIRED | yes |
| `list_mandates` | READ | USER, ARTIST, OWNER, WORKER, AFFILIATE, ADMIN | `wallet.read` | NONE | no |
| `revoke_mandate` | WRITE_FINANCIAL | USER, ARTIST, OWNER, WORKER, ADMIN | `payments.write` | REQUIRED | yes |

## artist (15)

| Tool | Classification | Roles | Consent scopes | Confirmation | Financial |
|---|---|---|---|---|---|
| `get_my_artist_profile` | READ | ARTIST | `artist.read` | NONE | no |
| `update_my_artist_profile` | WRITE | ARTIST | `artist.write` | REQUIRED | no |
| `get_my_artist_bookings` | READ | ARTIST | `bookings.read` | NONE | no |
| `get_my_artist_sets` | READ | ARTIST | `sets.read` | NONE | no |
| `get_my_artist_events` | READ | ARTIST | `bookings.read` | NONE | no |
| `get_my_artist_earnings` | READ | ARTIST | `earnings.read` | NONE | no |
| `get_my_artist_wallet` | READ | ARTIST | `wallet.read` | NONE | no |
| `accept_booking` | WRITE_BUSINESS | ARTIST | `bookings.write` | REQUIRED | no |
| `reject_booking` | WRITE_BUSINESS | ARTIST | `bookings.write` | REQUIRED | no |
| `accept_set` | WRITE_BUSINESS | ARTIST | `sets.write` | REQUIRED | no |
| `reject_set` | WRITE_BUSINESS | ARTIST | `sets.write` | REQUIRED | no |
| `get_event_rider` | READ | ARTIST | `rider.read` | NONE | no |
| `get_my_rider_entitlements` | READ | ARTIST | `rider.read` | NONE | no |
| `select_rider_products` | WRITE_BUSINESS | ARTIST | `rider.write` | REQUIRED | no |
| `get_my_product_selections` | READ | ARTIST | `rider.read` | NONE | no |

## owner (37)

| Tool | Classification | Roles | Consent scopes | Confirmation | Financial |
|---|---|---|---|---|---|
| `get_my_business` | READ | OWNER | `business.read` | NONE | no |
| `get_my_business_profile` | READ | OWNER | `business.read` | NONE | no |
| `get_my_business_members` | READ | OWNER | `workers.read` | NONE | no |
| `get_my_business_workers` | READ | OWNER | `workers.read` | NONE | no |
| `get_my_events` | READ | OWNER | `events.read` | NONE | no |
| `get_owner_event` | READ | OWNER | `events.read` | NONE | no |
| `create_event` | WRITE_BUSINESS | OWNER | `events.write` | REQUIRED | no |
| `update_event` | WRITE_BUSINESS | OWNER | `events.write` | REQUIRED | no |
| `publish_event` | WRITE_BUSINESS | OWNER | `events.write` | REQUIRED | no |
| `unpublish_event` | WRITE_BUSINESS | OWNER | `events.write` | REQUIRED | no |
| `cancel_event` | WRITE_BUSINESS | OWNER | `events.write` | REQUIRED | no |
| `get_event_sets` | READ | OWNER | `sets.read` | NONE | no |
| `create_event_set` | WRITE_BUSINESS | OWNER | `sets.write` | REQUIRED | no |
| `update_event_set` | WRITE_BUSINESS | OWNER | `sets.write` | REQUIRED | no |
| `delete_event_set` | WRITE_BUSINESS | OWNER | `sets.write` | REQUIRED | no |
| `search_artists_owner` | READ | OWNER | `artists.read` | NONE | no |
| `get_artist_owner` | READ | OWNER | `artists.read` | NONE | no |
| `invite_artist` | WRITE_BUSINESS | OWNER | `artists.write` | REQUIRED | no |
| `book_artist` | WRITE_BUSINESS | OWNER | `bookings.write` | REQUIRED | no |
| `reject_artist` | WRITE_BUSINESS | OWNER | `artists.write` | REQUIRED | no |
| `remove_artist` | WRITE_BUSINESS | OWNER | `bookings.write` | REQUIRED | no |
| `get_event_artists` | READ | OWNER | `artists.read` | NONE | no |
| `get_artist_booking` | READ | OWNER | `bookings.read` | NONE | no |
| `accept_artist_request` | WRITE_BUSINESS | OWNER | `bookings.write` | REQUIRED | no |
| `reject_artist_request` | WRITE_BUSINESS | OWNER | `bookings.write` | REQUIRED | no |
| `get_event_rider_settings` | READ | OWNER | `rider.read` | NONE | no |
| `set_event_rider` | WRITE_BUSINESS | OWNER | `rider.write` | REQUIRED | no |
| `update_event_rider` | WRITE_BUSINESS | OWNER | `rider.write` | REQUIRED | no |
| `disable_event_rider` | WRITE_BUSINESS | OWNER | `rider.write` | REQUIRED | no |
| `get_rider_product_options` | READ | OWNER | `rider.read` | NONE | no |
| `get_my_products` | READ | OWNER | `products.read` | NONE | no |
| `create_product` | WRITE_BUSINESS | OWNER | `products.write` | REQUIRED | no |
| `update_product` | WRITE_BUSINESS | OWNER | `products.write` | REQUIRED | no |
| `delete_product` | WRITE_BUSINESS | OWNER | `products.write` | REQUIRED | no |
| `create_work_shift` | WRITE_BUSINESS | OWNER | `workers.write` | REQUIRED | no |
| `get_work_shifts` | READ | OWNER | `workers.read` | NONE | no |
| `cancel_work_shift` | WRITE_BUSINESS | OWNER | `workers.write` | REQUIRED | no |

## worker (14)

| Tool | Classification | Roles | Consent scopes | Confirmation | Financial |
|---|---|---|---|---|---|
| `get_my_worker_profile` | READ | WORKER | `worker.read` | NONE | no |
| `get_my_earnings` | READ | WORKER | `earnings.read` | NONE | no |
| `get_my_tips` | READ | WORKER | `earnings.read` | NONE | no |
| `get_my_wallet` | READ | WORKER | `wallet.read` | NONE | no |
| `get_my_assignments` | READ | WORKER | `assignments.read` | NONE | no |
| `get_my_schedule` | READ | WORKER | `schedule.read` | NONE | no |
| `get_my_worker_events` | READ | WORKER | `assignments.read` | NONE | no |
| `get_my_tasks` | READ | WORKER | `assignments.read` | NONE | no |
| `accept_assignment` | WRITE | WORKER | `assignments.write` | REQUIRED | no |
| `decline_assignment` | WRITE | WORKER | `assignments.write` | REQUIRED | no |
| `complete_assignment` | WRITE | WORKER | `assignments.write` | REQUIRED | no |
| `verify_ticket` | WRITE | WORKER | `assignments.write` | NONE | no |
| `review_refund` | WRITE | WORKER | `assignments.write` | REQUIRED | no |
| `assign_barcode` | WRITE | WORKER | `assignments.write` | NONE | no |

## affiliate (7)

| Tool | Classification | Roles | Consent scopes | Confirmation | Financial |
|---|---|---|---|---|---|
| `get_my_affiliate_profile` | READ | AFFILIATE | `affiliate.read` | NONE | no |
| `complete_affiliate_onboarding` | WRITE | AFFILIATE | `affiliate.write` | REQUIRED | no |
| `get_my_commissions` | READ | AFFILIATE | `earnings.read` | NONE | no |
| `get_my_affiliate_tips` | READ | AFFILIATE | `earnings.read` | NONE | no |
| `get_affiliate_withdrawal_eligibility` | READ | AFFILIATE | `earnings.read` | NONE | no |
| `get_my_affiliate_links` | READ | AFFILIATE | `affiliate.read` | NONE | no |
| `create_affiliate_link` | WRITE | AFFILIATE | `affiliate.write` | REQUIRED | no |

## notifications (3)

| Tool | Classification | Roles | Consent scopes | Confirmation | Financial |
|---|---|---|---|---|---|
| `get_my_notifications` | READ | USER, ARTIST, OWNER, WORKER, AFFILIATE, ADMIN | any active consent | NONE | no |
| `mark_notification_read` | WRITE | USER, ARTIST, OWNER, WORKER, AFFILIATE, ADMIN | any active consent | NONE | no |
| `mark_all_notifications_read` | WRITE | USER, ARTIST, OWNER, WORKER, AFFILIATE, ADMIN | any active consent | NONE | no |

## withdraw (2)
| Tool | Classification | Roles | Consent scopes | Confirmation | Financial |
|---|---|---|---|---|---|
| `withdraw` | WRITE_FINANCIAL | ARTIST, OWNER, WORKER, AFFILIATE | `payments.write` | REQUIRED | yes |
| `get_withdrawal_eligibility` | READ | OWNER, WORKER, AFFILIATE | `earnings.read` | NONE | no |

## admin (8)

| Tool | Classification | Roles | Consent scopes | Confirmation | Financial |
|---|---|---|---|---|---|
| `get_platform_overview` | READ | ADMIN | `admin.read` | NONE | no |
| `get_platform_financial_overview` | READ | ADMIN | `admin.read` | NONE | no |
| `get_ksc_overview` | READ | ADMIN | `admin.read` | NONE | no |
| `get_pending_settlements` | READ | ADMIN | `admin.read` | NONE | no |
| `retry_settlement` | WRITE_BUSINESS | ADMIN | `admin.write` | NONE | no |
| `review_user` | READ | ADMIN | `admin.read` | NONE | no |
| `review_event` | READ | ADMIN | `admin.read` | NONE | no |
| `review_payment` | READ | ADMIN | `admin.read` | NONE | no |

## Resources

| URI | Access |
|---|---|
| `king-sparkon://me` | Any authenticated role, any active consent |
| `king-sparkon://me/permissions` | Any authenticated role, any active consent |
| `king-sparkon://me/consent` | Any authenticated role, any active consent |
| `king-sparkon://events/{eventId}` | Any authenticated role + `events.read` scope |
| `king-sparkon://wallet` | Any authenticated role + `wallet.read` scope |

## Prompts

| Prompt | Purpose |
|---|---|
| `event_management` | Owner ticket-event lifecycle guide |
| `artist_booking` | Artist apply/answer booking offers guide |
| `rider_selection` | Company-paid rider redemption guide (never a cart checkout) |
| `payment_review` | Quote-then-confirm discipline before any KSC movement |
