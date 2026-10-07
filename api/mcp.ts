/**
 * Vercel serverless MCP endpoint: POST /api/mcp (Streamable HTTP, stateless).
 *
 * A fresh server is created per request (no shared sessions, no filesystem
 * state). The caller's OAuth bearer token travels in the Authorization
 * header and stays the identity authority end to end.
 */

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "../src/mcpServer.js";
import { authFromHeaders, runWithRequestAuth } from "../src/auth/requestStore.js";

interface VercelRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end: (body?: unknown) => void;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: `Method ${req.method ?? "unknown"} not allowed. POST to /api/mcp.` },
      id: null,
    });
    return;
  }
  const auth = authFromHeaders(req.headers ?? {});
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    await runWithRequestAuth(auth, () =>
      transport.handleRequest(req as never, res as never, req.body),
    );
  } catch (error) {
    console.error(JSON.stringify({ mcp_endpoint_error: String((error as Error)?.message ?? error) }));
    try {
      res.status(500).json({
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
}

export { SERVER_NAME, SERVER_VERSION };
