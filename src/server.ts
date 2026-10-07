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

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { errorPayload, McpError } from "./auth/errors.js";
import { auditTool, authorizeTool } from "./tools/types.js";
import { tools } from "./tools/registry.js";
import { authFromHeaders, runWithRequestAuth } from "./auth/requestStore.js";

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

  return server;
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
