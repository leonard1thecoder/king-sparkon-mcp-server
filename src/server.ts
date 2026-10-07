/**
 * MCP server assembly + Vercel root entrypoint (`src/server.ts`).
 *
 * Library part: `createServer()` registers every tool with the central
 * authorization pipeline (OAuth → identity → roles → scopes → consent →
 * tool-role) before its handler, and every outcome is audited. Backend
 * remains the authority for business rules, money, and data.
 *
 * Server part: the default export is the catch-all request handler Vercel
 * runs for every route. It serves MCP Streamable HTTP (stateless) on
 * POST /api/mcp and answers anything else with a JSON-RPC 404/405.
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { errorPayload, McpError } from "./auth/errors.js";
import { auditTool, authorizeTool } from "./tools/types.js";
import { tools } from "./tools/registry.js";
import { authFromHeaders, backendUrl, runWithRequestAuth } from "./auth/requestStore.js";
import { backendGet } from "./backend/client.js";
import { API } from "./backend/endpoints.js";
import { auditInvocation } from "./audit/log.js";
import { permissionsForRoles, type KingSparkonRole, type ToolSecurity } from "./auth/consent.js";
import type { McpRequestContext } from "./auth/pipeline.js";

export const SERVER_NAME = "king-sparkon-mcp-server";
export const SERVER_VERSION = "0.1.0";

export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.schema, async (rawArgs) => {
      const args = (rawArgs ?? {}) as Record<string, unknown>;
      let ctx;
      try {
        const authorized = await authorizeTool(tool.security);
        ctx = authorized.ctx;
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(errorPayload(error)) }],
          isError: true,
        };
      }
      try {
        const result = await tool.handler(ctx, args);
        const confirmation =
          result !== null &&
          typeof result === "object" &&
          (result as Record<string, unknown>).status === "confirmation_required";
        auditTool(ctx, tool, confirmation ? "confirmation_required" : "ok");
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result ?? null) }],
        };
      } catch (error) {
        const payload = errorPayload(error);
        try {
          auditTool(ctx, tool, payload.code === "CONFIRMATION_REQUIRED" ? "confirmation_required" : "error");
        } catch {
          // Auditing must never break the error path.
        }
        if (error instanceof McpError && error.code === "CONFIRMATION_REQUIRED") {
          return {
            content: [{ type: "text" as const, text: JSON.stringify((error as McpError & { details?: { confirmation?: unknown } }).details?.confirmation ?? payload) }],
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload) }],
          isError: true,
        };
      }
    });
  }

  registerResources(server);
  registerPrompts(server);

  return server;
}

/**
 * Read-oriented MCP resources (§25). Every read re-resolves identity and
 * consent through the same pipeline as tools; `resources/list` advertises
 * only capability names (no data), contents stay caller-scoped.
 */
const RESOURCE_ROLES = ["USER", "ARTIST", "OWNER", "WORKER", "AFFILIATE", "ADMIN"] as const;

function auditResource(ctx: McpRequestContext, name: string, result: "ok" | "error"): void {
  auditInvocation({
    userId: ctx.identity.userId,
    agentId: ctx.agentId,
    role: ctx.identity.roles.join(","),
    tool: `resource:${name}`,
    resourceType: "resource",
    resourceId: name,
    action: `resource:${name}`,
    consentId: ctx.connectionId,
    mandateId: null,
    amount: null,
    currency: null,
    result,
    requestId: ctx.requestId,
    timestamp: new Date().toISOString(),
  });
}

function resourceText(uri: string, value: unknown): {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
} {
  return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(value) }] };
}

