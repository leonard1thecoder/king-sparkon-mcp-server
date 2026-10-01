/**
 * Withdraw tool (§6 sensitive write). Routes to the caller's existing ZAR
 * withdrawal rail by role; request bodies pass through backend-native shapes
 * that the backend validates. KSC is never withdrawable to bank.
 */

import { z } from "zod";
import { backendPost } from "../backend/client.js";
import { API } from "../backend/endpoints.js";
import { McpError } from "../auth/errors.js";
import { requireConfirmation } from "../auth/pipeline.js";
import { auditTool, defineTool, type KingSparkonTool } from "./types.js";

const withdraw = defineTool({
  name: "withdraw",
  description: "Request a ZAR withdrawal through my existing rail (artist payouts, owner withdrawals, worker tips). KSC cannot be withdrawn to bank.",
  security: {
    classification: "WRITE_FINANCIAL",
    roles: ["ARTIST", "OWNER", "WORKER"],
    scopes: ["payments.write"],
    confirmation: "REQUIRED",
    financial: true,
    mandate: "NONE",
  },
  schema: {
    rail: z.enum(["artist", "owner", "worker"]).describe("Which existing withdrawal rail to use."),
    request: z.record(z.string(), z.unknown()).describe("Backend-native withdrawal request shape."),
    confirm: z.boolean().optional(),
    confirmationToken: z.string().optional(),
  },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as {
      rail: "artist" | "owner" | "worker";
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
    const role = ctx.identity.roles.find((candidate) => candidate === "ARTIST" || candidate === "OWNER" || candidate === "WORKER");
    if (!role) {
      throw new McpError("ROLE_NOT_ALLOWED", "Withdrawals require an Artist, Owner or Worker role.");
    }
    if ((args.rail === "artist" && role !== "ARTIST") || (args.rail === "owner" && role !== "OWNER") || (args.rail === "worker" && role !== "WORKER")) {
      throw new McpError("ROLE_NOT_ALLOWED", `The ${args.rail} rail does not match your ${role} role.`);
    }
    const path =
      args.rail === "artist" ? API.artistWithdrawals
      : args.rail === "owner" ? API.ownerWithdrawals
      : API.tipsWithdrawals;
    const result = await backendPost(ctx, path, args.request);
    auditTool(ctx, withdraw, "ok", { currency: "ZAR" });
    return result;
  },
});

export const withdrawTools: KingSparkonTool[] = [withdraw];
