import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import { normalizeForCompare } from "./project-validator";

export interface ProjectMemoryEntry {
  /** Original casing/separators, as last used. */
  projectPath: string;
  normalizedKey: string;
  lastUsedAt: string;
}

interface ProjectMemoryFile {
  entries: ProjectMemoryEntry[];
}

const MAX_ENTRIES = 30;

function filePath(): string {
  return path.join(config.dataDir, "project-memory.json");
}

function load(): ProjectMemoryFile {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(), "utf8")) as Partial<ProjectMemoryFile>;
    return { entries: Array.isArray(raw.entries) ? raw.entries : [] };
  } catch {
    return { entries: [] };
  }
}

function save(data: ProjectMemoryFile): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(filePath(), JSON.stringify(data, null, 2), "utf8");
}

/**
 * Upserts (by normalized path) the most-recently-used entry to the front of
 * the list — same JSON-file persistence pattern as task-store.ts /
 * settings-store.ts, kept as its own small file since it's a distinct
 * concern (per-project "recently used" memory, not Task state itself).
 *
 * Used only to seed the New Task screen's project picker with a sensible
 * default/recent list. This file used to also remember each project's last
 * Workflow and feed it back into the next Task on that project — that
 * implicit per-project Workflow carry-over was removed (see
 * taskService.createTask): Task Workflow is now derived from `purpose` +
 * Settings' Role config every time, never from what a previous Task on the
 * same path happened to use.
 */
export function recordProjectUsage(projectPath: string): void {
  const normalizedKey = normalizeForCompare(projectPath);
  const data = load();
  const entry: ProjectMemoryEntry = {
    projectPath,
    normalizedKey,
    lastUsedAt: new Date().toISOString(),
  };
  const rest = data.entries.filter((e) => e.normalizedKey !== normalizedKey);
  const entries = [entry, ...rest].slice(0, MAX_ENTRIES);
  save({ entries });
}

export function getRecentProjects(limit = 10): { projectPath: string; lastUsedAt: string }[] {
  return load()
    .entries.slice(0, limit)
    .map((e) => ({ projectPath: e.projectPath, lastUsedAt: e.lastUsedAt }));
}
