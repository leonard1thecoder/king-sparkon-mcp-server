/**
 * Delivery tools shared by worker and owner dashboards. Paid delivery orders
 * carry an address, a per-unit delivery fee and a lead-time ETA; dispatch
 * requires barcode preparation, delivery completes the handover.
 */

import { z } from "zod";
import { backendGet, backendPost } from "../backend/client.js";
import { API } from "../backend/endpoints.js";
import { requireConfirmation } from "../auth/pipeline.js";
import { auditTool, defineTool, type KingSparkonTool } from "./types.js";

const confirmFields = {
  confirm: z.boolean().optional(),
  confirmationToken: z.string().optional(),
};

type ConfirmArgs = { confirm?: boolean; confirmationToken?: string };

export function buildDeliveryTools(options: {
  listName: string;
  dispatchName: string;
  deliverName: string;
  roles: Array<"OWNER" | "WORKER">;
  listScopes: string[];
  writeScopes: string[];
  blurb: string;
}): KingSparkonTool[] {
  const getDeliveryQueue = defineTool({
    name: options.listName,
    description: `List paid delivery orders for the business with address, fee and lead-time ETA. ${options.blurb}`,
    security: { classification: "READ", roles: [...options.roles], scopes: options.listScopes, confirmation: "NONE", financial: false, mandate: "NONE" },
    schema: {},
    handler: async (ctx) => {
      const deliveries = await backendGet(ctx, API.deliveriesPending);
      auditTool(ctx, getDeliveryQueue, "ok");
      return deliveries;
    },
  });

  const dispatchDelivery = defineTool({
    name: options.dispatchName,
    description: "Mark a prepared delivery order as out for delivery (requires all barcodes assigned).",
    security: { classification: "WRITE", roles: [...options.roles], scopes: options.writeScopes, confirmation: "REQUIRED", financial: false, mandate: "NONE" },
    schema: { transactionId: z.number().int().positive(), ...confirmFields },
    handler: async (ctx, rawArgs) => {
      const args = rawArgs as { transactionId: number } & ConfirmArgs;
      const gate = requireConfirmation(args, {
        action: options.dispatchName,
        summary: { transactionId: args.transactionId, effect: "out for delivery" },
        argsForToken: { transactionId: args.transactionId },
      });
      if (gate) {
        auditTool(ctx, dispatchDelivery, "confirmation_required", { resourceType: "delivery", resourceId: String(args.transactionId) });
        return gate;
      }
      const result = await backendPost(ctx, API.deliveryDispatch(args.transactionId));
      auditTool(ctx, dispatchDelivery, "ok", { resourceType: "delivery", resourceId: String(args.transactionId) });
      return result;
    },
  });

  const completeDelivery = defineTool({
    name: options.deliverName,
    description: "Mark an out-for-delivery order as delivered (doorstep handover done).",
    security: { classification: "WRITE", roles: [...options.roles], scopes: options.writeScopes, confirmation: "REQUIRED", financial: false, mandate: "NONE" },
    schema: { transactionId: z.number().int().positive(), ...confirmFields },
    handler: async (ctx, rawArgs) => {
      const args = rawArgs as { transactionId: number } & ConfirmArgs;
      const gate = requireConfirmation(args, {
        action: options.deliverName,
        summary: { transactionId: args.transactionId, effect: "delivered" },
        argsForToken: { transactionId: args.transactionId },
      });
      if (gate) {
        auditTool(ctx, completeDelivery, "confirmation_required", { resourceType: "delivery", resourceId: String(args.transactionId) });
        return gate;
      }
      const result = await backendPost(ctx, API.deliveryDeliver(args.transactionId));
      auditTool(ctx, completeDelivery, "ok", { resourceType: "delivery", resourceId: String(args.transactionId) });
      return result;
    },
  });

  return [getDeliveryQueue, dispatchDelivery, completeDelivery];
}
