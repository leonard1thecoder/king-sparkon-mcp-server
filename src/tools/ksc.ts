/**
 * KSC wallet tools. Money movement uses business-intent purchase tools;
 * these expose reads, top-ups (PayFast checkout), and spending mandates.
 * Raw ledger primitives are never exposed (§8).
 */

import { z } from "zod";
import { createHash } from "node:crypto";
import { backendDelete, backendGet, backendPost } from "../backend/client.js";
import { API } from "../backend/endpoints.js";
import { McpError } from "../auth/errors.js";
import { requireConfirmation } from "../auth/pipeline.js";
import type { McpRequestContext } from "../auth/pipeline.js";
import { auditTool, authorizeTool, defineTool, type KingSparkonTool } from "./types.js";

export function stableKey(scope: string, canonicalArgs: string): string {
  return `${scope}:${createHash("sha256").update(canonicalArgs).digest("hex").slice(0, 32)}`;
}

const confirmFields = {
  confirm: z.boolean().optional().describe("Set true with confirmationToken to execute after reviewing the summary."),
  confirmationToken: z.string().optional().describe("Token from the confirmation_required response."),
};

function stripConfirm<T extends Record<string, unknown>>(args: T): Omit<T, "confirm" | "confirmationToken"> {
  const { confirm: _confirm, confirmationToken: _token, ...rest } = args as Record<string, unknown>;
  void _confirm;
  void _token;
  return rest as Omit<T, "confirm" | "confirmationToken">;
}

export function mapKscBackendError(error: unknown): McpError {
  if (error instanceof McpError) return error;
  const message = error instanceof Error ? error.message : "KSC operation failed.";
  const lower = message.toLowerCase();
  if (lower.includes("no active spending mandate")) return new McpError("MANDATE_REQUIRED", message);
  if (lower.includes("mandate") && lower.includes("not active")) return new McpError("MANDATE_REVOKED", message);
  if (lower.includes("mandate") && (lower.includes("expir") || lower.includes("no active"))) {
    return new McpError("MANDATE_EXPIRED", message);
  }
  if (lower.includes("mandate") && (lower.includes("exceed") || lower.includes("maximum") || lower.includes("limit"))) {
    return new McpError("MANDATE_LIMIT_EXCEEDED", message);
  }
  if (lower.includes("insufficient available ksc")) return new McpError("INSUFFICIENT_KSC", message);
  return new McpError("BACKEND_ERROR", message.slice(0, 500));
}

const READ_ROLES = ["USER", "ARTIST", "OWNER", "WORKER", "AFFILIATE", "ADMIN"] as const;
/** Roles allowed to move KSC or authorize agent spending (affiliates use affiliate rails instead). */
const SPEND_ROLES = ["USER", "ARTIST", "OWNER", "WORKER", "ADMIN"] as const;

