/**
 * Owner tools (§12). Every mutation is scoped to the caller's business:
 * ownership is pre-checked against live backend reads, and the backend
 * re-enforces it. Complex bodies pass through as backend-native shapes.
 */

import { z } from "zod";
import { backendDelete, backendGet, backendPatch, backendPost, backendPut } from "../backend/client.js";
import { API } from "../backend/endpoints.js";
import { McpError } from "../auth/errors.js";
import { assertSameBusiness, fetchBusinessId, requireConfirmation } from "../auth/pipeline.js";
import { auditTool, defineTool, type KingSparkonTool } from "./types.js";

const confirmFields = {
  confirm: z.boolean().optional(),
  confirmationToken: z.string().optional(),
};

type ConfirmArgs = { confirm?: boolean; confirmationToken?: string };

const OWNER = ["OWNER"] as const;

async function confirmedAction(
  tool: KingSparkonTool,
  ctx: Parameters<typeof auditTool>[0],
  action: string,
  summary: Record<string, unknown>,
  argsForToken: unknown,
  args: ConfirmArgs,
  resourceType?: string,
  resourceId?: string,
): Promise<null | { status: "confirmation_required"; confirmation: { token: string; action: string; summary: Record<string, unknown> } }> {
  const gate = requireConfirmation(args, { action, summary, argsForToken });
  if (gate) {
    auditTool(ctx, tool, "confirmation_required", { resourceType: resourceType ?? null, resourceId: resourceId ?? null });
    return gate;
  }
  return null;
}

