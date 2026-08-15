import express from "express";
import cors from "cors";
import { config } from "../config";
import { taskRouter } from "../tasks/task-routes";
import { settingsRouter } from "../settings/settings-routes";
import { projectRouter } from "../projects/project-routes";
import { mcpRouter, activeMcpSessionCount } from "../mcp/mcp-router";
import { MCP_TOOL_NAMES } from "../mcp/mcp-server";

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      mcp: {
        endpoint: "/mcp",
        tools: MCP_TOOL_NAMES,
        activeSessions: activeMcpSessionCount(),
      },
    });
  });

  // Dashboard API: restricted to the configured web origin.
  const dashboardCors = cors({ origin: config.webOrigin });
  app.use("/api/tasks", dashboardCors, taskRouter);
  app.use("/api/settings", dashboardCors, settingsRouter);
  app.use("/api/projects", dashboardCors, projectRouter);

  // MCP endpoint: deliberately more permissive. This is a local-only dev
  // tool (see docs/architecture.md); MCP clients are typically not browser
  // pages subject to CORS enforcement anyway, but a permissive policy here
  // also lets browser-based MCP inspector tools connect during development.
  app.use(
    "/mcp",
    cors({
      origin: true,
      exposedHeaders: ["mcp-session-id"],
      allowedHeaders: ["Content-Type", "mcp-session-id", "Accept"],
    }),
    mcpRouter,
  );

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}
