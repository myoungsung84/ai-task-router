import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTaskTools } from "./tools/task-tools";
import { registerDiscussionTools } from "./tools/discussion-tools";

export const MCP_SERVER_NAME = "ai-task-router";
export const MCP_SERVER_VERSION = "0.1.0";

export const MCP_TOOL_NAMES = [
  "run_task",
  "run_tasks",
  "list_tasks",
  "get_task",
  "get_task_result",
  "cancel_task",
  "create_discussion",
  "list_discussions",
  "read_discussion_document",
  "claim_discussion_turn",
  "submit_discussion_turn",
  "add_discussion_repo",
] as const;

/**
 * One McpServer instance per client session (see mcp-router.ts) — cheap to
 * create since it only wires up tool handlers, no state of its own beyond
 * that. All actual Task state lives in TaskService/TaskStore, shared across
 * every session and with the HTTP dashboard API.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION });
  registerTaskTools(server);
  registerDiscussionTools(server);
  return server;
}
