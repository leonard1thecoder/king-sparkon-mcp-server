/**
 * Customer tools (§10). All `/my` resources resolve from the authenticated
 * user — AI-supplied user IDs are never accepted for private data.
 */

import { z } from "zod";
import { backendGet } from "../backend/client.js";
import { API } from "../backend/endpoints.js";
import { McpError } from "../auth/errors.js";
import type { McpRequestContext } from "../auth/pipeline.js";
import { auditTool, authorizeTool, defineTool, type KingSparkonTool } from "./types.js";
import { kscPurchaseFlow } from "./ksc.js";

const confirmFields = {
  confirm: z.boolean().optional(),
  confirmationToken: z.string().optional(),
};

const CUSTOMER_ROLES = ["USER", "ARTIST", "OWNER", "WORKER", "AFFILIATE"] as const;
/** Roles allowed to move money or hold purchase history (affiliates use affiliate rails instead). */
const PURCHASE_ROLES = ["USER", "ARTIST", "OWNER", "WORKER"] as const;

const getMyProfile = defineTool({
  name: "get_my_profile",
  description: "Get the authenticated user's King Sparkon profile.",
  security: { classification: "READ", roles: [...CUSTOMER_ROLES], scopes: [], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const profile = await backendGet(ctx, API.usersMe);
    auditTool(ctx, getMyProfile, "ok");
    return profile;
  },
});

const getMyRole = defineTool({
  name: "get_my_role",
  description: "Get the authenticated user's current backend roles (re-resolved every request, never cached).",
  security: { classification: "READ", roles: [...CUSTOMER_ROLES, "ADMIN"], scopes: [], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    auditTool(ctx, getMyRole, "ok");
    return { roles: ctx.identity.roles, businessId: ctx.identity.businessId, businessName: ctx.identity.businessName };
  },
});

const getMyPermissions = defineTool({
  name: "get_my_permissions",
  description: "List the MCP permissions the current roles may request.",
  security: { classification: "READ", roles: [...CUSTOMER_ROLES, "ADMIN"], scopes: [], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const { permissionsForRoles } = await import("../auth/consent.js");
    const permissions = permissionsForRoles(ctx.identity.roles);
    auditTool(ctx, getMyPermissions, "ok");
    return { roles: ctx.identity.roles, permissions };
  },
});

const getMyConsent = defineTool({
  name: "get_my_consent",
  description: "Show the effective MCP consent for this connection: granted scopes, expiry and role permissions.",
  security: { classification: "READ", roles: [...CUSTOMER_ROLES, "ADMIN"], scopes: [], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const { permissionsForRoles } = await import("../auth/consent.js");
    auditTool(ctx, getMyConsent, "ok");
    return {
      connectionId: ctx.connectionId,
      agentId: ctx.agentId,
      grantedScopes: ctx.consent?.scopes ?? [],
      expiresAt: ctx.consent?.expiresAt ?? null,
      revoked: ctx.consent?.revoked ?? false,
      permissions: permissionsForRoles(ctx.identity.roles),
    };
  },
});

