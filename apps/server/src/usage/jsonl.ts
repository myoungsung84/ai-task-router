import fs from "node:fs";
import readline from "node:readline";

/**
 * Streams one JSON object per line out of a `.jsonl` file.
 *
 * Both CLIs write their transcripts as append-only JSONL and a single long
 * session can reach tens of megabytes, so these are read line by line rather
 * than slurped — the collectors only ever want a handful of fields out of the
 * last few lines, and reading the whole file into memory to get them would make
 * a dashboard poll noticeably expensive.
 *
 * A line that is not valid JSON is skipped rather than thrown: a transcript
 * being appended to *right now* can have a torn final line, which is normal and
 * must not take down the usage panel.
 */
export async function forEachJsonLine(
  filePath: string,
  visit: (value: Record<string, unknown>) => void,
): Promise<void> {
  let stream: fs.ReadStream;
  try {
    stream = fs.createReadStream(filePath, { encoding: "utf8" });
  } catch {
    return; // deleted between listing and reading — nothing to report
  }

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (parsed && typeof parsed === "object") visit(parsed as Record<string, unknown>);
    }
  } catch {
    // A read error mid-file leaves whatever was already visited intact, which
    // is the useful outcome — a partial token count beats no panel at all.
  } finally {
    rl.close();
    stream.destroy();
  }
}

/** Reads and parses a JSON file, returning null for anything unreadable. */
export function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}
