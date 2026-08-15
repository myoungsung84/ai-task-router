import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "./mcp-server";

/**
 * Official MCP TypeScript SDK "stateful Streamable HTTP" pattern: one
 * transport (+ McpServer instance) per client session, keyed by the
 * `Mcp-Session-Id` header the transport assigns on the initialize request.
 * This is the same shape as the SDK's own example server
 * (examples/server/simpleStreamableHttp), adapted onto our existing Express
 * app instead of a standalone one.
 */
const transports = new Map<string, StreamableHTTPServerTransport>();

export const mcpRouter = Router();

async function handleMcpPost(req: Request, res: Response): Promise<void> {
  const sessionId = req.header("mcp-session-id");

  try {
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      if (sessionId) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: unknown mcp-session-id" },
          id: null,
        });
        return;
      }
      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: No valid session ID provided" },
          id: null,
        });
        return;
      }

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        // Plain JSON responses are enough here — every tool call in this
        // server resolves immediately, no server-initiated streaming needed.
        enableJsonResponse: true,
        onsessioninitialized: (sid) => {
          transports.set(sid, transport!);
        },
      });
      transport.onclose = () => {
        if (transport?.sessionId) transports.delete(transport.sessionId);
      };

      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[mcp] request handling error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
}

async function handleMcpSessionRequest(req: Request, res: Response): Promise<void> {
  const sessionId = req.header("mcp-session-id");
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) {
    res.status(400).send("Invalid or missing mcp-session-id");
    return;
  }
  try {
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("[mcp] session request handling error:", err);
    if (!res.headersSent) res.status(500).send("Internal server error");
  }
}

// Both handlers above already catch and respond to every failure themselves
// (never reject), so `void` here is the intentional "fire and forget" this
// rule expects rather than a genuinely unhandled promise.
mcpRouter.post("/", (req, res) => void handleMcpPost(req, res));
mcpRouter.get("/", (req, res) => void handleMcpSessionRequest(req, res));
mcpRouter.delete("/", (req, res) => void handleMcpSessionRequest(req, res));

export function activeMcpSessionCount(): number {
  return transports.size;
}
