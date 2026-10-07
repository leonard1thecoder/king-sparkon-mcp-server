import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "@/server.js";
import { runWithRequestAuth } from "@/auth/requestStore.js";

function usersMeResponse() {
  return {
    id: 9,
    username: "reader",
    privilege: "User",
    roles: ["USER"],
    businessId: null,
    businessName: null,
  };
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

function stubBackend() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      const href = String(url);
      if (href.endsWith("/api/users/me")) return json(usersMeResponse());
      if (href.endsWith("/api/ksc/wallet")) return json({ available: 10, reserved: 0, total: 10 });
      if (href.endsWith("/api/v1/tickets/events")) {
        return json([{ id: "evt-1", name: "Test Event", status: "PUBLISHED" }]);
      }
      if (href.includes("/api/v1/tickets/events/")) {
        return json({ id: "evt-1", name: "Test Event", status: "PUBLISHED" });
      }
      return json({});
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function linkedClient() {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { server, client, close: async () => client.close().catch(() => undefined) };
}

describe("resources and prompts", () => {
  it("lists tools, resources and prompts", async () => {
    const { client, close } = await linkedClient();
    try {
      const [toolList, resourceList, promptList] = await Promise.all([
        client.listTools(),
        client.listResources(),
        client.listPrompts(),
      ]);
      expect(toolList.tools.length).toBeGreaterThan(90);
      expect(resourceList.resources.map((resource) => resource.uri)).toEqual(
        expect.arrayContaining([
          "king-sparkon://me",
          "king-sparkon://me/permissions",
          "king-sparkon://me/consent",
          "king-sparkon://wallet",
        ]),
      );
      expect(promptList.prompts.map((prompt) => prompt.name)).toEqual(
        expect.arrayContaining(["event_management", "artist_booking", "rider_selection", "payment_review"]),
      );
    } finally {
      await close();
    }
  });

  it("enumerates public event instances for the events template", async () => {
    stubBackend();
    const { client, close } = await linkedClient();
    try {
      const resourceList = await client.listResources();
      expect(resourceList.resources.map((resource) => resource.uri)).toContain("king-sparkon://events/evt-1");
      const read = await runWithRequestAuth(
        { bearerToken: "token", agentId: "agent-1", connectionId: "conn-1", consent: { scopes: ["events.read"] } },
        () => client.readResource({ uri: "king-sparkon://events/evt-1" }),
      );
      expect((read.contents[0] as { text?: string }).text ?? "").toContain("Test Event");
    } finally {
      await close();
    }
  });

  it("reads an authenticated resource through the pipeline", async () => {
    stubBackend();
    const { client, close } = await linkedClient();
    try {
      const result = await runWithRequestAuth(
        { bearerToken: "token", agentId: "agent-1", connectionId: "conn-1", consent: { scopes: ["wallet.read"] } },
        () => client.readResource({ uri: "king-sparkon://wallet" }),
      );
      const text = (result.contents[0] as { text?: string }).text ?? "";
      expect(text).toContain("10");
    } finally {
      await close();
    }
  });

  it("rejects unauthenticated resource reads without leaking data", async () => {
    const { client, close } = await linkedClient();
    try {
      await expect(client.readResource({ uri: "king-sparkon://me" })).rejects.toThrow();
    } finally {
      await close();
    }
  });

  it("serves workflow prompts without exposing secrets", async () => {
    const { client, close } = await linkedClient();
    try {
      const prompt = await client.getPrompt({ name: "payment_review" });
      const text = prompt.messages.map((message) => JSON.stringify(message.content)).join(" ");
      expect(text).toMatch(/confirm/i);
      expect(text).not.toMatch(/refresh[_-]?token|password|secret/i);
    } finally {
      await close();
    }
  });
});
