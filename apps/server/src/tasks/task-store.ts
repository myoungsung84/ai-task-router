import fs from "node:fs";
import path from "node:path";
import type { LogEntry, Task } from "@ai-task-router/shared";
import { config } from "../config";

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
  private tasksRootDir: string;

  constructor() {
    this.tasksRootDir = path.join(config.dataDir, "tasks");
  }

  init(): void {
    fs.mkdirSync(this.tasksRootDir, { recursive: true });
    const entries = fs.existsSync(this.tasksRootDir)
      ? fs.readdirSync(this.tasksRootDir, { withFileTypes: true })
      : [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = this.metaPath(entry.name);
      if (!fs.existsSync(metaPath)) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Omit<Task, "logs">;
        const logs = this.readLogsFromDisk(entry.name);
        this.tasks.set(entry.name, { ...meta, logs });
      } catch (err) {
        console.warn(`[task-store] ${entry.name} 태스크 로드 실패:`, err);
      }
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
    fs.writeFileSync(this.logsPath(task.id), "", "utf8");
    this.persistMeta(task);
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
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
}

export const taskStore = new TaskStore();
