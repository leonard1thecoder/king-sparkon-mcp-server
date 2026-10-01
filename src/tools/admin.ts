/**
 * Admin tools (§16). Isolated: every tool requires the ADMIN role resolved
 * live from the backend, and admin operations are never exposed to others.
 * No arbitrary database or REST execution exists.
 */

import { z } from "zod";
import { backendGet, backendPost } from "../backend/client.js";
import { API } from "../backend/endpoints.js";
import { auditTool, defineTool, type KingSparkonTool } from "./types.js";

const ADMIN = ["ADMIN"] as const;

const getPlatformOverview = defineTool({
  name: "get_platform_overview",
  description: "Platform capacity overview (admin).",
  security: { classification: "READ", roles: [...ADMIN], scopes: ["admin.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const overview = await backendGet(ctx, API.adminOverview);
    auditTool(ctx, getPlatformOverview, "ok");
    return overview;
  },
});

const getPlatformFinancialOverview = defineTool({
  name: "get_platform_financial_overview",
  description: "Platform financial overview combining KSC reconciliation with business scope.",
  security: { classification: "READ", roles: [...ADMIN], scopes: ["admin.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const [platform, ksc] = await Promise.all([
      backendGet(ctx, API.adminOverview).catch(() => null),
      backendGet(ctx, API.kscAdminOverview).catch(() => null),
    ]);
    auditTool(ctx, getPlatformFinancialOverview, "ok");
    return { platform, ksc };
  },
});

const getKscOverview = defineTool({
  name: "get_ksc_overview",
  description: "KSC reconciliation overview: issued, captured, outstanding, reserved, top-ups, refunds, settlements.",
  security: { classification: "READ", roles: [...ADMIN], scopes: ["admin.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const overview = await backendGet(ctx, API.kscAdminOverview);
    auditTool(ctx, getKscOverview, "ok");
    return overview;
  },
});

const getPendingSettlements = defineTool({
  name: "get_pending_settlements",
  description: "List KSC seller settlements by status (PENDING, FAILED, SETTLED, REVERSED, CANCELLED).",
  security: { classification: "READ", roles: [...ADMIN], scopes: ["admin.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { status: z.enum(["PENDING", "FAILED", "SETTLED", "REVERSED", "CANCELLED"]).optional() },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { status?: string };
    const settlements = await backendGet(ctx, API.kscAdminSettlements, { status: args.status });
    auditTool(ctx, getPendingSettlements, "ok");
    return settlements;
  },
});

const retrySettlement = defineTool({
  name: "retry_settlement",
  description: "Retry a failed or pending KSC seller settlement (idempotent).",
  security: { classification: "WRITE_BUSINESS", roles: [...ADMIN], scopes: ["admin.write"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { settlementId: z.number().int().positive() },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { settlementId: number };
    const settlement = await backendPost(ctx, API.kscAdminSettlementRetry(args.settlementId));
    auditTool(ctx, retrySettlement, "ok", { resourceType: "settlement", resourceId: String(args.settlementId) });
    return settlement;
  },
});

const reviewUser = defineTool({
  name: "review_user",
  description: "Review a user account (admin). Returns account data only.",
  security: { classification: "READ", roles: [...ADMIN], scopes: ["admin.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { userId: z.number().int().positive() },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { userId: number };
    const user = await backendGet(ctx, API.adminUser(args.userId));
    auditTool(ctx, reviewUser, "ok", { resourceType: "user", resourceId: String(args.userId) });
    return user;
  },
});

const reviewEvent = defineTool({
  name: "review_event",
  description: "Review a ticket event with capacity and sales context (admin).",
  security: { classification: "READ", roles: [...ADMIN], scopes: ["admin.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { eventId: z.string().min(1) },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { eventId: string };
    const event = await backendGet(ctx, API.ticketEvent(args.eventId));
    auditTool(ctx, reviewEvent, "ok", { resourceType: "event", resourceId: args.eventId });
    return event;
  },
});

const reviewPayment = defineTool({
  name: "review_payment",
  description: "Review a KSC payment with its settlement record (admin).",
  security: { classification: "READ", roles: [...ADMIN], scopes: ["admin.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { paymentId: z.string().min(1) },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { paymentId: string };
    const settlements = (await backendGet<unknown[]>(ctx, API.kscAdminSettlements).catch(() => [])) ?? [];
    const settlement = settlements.find((entry) => (entry as Record<string, unknown>).paymentId === args.paymentId) ?? null;
    auditTool(ctx, reviewPayment, "ok", { resourceType: "payment", resourceId: args.paymentId });
    return {
      paymentId: args.paymentId,
      note: "Payment detail is owner-scoped in the backend; admin visibility covers the linked settlement.",
      settlement,
    };
  },
});

export const adminTools: KingSparkonTool[] = [
  getPlatformOverview,
  getPlatformFinancialOverview,
  getKscOverview,
  getPendingSettlements,
  retrySettlement,
  reviewUser,
  reviewEvent,
  reviewPayment,
];
