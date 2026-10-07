import { describe, expect, it } from "vitest";
import { rolesFromBackendUser } from "@/auth/identity.js";
import { checkConsent, permissionsForRoles } from "@/auth/consent.js";
import type { KingSparkonRole } from "@/auth/consent.js";
import { validateToolRole } from "@/auth/pipeline.js";
import type { ToolSecurity } from "@/auth/consent.js";
import { tools } from "@/tools/registry.js";

const ALL_ROLES: KingSparkonRole[] = ["USER", "ARTIST", "OWNER", "WORKER", "AFFILIATE", "ADMIN"];

const affiliateSecurity: ToolSecurity = {
  classification: "READ",
  roles: ["AFFILIATE"],
  scopes: ["affiliate.read"],
  confirmation: "NONE",
  financial: false,
  mandate: "NONE",
};

function ctxWithRoles(roles: KingSparkonRole[]) {
  return {
    backendUrl: "http://localhost:8080",
    bearerToken: "token",
    agentId: null,
    connectionId: null,
    consent: { scopes: ["affiliate.read"] },
    identity: { userId: 7, username: "aff", roles, businessId: null, businessName: null },
    requestId: "req-aff-1",
  };
}

describe("affiliate role", () => {
  it("normalizes the backend Affiliate privilege instead of dropping it", () => {
    expect(rolesFromBackendUser({ id: 7, username: "aff", privilege: "Affiliate", roles: [] })).toEqual([
      "AFFILIATE",
    ]);
    expect(
      rolesFromBackendUser({ id: 7, username: "aff", privilege: "User", roles: ["Affiliate"] }),
    ).toEqual(expect.arrayContaining(["USER", "AFFILIATE"]));
  });

  it("grants affiliate-scoped permissions without admin reach", () => {
    const permissions = permissionsForRoles(["AFFILIATE"]);
    expect(permissions).toEqual(
      expect.arrayContaining(["affiliate.read", "affiliate.write", "earnings.read", "wallet.read"]),
    );
    expect(permissions).not.toContain("admin.write");
    expect(permissions).not.toContain("artists.write");
  });

  it("gates affiliate tools by role", () => {
    expect(validateToolRole(ctxWithRoles(["AFFILIATE"]), affiliateSecurity)).toBe("AFFILIATE");
    expect(() => validateToolRole(ctxWithRoles(["USER"]), affiliateSecurity)).toThrowError(/AFFILIATE/);
    expect(() => validateToolRole(ctxWithRoles(["WORKER"]), affiliateSecurity)).toThrowError(/AFFILIATE/);
  });
});

describe("affiliate tool registry", () => {
  const names = tools.map((tool) => tool.name);

  it("registers the affiliate domain", () => {
    for (const name of [
      "get_my_affiliate_profile",
      "complete_affiliate_onboarding",
      "get_my_commissions",
      "get_my_affiliate_tips",
      "get_affiliate_withdrawal_eligibility",
      "get_my_affiliate_links",
      "create_affiliate_link",
    ]) {
      expect(names).toContain(name);
    }
  });

  it("registers the KSC payment-status read and withdrawal eligibility", () => {
    expect(names).toContain("get_ksc_payment");
    expect(names).toContain("get_withdrawal_eligibility");
  });

  it("keeps every tool role inside the six backend roles", () => {
    for (const tool of tools) {
      for (const role of tool.security.roles) {
        expect(ALL_ROLES).toContain(role);
      }
    }
  });

  it("restricts the withdraw tool to rail-owning roles including AFFILIATE", () => {
    const withdraw = tools.find((tool) => tool.name === "withdraw");
    expect(withdraw?.security.roles).toEqual(expect.arrayContaining(["ARTIST", "OWNER", "WORKER", "AFFILIATE"]));
    expect(withdraw?.security.confirmation).toBe("REQUIRED");
    expect(withdraw?.security.financial).toBe(true);
  });
});

describe("consent grant model", () => {
  it("rejects explicitly ungranted consent", () => {
    expect(checkConsent({ scopes: ["wallet.read"], granted: false }, ["wallet.read"]).ok).toBe(false);
  });

  it("accepts granted consent with metadata attached", () => {
    expect(
      checkConsent(
        { scopes: ["wallet.read"], granted: true, id: "grant-1", role: "USER", grantedAt: new Date().toISOString() },
        ["wallet.read"],
      ),
    ).toEqual({ ok: true });
  });
});
