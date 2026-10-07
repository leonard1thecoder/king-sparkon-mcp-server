/**
 * Role-based consent matrix (§5) and tool security metadata (§17).
 *
 * Layer A (OAuth account consent) arrives per request as granted scopes.
 * Layer B (role consent) is this matrix: which permissions each backend role
 * may request. The backend remains the final enforcer; this layer keeps AI
 * agents from even attempting what their role can never do.
 */

export type KingSparkonRole = "USER" | "ARTIST" | "OWNER" | "WORKER" | "AFFILIATE" | "ADMIN";

export type ToolClassification = "READ" | "WRITE" | "WRITE_BUSINESS" | "WRITE_FINANCIAL";

export interface ToolSecurity {
  classification: ToolClassification;
  roles: KingSparkonRole[];
  /** OAuth/consent scopes the connection must hold. */
  scopes: string[];
  confirmation: "NONE" | "REQUIRED";
  financial: boolean;
  mandate: "NONE" | "OPTIONAL" | "REQUIRED";
}

export const ROLE_PERMISSIONS: Record<KingSparkonRole, string[]> = {
  USER: [
    "events.read",
    "products.read",
    "tickets.read",
    "orders.read",
    "wallet.read",
    "tickets.purchase",
    "products.purchase",
    "payments.write",
  ],
  ARTIST: [
    "artist.read",
    "artist.write",
    "bookings.read",
    "bookings.write",
    "sets.read",
    "sets.write",
    "rider.read",
    "rider.write",
    "earnings.read",
    "wallet.read",
    "payments.write",
    "events.read",
    "products.read",
    "tickets.read",
    "tickets.purchase",
    "products.purchase",
    "orders.read",
  ],
  OWNER: [
    "business.read",
    "events.read",
    "events.write",
    "sets.read",
    "sets.write",
    "artists.read",
    "artists.write",
    "bookings.read",
    "bookings.write",
    "products.read",
    "products.write",
    "rider.read",
    "rider.write",
    "workers.read",
    "workers.write",
    "earnings.read",
    "wallet.read",
    "payments.write",
    "tickets.purchase",
    "products.purchase",
    "orders.read",
  ],
  WORKER: [
    "worker.read",
    "worker.write",
    "assignments.read",
    "assignments.write",
    "schedule.read",
    "earnings.read",
    "wallet.read",
    "events.read",
    "products.read",
    "tickets.read",
    "tickets.purchase",
    "products.purchase",
    "orders.read",
    "payments.write",
  ],
  AFFILIATE: [
    "affiliate.read",
    "affiliate.write",
    "earnings.read",
    "wallet.read",
    "events.read",
    "products.read",
    "tickets.read",
    "orders.read",
  ],
  ADMIN: [
    "business.read",
    "events.read",
    "products.read",
    "tickets.read",
    "orders.read",
    "wallet.read",
    "earnings.read",
    "admin.read",
    "admin.write",
  ],
};

export interface Consent {
  scopes: string[];
  expiresAt?: string | null;
  revoked?: boolean;
  connectionId?: string | null;
  /** Optional grant metadata (§7 typed consent model). Never trusted for identity. */
  id?: string | null;
  userId?: string | number | null;
  role?: string | null;
  granted?: boolean | null;
  grantedAt?: string | null;
}

export type ConsentCheck =
  | { ok: true }
  | { ok: false; code: "CONSENT_REQUIRED" | "CONSENT_REVOKED" | "CONSENT_EXPIRED" | "INSUFFICIENT_SCOPE"; message: string };

export function checkConsent(
  consent: Consent | null | undefined,
  requiredScopes: string[],
  now: Date = new Date(),
): ConsentCheck {
  if (!consent || !Array.isArray(consent.scopes) || consent.scopes.length === 0) {
    return { ok: false, code: "CONSENT_REQUIRED", message: "MCP connection consent is required for this operation." };
  }
  if (consent.revoked) {
    return { ok: false, code: "CONSENT_REVOKED", message: "MCP connection consent was revoked. Reconnect to continue." };
  }
  if (consent.granted === false) {
    return { ok: false, code: "CONSENT_REQUIRED", message: "MCP connection consent was not granted for this operation." };
  }
  if (consent.expiresAt) {
    const expiry = new Date(consent.expiresAt);
    if (!Number.isNaN(expiry.getTime()) && expiry.getTime() <= now.getTime()) {
      return { ok: false, code: "CONSENT_EXPIRED", message: "MCP connection consent expired. Reconnect to continue." };
    }
  }
  const granted = new Set(consent.scopes.map((s) => s.trim()).filter(Boolean));
  const missing = requiredScopes.filter((scope) => !granted.has(scope));
  if (missing.length > 0) {
    return {
      ok: false,
      code: "INSUFFICIENT_SCOPE",
      message: `Connection consent is missing required scope(s): ${missing.join(", ")}.`,
    };
  }
  return { ok: true };
}

/** Union of every permission the given roles may request. */
export function permissionsForRoles(roles: KingSparkonRole[]): string[] {
  const permissions = new Set<string>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) {
      permissions.add(permission);
    }
  }
  return [...permissions].sort();
}
