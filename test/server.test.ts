import { describe, expect, it } from "vitest";
import { backendFailure, errorPayload, McpError } from "@/auth/errors.js";
import { auditInvocation } from "@/audit/log.js";
import { idempotencyKey } from "@/backend/client.js";
import { tools } from "@/tools/registry.js";

describe("errors", () => {
  it("maps backend statuses to MCP codes", () => {
    expect(backendFailure(401, "x").code).toBe("INVALID_TOKEN");
    expect(backendFailure(403, "x").code).toBe("ROLE_NOT_ALLOWED");
    expect(backendFailure(400, "limit exceeded")).toEqual(
      expect.objectContaining({ code: "BUSINESS_RULE_VIOLATION" }),
    );
    expect(backendFailure(500, "x").code).toBe("BACKEND_ERROR");
  });

  it("serializes unknown errors safely", () => {
    expect(errorPayload(new Error("boom")).code).toBe("BACKEND_ERROR");
    expect(errorPayload(new McpError("INSUFFICIENT_KSC", "Low balance", { a: 1 })).code).toBe("INSUFFICIENT_KSC");
  });
});

describe("audit", () => {
  it("redacts secrets and keeps the §20 shape", () => {
    const record = auditInvocation({
      userId: 1,
      agentId: "agent-1",
      role: "USER",
      tool: "get_my_ksc_wallet",
      resourceType: null,
      resourceId: null,
      action: "get_my_ksc_wallet",
      consentId: null,
      mandateId: null,
      amount: null,
      currency: null,
      result: "ok",
      requestId: "req-1",
      timestamp: new Date().toISOString(),
      ...( { accessToken: "secret-token", nested: { refreshToken: "x" } } as Record<string, unknown> ),
    }) as unknown as Record<string, unknown>;
    expect(record.accessToken).toBe("[redacted]");
    expect((record.nested as Record<string, unknown>).refreshToken).toBe("[redacted]");
    expect(record.tool).toBe("get_my_ksc_wallet");
  });
});

describe("idempotency", () => {
  it("builds stable scoped keys", () => {
    const key = idempotencyKey("purchase_ticket", "event-1", "VIP");
    expect(key.startsWith("purchase_ticket:event-1:VIP:")).toBe(true);
    expect(key.length).toBeLessThanOrEqual(128);
  });
});

describe("registry", () => {
  it("registers every tool with security metadata and no name collisions", () => {
    expect(tools.length).toBeGreaterThan(60);
    const names = tools.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of tools) {
      expect(tool.security.roles.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it("never exposes raw ledger primitives as tools", () => {
    const names = tools.map((tool) => tool.name);
    for (const banned of ["ksc_authorize", "ksc_capture", "ksc_cancel", "ksc_settle", "wallet_adjustment", "ledger_write", "platform_fee_write"]) {
      expect(names).not.toContain(banned);
    }
  });
});