function registerResources(server: McpServer): void {
  const readSecurity = (scopes: string[]): ToolSecurity => ({
    classification: "READ",
    roles: [...RESOURCE_ROLES] as KingSparkonRole[],
    scopes,
    confirmation: "NONE",
    financial: false,
    mandate: "NONE",
  });

  server.registerResource(
    "current-user",
    "king-sparkon://me",
    { description: "Authenticated King Sparkon profile: id, username, live roles and business assignment. Never includes tokens or secrets." },
    async (uri) => {
      const { ctx } = await authorizeTool(readSecurity([]));
      try {
        const profile = await backendGet(ctx, API.usersMe);
        auditResource(ctx, "king-sparkon://me", "ok");
        return resourceText(uri.href, profile);
      } catch {
        auditResource(ctx, "king-sparkon://me", "error");
        throw new McpError("BACKEND_ERROR", "Could not load the current user.");
      }
    },
  );

  server.registerResource(
    "my-permissions",
    "king-sparkon://me/permissions",
    { description: "Effective MCP permissions for the caller's live roles plus granted consent scopes." },
    async (uri) => {
      const { ctx } = await authorizeTool(readSecurity([]));
      auditResource(ctx, "king-sparkon://me/permissions", "ok");
      return resourceText(uri.href, {
        roles: ctx.identity.roles,
        permissions: permissionsForRoles(ctx.identity.roles),
        grantedScopes: ctx.consent?.scopes ?? [],
      });
    },
  );

  server.registerResource(
    "my-consent",
    "king-sparkon://me/consent",
    { description: "Effective MCP consent state for this connection: scopes, expiry, revocation and role permissions." },
    async (uri) => {
      const { ctx } = await authorizeTool(readSecurity([]));
      auditResource(ctx, "king-sparkon://me/consent", "ok");
      return resourceText(uri.href, {
        connectionId: ctx.connectionId,
        agentId: ctx.agentId,
        grantedScopes: ctx.consent?.scopes ?? [],
        expiresAt: ctx.consent?.expiresAt ?? null,
        revoked: ctx.consent?.revoked ?? false,
        permissions: permissionsForRoles(ctx.identity.roles),
      });
    },
  );

  server.registerResource(
    "event",
    new ResourceTemplate("king-sparkon://events/{eventId}", {
      // Public catalogue enumeration (backend endpoint is public): lets
      // clients discover event instances. Reads by id still enforce consent.
      list: async () => {
        try {
          const response = await fetch(`${backendUrl()}/api/v1/tickets/events`);
          if (!response.ok) return { resources: [] };
          const data: unknown = await response.json();
          const items = (Array.isArray(data) ? data : []).slice(0, 50);
          return {
            resources: items.flatMap((item) => {
              const record = item as Record<string, unknown>;
              const id = String(record.id ?? "");
              if (!id) return [];
              return [
                {
                  uri: `king-sparkon://events/${id}`,
                  name: String(record.name ?? `Event ${id}`),
                  description: "Published ticket event.",
                  mimeType: "application/json",
                },
              ];
            }),
          };
        } catch {
          return { resources: [] };
        }
      },
    }),
    { description: "One published ticket event with ticket classes and availability. Draft visibility is enforced by the backend." },
    async (uri, variables) => {
      const eventId = String((variables as Record<string, string>).eventId ?? "");
      if (!eventId) throw new McpError("BUSINESS_RULE_VIOLATION", "An eventId is required.");
      const { ctx } = await authorizeTool(readSecurity(["events.read"]));
      try {
        const event = await backendGet(ctx, API.ticketEvent(eventId));
        auditResource(ctx, "king-sparkon://events/{eventId}", "ok");
        return resourceText(uri.href, event);
      } catch {
        auditResource(ctx, "king-sparkon://events/{eventId}", "error");
        throw new McpError("EVENT_NOT_FOUND", "Ticket event not found.");
      }
    },
  );

  server.registerResource(
    "wallet",
    "king-sparkon://wallet",
    { description: "Caller-owned KSC wallet: available, reserved and total balances. Never combined with ZAR earnings." },
    async (uri) => {
      const { ctx } = await authorizeTool(readSecurity(["wallet.read"]));
      try {
        const wallet = await backendGet(ctx, API.kscWallet);
        auditResource(ctx, "king-sparkon://wallet", "ok");
        return resourceText(uri.href, wallet);
      } catch {
        auditResource(ctx, "king-sparkon://wallet", "error");
        throw new McpError("BACKEND_ERROR", "Could not load the KSC wallet.");
      }
    },
  );
}

/**
 * Workflow prompts (§26). Static guidance only — they describe safe tool
 * sequences and never bypass authorization, consent or confirmation.
 */
function registerPrompts(server: McpServer): void {
  const message = (text: string) => ({
    messages: [{ role: "user" as const, content: { type: "text" as const, text } }],
  });

  server.registerPrompt(
    "event_management",
    { description: "Guide an owner through the ticket-event lifecycle: draft, sets, publish, bookings, cancel." },
    async () => message(
      [
        "Owner event lifecycle. Always start with get_my_role to confirm the OWNER role, then:",
        "1. get_my_events to see existing ticket and drafted events.",
        "2. create_event (draft) with the backend-native event shape; confirm when asked.",
        "3. create_event_set per performance slot with ISO-8601 startTime/endTime; backend validates overlaps.",
        "4. Review applicants with get_event_artists; approve via book_artist (with offer) or reject via reject_artist — rejection uses the real workflow, never deletion.",
        "5. publish_event only when sets, rider and tickets are ready; cancel_event cancels, never deletes history.",
        "Every mutation needs owner.events consent and an explicit confirmation round. Ownership is enforced against the live backend principal.",
      ].join("\n"),
    ),
  );

  server.registerPrompt(
    "artist_booking",
    { description: "Guide an artist through applying to sets and answering booking offers." },
    async () => message(
      [
        "Artist booking workflow. Confirm the ARTIST role with get_my_role, then:",
        "1. search_events for published events; get_event_sets is owner-side, so use get_my_artist_sets for your applications and bookings.",
        "2. Apply with accept_set (creates a PENDING application — confirmation required).",
        "3. Track with get_my_artist_bookings; answer offers with accept_booking or reject_booking.",
        "4. Withdraw a pending application with reject_set.",
        "Never act on another artist's bookings; the backend scopes everything to the authenticated artist.",
      ].join("\n"),
    ),
  );

  server.registerPrompt(
    "rider_selection",
    { description: "Guide an artist through company-paid rider redemption without touching the customer cart." },
    async () => message(
      [
        "Rider workflow (company-paid, never a customer checkout). Confirm the ARTIST role, then:",
        "1. get_my_rider_entitlements to list events with rider budgets.",
        "2. get_event_rider for budget, spent and remaining on one event.",
        "3. select_rider_products with eventId, productId and quantity — confirmation required; the backend checks catalogue, budget and confirmed-booking status.",
        "4. get_my_product_selections to review what was taken.",
        "Rider items go straight to My Purchases for counter collection. No KSC moves, no cart, no checkout. Owners configure budgets with set_event_rider / update_event_rider / disable_event_rider.",
      ].join("\n"),
    ),
  );

  server.registerPrompt(
    "payment_review",
    { description: "Enforce quote-then-confirm discipline before any KSC movement." },
    async () => message(
      [
        "Payment discipline. Before any purchase_ticket, purchase_product, ksc_topup, create_mandate or withdraw call:",
        "1. Read the quote first: get_event for ticket price/availability, get_product for price/stock, get_my_ksc_wallet and get_ksc_transactions for balance, get_ksc_payment for an existing payment's state.",
        "2. Present amount, recipient and purpose; request explicit confirmation — the server enforces the confirmation token and rejects mismatches.",
        "3. Execute, then return the transaction reference; amounts are backend-exact KSC/ZAR, never recomputed locally.",
        "4. Retries reuse deterministic idempotency keys, so a repeated call cannot double-charge. Refunds and cancellations go through backend review flows, never ledger primitives.",
      ].join("\n"),
    ),
  );
}

