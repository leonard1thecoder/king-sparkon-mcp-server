/**
 * Vercel serverless MCP endpoint: POST /api/mcp (Streamable HTTP, stateless).
 *
 * Thin wrapper around the shared handler in `src/server.ts` (which is also
 * the Vercel root entrypoint). A fresh MCP server is created per request
 * (no shared sessions, no filesystem state). The caller's OAuth bearer
 * token travels in the Authorization header and stays the identity
 * authority end to end.
 */

import serverHandler, { SERVER_NAME, SERVER_VERSION } from "../src/server.js";

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
  await serverHandler(req, res);
}

export { SERVER_NAME, SERVER_VERSION };
