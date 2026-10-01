/**
 * Artist tools (§11). Backend verifies artist ownership on every mutation;
 * MCP pre-gates by role and confirmation.
 */

import { z } from "zod";
import { backendGet, backendPost, backendPut } from "../backend/client.js";
import { API } from "../backend/endpoints.js";
import { McpError } from "../auth/errors.js";
import { requireConfirmation } from "../auth/pipeline.js";
import { auditTool, defineTool, type KingSparkonTool } from "./types.js";

const confirmFields = {
  confirm: z.boolean().optional(),
  confirmationToken: z.string().optional(),
};

const ARTIST = ["ARTIST"] as const;

const getMyArtistProfile = defineTool({
  name: "get_my_artist_profile",
  description: "Get my artist profile (type, fee, bio, links).",
  security: { classification: "READ", roles: [...ARTIST], scopes: ["artist.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const profile = await backendGet(ctx, API.artistProfile);
    auditTool(ctx, getMyArtistProfile, "ok");
    return profile;
  },
});

const updateMyArtistProfile = defineTool({
  name: "update_my_artist_profile",
  description: "Update my artist profile (type, fee, bio, links, location).",
  security: { classification: "WRITE", roles: [...ARTIST], scopes: ["artist.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: {
    artistType: z.enum(["DJ", "MUSICIAN", "MCEE"]).optional(),
    performancesPerDay: z.number().int().min(1).optional(),
    minimumBookingFee: z.number().positive().optional(),
    bio: z.string().max(2000).optional(),
    coverImageUrl: z.string().max(2048).optional(),
    instagramUrl: z.string().max(2048).optional(),
    facebookUrl: z.string().max(2048).optional(),
    tiktokUrl: z.string().max(2048).optional(),
    location: z.string().max(255).optional(),
    ...confirmFields,
  },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as Record<string, unknown>;
    
    const gate = requireConfirmation(args as { confirm?: boolean; confirmationToken?: string }, {
      action: "update_my_artist_profile",
      summary: { update: args },
      argsForToken: args,
    });
    if (gate) {
      auditTool(ctx, updateMyArtistProfile, "confirmation_required");
      return gate;
    }
    const { confirm: _c, confirmationToken: _t, ...payload } = args;
    void _c;
    void _t;
    const profile = await backendPut(ctx, API.artistProfile, payload);
    auditTool(ctx, updateMyArtistProfile, "ok");
    return profile;
  },
});

const getMyArtistBookings = defineTool({
  name: "get_my_artist_bookings",
  description: "List all my performance bookings with request status.",
  security: { classification: "READ", roles: [...ARTIST], scopes: ["bookings.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const bookings = await backendGet(ctx, API.artistBookings);
    auditTool(ctx, getMyArtistBookings, "ok");
    return bookings;
  },
});

const getMyArtistSets = defineTool({
  name: "get_my_artist_sets",
  description: "List my event-set applications and set bookings.",
  security: { classification: "READ", roles: [...ARTIST], scopes: ["sets.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const [applications, bookings] = await Promise.all([
      backendGet(ctx, API.setApplicationsMe).catch(() => []),
      backendGet(ctx, API.setBookingsMe).catch(() => []),
    ]);
    auditTool(ctx, getMyArtistSets, "ok");
    return { applications, bookings };
  },
});

const getMyArtistEvents = defineTool({
  name: "get_my_artist_events",
  description: "List my confirmed booked events plus upcoming schedule.",
  security: { classification: "READ", roles: [...ARTIST], scopes: ["bookings.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const [booked, schedule] = await Promise.all([
      backendGet(ctx, API.artistBooked).catch(() => []),
      backendGet(ctx, API.artistSchedule).catch(() => []),
    ]);
    auditTool(ctx, getMyArtistEvents, "ok");
    return { booked, schedule };
  },
});