interface SinkResponse {
  status?: unknown;
  json?: unknown;
  writeHead?: unknown;
  setHeader?: unknown;
  end?: unknown;
}

function sendJson(res: unknown, status: number, payload: unknown): void {
  const r = res as SinkResponse | null | undefined;
  if (!r) return;
  if (typeof r.status === "function") {
    try {
      const chained = (r as { status: (code: number) => unknown }).status(status) as {
        json?: unknown;
      } | null | undefined;
      if (chained && typeof chained.json === "function") {
        (chained as { json: (b: unknown) => void }).json(payload);
        return;
      }
    } catch {
      // Fall through to the raw-Node shapes below.
    }
  }
  if (typeof r.json === "function") {
    try {
      (r as { json: (b: unknown) => void }).json(payload);
      return;
    } catch {
      // Fall through to the raw-Node shapes below.
    }
  }
  try {
    const body = JSON.stringify(payload);
    if (typeof r.writeHead === "function") {
      (r as { writeHead: (code: number, headers: Record<string, string>) => void }).writeHead(status, {
        "content-type": "application/json",
      });
    } else if (typeof r.setHeader === "function") {
      (r as { setHeader: (k: string, v: string) => void }).setHeader("content-type", "application/json");
    }
    if (typeof r.end === "function") {
      (r as { end: (b: string) => void }).end(body);
    }
  } catch {
    // Never throw from the response path.
  }
}

async function readJsonBody(req: unknown): Promise<unknown> {
  const r = req as { body?: unknown } | null | undefined;
  if (r && r.body !== undefined) return r.body;
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req as AsyncIterable<Buffer | string>) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (!text) return undefined;
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Vercel root-entrypoint handler. Serves POST /api/mcp with a fresh
 * stateless MCP server per request; every other path/method gets a
 * JSON-RPC error so misrouted callers learn the correct endpoint.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any): Promise<unknown> {
  const rawUrl = typeof req?.url === "string" ? req.url : "/";
  const path = rawUrl.split("?")[0];
  const method = String(req?.method ?? "GET").toUpperCase();

  if (path !== "/api/mcp") {
    sendJson(res, 404, {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Not an MCP endpoint. POST to /api/mcp." },
      id: null,
    });
    return undefined;
  }
  if (method !== "POST") {
    sendJson(res, 405, {
      jsonrpc: "2.0",
      error: { code: -32000, message: `Method ${method} not allowed. POST to /api/mcp.` },
      id: null,
    });
    return undefined;
  }
  if (!res || typeof res.end !== "function") {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32603, message: "MCP request failed." },
        id: null,
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const auth = authFromHeaders((req?.headers ?? {}) as Record<string, string | string[] | undefined>);
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    const parsedBody = await readJsonBody(req);
    await runWithRequestAuth(auth, () => transport.handleRequest(req, res, parsedBody));
  } catch (error) {
    console.error(JSON.stringify({ mcp_endpoint_error: String((error as Error)?.message ?? error) }));
    try {
      sendJson(res, 500, {
        jsonrpc: "2.0",
        error: { code: -32603, message: "MCP request failed." },
        id: null,
      });
    } catch {
      // Response already started; nothing further to do.
    }
  } finally {
    try {
      await transport.close();
    } catch {
      // Ignore close errors on serverless.
    } finally {
      await server.close().catch(() => undefined);
    }
  }
  return undefined;
}
