/**
 * Central authorization engine (§18). Every tool invocation passes the same
 * pipeline — no per-tool duplication:
 *
 * validateOAuth → resolveIdentity → resolveCurrentRoles → validateOAuthScopes
 * → resolveMcpConnection → validateMcpConsent → validateToolRole
 * → validateResourceOwnership → validateConfirmation → validateFinancialMandate
 * → executeBackendOperation → auditResult
 */

import { randomUUID } from "node:crypto";
import { backendGet } from "../backend/client.js";
import { API } from "../backend/endpoints.js";
import { checkConsent, permissionsForRoles, type Consent, type KingSparkonRole, type ToolSecurity } from "./consent.js";
import { McpError } from "./errors.js";
import { canonicalize, resolveIdentity, verifyConfirmationToken, type RequestIdentity } from "./identity.js";

export interface McpRequestContext {
  backendUrl: string;
  bearerToken: string;
  agentId: string | null;
  connectionId: string | null;
  consent: Consent | null;
  identity: RequestIdentity;
  requestId: string;
}

export interface PipelineInput {
  backendUrl: string;
  bearerToken: string | null;
  agentId?: string | null;
  connectionId?: string | null;
  consent?: Consent | null;
  defaultScopes?: string[];
}

export async function buildContext(input: PipelineInput): Promise<McpRequestContext> {
  if (!input.bearerToken) {
    throw new McpError("AUTHENTICATION_REQUIRED", "An OAuth bearer token is required. Connect your King Sparkon account first.");
  }
  const identity = await resolveIdentity(input.backendUrl, input.bearerToken);
  const fallbackScopes = (input.defaultScopes ?? [])
    .concat((process.env.MCP_DEFAULT_SCOPES ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  return {
    backendUrl: input.backendUrl,
    bearerToken: input.bearerToken,
    agentId: input.agentId?.trim() || null,
    connectionId: input.connectionId?.trim() || null,
    consent: input.consent ?? (fallbackScopes.length > 0 ? { scopes: fallbackScopes } : null),
    identity,
    requestId: randomUUID(),
  };
}

export function validateToolRole(ctx: McpRequestContext, security: ToolSecurity): KingSparkonRole {
  const allowed = ctx.identity.roles.filter((role) => security.roles.includes(role));
  if (allowed.length === 0) {
    throw new McpError(
      "ROLE_NOT_ALLOWED",
      `This tool requires one of: ${security.roles.join(", ")}. Your current role(s): ${ctx.identity.roles.join(", ")}.`,
    );
  }
  // Evaluate the most relevant role, never collapse into ADMIN.
  if (allowed.includes("ADMIN") && allowed.length > 1) {
    return allowed.find((role) => role !== "ADMIN") ?? "ADMIN";
  }
  return allowed[0];
}

export function validateConsent(ctx: McpRequestContext, security: ToolSecurity): void {
  const check = checkConsent(ctx.consent, security.scopes);
  if (!check.ok) {
    throw new McpError(check.code, check.message);
  }
  void permissionsForRoles(ctx.identity.roles);
}

export interface ConfirmationSpec {
  action: string;
  summary: Record<string, unknown>;
  argsForToken: unknown;
}

export function requireConfirmation(
  args: { confirm?: boolean | null; confirmationToken?: string | null },
  spec: ConfirmationSpec,
): { status: "confirmation_required"; confirmation: { token: string; action: string; summary: Record<string, unknown> } } | null {
  const canonical = canonicalize(spec.argsForToken);
  if (args.confirm === true && typeof args.confirmationToken === "string") {
    if (!verifyConfirmationToken(spec.action, canonical, args.confirmationToken)) {
      throw new McpError("CONFIRMATION_REJECTED", "Confirmation token does not match this action. Review the summary and confirm again.");
    }
    return null;
  }
  const token = confirmationToken(spec.action, canonical);
  return {
    status: "confirmation_required",
    confirmation: { token, action: spec.action, summary: spec.summary },
  };
}

// Re-exported for tool modules that need a token without importing identity internals.
import { confirmationToken } from "./identity.js";
export { confirmationToken };

export function grantedPermissions(ctx: McpRequestContext): string[] {
  return permissionsForRoles(ctx.identity.roles);
}

export interface BackendActor {
  userId: number;
  username: string;
  businessId: number | null;
}

/** Ownership pre-check helper: compares a resource's business against the caller's. */
export function assertSameBusiness(callerBusinessId: number | null, resourceBusinessId: number | null, resource: string): void {
  if (callerBusinessId == null || resourceBusinessId == null || callerBusinessId !== resourceBusinessId) {
    throw new McpError("RESOURCE_NOT_OWNED", `This ${resource} does not belong to your business.`);
  }
}

export async function fetchBusinessId(ctx: McpRequestContext): Promise<number | null> {
  if (ctx.identity.businessId != null) return ctx.identity.businessId;
  try {
    const me = await backendGet<{ businessId?: number | null }>(
      { backendUrl: ctx.backendUrl, bearerToken: ctx.bearerToken },
      API.usersMe,
    );
    return me.businessId ?? null;
  } catch {
    return null;
  }
}
