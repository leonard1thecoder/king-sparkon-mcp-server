/**
 * Tool definition framework (§17). Every tool declares security metadata and
 * runs through `authorizeTool` (OAuth → identity → roles → scopes → consent
 * → tool-role) before its handler executes backend operations.
 */

import type { z } from "zod";
import { buildContext, validateConsent, validateToolRole, type McpRequestContext } from "../auth/pipeline.js";
import type { KingSparkonRole, ToolSecurity } from "../auth/consent.js";
import { backendUrl, requestAuth } from "../auth/requestStore.js";
import { auditInvocation } from "../audit/log.js";

export type ToolHandler = (ctx: McpRequestContext, args: Record<string, unknown>) => Promise<unknown>;

export interface KingSparkonTool {
  name: string;
  description: string;
  security: ToolSecurity;
  schema: z.ZodRawShape;
  handler: ToolHandler;
}

export function defineTool(tool: KingSparkonTool): KingSparkonTool {
  return tool;
}

/** Runs pipeline steps 1–7 and returns the authorized context. */
export async function authorizeTool(security: ToolSecurity): Promise<{ ctx: McpRequestContext; role: KingSparkonRole }> {
  const auth = requestAuth();
  const ctx = await buildContext({
    backendUrl: backendUrl(),
    bearerToken: auth.bearerToken,
    agentId: auth.agentId,
    connectionId: auth.connectionId,
    consent: auth.consent,
  });
  const role = validateToolRole(ctx, security);
  validateConsent(ctx, security);
  return { ctx, role };
}

export function auditTool(
  ctx: McpRequestContext,
  tool: KingSparkonTool,
  result: "ok" | "error" | "confirmation_required",
  extra?: Partial<Parameters<typeof auditInvocation>[0]>,
): void {
  auditInvocation({
    userId: ctx.identity.userId,
    agentId: ctx.agentId,
    role: ctx.identity.roles.join(","),
    tool: tool.name,
    resourceType: null,
    resourceId: null,
    action: tool.name,
    consentId: ctx.connectionId,
    mandateId: null,
    amount: null,
    currency: null,
    result,
    requestId: ctx.requestId,
    timestamp: new Date().toISOString(),
    ...extra,
  });
}
