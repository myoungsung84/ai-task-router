import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

interface CounterFile {
  lastNumber: number;
}

function counterPath(): string {
  return path.join(config.dataDir, "job-id-counter.json");
}

function readCounter(): CounterFile {
  try {
    const raw = JSON.parse(fs.readFileSync(counterPath(), "utf8")) as Partial<CounterFile>;
    return { lastNumber: typeof raw.lastNumber === "number" ? raw.lastNumber : 0 };
  } catch {
    return { lastNumber: 0 };
  }
}

function writeCounter(counter: CounterFile): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(counterPath(), JSON.stringify(counter, null, 2), "utf8");
}

/**
 * Allocates the next sequential, human-friendly Job ID (e.g. "T-1042").
 *
 * Persistent across restarts (backed by data/job-id-counter.json) and safe
 * under concurrent callers *within this one Node process*: the read →
 * increment → write happens with no `await` in between, so nothing else can
 * run on the single JS thread mid-allocation — no file locking needed for a
 * single-process server.
 */
export function allocateJobId(): string {
  const counter = readCounter();
  counter.lastNumber += 1;
  writeCounter(counter);
  return `T-${counter.lastNumber}`;
}
