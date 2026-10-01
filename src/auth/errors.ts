/**
 * Structured MCP error model (§19). Every tool failure returns one of these
 * codes with a safe human-readable message — never tokens, secrets, or
 * database internals.
 */

export type McpErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "INVALID_TOKEN"
  | "INSUFFICIENT_SCOPE"
  | "ROLE_NOT_ALLOWED"
  | "CONSENT_REQUIRED"
  | "CONSENT_REVOKED"
  | "CONSENT_EXPIRED"
  | "RESOURCE_NOT_OWNED"
  | "CONFIRMATION_REQUIRED"
  | "CONFIRMATION_REJECTED"
  | "MANDATE_REQUIRED"
  | "MANDATE_EXPIRED"
  | "MANDATE_REVOKED"
  | "MANDATE_LIMIT_EXCEEDED"
  | "INSUFFICIENT_KSC"
  | "EVENT_NOT_FOUND"
  | "EVENT_NOT_AVAILABLE"
  | "TICKET_NOT_AVAILABLE"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_OUT_OF_STOCK"
  | "BOOKING_NOT_AVAILABLE"
  | "BUSINESS_RULE_VIOLATION"
  | "UNSUPPORTED_OPERATION"
  | "BACKEND_ERROR";

export class McpError extends Error {
  readonly code: McpErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: McpErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "McpError";
    this.code = code;
    this.details = details;
  }
}

/** Maps backend HTTP failures to MCP error codes without leaking internals. */
export function backendFailure(status: number | undefined, message: string): McpError {
  const safe = message && message.length < 500 ? message : "The backend rejected this request.";
  if (status === 401) return new McpError("INVALID_TOKEN", "Backend authentication failed. Reconnect with a fresh token.");
  if (status === 403) return new McpError("ROLE_NOT_ALLOWED", "The backend denied this operation for your role.");
  if (status === 404) return new McpError("BACKEND_ERROR", `Not found: ${safe}`);
  if (status === 409) return new McpError("BUSINESS_RULE_VIOLATION", safe);
  if (status === 422) return new McpError("BUSINESS_RULE_VIOLATION", safe);
  if (status === 400) return new McpError("BUSINESS_RULE_VIOLATION", safe);
  return new McpError("BACKEND_ERROR", "Backend request failed. Try again later.");
}

export function errorPayload(error: unknown): { code: McpErrorCode; message: string; details?: Record<string, unknown> } {
  if (error instanceof McpError) {
    return { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) };
  }
  const message = error instanceof Error ? error.message : "Unexpected MCP error.";
  return { code: "BACKEND_ERROR", message: message.slice(0, 500) };
}
