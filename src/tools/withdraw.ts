/**
 * Withdraw tools (§6 sensitive writes). Each rail maps to the caller's
 * existing ZAR withdrawal endpoint by role; request bodies pass through
 * backend-native shapes that the backend validates. KSC is never
 * withdrawable to bank. All executions carry deterministic idempotency
 * keys so client retries cannot double-pay.
 */

import { z } from "zod";
import { backendGet, backendPost } from "../backend/client.js";
import { API } from "../backend/endpoints.js";
import { McpError } from "../auth/errors.js";
import { requireConfirmation } from "../auth/pipeline.js";
import { auditTool, defineTool, type KingSparkonTool } from "./types.js";
import { stableKey } from "./ksc.js";

const railEnum = z.enum(["artist", "owner", "worker", "affiliate_tip", "affiliate_commission"]);

type Rail = z.infer<typeof railEnum>;

const RAIL_ROLES: Record<Rail, "ARTIST" | "OWNER" | "WORKER" | "AFFILIATE"> = {
  artist: "ARTIST",
  owner: "OWNER",
  worker: "WORKER",
  affiliate_tip: "AFFILIATE",
  affiliate_commission: "AFFILIATE",
};

function railPath(rail: Rail): string {
  switch (rail) {
    case "artist":
      return API.artistWithdrawals;
    case "owner":
      return API.ownerWithdrawals;
    case "worker":
      return API.tipsWithdrawals;
    case "affiliate_tip":
      return API.affiliateTipWithdrawals;
    case "affiliate_commission":
      return API.affiliateWithdrawals;
  }
}

const withdraw = defineTool({
  name: "withdraw",
  description:
    "Request a ZAR withdrawal through my existing rail (artist payouts, owner withdrawals, worker tips, affiliate tips or affiliate commissions). Usable by ARTIST, OWNER, WORKER and AFFILIATE roles; the rail must match the caller's role. KSC cannot be withdrawn to bank. Requires explicit confirmation and is idempotent across retries.",
  security: {
    classification: "WRITE_FINANCIAL",
    roles: ["ARTIST", "OWNER", "WORKER", "AFFILIATE"],
    scopes: ["payments.write"],
    confirmation: "REQUIRED",
    financial: true,
    mandate: "NONE",
  },
  schema: {
    rail: railEnum.describe("Which existing withdrawal rail to use (must match your role)."),
    request: z.record(z.string(), z.unknown()).describe("Backend-native withdrawal request shape."),
    confirm: z.boolean().optional(),
    confirmationToken: z.string().optional(),
  },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as {
      rail: Rail;
      request: Record<string, unknown>;
      confirm?: boolean;
      confirmationToken?: string;
    };
    const gate = requireConfirmation(args, {
      action: "withdraw",
      summary: { rail: args.rail, request: args.request },
      argsForToken: { rail: args.rail, request: args.request },
    });
    if (gate) {
      auditTool(ctx, withdraw, "confirmation_required", { currency: "ZAR" });
      return gate;
    }
    const expectedRole = RAIL_ROLES[args.rail];
    if (!ctx.identity.roles.includes(expectedRole)) {
      throw new McpError("ROLE_NOT_ALLOWED", `The ${args.rail} rail requires the ${expectedRole} role.`);
    }
    const key = stableKey("withdraw", JSON.stringify({ rail: args.rail, request: args.request }));
    const result = await backendPost(ctx, railPath(args.rail), args.request, key);
    auditTool(ctx, withdraw, "ok", { currency: "ZAR" });
    return result;
  },
});

const getWithdrawalEligibility = defineTool({
  name: "get_withdrawal_eligibility",
  description:
    "Check withdrawal eligibility and minimums for my rail (owner, worker tips, affiliate tips or affiliate commissions) before requesting a payout. Read-only.",
  security: {
    classification: "READ",
    roles: ["OWNER", "WORKER", "AFFILIATE"],
    scopes: ["earnings.read"],
    confirmation: "NONE",
    financial: false,
    mandate: "NONE",
  },
  schema: {
    rail: z.enum(["owner", "worker", "affiliate_tip", "affiliate_commission"]).describe("Which rail to check."),
  },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { rail: "owner" | "worker" | "affiliate_tip" | "affiliate_commission" };
    const expectedRole = RAIL_ROLES[args.rail];
    if (!ctx.identity.roles.includes(expectedRole)) {
      throw new McpError("ROLE_NOT_ALLOWED", `The ${args.rail} rail requires the ${expectedRole} role.`);
    }
    const path =
      args.rail === "owner"
        ? API.ownerWithdrawalEligibility
        : args.rail === "worker"
          ? API.tipsWorkerWithdrawalEligibility(ctx.identity.userId)
          : args.rail === "affiliate_tip"
            ? API.affiliateTipWithdrawalEligibility
            : API.affiliateWithdrawalEligibility;
    const eligibility = await backendGet(ctx, path);
    auditTool(ctx, getWithdrawalEligibility, "ok");
    return eligibility;
  },
});

export const withdrawTools: KingSparkonTool[] = [withdraw, getWithdrawalEligibility];
