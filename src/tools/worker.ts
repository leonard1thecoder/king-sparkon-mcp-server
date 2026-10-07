/**
 * Worker tools (§15). Only resources belonging to the authenticated worker
 * are exposed. Assignment accept/decline/complete route to the real
 * underlying operations (refund review, barcode readiness); anything without
 * a backend operation fails explicitly instead of pretending.
 */

import { z } from "zod";
import { backendGet, backendPost } from "../backend/client.js";
import { API } from "../backend/endpoints.js";
import { McpError } from "../auth/errors.js";
import { requireConfirmation } from "../auth/pipeline.js";
import { auditTool, defineTool, type KingSparkonTool } from "./types.js";

const confirmFields = {
  confirm: z.boolean().optional(),
  confirmationToken: z.string().optional(),
};

type ConfirmArgs = { confirm?: boolean; confirmationToken?: string };

const WORKER = ["WORKER"] as const;

const getMyWorkerProfile = defineTool({
  name: "get_my_worker_profile",
  description: "Get my worker profile with business assignment and staff discount.",
  security: { classification: "READ", roles: [...WORKER], scopes: ["worker.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const profile = await backendGet(ctx, API.usersMe);
    const dashboard = await backendGet(ctx, API.workerDashboard).catch(() => null);
    auditTool(ctx, getMyWorkerProfile, "ok");
    return { profile, dashboard };
  },
});

const getMyEarnings = defineTool({
  name: "get_my_earnings",
  description: "Get my worker earnings: tips received plus counter transactions handled.",
  security: { classification: "READ", roles: [...WORKER], scopes: ["earnings.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const [tips, transactions, dashboard] = await Promise.all([
      backendGet(ctx, API.workerTipsMe).catch(() => []),
      backendGet(ctx, API.workerTransactionsMe).catch(() => []),
      backendGet(ctx, API.workerDashboard).catch(() => null),
    ]);
    auditTool(ctx, getMyEarnings, "ok");
    return { tips, transactions, dashboard };
  },
});

