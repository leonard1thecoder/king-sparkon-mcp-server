/**
 * Backend endpoint map (§25). Every path below was verified against the
 * Spring Boot controllers — never invent paths. The backend validates all
 * business rules; MCP only routes intent.
 */

export const API = {
  usersMe: "/api/users/me",
  userBusinesses: "/api/user-dashboard/businesses",
  businessWorkers: (businessId: number | string) => `/api/user-dashboard/businesses/${businessId}/workers`,

  // Artist
  artistProfile: "/api/artist/profile",
  artistProfileById: (id: number | string) => `/api/artist/profile/${id}`,
  artistDraftedEvents: "/api/artist/events/drafted",
  artistEvent: (id: string) => `/api/artist/events/${encodeURIComponent(id)}`,
  artistRequestPerform: (id: string) => `/api/artist/events/${encodeURIComponent(id)}/request`,
  artistBookings: "/api/artist/bookings",
  artistBooked: "/api/artist/booked",
  artistBookingStatus: (eventId: string) => `/api/artist/bookings/event/${encodeURIComponent(eventId)}/status`,
  artistSchedule: "/api/artist/schedule",
  artistDashboard: "/api/artist/dashboard",
  artistEarningsBalance: "/api/artist/earnings/balance",
  artistWithdrawals: "/api/artist/withdrawals",
  artistMallProducts: "/api/artist/mall/products",
  artistMallPurchases: "/api/artist/mall/purchases",
  artistMallMyPurchases: "/api/artist/mall/my-purchases",
  artistTicketEvents: "/api/artist/tickets/events",
  artistTicketEvent: (id: string) => `/api/artist/tickets/events/${encodeURIComponent(id)}`,
  artistTicketPurchase: "/api/artist/tickets/purchase",
  artistMyTickets: "/api/artist/tickets/my-tickets",
  artistEventRider: (eventId: string) => `/api/artist/events/${encodeURIComponent(eventId)}/rider`,
  artistEventRiderRedeem: (eventId: string) => `/api/artist/events/${encodeURIComponent(eventId)}/rider/redeem`,

  // Owner — artist events + bookings + rider
  ownerArtistEvents: "/api/owner/artist/events",
  ownerArtistEvent: (id: string) => `/api/owner/artist/events/${encodeURIComponent(id)}`,
  ownerArtistEventPublish: (id: string) => `/api/owner/artist/events/${encodeURIComponent(id)}/publish`,
  ownerArtistEventRider: (eventId: string) => `/api/owner/artist/events/${encodeURIComponent(eventId)}/rider`,
  ownerArtistRequests: "/api/owner/artist/requests",
  ownerArtistRequestAccept: (id: string | number) => `/api/owner/artist/requests/${id}/accept`,
  ownerArtistRequestReject: (id: string | number) => `/api/owner/artist/requests/${id}/reject`,
  ownerArtistPendingWithdrawals: "/api/owner/artist/withdrawals/pending",
  ownerArtistWithdrawal: (id: number | string, decision: "approve" | "reject" | "mark-paid") =>
    `/api/owner/artist/withdrawals/${id}/${decision}`,

  // Owner — workers + business
  ownerWorkers: "/api/users/workers",
  ownerWorker: (id: number | string) => `/api/users/workers/${id}`,
  ownerUsers: "/api/users",
  businessAccountSummary: "/api/business-account/summary",
  businessAccountWallet: "/api/business-account/wallet",
  businessAccountLedger: "/api/business-account/ledger",
  businessAccountWithdrawals: "/api/business-account/withdrawals",
  ownerWithdrawalEligibility: "/api/transactions/withdrawals/eligibility",
  ownerWithdrawals: "/api/transactions/withdrawals",
  ownerPaypalOnboarding: "/api/transactions/withdrawals/paypal/onboarding",

  // Tickets
  ticketEvents: "/api/v1/tickets/events",
  ticketEvent: (id: string) => `/api/v1/tickets/events/${encodeURIComponent(id)}`,
  ticketPurchase: "/api/v1/tickets/purchase",
  ticketMyTickets: "/api/v1/tickets/my-tickets",
  ticketVerifyQr: "/api/v1/tickets/verify/qr",
  ticketVerifyReference: "/api/v1/tickets/verify/reference",
  ticketOwnerDashboard: "/api/v1/tickets/owner/dashboard",
  ticketOwnerEvents: "/api/v1/tickets/owner/events",
  ticketOwnerWithdrawals: "/api/v1/tickets/owner/withdrawals",
  eventSets: (eventId: string) => `/api/v1/tickets/events/${encodeURIComponent(eventId)}/sets`,
  eventSet: (setId: string) => `/api/v1/tickets/sets/${encodeURIComponent(setId)}`,
  eventSetsOpen: "/api/v1/tickets/sets/open",
  setApplications: (setId: string) => `/api/v1/tickets/sets/${encodeURIComponent(setId)}/applications`,
  setBookings: (setId: string) => `/api/v1/tickets/sets/${encodeURIComponent(setId)}/bookings`,
  setApply: (setId: string) => `/api/v1/tickets/sets/${encodeURIComponent(setId)}/apply`,
  setApplicationReject: (setId: string, applicationId: string) =>
    `/api/v1/tickets/sets/${encodeURIComponent(setId)}/applications/${encodeURIComponent(applicationId)}/reject`,
  setApplicationsMe: "/api/v1/tickets/sets/applications/me",
  setVow: (setId: string) => `/api/v1/tickets/sets/${encodeURIComponent(setId)}/vows`,
  setBookWinner: (setId: string) => `/api/v1/tickets/sets/${encodeURIComponent(setId)}/book-winner`,
  setBookArtist: (setId: string) => `/api/v1/tickets/sets/${encodeURIComponent(setId)}/book-artist`,
  setBookingsMe: "/api/v1/tickets/set-bookings/me",
  setBookingAccept: (bookingId: string) => `/api/v1/tickets/set-bookings/${encodeURIComponent(bookingId)}/accept`,
  setBookingReject: (bookingId: string) => `/api/v1/tickets/set-bookings/${encodeURIComponent(bookingId)}/reject`,
  setBookingCancel: (bookingId: string) => `/api/v1/tickets/set-bookings/${encodeURIComponent(bookingId)}/cancel`,
  completeDraft: (eventId: string) => `/api/v1/tickets/events/${encodeURIComponent(eventId)}/complete-draft`,

  // Mall / products
  tuckShopProducts: "/api/v1/tuck-shop/products",
  tuckShopProduct: (id: number | string) => `/api/v1/tuck-shop/products/${id}`,
  tuckShopPurchases: "/api/v1/tuck-shop/purchases",
  tuckShopMyPurchases: "/api/v1/tuck-shop/my-purchases",
  tuckShopStaffPurchases: "/api/v1/tuck-shop/staff-purchases",
  tuckShopOnlinePurchases: "/api/v1/tuck-shop/workers/online-purchases",
  tuckShopAssignBarcode: (transactionId: number | string, productId: number | string) =>
    `/api/v1/tuck-shop/workers/online-purchases/${transactionId}/products/${productId}/barcodes`,
  products: "/api/products",
  product: (id: number | string) => `/api/products/${id}`,
  productByBarcode: (barcode: string) => `/api/products/barcode/${encodeURIComponent(barcode)}`,

  // Worker
  workerDashboard: "/api/worker/dashboard",
  workerMallProducts: "/api/worker/mall/products",
  workerMallStaffPurchases: "/api/worker/mall/staff-purchases",
  workerMallMyPurchases: "/api/worker/mall/my-purchases",
  workerTicketEvents: "/api/worker/tickets/events",
  workerMyTickets: "/api/worker/tickets/my-tickets",
  workerTransactionsMe: "/api/transactions/me",
  workerTipsMe: "/api/tips/me",
  workerTipsAiConfirm: "/api/tips/me/ai-confirm",
  transactions: "/api/transactions",
  pendingRefunds: "/api/v1/refunds/pending",
  refundApprove: (id: number | string) => `/api/v1/refunds/${id}/approve`,
  refundReject: (id: number | string) => `/api/v1/refunds/${id}/reject`,
  pendingReturnableRefunds: "/api/v1/tuck-shop/returnable-refunds/pending",
  returnableRefundApprove: (id: number | string) => `/api/v1/tuck-shop/returnable-refunds/${id}/approve`,
  returnableRefundReject: (id: number | string) => `/api/v1/tuck-shop/returnable-refunds/${id}/reject`,

  // Tips (customer)
  tips: "/api/tips",
  tipsSent: "/api/tips/sent",
  tipsWithdrawals: "/api/tips/withdrawals",

  // KSC
  kscWallet: "/api/ksc/wallet",
  kscTransactions: "/api/ksc/wallet/transactions",
  kscTopups: "/api/ksc/topups",
  kscTopup: (id: number | string) => `/api/ksc/topups/${id}`,
  kscAuthorize: "/api/ksc/payments/authorize",
  kscPayment: (id: string) => `/api/ksc/payments/${encodeURIComponent(id)}`,
  kscCapture: (id: string) => `/api/ksc/payments/${encodeURIComponent(id)}/capture`,
  kscCancel: (id: string) => `/api/ksc/payments/${encodeURIComponent(id)}/cancel`,
  kscRefund: (id: string) => `/api/ksc/payments/${encodeURIComponent(id)}/refund`,
  kscSettle: (id: string) => `/api/ksc/payments/${encodeURIComponent(id)}/settle`,
  kscMandates: "/api/ksc/mandates",
  kscMandate: (id: number | string) => `/api/ksc/mandates/${id}`,
  kscAdminOverview: "/api/ksc/admin/overview",
  kscAdminSettlements: "/api/ksc/admin/settlements",
  kscAdminSettlementRetry: (id: number | string) => `/api/ksc/admin/settlements/${id}/retry`,

  // Admin
  adminOverview: "/api/admin/overview",
  adminUsers: "/api/admin/users",
  adminUser: (id: number | string) => `/api/admin/users/${id}`,
  adminBusinesses: "/api/admin/businesses",
  adminBusiness: (id: number | string) => `/api/admin/businesses/${id}`,
} as const;
