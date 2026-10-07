/**
 * Affiliate tools. Affiliates earn commissions on referrals plus tips on
 * their content; both withdraw through dedicated backend rails. The backend
 * owns balances, eligibility and validation — MCP only routes intent with
 * role, consent and confirmation gates.
 */

import { z } from "zod";
import { backendGet, backendPatch, backendPost } from "../backend/client.js";
import { API } from "../backend/endpoints.js";
import { auditTool, defineTool } from "./types.js";
import { requireConfirmation } from "../auth/pipeline.js";

const confirmFields = {
  confirm: z.boolean().optional(),
  confirmationToken: z.string().optional(),
};

type ConfirmArgs = { confirm?: boolean; confirmationToken?: string };

const AFFILIATE = ["AFFILIATE"] as const;

const getMyAffiliateProfile = defineTool({
  name: "get_my_affiliate_profile",
  description:
    "Get the authenticated affiliate's profile (tier, referral code, onboarding state). Usable by the AFFILIATE role; resolved live from the backend every request.",
  security: { classification: "READ", roles: [...AFFILIATE], scopes: ["affiliate.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const profile = await backendGet(ctx, API.affiliateMe);
    auditTool(ctx, getMyAffiliateProfile, "ok");
    return profile;
  },
});

const completeAffiliateOnboarding = defineTool({
  name: "complete_affiliate_onboarding",
  description:
    "Complete affiliate onboarding (payout details and channel info, backend-native shape). State-changing; the backend validates completeness.",
  security: { classification: "WRITE", roles: [...AFFILIATE], scopes: ["affiliate.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { onboarding: z.record(z.string(), z.unknown()).describe("Backend onboarding shape."), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { onboarding: Record<string, unknown> } & ConfirmArgs;
    const gate = requireConfirmation(args, {
      action: "complete_affiliate_onboarding",
      summary: { effect: "submit affiliate onboarding" },
      argsForToken: { onboarding: args.onboarding },
    });
    if (gate) {
      auditTool(ctx, completeAffiliateOnboarding, "confirmation_required");
      return gate;
    }
    const result = await backendPatch(ctx, API.affiliateOnboarding, args.onboarding);
    auditTool(ctx, completeAffiliateOnboarding, "ok");
    return result;
  },
});

const getMyCommissions = defineTool({
  name: "get_my_commissions",
  description:
    "List commission earnings from referrals (amounts, statuses). Read-only; the backend is authoritative for balances.",
  security: { classification: "READ", roles: [...AFFILIATE], scopes: ["earnings.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const commissions = await backendGet(ctx, API.affiliateCommissions);
    auditTool(ctx, getMyCommissions, "ok");
    return commissions;
  },
});

const getMyAffiliateTips = defineTool({
  name: "get_my_affiliate_tips",
  description: "List tips received on affiliate content.",
  security: { classification: "READ", roles: [...AFFILIATE], scopes: ["earnings.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const tips = await backendGet(ctx, API.affiliateTips);
    auditTool(ctx, getMyAffiliateTips, "ok");
    return tips;
  },
});

const getAffiliateWithdrawalEligibility = defineTool({
  name: "get_affiliate_withdrawal_eligibility",
  description:
    "Check withdrawal eligibility and minimums for the tip rail or the commission rail before requesting a payout.",
  security: { classification: "READ", roles: [...AFFILIATE], scopes: ["earnings.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { rail: z.enum(["tip", "commission"]) },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { rail: "tip" | "commission" };
    const path = args.rail === "tip" ? API.affiliateTipWithdrawalEligibility : API.affiliateWithdrawalEligibility;
    const eligibility = await backendGet(ctx, path);
    auditTool(ctx, getAffiliateWithdrawalEligibility, "ok");
    return eligibility;
  },
});

const getMyAffiliateLinks = defineTool({
  name: "get_my_affiliate_links",
  description: "List my referral links with click and conversion context.",
  security: { classification: "READ", roles: [...AFFILIATE], scopes: ["affiliate.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const links = await backendGet(ctx, API.affiliateLinks);
    auditTool(ctx, getMyAffiliateLinks, "ok");
    return links;
  },
});

const createAffiliateLink = defineTool({
  name: "create_affiliate_link",
  description:
    "Create a referral link (backend-native shape: target business or campaign). Clicks and attribution are tracked server-side.",
  security: { classification: "WRITE", roles: [...AFFILIATE], scopes: ["affiliate.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { link: z.record(z.string(), z.unknown()).describe("Backend affiliate-link shape."), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { link: Record<string, unknown> } & ConfirmArgs;
    const gate = requireConfirmation(args, {
      action: "create_affiliate_link",
      summary: { effect: "create referral link" },
      argsForToken: { link: args.link },
    });
    if (gate) {
      auditTool(ctx, createAffiliateLink, "confirmation_required");
      return gate;
    }
    const created = await backendPost(ctx, API.affiliateLinks, args.link);
    auditTool(ctx, createAffiliateLink, "ok", { resourceType: "affiliate-link" });
    return created;
  },
});

export const affiliateTools = [
  getMyAffiliateProfile,
  completeAffiliateOnboarding,
  getMyCommissions,
  getMyAffiliateTips,
  getAffiliateWithdrawalEligibility,
  getMyAffiliateLinks,
  createAffiliateLink,
];
