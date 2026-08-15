import fs from "node:fs";
import path from "node:path";

export interface ProjectValidationResult {
  ok: boolean;
  error?: string;
  normalizedPath?: string;
}

/** Basic sanity check before we ever touch a project path. */
export function validateProjectPath(projectPath: string): ProjectValidationResult {
  if (!projectPath || !projectPath.trim()) {
    return { ok: false, error: "projectPath가 비어 있습니다." };
  }
  const normalized = path.resolve(projectPath.trim());
  let stat: fs.Stats;
  try {
    stat = fs.statSync(normalized);
  } catch {
    return { ok: false, error: `경로를 찾을 수 없습니다: ${normalized}` };
  }
  if (!stat.isDirectory()) {
    return { ok: false, error: `디렉터리가 아닙니다: ${normalized}` };
  }
  return { ok: true, normalizedPath: normalized };
}

/** Case-insensitive on Windows, exact match elsewhere — used for the same-project concurrency guard. */
export function normalizeForCompare(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
