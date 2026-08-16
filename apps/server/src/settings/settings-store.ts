import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_ROLE_SETTINGS,
  DEFAULT_SETTINGS,
  TASK_ROLES,
  type AgentName,
  type RoleConfig,
  type RoleSettings,
  type Settings,
  type WorkflowSpec,
} from "@ai-task-router/shared";
import { config } from "../config";

function settingsPath(): string {
  return path.join(config.dataDir, "settings.json");
}

function isAgentName(v: unknown): v is AgentName {
  return v === "claude" || v === "codex";
}

function readRoleConfig(v: unknown, fallback: RoleConfig): RoleConfig {
  if (!v || typeof v !== "object") return fallback;
  const obj = v as Record<string, unknown>;
  const agent = isAgentName(obj.agent) ? obj.agent : fallback.agent;
  const model = typeof obj.model === "string" && obj.model.trim() ? obj.model.trim() : null;
  return { agent, model };
}

/** A pre-Role settings.json only ever had one hand-built `defaultWorkflow` — derive each Role's Agent/model from whichever Step used that action, so an upgrade never silently resets a user's Claude/Codex choice. */
function rolesFromLegacyWorkflow(workflow: WorkflowSpec): RoleSettings {
  const roles: RoleSettings = { ...DEFAULT_ROLE_SETTINGS };
  for (const step of workflow.steps) {
    const roleConfig: RoleConfig = { agent: step.agent, model: step.model ?? null };
    if (step.action === "implement") roles.implementer = roleConfig;
    else if (step.action === "analyze") roles.analyzer = roleConfig;
    else if (step.action === "review") roles.reviewer = roleConfig;
  }
  return roles;
}

function readRoles(raw: Partial<Settings>): RoleSettings {
  if (raw.roles && typeof raw.roles === "object") {
    const rolesObj = raw.roles as Record<string, unknown>;
    const roles = { ...DEFAULT_ROLE_SETTINGS };
    for (const role of TASK_ROLES) {
      roles[role] = readRoleConfig(rolesObj[role], DEFAULT_ROLE_SETTINGS[role]);
    }
    return roles;
  }
  if (Array.isArray(raw.defaultWorkflow?.steps) && raw.defaultWorkflow.steps.length > 0) {
    return rolesFromLegacyWorkflow(raw.defaultWorkflow);
  }
  return DEFAULT_ROLE_SETTINGS;
}

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), "utf8")) as Partial<Settings>;
    return { roles: readRoles(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  // `defaultWorkflow` is deliberately never written back — once a settings.json
  // is saved through this build it's `roles`-only; readRoles() above still
  // knows how to migrate an old file that predates this change.
  fs.writeFileSync(settingsPath(), JSON.stringify({ roles: settings.roles }, null, 2), "utf8");
}
