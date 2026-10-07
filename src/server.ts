/**
 * MCP server assembly. Each registered tool runs the central authorization
 * pipeline (OAuth → identity → roles → scopes → consent → tool-role) before
 * its handler, and every outcome is audited. Backend remains the authority
 * for business rules, money, and data.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorPayload, McpError } from "./auth/errors.js";
import { auditTool, authorizeTool } from "./tools/types.js";
import { tools } from "./tools/registry.js";

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

/**
 * Default export so Vercel never fails with
 * `Invalid export found in module "/var/task/src/server.js"` if this file
 * is loaded as a function entrypoint/chunk. Real MCP traffic goes to
 * `api/mcp.ts` (POST /api/mcp); this handler only explains the misroute.
 */
export default function handler(
  _req: unknown,
  res?: { status: (code: number) => { json: (body: unknown) => void } },
): void {
  res?.status(404).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Not an MCP endpoint. POST to /api/mcp." },
    id: null,
  });
}
