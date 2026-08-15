import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SETTINGS, type Settings } from "@ai-task-router/shared";
import { config } from "../config";

function settingsPath(): string {
  return path.join(config.dataDir, "settings.json");
}

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), "utf8")) as Partial<Settings>;
    if (Array.isArray(raw.defaultWorkflow?.steps) && raw.defaultWorkflow.steps.length > 0) {
      return { defaultWorkflow: raw.defaultWorkflow };
    }
    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
}
