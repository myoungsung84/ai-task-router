import fs from "node:fs";
import path from "node:path";
import { isTerminalStatus, type Task } from "@ai-task-router/shared";
import { config } from "../config";
import { getChangedFiles, getDiff } from "../git/git-manager";

const MAX_DIFF_CHARS_IN_HISTORY = 20000;

const WINDOWS_FORBIDDEN_FILENAME_CHARS = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"]);

/**
 * Strips characters Windows forbids in filenames (plus ASCII control
 * characters) and collapses whitespace. Korean and other non-ASCII text is
 * left as-is — NTFS handles Unicode filenames fine. Written as an explicit
 * character filter rather than a regex so the forbidden-char set stays
 * unambiguous.
 */
function sanitizeFilenamePart(input: string): string {
  let stripped = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20) continue; // ASCII control characters
    if (WINDOWS_FORBIDDEN_FILENAME_CHARS.has(ch)) continue;
    stripped += ch;
  }
  const cleaned = stripped.trim().replace(/\s+/g, "-").replace(/\.+$/, ""); // trailing dots are also problematic on Windows
  return (cleaned || "untitled").slice(0, 80);
}

function historyDir(createdAt: string): string {
  const d = new Date(createdAt);
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return path.join(config.dataDir, "history", ym);
}

function historyFilePath(task: Task): string {
  return path.join(
    historyDir(task.createdAt),
    `${task.jobId}-${sanitizeFilenamePart(task.title)}.md`,
  );
}

function stepStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: "대기",
    RUNNING: "진행 중",
    SUCCESS: "성공",
    SKIPPED: "건너뜀",
    FAILED: "실패",
    CANCELLED: "취소",
  };
  return labels[status] ?? status;
}

function renderMarkdown(task: Task, changedFiles: string[], diff: string): string {
  const lines: string[] = [];
  lines.push(`# ${task.jobId} ${task.title}`, "");
  lines.push(`- Task ID: ${task.id}`);
  lines.push(`- Job ID: ${task.jobId}`);
  lines.push(`- Project: ${task.projectPath}`);
  lines.push(`- Branch: ${task.branch ?? task.gitInfo?.resolvedBranch ?? "-"}`);
  lines.push(`- Started: ${task.startedAt ?? "-"}`);
  lines.push(`- Completed: ${task.completedAt ?? "-"}`);
  lines.push(`- Final Status: ${task.status}`);
  lines.push("");

  lines.push("## 작업 지시사항", "", task.instruction, "");

  lines.push("## Workflow", "");
  task.workflow.steps.forEach((s, i) => {
    const suffix = s.skipReason ? ` (${s.skipReason})` : "";
    lines.push(`${i + 1}. ${s.agent} / ${s.action} / ${stepStatusLabel(s.status)}${suffix}`);
  });
  lines.push("");

  lines.push("## 변경 파일", "");
  if (changedFiles.length === 0) lines.push("- (없음)");
  else changedFiles.forEach((f) => lines.push(`- ${f}`));
  lines.push("");

  lines.push("## Step 결과", "");
  for (const s of task.workflow.steps) {
    lines.push(`### ${s.agent} / ${s.action}`, "");
    if (s.status === "SKIPPED") {
      lines.push(`건너뜀 (${s.skipReason ?? "-"})`, "");
      continue;
    }
    if (s.status === "PENDING") {
      lines.push("실행되지 않음", "");
      continue;
    }
    if (s.result?.summary) lines.push(s.result.summary, "");
    if (s.result?.review) {
      lines.push(`**리뷰 결과: ${s.result.review.result}**`, "");
      for (const issue of s.result.review.issues) {
        lines.push(`- [${issue.severity}] ${issue.file}: ${issue.message}`);
      }
      if (s.result.review.issues.length) lines.push("");
    }
    if (s.error) lines.push(`> 오류: ${s.error}`, "");
  }

  if (task.error) lines.push("## 오류", "", task.error, "");

  if (diff) {
    const truncated = diff.length > MAX_DIFF_CHARS_IN_HISTORY;
    const body = truncated ? diff.slice(0, MAX_DIFF_CHARS_IN_HISTORY) + "\n... (생략됨)" : diff;
    lines.push("## Diff", "", "```diff", body, "```", "");
  }

  lines.push("## 최종 결과", "", task.status, "");
  return lines.join("\n");
}

/**
 * Writes/overwrites the one Markdown history file for a terminal Task.
 * "Overwrite the same path" (rather than skip-if-exists) is the dedupe
 * strategy: a Task can be restarted after FAILED/CANCELLED and reach a
 * terminal state again, and the history should reflect the latest run —
 * never a second file for the same Task.
 */
export async function generateHistoryForTask(task: Task): Promise<void> {
  if (!isTerminalStatus(task.status)) return;

  let changedFiles: string[] = [];
  let diff = "";
  try {
    const [files, diffText] = await Promise.all([
      getChangedFiles(task.projectPath),
      getDiff(task.projectPath),
    ]);
    changedFiles = files.map((f) => `${f.status} ${f.path}`);
    diff = diffText;
  } catch {
    // project path may be gone/inaccessible at completion time — still write history without diff.
  }

  const filePath = historyFilePath(task);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, renderMarkdown(task, changedFiles, diff), "utf8");
}
