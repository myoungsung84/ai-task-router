import type { ChangedFile } from "../types";

/** One changed file's own slice of a Task's unified diff, plus a line-count summary computed straight from that text — nothing here comes from a new server call. */
export interface FileDiffSegment {
  file: ChangedFile;
  /**
   * The `diff --git a/… b/…` block for just this file. Empty when the diff
   * has no matching block — the one real case is an untracked/new file
   * (`git diff HEAD` never shows untracked content, see git-manager.ts's
   * `getDiff`), so callers should treat an empty `diffText` as "no preview
   * available", not as an error.
   */
  diffText: string;
  additions: number;
  deletions: number;
}

// Git always writes `diff --git a/<path> b/<path>` with forward slashes,
// regardless of OS — matches ChangedFile.path from `git status --porcelain`
// (git-manager.ts runs both through the same `-c core.quotepath=false`).
const DIFF_HEADER_RE = /^diff --git a\/(.+) b\/(.+)$/;

/**
 * Splits one Task's whole `git diff HEAD` text into per-file segments and
 * aligns them with the already-fetched `changedFiles` list — client-side
 * only, so `TaskDiffView` can offer "이 파일만 보기" without a new server
 * endpoint. A changed file with no matching segment (untracked/new, or a
 * rename git described differently than its porcelain path) just gets an
 * empty `diffText`; the caller decides how to render that.
 */
export function splitDiffByFile(diff: string, changedFiles: ChangedFile[]): FileDiffSegment[] {
  const segmentByPath = new Map<string, string>();

  if (diff) {
    let currentPath: string | null = null;
    let currentLines: string[] = [];
    const flush = () => {
      if (currentPath !== null) segmentByPath.set(currentPath, currentLines.join("\n"));
    };
    for (const line of diff.split(/\r?\n/)) {
      const match = DIFF_HEADER_RE.exec(line);
      if (match) {
        flush();
        currentPath = match[2]!; // the b/ (post-change) path
        currentLines = [line];
      } else if (currentPath !== null) {
        currentLines.push(line);
      }
    }
    flush();
  }

  return changedFiles.map((file) => {
    const diffText = segmentByPath.get(file.path) ?? "";
    let additions = 0;
    let deletions = 0;
    for (const line of diffText.split("\n")) {
      // `+++`/`---` are the file-header lines, not content changes.
      if (line.startsWith("+++") || line.startsWith("---")) continue;
      if (line.startsWith("+")) additions++;
      else if (line.startsWith("-")) deletions++;
    }
    return { file, diffText, additions, deletions };
  });
}