const getMyKscWallet = defineTool({
  name: "get_my_ksc_wallet",
  description: "Get the authenticated user's KSC wallet: available, reserved and total balances. Never combined with ZAR earnings.",
  security: { classification: "READ", roles: [...READ_ROLES], scopes: ["wallet.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const wallet = await backendGet(ctx, API.kscWallet);
    auditTool(ctx, getMyKscWallet, "ok");
    return wallet;
  },
});

const getKscTransactions = defineTool({
  name: "get_ksc_transactions",
  description: "List the authenticated user's KSC ledger history (top-ups, holds, captures, refunds).",
  security: { classification: "READ", roles: [...READ_ROLES], scopes: ["wallet.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const transactions = await backendGet(ctx, API.kscTransactions);
    auditTool(ctx, getKscTransactions, "ok");
    return transactions;
  },
});

const kscTopup = defineTool({
  name: "ksc_topup",
  description: "Create a KSC top-up (PayFast checkout). KSC credits only after the provider confirms — returns the checkout URL.",
  security: { classification: "WRITE_FINANCIAL", roles: [...SPEND_ROLES], scopes: ["payments.write"], confirmation: "REQUIRED", financial: true, mandate: "NONE" },
  schema: {
    amountZar: z.number().positive().describe("ZAR amount to pay via PayFast (min R10)."),
    ...confirmFields,
  },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { amountZar: number; confirm?: boolean; confirmationToken?: string };
    const canonical = JSON.stringify({ amountZar: args.amountZar });
    const gate = requireConfirmation(args, {
      action: "ksc_topup",
      summary: { amountZar: args.amountZar, resultKsc: `≈ ${args.amountZar} KSC at 1 KSC = R1.00` },
      argsForToken: { amountZar: args.amountZar },
    });
    if (gate) {
      auditTool(ctx, kscTopup, "confirmation_required");
      return gate;
    }
    try {
      const topup = await backendPost(
        ctx,
        API.kscTopups,
        { amountZar: args.amountZar },
        stableKey("ksc-topup", canonical),
      );
      auditTool(ctx, kscTopup, "ok", { amount: args.amountZar, currency: "ZAR" });
      return topup;
    } catch (error) {
      auditTool(ctx, kscTopup, "error");
      throw mapKscBackendError(error);
    }
  },
});

const getKscPayment = defineTool({
  name: "get_ksc_payment",
  description:
    "Read one KSC payment with its lifecycle state (AUTHORIZED, CAPTURED, CANCELLED, REFUNDED, EXPIRED) and linked settlement. Read-only; money moves only through purchase flows and withdrawal rails, never through ledger primitives.",
  security: { classification: "READ", roles: [...READ_ROLES], scopes: ["wallet.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { paymentId: z.string().min(1) },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { paymentId: string };
    const payment = await backendGet(ctx, API.kscPayment(args.paymentId));
    auditTool(ctx, getKscPayment, "ok", { resourceType: "ksc-payment", resourceId: args.paymentId });
    return payment;
  },
});

const kscTopupStatus = defineTool({
  name: "ksc_topup_status",
  description: "Check a KSC top-up status (PENDING until the provider confirms, then COMPLETED).",
  security: { classification: "READ", roles: [...READ_ROLES], scopes: ["wallet.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { topUpId: z.number().int().positive() },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { topUpId: number };
    const topup = await backendGet(ctx, API.kscTopup(args.topUpId));
    auditTool(ctx, kscTopupStatus, "ok");
    return topup;
  },
});

const createMandate = defineTool({
  name: "create_mandate",
  description: "Authorize an AI agent to spend KSC within per-transaction, daily and monthly limits. The agent never receives bank credentials.",
  security: { classification: "WRITE_FINANCIAL", roles: [...SPEND_ROLES], scopes: ["payments.write"], confirmation: "REQUIRED", financial: true, mandate: "NONE" },
  schema: {
    agentId: z.string().min(1).max(120),
    maxPerTransaction: z.number().positive(),
    dailyLimit: z.number().min(0),
    monthlyLimit: z.number().min(0),
    allowedTools: z.array(z.string()).optional(),
    allowedMerchants: z.array(z.string()).optional(),
    expiresAt: z.string().optional(),
    ...confirmFields,
  },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as {
      agentId: string; maxPerTransaction: number; dailyLimit: number; monthlyLimit: number;
      allowedTools?: string[]; allowedMerchants?: string[]; expiresAt?: string;
      confirm?: boolean; confirmationToken?: string;
    };
    const payload = {
      agentId: args.agentId,
      maxPerTransaction: args.maxPerTransaction,
      dailyLimit: args.dailyLimit,
      monthlyLimit: args.monthlyLimit,
      allowedTools: args.allowedTools,
      allowedMerchants: args.allowedMerchants,
      expiresAt: args.expiresAt,
    };
    const gate = requireConfirmation(args, {
      action: "create_mandate",
      summary: { agentId: payload.agentId, maxPerTransaction: payload.maxPerTransaction, dailyLimit: payload.dailyLimit, monthlyLimit: payload.monthlyLimit },
      argsForToken: payload,
    });
    if (gate) {
      auditTool(ctx, createMandate, "confirmation_required", { agentId: payload.agentId });
      return gate;
    }
    try {
      const mandate = await backendPost(ctx, API.kscMandates, payload, stableKey("ksc-mandate", JSON.stringify(payload)));
      auditTool(ctx, createMandate, "ok", { agentId: payload.agentId });
      return mandate;
    } catch (error) {
      auditTool(ctx, createMandate, "error");
      throw mapKscBackendError(error);
    }
  },
});

const listMandates = defineTool({
  name: "list_mandates",
  description: "List my KSC spending mandates with limits, allowlists and status.",
  security: { classification: "READ", roles: [...READ_ROLES], scopes: ["wallet.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const mandates = await backendGet(ctx, API.kscMandates);
    auditTool(ctx, listMandates, "ok");
    return mandates;
  },
});

const revokeMandate = defineTool({
  name: "revoke_mandate",
  description: "Immediately revoke a KSC spending mandate. Agent financial operations fail at once; OAuth access is separate.",
  security: { classification: "WRITE_FINANCIAL", roles: [...SPEND_ROLES], scopes: ["payments.write"], confirmation: "REQUIRED", financial: true, mandate: "NONE" },
  schema: { mandateId: z.number().int().positive(), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { mandateId: number; confirm?: boolean; confirmationToken?: string };
    const gate = requireConfirmation(args, {
      action: "revoke_mandate",
      summary: { mandateId: args.mandateId },
      argsForToken: { mandateId: args.mandateId },
    });
    if (gate) {
      auditTool(ctx, revokeMandate, "confirmation_required");
      return gate;
    }
    const mandate = await backendDelete(ctx, API.kscMandate(args.mandateId));
    auditTool(ctx, revokeMandate, "ok");
    return mandate;
  },
});

export const kscTools: KingSparkonTool[] = [
  getMyKscWallet,
  getKscTransactions,
  getKscPayment,
  kscTopup,
  kscTopupStatus,
  createMandate,
  listMandates,
  revokeMandate,
];

/** Shared authorize→capture purchase flow used by business-intent purchase tools. */
export async function kscPurchaseFlow(
  tool: KingSparkonTool,
  ctx: McpRequestContext,
  input: {
    amountKsc: number;
    description?: string | null;
    agentId?: string | null;
    tool?: string | null;
    merchantId?: string | null;
    sellerUsername: string;
    settlementKind: string;
    subjectReference?: string | null;
    confirm?: boolean | null;
    confirmationToken?: string | null;
    summary: Record<string, unknown>;
  },
): Promise<unknown> {
  const canonical = JSON.stringify({
    amountKsc: input.amountKsc,
    sellerUsername: input.sellerUsername,
    settlementKind: input.settlementKind,
    subjectReference: input.subjectReference ?? null,
    tool: input.tool ?? null,
    merchantId: input.merchantId ?? null,
  });
  const gate = requireConfirmation(
    { confirm: input.confirm ?? undefined, confirmationToken: input.confirmationToken ?? undefined },
    { action: tool.name, summary: { ...input.summary, amountKsc: input.amountKsc }, argsForToken: canonical },
  );
  if (gate) {
    auditTool(ctx, tool, "confirmation_required", { amount: input.amountKsc, currency: "KSC" });
    return gate;
  }
  try {
    const key = stableKey(tool.name, canonical);
    const payment = (await backendPost(
      ctx,
      API.kscAuthorize,
      {
        amountKsc: input.amountKsc,
        description: input.description ?? null,
        agentId: input.agentId ?? ctx.agentId,
        tool: input.tool ?? null,
        merchantId: input.merchantId ?? null,
        sellerUsername: input.sellerUsername,
        settlementKind: input.settlementKind,
        subjectReference: input.subjectReference ?? null,
      },
      key,
    )) as { id: string };
    const captured = await backendPost(ctx, API.kscCapture(payment.id), {}, `${key}:capture`);
    auditTool(ctx, tool, "ok", { amount: input.amountKsc, currency: "KSC", resourceId: payment.id });
    return {
      ...(captured as Record<string, unknown>),
      fulfillment: "KSC captured and seller proceeds settled to existing ZAR earnings. Complete any item fulfillment (ticket issuance, product collection) through the standard checkout flows.",
    };
  } catch (error) {
    auditTool(ctx, tool, "error", { amount: input.amountKsc, currency: "KSC" });
    throw mapKscBackendError(error);
  }
}