const getMyTips = defineTool({
  name: "get_my_tips",
  description: "List tips I received.",
  security: { classification: "READ", roles: [...WORKER], scopes: ["earnings.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const tips = await backendGet(ctx, API.workerTipsMe);
    auditTool(ctx, getMyTips, "ok");
    return tips;
  },
});

const getMyWalletWorker = defineTool({
  name: "get_my_wallet",
  description: "Get my KSC wallet (separate from tip earnings).",
  security: { classification: "READ", roles: [...WORKER], scopes: ["wallet.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const wallet = await backendGet(ctx, API.kscWallet);
    auditTool(ctx, getMyWalletWorker, "ok");
    return wallet;
  },
});

type AssignmentTask =
  | { taskId: string; kind: "online_order"; title: string; detail: string; transactionId: number }
  | { taskId: string; kind: "refund"; title: string; detail: string; refundId: number }
  | { taskId: string; kind: "returnable_refund"; title: string; detail: string; refundId: number };

async function collectAssignments(ctx: Parameters<typeof auditTool>[0]): Promise<AssignmentTask[]> {
  const [orders, refunds, returnables] = await Promise.all([
    backendGet<unknown[]>(ctx, API.tuckShopOnlinePurchases).catch(() => []),
    backendGet<unknown[]>(ctx, API.pendingRefunds).catch(() => []),
    backendGet<unknown[]>(ctx, API.pendingReturnableRefunds).catch(() => []),
  ]);
  const tasks: AssignmentTask[] = [];
  for (const order of orders ?? []) {
    const record = order as Record<string, unknown>;
    const transactionId = Number(record.transactionId ?? record.id ?? NaN);
    if (!Number.isFinite(transactionId)) continue;
    tasks.push({
      taskId: `order:${transactionId}`,
      kind: "online_order",
      title: `Prepare online order #${transactionId}`,
      detail: `${String(record.customerUsername ?? "customer")} · ${String(record.fulfilmentStatus ?? "")}`,
      transactionId,
    });
  }
  for (const refund of refunds ?? []) {
    const record = refund as Record<string, unknown>;
    const refundId = Number(record.id ?? NaN);
    if (!Number.isFinite(refundId)) continue;
    tasks.push({
      taskId: `refund:${refundId}`,
      kind: "refund",
      title: `Review refund #${refundId}`,
      detail: `${String(record.kind ?? "")} · ${String(record.productName ?? record.eventId ?? "")}`,
      refundId,
    });
  }
  for (const refund of returnables ?? []) {
    const record = refund as Record<string, unknown>;
    const refundId = Number(record.id ?? NaN);
    if (!Number.isFinite(refundId)) continue;
    tasks.push({
      taskId: `returnable:${refundId}`,
      kind: "returnable_refund",
      title: `Review returnable refund #${refundId}`,
      detail: `${String(record.productName ?? "")} x${String(record.quantity ?? "")}`,
      refundId,
    });
  }
  return tasks;
}

const getMyAssignments = defineTool({
  name: "get_my_assignments",
  description: "List my work tasks: online orders needing barcode prep and pending refund reviews.",
  security: { classification: "READ", roles: [...WORKER], scopes: ["assignments.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const tasks = await collectAssignments(ctx);
    auditTool(ctx, getMyAssignments, "ok");
    return tasks;
  },
});

const getMySchedule = defineTool({
  name: "get_my_schedule",
  description: "Get my scheduled work shifts (plus open counter duties and gate duty). Shifts are owner-planned per business.",
  security: { classification: "READ", roles: [...WORKER], scopes: ["schedule.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { from: z.string().optional().describe("ISO date, defaults to today."), to: z.string().optional() },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { from?: string; to?: string };
    const [shifts, tasks] = await Promise.all([
      backendGet(ctx, API.workerShiftsMe, { from: args.from, to: args.to }).catch(() => null),
      collectAssignments(ctx),
    ]);
    auditTool(ctx, getMySchedule, "ok");
    return {
      shifts: shifts ?? [],
      scheduleUnavailable: shifts === null,
      ticketEntryDuty: "Gate QR verification available at the Ticket Entry scanner.",
      openTasks: tasks,
    };
  },
});

const getMyEventsWorker = defineTool({
  name: "get_my_worker_events",
  description: "List upcoming ticket events relevant to my gate and counter duties.",
  security: { classification: "READ", roles: [...WORKER], scopes: ["assignments.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const events = await backendGet(ctx, API.workerTicketEvents).catch(() => backendGet(ctx, API.ticketEvents));
    auditTool(ctx, getMyEventsWorker, "ok");
    return events;
  },
});

const getMyTasks = defineTool({
  name: "get_my_tasks",
  description: "Alias of my assignments presented as a task list.",
  security: { classification: "READ", roles: [...WORKER], scopes: ["assignments.read"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: {},
  handler: async (ctx) => {
    const tasks = await collectAssignments(ctx);
    auditTool(ctx, getMyTasks, "ok");
    return tasks;
  },
});

function parseTaskId(taskId: string): AssignmentTask {
  const [kind, id] = taskId.split(":");
  const numericId = Number(id);
  if ((kind === "order" || kind === "refund" || kind === "returnable") && Number.isFinite(numericId)) {
    if (kind === "order") {
      return { taskId, kind: "online_order", title: "", detail: "", transactionId: numericId };
    }
    return {
      taskId,
      kind: kind === "refund" ? "refund" : "returnable_refund",
      title: "",
      detail: "",
      refundId: numericId,
    };
  }
  throw new McpError("BUSINESS_RULE_VIOLATION", `Unknown task ${taskId}. List tasks with get_my_assignments first.`);
}

const acceptAssignment = defineTool({
  name: "accept_assignment",
  description: "Accept a task: approves refund reviews; acknowledges online orders for preparation.",
  security: { classification: "WRITE", roles: [...WORKER], scopes: ["assignments.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { taskId: z.string().min(1), reason: z.string().max(1000).optional(), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { taskId: string; reason?: string } & ConfirmArgs;
    const task = parseTaskId(args.taskId);
    const gate = requireConfirmation(args, {
      action: "accept_assignment",
      summary: { taskId: args.taskId, effect: task.kind === "online_order" ? "acknowledge for preparation" : "approve refund" },
      argsForToken: { taskId: args.taskId },
    });
    if (gate) {
      auditTool(ctx, acceptAssignment, "confirmation_required", { resourceType: "task", resourceId: args.taskId });
      return gate;
    }
    if (task.kind === "online_order") {
      const orders = (await backendGet<unknown[]>(ctx, API.tuckShopOnlinePurchases).catch(() => [])) ?? [];
      const order = orders.find((entry) => Number((entry as Record<string, unknown>).transactionId) === task.transactionId);
      if (!order) {
        throw new McpError("BUSINESS_RULE_VIOLATION", `Online order #${task.transactionId} is no longer awaiting preparation.`);
      }
      auditTool(ctx, acceptAssignment, "ok", { resourceType: "task", resourceId: args.taskId });
      return { acknowledged: true, taskId: args.taskId, order };
    }
    const path = task.kind === "refund" ? API.refundApprove(task.refundId) : API.returnableRefundApprove(task.refundId);
    const result = await backendPost(ctx, path);
    auditTool(ctx, acceptAssignment, "ok", { resourceType: "task", resourceId: args.taskId });
    return result;
  },
});

const declineAssignment = defineTool({
  name: "decline_assignment",
  description: "Decline a task: rejects refund reviews with a reason. Online orders cannot be declined (no backend operation).",
  security: { classification: "WRITE", roles: [...WORKER], scopes: ["assignments.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { taskId: z.string().min(1), reason: z.string().min(1).max(1000), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { taskId: string; reason: string } & ConfirmArgs;
    const task = parseTaskId(args.taskId);
    if (task.kind === "online_order") {
      auditTool(ctx, declineAssignment, "error", { resourceType: "task", resourceId: args.taskId });
      throw new McpError(
        "UNSUPPORTED_OPERATION",
        "Online orders cannot be declined — no such backend operation exists. Assign barcodes or leave the order in the queue.",
      );
    }
    const gate = requireConfirmation(args, {
      action: "decline_assignment",
      summary: { taskId: args.taskId, effect: "reject refund", reason: args.reason },
      argsForToken: { taskId: args.taskId, reason: args.reason },
    });
    if (gate) {
      auditTool(ctx, declineAssignment, "confirmation_required", { resourceType: "task", resourceId: args.taskId });
      return gate;
    }
    const path = task.kind === "refund" ? API.refundReject(task.refundId) : API.returnableRefundReject(task.refundId);
    const result = await backendPost(ctx, path, { reason: args.reason });
    auditTool(ctx, declineAssignment, "ok", { resourceType: "task", resourceId: args.taskId });
    return result;
  },
});

const completeAssignment = defineTool({
  name: "complete_assignment",
  description: "Complete a task: verifies an online order is fully prepared (all barcodes assigned, ready for collection).",
  security: { classification: "WRITE", roles: [...WORKER], scopes: ["assignments.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: { taskId: z.string().min(1), ...confirmFields },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { taskId: string } & ConfirmArgs;
    const task = parseTaskId(args.taskId);
    if (task.kind !== "online_order") {
      auditTool(ctx, completeAssignment, "error", { resourceType: "task", resourceId: args.taskId });
      throw new McpError("UNSUPPORTED_OPERATION", "Only online-order tasks complete this way; refunds finish on approve/reject.");
    }
    const gate = requireConfirmation(args, {
      action: "complete_assignment",
      summary: { taskId: args.taskId, effect: "verify order ready for collection" },
      argsForToken: { taskId: args.taskId },
    });
    if (gate) {
      auditTool(ctx, completeAssignment, "confirmation_required", { resourceType: "task", resourceId: args.taskId });
      return gate;
    }
    const orders = (await backendGet<unknown[]>(ctx, API.tuckShopOnlinePurchases).catch(() => [])) ?? [];
    const order = orders.find((entry) => Number((entry as Record<string, unknown>).transactionId) === task.transactionId) as Record<string, unknown> | undefined;
    if (!order) {
      auditTool(ctx, completeAssignment, "ok", { resourceType: "task", resourceId: args.taskId });
      return { completed: true, taskId: args.taskId, note: "Order no longer in the preparation queue — treated as collected or fulfilled." };
    }
    const outstanding = Number(order.barcodesRequired ?? 0);
    auditTool(ctx, completeAssignment, outstanding === 0 ? "ok" : "error", { resourceType: "task", resourceId: args.taskId });
    if (outstanding > 0) {
      throw new McpError("BUSINESS_RULE_VIOLATION", `Order #${task.transactionId} still needs ${outstanding} barcode(s). Use assign_barcode first.`);
    }
    return { completed: true, taskId: args.taskId, order };
  },
});

const verifyTicket = defineTool({
  name: "verify_ticket",
  description: "Verify a ticket at the gate by QR value or reference (worker gate duty).",
  security: { classification: "WRITE", roles: [...WORKER], scopes: ["assignments.write"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { value: z.string().min(1), mode: z.enum(["qr", "reference"]) },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { value: string; mode: "qr" | "reference" };
    const path = args.mode === "qr" ? API.ticketVerifyQr : API.ticketVerifyReference;
    const result = await backendPost(ctx, path, { value: args.value });
    auditTool(ctx, verifyTicket, "ok");
    return result;
  },
});

const reviewRefund = defineTool({
  name: "review_refund",
  description: "Approve or reject a refund request with an optional reason.",
  security: { classification: "WRITE", roles: [...WORKER], scopes: ["assignments.write"], confirmation: "REQUIRED", financial: false, mandate: "NONE" },
  schema: {
    refundId: z.number().int().positive(),
    decision: z.enum(["approve", "reject"]),
    kind: z.enum(["refund", "returnable"]).optional(),
    reason: z.string().max(1000).optional(),
    ...confirmFields,
  },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { refundId: number; decision: "approve" | "reject"; kind?: "refund" | "returnable"; reason?: string } & ConfirmArgs;
    if (args.decision === "reject" && !args.reason?.trim()) {
      throw new McpError("BUSINESS_RULE_VIOLATION", "A reason is required to reject a refund.");
    }
    const gate = requireConfirmation(args, {
      action: "review_refund",
      summary: { refundId: args.refundId, decision: args.decision },
      argsForToken: { refundId: args.refundId, decision: args.decision, reason: args.reason ?? null },
    });
    if (gate) {
      auditTool(ctx, reviewRefund, "confirmation_required", { resourceType: "refund", resourceId: String(args.refundId) });
      return gate;
    }
    const kind = args.kind ?? "refund";
    const path =
      args.decision === "approve"
        ? kind === "refund" ? API.refundApprove(args.refundId) : API.returnableRefundApprove(args.refundId)
        : kind === "refund" ? API.refundReject(args.refundId) : API.returnableRefundReject(args.refundId);
    const body = args.decision === "reject" ? { reason: args.reason } : undefined;
    const result = await backendPost(ctx, path, body);
    auditTool(ctx, reviewRefund, "ok", { resourceType: "refund", resourceId: String(args.refundId) });
    return result;
  },
});

const assignBarcode = defineTool({
  name: "assign_barcode",
  description: "Assign one scanned barcode to a paid online purchase product line.",
  security: { classification: "WRITE", roles: [...WORKER], scopes: ["assignments.write"], confirmation: "NONE", financial: false, mandate: "NONE" },
  schema: { transactionId: z.number().int().positive(), productId: z.number().int().positive(), barcode: z.string().min(1) },
  handler: async (ctx, rawArgs) => {
    const args = rawArgs as { transactionId: number; productId: number; barcode: string };
    const result = await backendPost(ctx, API.tuckShopAssignBarcode(args.transactionId, args.productId), { barcode: args.barcode });
    auditTool(ctx, assignBarcode, "ok", { resourceType: "task", resourceId: `order:${args.transactionId}` });
    return result;
  },
});

export const workerTools: KingSparkonTool[] = [
  getMyWorkerProfile,
  getMyEarnings,
  getMyTips,
  getMyWalletWorker,
  getMyAssignments,
  getMySchedule,
  getMyEventsWorker,
  getMyTasks,
  acceptAssignment,
  declineAssignment,
  completeAssignment,
  verifyTicket,
  reviewRefund,
  assignBarcode,
];