const getMyBusiness = defineTool({
  name: "get_my_business",
  description: "Get my business profile and wallet summary.",
  security: { classification: "READ", roles: [...OWNER], scopes: ["business.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const summary = await backendGet(ctx, API.businessAccountSummary);
    auditTool(ctx, getMyBusiness, "ok");
    return summary;
  },
});

const getMyBusinessProfile = defineTool({
  name: "get_my_business_profile",
  description: "Get my user profile with business assignment.",
  security: { classification: "READ", roles: [...OWNER], scopes: ["business.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const profile = await backendGet(ctx, API.usersMe);
    auditTool(ctx, getMyBusinessProfile, "ok");
    return profile;
  },
});

const getMyBusinessMembers = defineTool({
  name: "get_my_business_members",
  description: "List users belonging to my business (owners and workers).",
  security: { classification: "READ", roles: [...OWNER], scopes: ["workers.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { page: z.number().int().min(0).optional(), size: z.number().int().min(1).max(100).optional() },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { page?: number; size?: number };
    const users = await backendGet(ctx, API.ownerUsers, { page: args.page ?? 0, size: args.size ?? 20 });
    auditTool(ctx, getMyBusinessMembers, "ok");
    return users;
  },
});

const getMyBusinessWorkers = defineTool({
  name: "get_my_business_workers",
  description: "List workers of my business.",
  security: { classification: "READ", roles: [...OWNER], scopes: ["workers.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const workers = await backendGet(ctx, API.ownerUsers, { page: 0, size: 100 });
    auditTool(ctx, getMyBusinessWorkers, "ok");
    return workers;
  },
});

const getMyEvents = defineTool({
  name: "get_my_events",
  description: "List my ticket events and my drafted artist events.",
  security: { classification: "READ", roles: [...OWNER], scopes: ["events.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const [ticketEvents, artistEvents] = await Promise.all([
      backendGet(ctx, API.ticketOwnerEvents).catch(() => []),
      backendGet(ctx, API.ownerArtistEvents).catch(() => []),
    ]);
    auditTool(ctx, getMyEvents, "ok");
    return { ticketEvents, artistEvents };
  },
});

const getEventOwner = defineTool({
  name: "get_owner_event",
  description: "Get one of my ticket events with capacity and sales context.",
  security: { classification: "READ", roles: [...OWNER], scopes: ["events.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { eventId: z.string().min(1) },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { eventId: string };
    const event = (await backendGet(ctx, API.ticketEvent(args.eventId))) as Record<string, unknown>;
    const businessId = await fetchBusinessId(ctx);
    if (event.businessId != null && businessId != null) {
      assertSameBusiness(businessId, Number(event.businessId), "event");
    }
    auditTool(ctx, getEventOwner, "ok", { resourceType: "event", resourceId: args.eventId });
    return event;
  },
});

const createEvent = defineTool({
  name: "create_event",
  description: "Create a ticket event (backend-native event shape; backend validates).",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["events.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { event: z.record(z.string(), z.unknown()).describe("Backend CreateEventRequest shape."), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { event: Record<string, unknown> } & ConfirmArgs;
    const gate = await confirmedAction(createEvent, ctx, "create_event", { event: args.event }, { event: args.event }, args, "event");
    if (gate) return gate;
    const created = await backendPost(ctx, API.ticketEvents, args.event);
    auditTool(ctx, createEvent, "ok", { resourceType: "event" });
    return created;
  },
});

const updateEvent = defineTool({
  name: "update_event",
  description: "Update one of my ticket events (backend-native shape).",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["events.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { eventId: z.string().min(1), event: z.record(z.string(), z.unknown()), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { eventId: string; event: Record<string, unknown> } & ConfirmArgs;
    const gate = await confirmedAction(updateEvent, ctx, "update_event", { eventId: args.eventId }, { eventId: args.eventId, event: args.event }, args, "event", args.eventId);
    if (gate) return gate;
    const updated = await backendPatch(ctx, API.ticketEvent(args.eventId), args.event);
    auditTool(ctx, updateEvent, "ok", { resourceType: "event", resourceId: args.eventId });
    return updated;
  },
});

async function setEventStatus(
  tool: KingSparkonTool,
  ctx: Parameters<typeof auditTool>[0],
  eventId: string,
  status: "PUBLISHED" | "DRAFT" | "CANCELLED",
  args: ConfirmArgs,
) {
  const gate = await confirmedAction(tool, ctx, `${status.toLowerCase()}_event`, { eventId, status }, { eventId, status }, args, "event", eventId);
  if (gate) return gate;
  const updated = await backendPatch(ctx, API.ticketEvent(eventId), { status });
  auditTool(ctx, tool, "ok", { resourceType: "event", resourceId: eventId });
  return updated;
}

const publishEvent = defineTool({
  name: "publish_event",
  description: "Publish one of my ticket events for sale.",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["events.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { eventId: z.string().min(1), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { eventId: string } & ConfirmArgs;
    return setEventStatus(publishEvent, ctx, args.eventId, "PUBLISHED", args);
  },
});

const unpublishEvent = defineTool({
  name: "unpublish_event",
  description: "Return one of my ticket events to draft.",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["events.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { eventId: z.string().min(1), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { eventId: string } & ConfirmArgs;
    return setEventStatus(unpublishEvent, ctx, args.eventId, "DRAFT", args);
  },
});

const cancelEvent = defineTool({
  name: "cancel_event",
  description: "Cancel one of my ticket events.",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["events.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { eventId: z.string().min(1), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { eventId: string } & ConfirmArgs;
    return setEventStatus(cancelEvent, ctx, args.eventId, "CANCELLED", args);
  },
});

const getEventSets = defineTool({
  name: "get_event_sets",
  description: "List performance sets of an event.",
  security: { classification: "READ", roles: [...OWNER], scopes: ["sets.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { eventId: z.string().min(1) },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { eventId: string };
    const sets = await backendGet(ctx, API.eventSets(args.eventId));
    auditTool(ctx, getEventSets, "ok", { resourceType: "event", resourceId: args.eventId });
    return sets;
  },
});

const createEventSet = defineTool({
  name: "create_event_set",
  description: "Create a performance set on my drafted event (backend-native shape with startTime/endTime).",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["sets.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { eventId: z.string().min(1), set: z.record(z.string(), z.unknown()), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { eventId: string; set: Record<string, unknown> } & ConfirmArgs;
    const gate = await confirmedAction(createEventSet, ctx, "create_event_set", { eventId: args.eventId }, { eventId: args.eventId, set: args.set }, args, "event", args.eventId);
    if (gate) return gate;
    const created = await backendPost(ctx, API.eventSets(args.eventId), args.set);
    auditTool(ctx, createEventSet, "ok", { resourceType: "event", resourceId: args.eventId });
    return created;
  },
});

const updateEventSet = defineTool({
  name: "update_event_set",
  description: "Update or cancel a performance set (backend-native shape).",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["sets.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { setId: z.string().min(1), set: z.record(z.string(), z.unknown()), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { setId: string; set: Record<string, unknown> } & ConfirmArgs;
    const gate = await confirmedAction(updateEventSet, ctx, "update_event_set", { setId: args.setId }, { setId: args.setId, set: args.set }, args, "set", args.setId);
    if (gate) return gate;
    const updated = await backendPatch(ctx, API.eventSet(args.setId), args.set);
    auditTool(ctx, updateEventSet, "ok", { resourceType: "set", resourceId: args.setId });
    return updated;
  },
});

const deleteEventSet = defineTool({
  name: "delete_event_set",
  description: "Cancel a performance set via status update (backend has no hard delete; uses CANCELLED).",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["sets.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { setId: z.string().min(1), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { setId: string } & ConfirmArgs;
    const gate = await confirmedAction(deleteEventSet, ctx, "delete_event_set", { setId: args.setId }, { setId: args.setId }, args, "set", args.setId);
    if (gate) return gate;
    const updated = await backendPatch(ctx, API.eventSet(args.setId), { status: "CANCELLED" });
    auditTool(ctx, deleteEventSet, "ok", { resourceType: "set", resourceId: args.setId });
    return updated;
  },
});

const searchArtistsOwner = defineTool({
  name: "search_artists_owner",
  description: "Search artists (owner view). Limited: no public directory exists; use get_artist_owner with a known id.",
  security: { classification: "READ", roles: [...OWNER], scopes: ["artists.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { query: z.string().optional() },
  handler: async (ctx) => {
    auditTool(ctx, searchArtistsOwner, "error");
    throw new McpError("UNSUPPORTED_OPERATION", "Artist name search is not supported by the backend. Use get_artist_owner with a known artist user id.");
  },
});

const getArtistOwner = defineTool({
  name: "get_artist_owner",
  description: "Get an artist profile by user id (owner view).",
  security: { classification: "READ", roles: [...OWNER], scopes: ["artists.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { artistId: z.number().int().positive() },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { artistId: number };
    const profile = await backendGet(ctx, API.artistProfileById(args.artistId));
    auditTool(ctx, getArtistOwner, "ok", { resourceType: "artist", resourceId: String(args.artistId) });
    return profile;
  },
});

const inviteArtist = defineTool({
  name: "invite_artist",
  description: "Invite an artist without an offer. Limited: the backend only supports booking with an offer — use book_artist.",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["artists.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { artistId: z.number().int().positive(), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { artistId: number };
    auditTool(ctx, inviteArtist, "error", { resourceType: "artist", resourceId: String(args.artistId) });
    throw new McpError("UNSUPPORTED_OPERATION", "Offer-less invites are not supported by the backend. Use book_artist with an offer amount.");
  },
});

const bookArtist = defineTool({
  name: "book_artist",
  description: "Book an artist on a manual set with an offer (backend-native booking shape).",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["bookings.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { setId: z.string().min(1), booking: z.record(z.string(), z.unknown()), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { setId: string; booking: Record<string, unknown> } & ConfirmArgs;
    const gate = await confirmedAction(bookArtist, ctx, "book_artist", { setId: args.setId }, { setId: args.setId, booking: args.booking }, args, "set", args.setId);
    if (gate) return gate;
    const booking = await backendPost(ctx, API.setBookArtist(args.setId), args.booking);
    auditTool(ctx, bookArtist, "ok", { resourceType: "set", resourceId: args.setId });
    return booking;
  },
});

const rejectArtist = defineTool({
  name: "reject_artist",
  description: "Reject an artist's set application.",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["artists.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { setId: z.string().min(1), applicationId: z.string().min(1), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { setId: string; applicationId: string } & ConfirmArgs;
    const gate = await confirmedAction(rejectArtist, ctx, "reject_artist", { setId: args.setId, applicationId: args.applicationId }, { setId: args.setId, applicationId: args.applicationId }, args, "set", args.setId);
    if (gate) return gate;
    const result = await backendPost(ctx, API.setApplicationReject(args.setId, args.applicationId));
    auditTool(ctx, rejectArtist, "ok", { resourceType: "set", resourceId: args.setId });
    return result;
  },
});

const removeArtist = defineTool({
  name: "remove_artist",
  description: "Remove a booked artist by cancelling their set booking (owner).",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["bookings.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { bookingId: z.string().min(1), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { bookingId: string } & ConfirmArgs;
    const gate = await confirmedAction(removeArtist, ctx, "remove_artist", { bookingId: args.bookingId }, { bookingId: args.bookingId }, args, "set-booking", args.bookingId);
    if (gate) return gate;
    const result = await backendPost(ctx, API.setBookingCancel(args.bookingId));
    auditTool(ctx, removeArtist, "ok", { resourceType: "set-booking", resourceId: args.bookingId });
    return result;
  },
});

const getEventArtists = defineTool({
  name: "get_event_artists",
  description: "List bookings of a set (artists engaged on it).",
  security: { classification: "READ", roles: [...OWNER], scopes: ["artists.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { setId: z.string().min(1) },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { setId: string };
    const bookings = await backendGet(ctx, API.setBookings(args.setId));
    auditTool(ctx, getEventArtists, "ok", { resourceType: "set", resourceId: args.setId });
    return bookings;
  },
});

const getArtistBooking = defineTool({
  name: "get_artist_booking",
  description: "List artist booking requests for one of my drafted events.",
  security: { classification: "READ", roles: [...OWNER], scopes: ["bookings.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { eventId: z.string().min(1) },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { eventId: string };
    const requests = await backendGet(ctx, API.ownerArtistRequests, { eventId: args.eventId });
    auditTool(ctx, getArtistBooking, "ok", { resourceType: "event", resourceId: args.eventId });
    return requests;
  },
});

async function decideDraftedRequest(
  tool: KingSparkonTool,
  ctx: Parameters<typeof auditTool>[0],
  requestId: string | number,
  decision: "accept" | "reject",
  args: ConfirmArgs,
) {
  const gate = await confirmedAction(tool, ctx, `${decision}_artist_request`, { requestId }, { requestId }, args, "booking-request", String(requestId));
  if (gate) return gate;
  const path = decision === "accept" ? API.ownerArtistRequestAccept(requestId) : API.ownerArtistRequestReject(requestId);
  const result = await backendPost(ctx, path);
  auditTool(ctx, tool, "ok", { resourceType: "booking-request", resourceId: String(requestId) });
  return result;
}

const acceptArtistRequest = defineTool({
  name: "accept_artist_request",
  description: "Accept an artist's request to perform at my drafted event.",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["bookings.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { requestId: z.union([z.string(), z.number()]), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { requestId: string | number } & ConfirmArgs;
    return decideDraftedRequest(acceptArtistRequest, ctx, args.requestId, "accept", args);
  },
});

const rejectArtistRequest = defineTool({
  name: "reject_artist_request",
  description: "Reject an artist's request to perform at my drafted event.",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["bookings.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { requestId: z.union([z.string(), z.number()]), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { requestId: string | number } & ConfirmArgs;
    return decideDraftedRequest(rejectArtistRequest, ctx, args.requestId, "reject", args);
  },
});

const getEventRiderSettings = defineTool({
  name: "get_event_rider_settings",
  description: "Get rider settings and per-artist spend for one of my events.",
  security: { classification: "READ", roles: [...OWNER], scopes: ["rider.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { eventId: z.string().min(1) },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { eventId: string };
    const summary = await backendGet(ctx, API.ownerArtistEventRider(args.eventId));
    auditTool(ctx, getEventRiderSettings, "ok", { resourceType: "event", resourceId: args.eventId });
    return summary;
  },
});

async function setRider(
  tool: KingSparkonTool,
  ctx: Parameters<typeof auditTool>[0],
  eventId: string,
  riderAvailable: boolean,
  riderAmount: number | undefined,
  args: ConfirmArgs,
) {
  const gate = await confirmedAction(tool, ctx, "set_event_rider", { eventId, riderAvailable, riderAmount }, { eventId, riderAvailable, riderAmount }, args, "event", eventId);
  if (gate) return gate;
  const updated = await backendPut(ctx, API.ownerArtistEvent(eventId), { riderAvailable, riderAmount });
  auditTool(ctx, tool, "ok", { resourceType: "event", resourceId: eventId });
  return updated;
}

const setEventRider = defineTool({
  name: "set_event_rider",
  description: "Enable the hospitality rider with an amount on my drafted event.",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["rider.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { eventId: z.string().min(1), riderAmount: z.number().positive(), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { eventId: string; riderAmount: number } & ConfirmArgs;
    return setRider(setEventRider, ctx, args.eventId, true, args.riderAmount, args);
  },
});

const updateEventRider = defineTool({
  name: "update_event_rider",
  description: "Change the rider amount (never below what artists already redeemed — enforced server-side).",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["rider.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { eventId: z.string().min(1), riderAmount: z.number().positive(), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { eventId: string; riderAmount: number } & ConfirmArgs;
    return setRider(updateEventRider, ctx, args.eventId, true, args.riderAmount, args);
  },
});

const disableEventRider = defineTool({
  name: "disable_event_rider",
  description: "Disable the hospitality rider on my drafted event.",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["rider.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { eventId: z.string().min(1), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { eventId: string } & ConfirmArgs;
    return setRider(disableEventRider, ctx, args.eventId, false, undefined, args);
  },
});

const getRiderProductOptions = defineTool({
  name: "get_rider_product_options",
  description: "List my in-stock company products eligible for rider redemption.",
  security: { classification: "READ", roles: [...OWNER], scopes: ["rider.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { size: z.number().int().min(1).max(50).optional() },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { size?: number };
    const businessId = await fetchBusinessId(ctx);
    const page = await backendGet<{ content?: unknown[] } | unknown[]>(ctx, API.tuckShopProducts, {
      businessId: businessId ?? undefined,
      size: args.size ?? 50,
    });
    const products = (Array.isArray(page) ? page : (page.content ?? [])).filter((product) => {
      const record = product as Record<string, unknown>;
      return Number(record.stockQuantity ?? 0) > 0;
    });
    auditTool(ctx, getRiderProductOptions, "ok");
    return products;
  },
});

const getMyProducts = defineTool({
  name: "get_my_products",
  description: "List my business products with stock.",
  security: { classification: "READ", roles: [...OWNER], scopes: ["products.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { page: z.number().int().min(0).optional(), size: z.number().int().min(1).max(100).optional() },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { page?: number; size?: number };
    const products = await backendGet(ctx, API.products, { page: args.page ?? 0, size: args.size ?? 20 });
    auditTool(ctx, getMyProducts, "ok");
    return products;
  },
});

const createProduct = defineTool({
  name: "create_product",
  description: "Create a product in my business catalogue (backend-native shape).",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["products.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { product: z.record(z.string(), z.unknown()), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { product: Record<string, unknown> } & ConfirmArgs;
    const gate = await confirmedAction(createProduct, ctx, "create_product", { product: args.product }, { product: args.product }, args, "product");
    if (gate) return gate;
    const created = await backendPost(ctx, API.products, args.product);
    auditTool(ctx, createProduct, "ok", { resourceType: "product" });
    return created;
  },
});

const updateProduct = defineTool({
  name: "update_product",
  description: "Update a product (quantity, image, approval). Backend-native shape.",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["products.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { productId: z.number().int().positive(), product: z.record(z.string(), z.unknown()), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { productId: number; product: Record<string, unknown> } & ConfirmArgs;
    const gate = await confirmedAction(updateProduct, ctx, "update_product", { productId: args.productId }, { productId: args.productId, product: args.product }, args, "product", String(args.productId));
    if (gate) return gate;
    const updated = await backendPut(ctx, API.product(args.productId), args.product);
    auditTool(ctx, updateProduct, "ok", { resourceType: "product", resourceId: String(args.productId) });
    return updated;
  },
});

const deleteProduct = defineTool({
  name: "delete_product",
  description: "Delete a product from my catalogue.",
  security: { classification: "WRITE_BUSINESS", roles: [...OWNER], scopes: ["products.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { productId: z.number().int().positive(), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { productId: number } & ConfirmArgs;
    const gate = await confirmedAction(deleteProduct, ctx, "delete_product", { productId: args.productId }, { productId: args.productId }, args, "product", String(args.productId));
    if (gate) return gate;
    await backendDelete(ctx, API.product(args.productId));
    auditTool(ctx, deleteProduct, "ok", { resourceType: "product", resourceId: String(args.productId) });
    return { deleted: true, productId: args.productId };
  },
});

export const ownerTools: KingSparkonTool[] = [
  getMyBusiness,
  getMyBusinessProfile,
  getMyBusinessMembers,
  getMyBusinessWorkers,
  getMyEvents,
  getEventOwner,
  createEvent,
  updateEvent,
  publishEvent,
  unpublishEvent,
  cancelEvent,
  getEventSets,
  createEventSet,
  updateEventSet,
  deleteEventSet,
  searchArtistsOwner,
  getArtistOwner,  inviteArtist,
  bookArtist,
  rejectArtist,
  removeArtist,
  getEventArtists,
  getArtistBooking,
  acceptArtistRequest,
  rejectArtistRequest,
  getEventRiderSettings,
  setEventRider,
  updateEventRider,
  disableEventRider,
  getRiderProductOptions,
  getMyProducts,
  createProduct,
  updateProduct,
  deleteProduct,
];
