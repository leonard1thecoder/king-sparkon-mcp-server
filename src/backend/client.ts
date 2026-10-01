/**
 * Typed HTTP client for the Spring Boot backend (§25). The caller's OAuth
 * bearer token is forwarded unchanged — the backend is the identity,
 * role, and financial authority. This client performs no business logic.
 */

import { McpError, backendFailure } from "../auth/errors.js";

export interface BackendContext {
  backendUrl: string;
  bearerToken: string;
  idempotencyKey?: string;
}

export interface BackendCallOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  idempotencyKey?: string;
}

function buildUrl(backendUrl: string, path: string, query?: BackendCallOptions["query"]): string {
  const base = backendUrl.replace(/\/$/, "");
  const url = new URL(base + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function safeMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["message", "error", "detail", "title"]) {
      if (typeof record[key] === "string" && (record[key] as string).length > 0) {
        return String(record[key]).slice(0, 500);
      }
    }
  }
  return fallback;
}

export async function backendCall<T>(ctx: BackendContext, path: string, options: BackendCallOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${ctx.bearerToken}`,
  };
  let body: string | undefined;
  if (options.body !== undefined && method !== "GET") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  const idempotencyKey = options.idempotencyKey ?? ctx.idempotencyKey;
  if (idempotencyKey && method !== "GET") {
    headers["Idempotency-Key"] = idempotencyKey;
  }
  let response: Response;
  try {
    response = await fetch(buildUrl(ctx.backendUrl, path, options.query), { method, headers, body });
  } catch (error) {
    throw new McpError("BACKEND_ERROR", `Backend unreachable: ${error instanceof Error ? error.message : "network error"}`);
  }
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (response.status === 204 || !text) {
    return undefined as T;
  }
  if (!response.ok) {
    throw backendFailure(response.status, safeMessage(payload, `Backend responded ${response.status}.`));
  }
  return payload as T;
}

export function backendGet<T>(ctx: BackendContext, path: string, query?: BackendCallOptions["query"]): Promise<T> {
  return backendCall<T>(ctx, path, { method: "GET", query });
}

export function backendPost<T>(ctx: BackendContext, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  return backendCall<T>(ctx, path, { method: "POST", body: body ?? {}, idempotencyKey });
}

export function backendPut<T>(ctx: BackendContext, path: string, body?: unknown): Promise<T> {
  return backendCall<T>(ctx, path, { method: "PUT", body: body ?? {} });
}

export function backendPatch<T>(ctx: BackendContext, path: string, body?: unknown): Promise<T> {
  return backendCall<T>(ctx, path, { method: "PATCH", body: body ?? {} });
}

export function backendDelete<T>(ctx: BackendContext, path: string): Promise<T> {
  return backendCall<T>(ctx, path, { method: "DELETE" });
}

/** Stable idempotency key for financial/business writes (§27). */
export function idempotencyKey(scope: string, ...parts: Array<string | number>): string {
  const digest = parts.map((part) => String(part).trim()).filter(Boolean).join(":");
  const random = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const scopePart = scope.trim().replace(/[^a-zA-Z0-9_-]+/g, "-") || "mcp";
  return `${scopePart}:${digest ? `${digest}:` : ""}${random}`.slice(0, 128);
}
