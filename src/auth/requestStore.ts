/**
 * Request-scoped auth carrier (§31 stateless). api/mcp.ts stores the incoming
 * HTTP auth material per request; tool handlers read it. No tokens are
 * cached across requests and nothing sensitive is ever logged.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Consent } from "../auth/consent.js";

export interface McpRequestAuth {
  bearerToken: string | null;
  agentId: string | null;
  connectionId: string | null;
  consent: Consent | null;
}

const store = new AsyncLocalStorage<McpRequestAuth>();

export function runWithRequestAuth<T>(auth: McpRequestAuth, fn: () => T): T {
  return store.run(auth, fn);
}

export function requestAuth(): McpRequestAuth {
  return (
    store.getStore() ?? {
      bearerToken: null,
      agentId: null,
      connectionId: null,
      consent: null,
    }
  );
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string | null {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function bearerFrom(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function authFromHeaders(headers: Record<string, string | string[] | undefined>): McpRequestAuth {
  const bearerToken = bearerFrom(header(headers, "authorization"));
  const agentId = header(headers, "x-mcp-agent");
  const connectionId = header(headers, "x-mcp-connection");
  let consent: Consent | null = null;
  const rawConsent = header(headers, "x-mcp-consent");
  if (rawConsent) {
    try {
      const parsed = JSON.parse(rawConsent) as Consent;
      if (parsed && Array.isArray(parsed.scopes)) {
        consent = {
          scopes: parsed.scopes.filter((scope): scope is string => typeof scope === "string"),
          expiresAt: typeof parsed.expiresAt === "string" ? parsed.expiresAt : null,
          revoked: parsed.revoked === true,
          connectionId: typeof parsed.connectionId === "string" ? parsed.connectionId : connectionId,
        };
      }
    } catch {
      consent = null;
    }
  }
  return { bearerToken, agentId, connectionId, consent };
}

export function backendUrl(): string {
  return (process.env.BACKEND_URL ?? "http://localhost:8080").replace(/\/$/, "");
}
