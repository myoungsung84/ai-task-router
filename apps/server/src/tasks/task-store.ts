import fs from "node:fs";
import path from "node:path";
import type { LogEntry, Task } from "@ai-task-router/shared";
import { config } from "../config";
import { allocateJobId } from "./job-id";
import {
  buildLegacyWorkflow,
  needsLegacyMigration,
  type StoredTaskRecord,
} from "./legacy-task-normalizer";

const MAX_IN_MEMORY_LOGS = 5000;

/**
 * Lightweight JSON-file persistence — no DB, as specified for v1.
 *
 * Layout per task, under data/tasks/<id>/:
 *   task.json   — everything except `logs` (rewritten on every metadata change)
 *   logs.jsonl  — one LogEntry per line, appended incrementally
 *
 * The same directory is reused by the Codex runner for its schema /
 * last-message scratch files, so a task's whole footprint lives in one place.
 */
export class TaskStore {
  private tasks = new Map<string, Task>();
  private jobIdIndex = new Map<string, string>(); // jobId -> uuid
  private tasksRootDir: string;

  constructor() {
    this.tasksRootDir = path.join(config.dataDir, "tasks");
  }

  init(): void {
    fs.mkdirSync(this.tasksRootDir, { recursive: true });
    const entries = fs.existsSync(this.tasksRootDir)
      ? fs.readdirSync(this.tasksRootDir, { withFileTypes: true })
      : [];

    // Read every stored task first so legacy Job ID backfill can be assigned
    // in creation order (oldest = lowest number), not directory-listing
    // order (which is effectively random — it's sorted by UUID).
    const loaded: { id: string; record: StoredTaskRecord }[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = this.metaPath(entry.name);
      if (!fs.existsSync(metaPath)) continue;
      try {
        const record = JSON.parse(fs.readFileSync(metaPath, "utf8")) as StoredTaskRecord;
        loaded.push({ id: entry.name, record });
      } catch (err) {
        console.warn(`[task-store] ${entry.name} 태스크 로드 실패:`, err);
      }
    }
    loaded.sort(
      (a, b) =>
        new Date(a.record.createdAt ?? 0).getTime() - new Date(b.record.createdAt ?? 0).getTime(),
    );

    for (const { id, record } of loaded) {
      const migrated = needsLegacyMigration(record);
      const workflow = record.workflow ?? buildLegacyWorkflow(record);
      const jobId = record.jobId ?? allocateJobId();
      const logs = this.readLogsFromDisk(id);
      const task: Task = { ...record, id, jobId, workflow, logs } as Task;

      this.tasks.set(id, task);
      this.jobIdIndex.set(jobId, id);

      // Additive, one-time migration write-back (workflow/jobId only — logs
      // and every legacy result field are left exactly as they were).
      if (migrated) this.persistMeta(task);
    }
  }

  getTaskDir(id: string): string {
    const dir = path.join(this.tasksRootDir, id);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private metaPath(id: string): string {
    return path.join(this.tasksRootDir, id, "task.json");
  }

  private logsPath(id: string): string {
    return path.join(this.tasksRootDir, id, "logs.jsonl");
  }

  private readLogsFromDisk(id: string): LogEntry[] {
    const p = this.logsPath(id);
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const logs: LogEntry[] = [];
    for (const line of lines) {
      try {
        // Each line was written by appendLog() below as JSON.stringify(LogEntry),
        // so this cast reflects a shape we ourselves guarantee at write time —
        // not an assumption about untrusted external input.
        logs.push(JSON.parse(line) as LogEntry);
      } catch {
        // skip a corrupted line rather than failing the whole load
      }
    }
    return logs.slice(-MAX_IN_MEMORY_LOGS);
  }

  private persistMeta(task: Task): void {
    this.getTaskDir(task.id);
    const { logs: _logs, ...meta } = task;
    fs.writeFileSync(this.metaPath(task.id), JSON.stringify(meta, null, 2), "utf8");
  }

  create(task: Task): void {
    this.getTaskDir(task.id);
    this.tasks.set(task.id, task);
    this.jobIdIndex.set(task.jobId, task.id);
    fs.writeFileSync(this.logsPath(task.id), "", "utf8");
    this.persistMeta(task);
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  getByJobId(jobId: string): Task | undefined {
    const id = this.jobIdIndex.get(jobId);
    return id ? this.tasks.get(id) : undefined;
  }

  /** Accepts either the internal UUID or the human-friendly Job ID (e.g. "T-1042"). The one resolver every caller (REST, MCP, Dashboard) goes through. */
  resolve(identifier: string): Task | undefined {
    return this.tasks.get(identifier) ?? this.getByJobId(identifier);
  }

  list(): Task[] {
    return [...this.tasks.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  update(id: string, patch: Partial<Task>): Task | undefined {
    const current = this.tasks.get(id);
    if (!current) return undefined;
    const updated: Task = { ...current, ...patch };
    this.tasks.set(id, updated);
    this.persistMeta(updated);
    return updated;
  }

  appendLog(id: string, entry: LogEntry): Task | undefined {
    const current = this.tasks.get(id);
    if (!current) return undefined;
    current.logs.push(entry);
    if (current.logs.length > MAX_IN_MEMORY_LOGS) {
      current.logs.splice(0, current.logs.length - MAX_IN_MEMORY_LOGS);
    }
    try {
      fs.appendFileSync(this.logsPath(id), JSON.stringify(entry) + "\n", "utf8");
    } catch (err) {
      console.warn(`[task-store] ${id} 로그 기록 실패:`, err);
    }
    return current;
  }

  /** Removes a task's directory (JSON + logs) entirely. Used only for explicit, user-confirmed cleanup of completed tasks — never for RUNNING/REVIEWING ones (callers must check status first). */
  delete(id: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    this.tasks.delete(id);
    this.jobIdIndex.delete(task.jobId);
    fs.rmSync(this.getTaskDir(id), { recursive: true, force: true });
  }
}

export const taskStore = new TaskStore();
