import { describe, expect, it } from "vitest";
import {
  canonicalize,
  confirmationToken,
  rolesFromBackendUser,
  verifyConfirmationToken,
} from "@/auth/identity.js";
import { validateToolRole } from "@/auth/pipeline.js";
import type { KingSparkonRole, ToolSecurity } from "@/auth/consent.js";

function ctxWithRoles(roles: KingSparkonRole[]) {
  return {
    backendUrl: "http://localhost:8080",
    bearerToken: "token",
    agentId: null,
    connectionId: null,
    consent: { scopes: ["wallet.read"] },
    identity: { userId: 1, username: "u", roles, businessId: null, businessName: null },
    requestId: "req-1",
  };
}

const ownerOnly: ToolSecurity = {
  classification: "WRITE_BUSINESS",
  roles: ["OWNER"],
  scopes: [],
  confirmation: "REQUIRED",
  financial: false,
  mandate: "NONE",
};

describe("roles", () => {
  it("resolves privilege plus extra roles without collapsing", () => {
    expect(rolesFromBackendUser({ id: 1, username: "u", privilege: "Owner", roles: ["USER", "ARTIST"] })).toEqual(
      expect.arrayContaining(["OWNER", "USER", "ARTIST"]),
    );
    expect(rolesFromBackendUser({ id: 1, username: "u", privilege: "nonsense", roles: [] })).toEqual([]);
  });

  it("never collapses multiple roles into ADMIN", () => {
    const ctx = ctxWithRoles(["ADMIN", "OWNER"]);
    expect(validateToolRole(ctx, ownerOnly)).toBe("OWNER");
  });

  it("denies roles outside the tool allowlist", () => {
    const ctx = ctxWithRoles(["USER"]);
    expect(() => validateToolRole(ctx, ownerOnly)).toThrowError(/OWNER/);
  });
});

describe("confirmation tokens", () => {
  it("verifies matching tokens and rejects mismatches", () => {
    const canonical = canonicalize({ amountKsc: 250 });
    const token = confirmationToken("purchase_ticket", canonical);
    expect(verifyConfirmationToken("purchase_ticket", canonical, token)).toBe(true);
    expect(verifyConfirmationToken("purchase_ticket", canonical, `${token}x`)).toBe(false);
    expect(verifyConfirmationToken("purchase_product", canonical, token)).toBe(false);
  });
});