const searchEvents = defineTool({
  name: "search_events",
  description: "Search published ticket events (public catalogue).",
  security: { classification: "READ", roles: [...CUSTOMER_ROLES], scopes: ["events.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { query: z.string().optional(), date: z.string().optional(), location: z.string().optional() },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { query?: string; date?: string; location?: string };
    const events = (await backendGet<unknown[]>(ctx, API.ticketEvents)) ?? [];
    const query = (args.query ?? "").toLowerCase();
    const filtered = events.filter((event) => {
      const record = event as Record<string, unknown>;
      const haystack = `${record.name ?? ""} ${record.description ?? ""} ${record.location ?? ""}`.toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (args.location && String(record.location ?? "").toLowerCase() !== args.location.toLowerCase()) return false;
      if (args.date && String(record.eventDate ?? "") !== args.date) return false;
      return true;
    });
    // Abuse protection (§28): the backend list is unpaged, so bound AI-facing results.
    auditTool(ctx, searchEvents, "ok");
    return filtered.slice(0, 50);
  },
});

const getEvent = defineTool({
  name: "get_event",
  description: "Get one ticket event with ticket classes and availability.",
  security: { classification: "READ", roles: [...CUSTOMER_ROLES], scopes: ["events.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { eventId: z.string().min(1) },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { eventId: string };
    try {
      const event = await backendGet(ctx, API.ticketEvent(args.eventId));
      auditTool(ctx, getEvent, "ok", { resourceType: "event", resourceId: args.eventId });
      return event;
    } catch (error) {
      auditTool(ctx, getEvent, "error");
      if (error instanceof McpError && error.code === "BACKEND_ERROR") {
        throw new McpError("EVENT_NOT_FOUND", "Ticket event not found.");
      }
      throw error;
    }
  },
});

const searchProducts = defineTool({
  name: "search_products",
  description: "Search King Sparkon Mall products with live prices and stock.",
  security: { classification: "READ", roles: [...CUSTOMER_ROLES], scopes: ["products.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { query: z.string().optional(), businessId: z.number().int().positive().optional(), size: z.number().int().min(1).max(50).optional() },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { query?: string; businessId?: number; size?: number };
    const page = await backendGet<{ content?: unknown[] } | unknown[]>(ctx, API.tuckShopProducts, {
      q: args.query,
      businessId: args.businessId,
      size: args.size ?? 20,
    });
    const products = Array.isArray(page) ? page : (page.content ?? []);
    auditTool(ctx, searchProducts, "ok");
    return products;
  },
});

const getProduct = defineTool({
  name: "get_product",
  description: "Get one mall product with live price and stock.",
  security: { classification: "READ", roles: [...CUSTOMER_ROLES], scopes: ["products.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { productId: z.number().int().positive() },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { productId: number };
    try {
      const product = await backendGet(ctx, API.tuckShopProduct(args.productId));
      auditTool(ctx, getProduct, "ok", { resourceType: "product", resourceId: String(args.productId) });
      return product;
    } catch (error) {
      auditTool(ctx, getProduct, "error");
      if (error instanceof McpError && error.code === "BACKEND_ERROR") {
        throw new McpError("PRODUCT_NOT_FOUND", "Product not found.");
      }
      throw error;
    }
  },
});

export interface ArtistDirectoryQuery {
  query?: string;
  type?: "DJ" | "MUSICIAN" | "MCEE";
  page?: number;
  size?: number;
}

export interface ArtistDirectoryPage {
  items: unknown[];
  page: number;
  pageSize: number;
  total?: number;
  hasNext: boolean;
}

/** Shared artist-directory read: only artist-chosen public profiles, normalized paging (§40). */
export async function searchArtistDirectory(
  ctx: McpRequestContext,
  args: ArtistDirectoryQuery,
): Promise<ArtistDirectoryPage> {
  const data = await backendGet<Record<string, unknown>>(ctx, API.artistsDirectory, {
    q: args.query,
    type: args.type,
    page: args.page ?? 0,
    size: Math.min(Math.max(args.size ?? 20, 1), 50),
  });
  const items = Array.isArray(data) ? data : ((data.content as unknown[]) ?? []);
  return {
    items,
    page: typeof data.number === "number" ? (data.number as number) : (args.page ?? 0),
    pageSize: typeof data.size === "number" ? (data.size as number) : items.length,
    total: typeof data.totalElements === "number" ? (data.totalElements as number) : undefined,
    hasNext: typeof data.last === "boolean" ? !(data.last as boolean) : false,
  };
}

const searchArtists = defineTool({
  name: "search_artists",
  description: "Search visible artists by username and type (authenticated directory; only artist-chosen public profiles, no contact details).",
  security: { classification: "READ", roles: [...CUSTOMER_ROLES], scopes: ["artists.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {
    query: z.string().optional(),
    type: z.enum(["DJ", "MUSICIAN", "MCEE"]).optional(),
    page: z.number().int().min(0).optional(),
    size: z.number().int().min(1).max(50).optional(),
  },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as ArtistDirectoryQuery;
    const result = await searchArtistDirectory(ctx, args);
    auditTool(ctx, searchArtists, "ok");
    return result;
  },
});

const getArtist = defineTool({
  name: "get_artist",
  description: "Get an artist profile by user id (backend enforces Artist/Owner/Admin visibility).",
  security: { classification: "READ", roles: ["ARTIST", "OWNER", "ADMIN"], scopes: ["artists.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { artistId: z.number().int().positive() },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { artistId: number };
    const profile = await backendGet(ctx, API.artistProfileById(args.artistId));
    auditTool(ctx, getArtist, "ok", { resourceType: "artist", resourceId: String(args.artistId) });
    return profile;
  },
});

const getMyOrders = defineTool({
  name: "get_my_orders",
  description: "List my mall purchase orders and collection status.",
  security: { classification: "READ", roles: [...PURCHASE_ROLES], scopes: ["orders.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const orders = await backendGet(ctx, API.tuckShopMyPurchases);
    auditTool(ctx, getMyOrders, "ok");
    return orders;
  },
});

const getMyTickets = defineTool({
  name: "get_my_tickets",
  description: "List my QR tickets.",
  security: { classification: "READ", roles: [...PURCHASE_ROLES], scopes: ["tickets.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const tickets = await backendGet(ctx, API.ticketMyTickets);
    auditTool(ctx, getMyTickets, "ok");
    return tickets;
  },
});

const getMyBookings = defineTool({
  name: "get_my_bookings",
  description: "List my artist performance bookings (artists).",
  security: { classification: "READ", roles: ["ARTIST"], scopes: ["bookings.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const bookings = await backendGet(ctx, API.artistBookings);
    auditTool(ctx, getMyBookings, "ok");
    return bookings;
  },
});

interface TicketTypeEntry {
  type: string;
  price: number;
  available: number;
}

const purchaseTicket = defineTool({
  name: "purchase_ticket",
  description: "Buy event tickets with KSC: validates price/availability, authorizes with seller settlement, captures on confirm. Ticket issuance follows standard flows.",
  security: { classification: "WRITE_FINANCIAL", roles: [...PURCHASE_ROLES], scopes: ["tickets.purchase", "payments.write"], confirmation: "REQUIRED", financial: true, mandate: "OPTIONAL" },
  schema: {
    eventId: z.string().min(1),
    ticketType: z.enum(["REGULAR", "VIP", "VVIP"]),
    quantity: z.number().int().min(1).max(20),
    buyerName: z.string().min(1).max(200),
    buyerEmail: z.string().email().max(255),
    sellerUsername: z.string().min(1).max(120).describe("Merchant username receiving settlement (validated server-side)."),
    mandateId: z.number().int().positive().optional(),
    ...confirmFields,
  },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as {
      eventId: string; ticketType: "REGULAR" | "VIP" | "VVIP"; quantity: number;
      buyerName: string; buyerEmail: string; sellerUsername: string; mandateId?: number;
      confirm?: boolean; confirmationToken?: string;
    };
    const event = (await backendGet(ctx, API.ticketEvent(args.eventId))) as {
      name: string; status: string; eventDate: string; location: string;
      ticketTypes: TicketTypeEntry[];
    };
    if (event.status !== "PUBLISHED") {
      auditTool(ctx, purchaseTicket, "error");
      throw new McpError("EVENT_NOT_AVAILABLE", `Event ${event.name} is not published for ticket sales.`);
    }
    const ticketType = event.ticketTypes?.find((entry) => entry.type === args.ticketType);
    if (!ticketType) {
      auditTool(ctx, purchaseTicket, "error");
      throw new McpError("TICKET_NOT_AVAILABLE", `Ticket class ${args.ticketType} not found for this event.`);
    }
    if (Number(ticketType.available ?? 0) < args.quantity) {
      auditTool(ctx, purchaseTicket, "error");
      throw new McpError("TICKET_NOT_AVAILABLE", `Only ${ticketType.available} ${args.ticketType} tickets left.`);
    }
    const amountKsc = Number(ticketType.price) * args.quantity;
    return kscPurchaseFlow(purchaseTicket, ctx, {
      amountKsc,
      description: `${args.quantity} ${args.ticketType} ticket(s) for ${event.name}`,
      tool: "ticket.purchase",
      merchantId: "tickets",
      sellerUsername: args.sellerUsername,
      settlementKind: "TICKET",
      subjectReference: args.eventId,
      confirm: args.confirm,
      confirmationToken: args.confirmationToken,
      summary: { event: event.name, ticketType: args.ticketType, quantity: args.quantity, unitPriceKsc: ticketType.price },
    });
  },
});

const purchaseProduct = defineTool({
  name: "purchase_product",
  description: "Buy mall products with KSC: validates price/stock, authorizes with seller settlement, captures on confirm. Collection follows standard flows.",
  security: { classification: "WRITE_FINANCIAL", roles: [...PURCHASE_ROLES], scopes: ["products.purchase", "payments.write"], confirmation: "REQUIRED", financial: true, mandate: "OPTIONAL" },
  schema: {
    productId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(100),
    sellerUsername: z.string().min(1).max(120).describe("Merchant username receiving settlement (validated server-side)."),
    mandateId: z.number().int().positive().optional(),
    ...confirmFields,
  },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as {
      productId: number; quantity: number; sellerUsername: string; mandateId?: number;
      confirm?: boolean; confirmationToken?: string;
    };
    const product = (await backendGet(ctx, API.tuckShopProduct(args.productId))) as {
      name: string; price: number; salePrice?: number; stockQuantity: number; businessName?: string;
    };
    if (Number(product.stockQuantity ?? 0) < args.quantity) {
      auditTool(ctx, purchaseProduct, "error");
      throw new McpError("PRODUCT_OUT_OF_STOCK", `Only ${product.stockQuantity} units of ${product.name} in stock.`);
    }
    const unitPrice = Number(product.salePrice ?? product.price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      auditTool(ctx, purchaseProduct, "error");
      throw new McpError("PRODUCT_NOT_FOUND", `Product ${product.name} has no valid price.`);
    }
    const amountKsc = unitPrice * args.quantity;
    return kscPurchaseFlow(purchaseProduct, ctx, {
      amountKsc,
      description: `${args.quantity} x ${product.name}`,
      tool: "product.purchase",
      merchantId: "mall",
      sellerUsername: args.sellerUsername,
      settlementKind: "PRODUCT",
      subjectReference: String(args.productId),
      confirm: args.confirm,
      confirmationToken: args.confirmationToken,
      summary: { product: product.name, quantity: args.quantity, unitPriceKsc: unitPrice, business: product.businessName ?? null },
    });
  },
});

export const customerTools: KingSparkonTool[] = [
  getMyProfile,
  getMyRole,
  getMyPermissions,
  getMyConsent,
  searchEvents,
  getEvent,
  searchProducts,
  getProduct,
  searchArtists,
  getArtist,
  getMyOrders,
  getMyTickets,
  getMyBookings,
  purchaseTicket,
  purchaseProduct,
];
