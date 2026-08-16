import { TASK_ROLES, type RoleSettings, type Settings } from "@ai-task-router/shared";
import { loadSettings, saveSettings } from "./settings-store";

export class SettingsServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Settings are read far more often than they change, and every change goes
// through updateRoles() below, so an in-memory cache kept in sync on write
// is simpler than re-reading the file every time.
let cached: Settings | null = null;

function parseRoles(input: unknown): RoleSettings {
  if (!input || typeof input !== "object") {
    throw new SettingsServiceError("roles가 필요합니다.");
  }
  const obj = input as Record<string, unknown>;
  const roles = {} as RoleSettings;
  for (const role of TASK_ROLES) {
    const entry = obj[role];
    if (!entry || typeof entry !== "object") {
      throw new SettingsServiceError(`roles.${role}이(가) 필요합니다.`);
    }
    const { agent, model } = entry as Record<string, unknown>;
    if (agent !== "claude" && agent !== "codex") {
      throw new SettingsServiceError(`roles.${role}.agent는 claude 또는 codex여야 합니다.`);
    }
    if (model !== undefined && model !== null && typeof model !== "string") {
      throw new SettingsServiceError(`roles.${role}.model은 문자열이거나 null이어야 합니다.`);
    }
    roles[role] = { agent, model: typeof model === "string" ? model.trim() || null : null };
  }
  return roles;
}

export const settingsService = {
  get(): Settings {
    cached ??= loadSettings();
    return cached;
  },

  /** Replaces every Role's Agent/model in one call — Settings' role cards always save the full set together so a stale partial update can't leave one Role pointing at mismatched state. */
  updateRoles(rolesInput: unknown): Settings {
    const roles = parseRoles(rolesInput);
    const settings: Settings = { roles };
    cached = settings;
    saveSettings(settings);
    return settings;
  },
};