const getMyArtistEarnings = defineTool({
  name: "get_my_artist_earnings",
  description: "Get my ZAR booking earnings balance (separate from KSC).",
  security: { classification: "READ", roles: [...ARTIST], scopes: ["earnings.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const balance = await backendGet(ctx, API.artistEarningsBalance);
    auditTool(ctx, getMyArtistEarnings, "ok");
    return balance;
  },
});

const getMyArtistWallet = defineTool({
  name: "get_my_artist_wallet",
  description: "Get my KSC wallet (separate from ZAR earnings).",
  security: { classification: "READ", roles: [...ARTIST], scopes: ["wallet.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const wallet = await backendGet(ctx, API.kscWallet);
    auditTool(ctx, getMyArtistWallet, "ok");
    return wallet;
  },
});

async function decideSetBooking(
  tool: KingSparkonTool,
  ctx: Parameters<typeof auditTool>[0],
  bookingId: string,
  decision: "accept" | "reject",
  args: { confirm?: boolean; confirmationToken?: string },
) {
  
  const gate = requireConfirmation(args, {
    action: `${decision}_booking`,
    summary: { bookingId, decision },
    argsForToken: { bookingId },
  });
  if (gate) {
    auditTool(ctx, tool, "confirmation_required", { resourceType: "set-booking", resourceId: bookingId });
    return gate;
  }
  const path = decision === "accept" ? API.setBookingAccept(bookingId) : API.setBookingReject(bookingId);
  const booking = await backendPost(ctx, path);
  auditTool(ctx, tool, "ok", { resourceType: "set-booking", resourceId: bookingId });
  return booking;
}

const acceptBooking = defineTool({
  name: "accept_booking",
  description: "Accept a set booking offer (artist).",
  security: { classification: "WRITE_BUSINESS", roles: [...ARTIST], scopes: ["bookings.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { bookingId: z.string().min(1), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { bookingId: string; confirm?: boolean; confirmationToken?: string };
    return decideSetBooking(acceptBooking, ctx, args.bookingId, "accept", args);
  },
});

const rejectBooking = defineTool({
  name: "reject_booking",
  description: "Reject a set booking offer (artist).",
  security: { classification: "WRITE_BUSINESS", roles: [...ARTIST], scopes: ["bookings.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { bookingId: z.string().min(1), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { bookingId: string; confirm?: boolean; confirmationToken?: string };
    return decideSetBooking(rejectBooking, ctx, args.bookingId, "reject", args);
  },
});

const acceptSet = defineTool({
  name: "accept_set",
  description: "Apply for an open performance set (artist application).",
  security: { classification: "WRITE_BUSINESS", roles: [...ARTIST], scopes: ["sets.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { setId: z.string().min(1), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { setId: string; confirm?: boolean; confirmationToken?: string };
    
    const gate = requireConfirmation(args, {
      action: "accept_set",
      summary: { setId: args.setId },
      argsForToken: { setId: args.setId },
    });
    if (gate) {
      auditTool(ctx, acceptSet, "confirmation_required", { resourceType: "set", resourceId: args.setId });
      return gate;
    }
    const application = await backendPost(ctx, API.setApply(args.setId));
    auditTool(ctx, acceptSet, "ok", { resourceType: "set", resourceId: args.setId });
    return application;
  },
});

const rejectSet = defineTool({
  name: "reject_set",
  description: "Withdraw my application or decline a set booking (artist).",
  security: { classification: "WRITE_BUSINESS", roles: [...ARTIST], scopes: ["sets.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { bookingId: z.string().min(1).describe("Set booking id to decline."), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { bookingId: string; confirm?: boolean; confirmationToken?: string };
    return decideSetBooking(rejectSet, ctx, args.bookingId, "reject", args);
  },
});

const getEventRider = defineTool({
  name: "get_event_rider",
  description: "Get rider budget, spent and remaining balance plus my redemptions for an event.",
  security: { classification: "READ", roles: [...ARTIST], scopes: ["rider.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { eventId: z.string().min(1) },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { eventId: string };
    try {
      const rider = await backendGet(ctx, API.artistEventRider(args.eventId));
      auditTool(ctx, getEventRider, "ok", { resourceType: "event", resourceId: args.eventId });
      return rider;
    } catch (error) {
      auditTool(ctx, getEventRider, "error");
      if (error instanceof McpError && error.code === "BACKEND_ERROR") {
        throw new McpError("EVENT_NOT_FOUND", "Event not found or rider unavailable.");
      }
      throw error;
    }
  },
});

const getMyRiderEntitlements = defineTool({
  name: "get_my_rider_entitlements",
  description: "List rider entitlements across my confirmed booked events.",
  security: { classification: "READ", roles: [...ARTIST], scopes: ["rider.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const booked = (await backendGet<unknown[]>(ctx, API.artistBooked).catch(() => [])) ?? [];
    const entitlements = [];
    for (const booking of booked) {
      const record = booking as Record<string, unknown>;
      const eventId = String(record.eventId ?? record.event_id ?? "");
      if (!eventId) continue;
      try {
        const rider = await backendGet(ctx, API.artistEventRider(eventId));
        entitlements.push({ eventId, rider });
      } catch {
        continue;
      }
    }
    auditTool(ctx, getMyRiderEntitlements, "ok");
    return entitlements;
  },
});

const selectRiderProducts = defineTool({
  name: "select_rider_products",
  description: "Take company products against the event rider (company-paid collection order, NOT a cart purchase, never KSC).",
  security: { classification: "WRITE_BUSINESS", roles: [...ARTIST], scopes: ["rider.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: {
    eventId: z.string().min(1),
    productId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(100),
    ...confirmFields,
  },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { eventId: string; productId: number; quantity: number; confirm?: boolean; confirmationToken?: string };
    
    const gate = requireConfirmation(args, {
      action: "select_rider_products",
      summary: { eventId: args.eventId, productId: args.productId, quantity: args.quantity },
      argsForToken: { eventId: args.eventId, productId: args.productId, quantity: args.quantity },
    });
    if (gate) {
      auditTool(ctx, selectRiderProducts, "confirmation_required", { resourceType: "event", resourceId: args.eventId, amount: args.quantity, currency: "units" });
      return gate;
    }
    try {
      const redemption = await backendPost(ctx, API.artistEventRiderRedeem(args.eventId), {
        productId: args.productId,
        quantity: args.quantity,
      });
      auditTool(ctx, selectRiderProducts, "ok", { resourceType: "event", resourceId: args.eventId, amount: args.quantity, currency: "units" });
      return {
        ...(redemption as Record<string, unknown>),
        fulfillment: "Company-paid order created straight in My Purchases. Collect at the counter — no cart, no KSC involved.",
      };
    } catch (error) {
      auditTool(ctx, selectRiderProducts, "error");
      throw error;
    }
  },
});

const getMyProductSelections = defineTool({
  name: "get_my_product_selections",
  description: "List products I already took against an event rider.",
  security: { classification: "READ", roles: [...ARTIST], scopes: ["rider.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { eventId: z.string().min(1) },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { eventId: string };
    const rider = (await backendGet(ctx, API.artistEventRider(args.eventId))) as { items?: unknown[] };
    auditTool(ctx, getMyProductSelections, "ok", { resourceType: "event", resourceId: args.eventId });
    return rider.items ?? [];
  },
});

export const artistTools: KingSparkonTool[] = [
  getMyArtistProfile,
  updateMyArtistProfile,
  getMyArtistBookings,
  getMyArtistSets,
  getMyArtistEvents,
  getMyArtistEarnings,
  getMyArtistWallet,
  acceptBooking,
  rejectBooking,
  acceptSet,
  rejectSet,
  getEventRider,
  getMyRiderEntitlements,
  selectRiderProducts,
  getMyProductSelections,
];

