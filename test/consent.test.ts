import { describe, expect, it } from "vitest";
import { checkConsent, permissionsForRoles, ROLE_PERMISSIONS } from "@/auth/consent.js";

describe("consent matrix", () => {
  it("grants listed scopes", () => {
    expect(checkConsent({ scopes: ["wallet.read"] }, ["wallet.read"])).toEqual({ ok: true });
  });

  it("requires consent when missing", () => {
    expect(checkConsent(null, ["wallet.read"]).ok).toBe(false);
    expect(checkConsent({ scopes: [] }, ["wallet.read"])).toEqual(
      expect.objectContaining({ code: "CONSENT_REQUIRED" }),
    );
  });

  it("denies revoked consent", () => {
    expect(checkConsent({ scopes: ["wallet.read"], revoked: true }, ["wallet.read"])).toEqual(
      expect.objectContaining({ code: "CONSENT_REVOKED" }),
    );
  });

  it("denies expired consent", () => {
    expect(
      checkConsent(
        { scopes: ["wallet.read"], expiresAt: "2020-01-01T00:00:00Z" },
        ["wallet.read"],
        new Date("2026-01-01T00:00:00Z"),
      ),
    ).toEqual(expect.objectContaining({ code: "CONSENT_EXPIRED" }));
  });

  it("denies missing scopes", () => {
    const result = checkConsent({ scopes: ["wallet.read"] }, ["wallet.read", "payments.write"]);
    expect(result).toEqual(expect.objectContaining({ code: "INSUFFICIENT_SCOPE" }));
  });

  it("gives each role its documented permissions", () => {
    expect(ROLE_PERMISSIONS.USER).toContain("tickets.purchase");
    expect(ROLE_PERMISSIONS.ARTIST).toContain("rider.write");
    expect(ROLE_PERMISSIONS.OWNER).toContain("products.write");
    expect(ROLE_PERMISSIONS.WORKER).toContain("assignments.write");
    expect(ROLE_PERMISSIONS.ADMIN).toContain("admin.read");
    expect(permissionsForRoles(["USER", "ARTIST"])).toContain("tickets.purchase");
  });
});
