#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools, setServerContext } from "./tools";

const apiKey = process.env.MCP_API_KEY;
if (!apiKey) {
  console.error("MCP_API_KEY is required (e.g. dc_<agentId>_<secret>)");
  process.exit(1);
}

const server = new McpServer(
  { name: "shareit", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

setServerContext(server, { apiKey });
registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
