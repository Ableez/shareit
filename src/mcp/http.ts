#!/usr/bin/env node
import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools, setServerContext } from "./tools";

const app = express();
app.use(express.json());

const transports = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", async (req, res) => {
  const apiKey = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!apiKey) {
    res.status(401).json({ error: "Missing Authorization bearer token" });
    return;
  }
  const sessionId = req.header("mcp-session-id") ?? randomUUID();
  let transport = transports.get(sessionId);
  if (!transport) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
    });
    transports.set(sessionId, transport);
    const server = new McpServer(
      { name: "shareit", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );
    setServerContext(server, { apiKey });
    registerTools(server);
    await server.connect(transport);
    transport.onclose = () => transports.delete(sessionId);
  }
  await transport.handleRequest(req, res, req.body);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT ?? 8081);
app.listen(port, () => {
  console.log(`MCP HTTP server listening on :${port}`);
});
