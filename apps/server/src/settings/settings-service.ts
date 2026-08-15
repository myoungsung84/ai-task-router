import type { Settings, WorkflowSpec } from "@ai-task-router/shared";
import { loadSettings, saveSettings } from "./settings-store";
import { workflowSpecSchema } from "../tasks/workflow-spec-schema";

export class SettingsServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Settings are read/written far more often than they change, and every
// change goes through updateDefaultWorkflow() below, so an in-memory cache
// kept in sync on write is simpler than re-reading the file every time.
let cached: Settings | null = null;

export const settingsService = {
  get(): Settings {
    cached ??= loadSettings();
    return cached;
  },

  updateDefaultWorkflow(workflow: unknown): Settings {
    const parsed = workflowSpecSchema.safeParse(workflow);
    if (!parsed.success) {
      throw new SettingsServiceError(
        parsed.error.issues[0]?.message ?? "workflow 형식이 올바르지 않습니다.",
      );
    }
    const settings: Settings = { defaultWorkflow: parsed.data as WorkflowSpec };
    cached = settings;
    saveSettings(settings);
    return settings;
  },
};
