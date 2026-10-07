/**
 * Per-request identity resolution (§3). The backend OAuth bearer token is the
 * identity authority: it is validated by calling the backend, and roles are
 * re-resolved on EVERY request — never cached, never trusted from MCP state.
 */

import { createHmac, randomBytes } from "node:crypto";
import { backendGet } from "../backend/client.js";
import { API } from "../backend/endpoints.js";
import { McpError } from "./errors.js";
import type { KingSparkonRole } from "./consent.js";

export interface BackendUser {
  id: number;
  username: string;
  emailAddress?: string | null;
  privilege?: string | null;
  roles?: string[] | null;
  businessId?: number | null;
  businessName?: string | null;
}

export interface RequestIdentity {
  userId: number;
  username: string;
  roles: KingSparkonRole[];
  businessId: number | null;
  businessName: string | null;
}

const VALID_ROLES: KingSparkonRole[] = ["USER", "ARTIST", "OWNER", "WORKER", "AFFILIATE", "ADMIN"];

function normalizeRole(value: unknown): KingSparkonRole | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return (VALID_ROLES as string[]).includes(upper) ? (upper as KingSparkonRole) : null;
}

export function rolesFromBackendUser(user: BackendUser): KingSparkonRole[] {
  const roles = new Set<KingSparkonRole>();
  const direct = normalizeRole(user.privilege);
  if (direct) roles.add(direct);
  for (const role of user.roles ?? []) {
    const normalized = normalizeRole(role);
    if (normalized) roles.add(normalized);
  }
  return [...roles];
}

export async function resolveIdentity(backendUrl: string, bearerToken: string): Promise<RequestIdentity> {
  if (!bearerToken || !bearerToken.trim()) {
    throw new McpError("AUTHENTICATION_REQUIRED", "An OAuth bearer token is required. Connect your King Sparkon account first.");
  }
  let user: BackendUser;
  try {
    user = await backendGet<BackendUser>({ backendUrl, bearerToken }, API.usersMe);
  } catch (error) {
    if (error instanceof McpError && error.code === "INVALID_TOKEN") throw error;
    throw new McpError("INVALID_TOKEN", "The access token was rejected by King Sparkon. Reconnect with a fresh token.");
  }
  const roles = rolesFromBackendUser(user);
  if (roles.length === 0) {
    throw new McpError("ROLE_NOT_ALLOWED", "Your account has no usable King Sparkon role.");
  }
  return {
    userId: user.id,
    username: user.username,
    roles,
    businessId: user.businessId ?? null,
    businessName: user.businessName ?? null,
  };
}

// ─── Confirmation tokens (stateless, §6) ─────────────────────────────

function confirmSecret(): string {
  const configured = process.env.MCP_CONFIRM_SECRET?.trim();
  if (configured && configured.length >= 16) return configured;
  if (!globalThis.__mcpEphemeralSecret) {
    globalThis.__mcpEphemeralSecret = randomBytes(32).toString("hex");
  }
  return globalThis.__mcpEphemeralSecret as string;
}

declare global {
  // eslint-disable-next-line no-var
  var __mcpEphemeralSecret: string | undefined;
}

export function confirmationToken(action: string, canonicalArgs: string): string {
  return createHmac("sha256", confirmSecret()).update(`${action}:${canonicalArgs}`).digest("base64url");
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

export function verifyConfirmationToken(action: string, canonicalArgs: string, token: string): boolean {
  const expected = confirmationToken(action, canonicalArgs);
  if (token.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < token.length; index += 1) {
    mismatch |= token.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}
