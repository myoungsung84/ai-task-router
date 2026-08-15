import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { CodexIssue, CodexReviewResult } from "@ai-task-router/shared";
import { config } from "../../config";
import { safeSpawn, killProcessTree } from "../common/process-utils";
import type { RunnerLogLine } from "../claude/claude-runner";

export interface CodexRunHandle {
  process: ChildProcess;
  pid: number | undefined;
  cancel: () => void;
}

export interface CodexRunOutcome {
  /** false when Codex itself failed to run/produce a parseable result. */
  executionOk: boolean;
  cancelled: boolean;
  review: CodexReviewResult;
}

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["result", "issues"],
  properties: {
    result: { type: "string", enum: ["PASS", "WARNING"] },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "file", "message"],
        properties: {
          severity: { type: "string", enum: ["low", "medium", "high"] },
          file: { type: "string" },
          message: { type: "string" },
        },
      },
    },
  },
};

function buildReviewPrompt(taskTitle: string, instruction: string): string {
  return [
    `다음은 Claude Code가 방금 수행한 작업에 대한 1회성 코드 리뷰 요청이다.`,
    ``,
    `[원래 작업 지시사항 - 제목] ${taskTitle}`,
    `[원래 작업 지시사항 - 상세]`,
    instruction,
    ``,
    `git status, git diff 등을 직접 실행해 커밋되지 않은 현재 working tree 변경사항을 파악하고, 그 변경사항만을 대상으로 리뷰하라.`,
    `파일을 수정하지 마라. 리뷰만 수행한다.`,
    ``,
    `리뷰 관점 (반드시 이 범위만):`,
    `- 명백한 버그`,
    `- 요구사항 누락 (위 지시사항 대비)`,
    `- 타입 문제`,
    `- null / undefined 처리 문제`,
    `- 예외 처리 문제`,
    `- 기존 기능 회귀 가능성`,
    `- 의도하지 않은 파일 변경`,
    `- 위험한 구현 (예: 파괴적 명령, 보안 문제)`,
    ``,
    `다음은 절대 지적하지 마라:`,
    `- 취향 수준의 코드 스타일`,
    `- 의미 없는 리팩터링 제안`,
    `- 과도한 구조 변경 제안`,
    `- 작업 범위를 벗어난 개선 제안`,
    ``,
    `문제가 없으면 result를 "PASS"로, issues는 빈 배열로 응답하라.`,
    `문제가 있으면 result를 "WARNING"으로 하고, 각 issue에 severity/file/message를 채워라.`,
    `과도하게 넓은 범위를 다시 분석하지 말고, 변경된 파일 중심으로만 리뷰하라.`,
    `최종 응답은 반드시 지정된 JSON 스키마({result, issues[]}) 형식의 JSON 한 덩어리여야 한다. 그 외의 설명 텍스트를 덧붙이지 마라.`,
  ].join("\n");
}

/**
 * Runs a single Codex CLI review pass:
 *   codex exec --json -o <lastMsg> --output-schema <schema> --sandbox read-only "<prompt>"
 *
 * Uses plain `codex exec`, not `codex exec review` — the `review` subcommand
 * has its own fixed free-text report format that ignores --output-schema,
 * while plain `exec` honors --output-schema and returns exactly the
 * {result, issues[]} JSON we need. `--sandbox read-only` is what actually
 * guarantees Codex cannot modify any file during this pass (the `review`
 * subcommand's "read-only by convention" framing is not itself a sandbox
 * guarantee under `exec`, so we enforce it explicitly).
 */
export function runCodexReview(
  taskId: string,
  taskTitle: string,
  instruction: string,
  cwd: string,
  taskDir: string,
  onLog: (line: RunnerLogLine) => void,
): { handle: CodexRunHandle; result: Promise<CodexRunOutcome> } {
  const schemaPath = path.join(taskDir, "codex-output-schema.json");
  const lastMessagePath = path.join(taskDir, "codex-last-message.json");
  fs.writeFileSync(schemaPath, JSON.stringify(OUTPUT_SCHEMA, null, 2), "utf8");
  try {
    fs.unlinkSync(lastMessagePath);
  } catch {
    // fine if it didn't exist yet
  }

  const prompt = buildReviewPrompt(taskTitle, instruction);

  const args = [
    "exec",
    "--json",
    "-o",
    lastMessagePath,
    "--output-schema",
    schemaPath,
    "--sandbox",
    "read-only",
    ...(config.codexModel ? ["-m", config.codexModel] : []),
    prompt,
  ];

  const child = safeSpawn(config.codexBin, args, { cwd });

  let cancelled = false;
  const stdoutBuf = { partial: "" };
  const stderrBuf = { partial: "" };

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");

  // `codex exec --json` emits one JSON event per line (thread.started,
  // turn.started, item.started/item.completed for each tool call or agent
  // message, turn.completed). We turn the ones worth showing into a
  // human-readable log line; anything unrecognized falls back to the raw
  // line so nothing is silently dropped.
  const emitJsonLine = (line: string) => {
    if (!line.trim()) return;
    let friendly: string | null = null;
    try {
      const parsed = JSON.parse(line) as { type?: string; item?: Record<string, unknown> };
      const item = parsed.item;
      if (parsed.type === "item.started" && item?.type === "command_execution") {
        friendly = `$ ${String(item.command ?? "").slice(0, 300)}`;
      } else if (parsed.type === "item.completed" && item?.type === "command_execution") {
        friendly = `(exit ${String(item.exit_code)}) ${String(item.command ?? "").slice(0, 200)}`;
      } else if (parsed.type === "item.completed" && item?.type === "agent_message") {
        friendly = String(item.text ?? "");
      } else if (parsed.type === "turn.started") {
        friendly = "리뷰 턴을 시작합니다...";
      } else if (parsed.type === "turn.completed") {
        friendly = null; // usage stats only — not worth a log line
      }
    } catch {
      friendly = line; // not JSON (or a partial line) — show it verbatim
    }
    if (friendly) onLog({ stream: "stdout", text: friendly });
  };

  child.stdout?.on("data", (chunk: string) => {
    const combined = stdoutBuf.partial + chunk;
    const parts = combined.split(/\r?\n/);
    stdoutBuf.partial = parts.pop() ?? "";
    for (const line of parts) emitJsonLine(line);
  });

  child.stderr?.on("data", (chunk: string) => {
    const combined = stderrBuf.partial + chunk;
    const parts = combined.split(/\r?\n/);
    stderrBuf.partial = parts.pop() ?? "";
    for (const line of parts) {
      if (line.length === 0) continue;
      onLog({ stream: "stderr", text: line });
    }
  });

  const startedAt = new Date().toISOString();

  const result = new Promise<CodexRunOutcome>((resolve) => {
    const finish = (executionOk: boolean, exitCode: number | null, raw: string | null) => {
      if (stdoutBuf.partial) emitJsonLine(stdoutBuf.partial);
      if (stderrBuf.partial) onLog({ stream: "stderr", text: stderrBuf.partial });

      if (cancelled) {
        resolve({
          executionOk: false,
          cancelled: true,
          review: {
            result: "WARNING",
            issues: [],
            raw: null,
            startedAt,
            completedAt: new Date().toISOString(),
          },
        });
        return;
      }

      const parsed = parseCodexOutput(lastMessagePath);
      if (!executionOk || !parsed) {
        onLog({
          stream: "stderr",
          text: `Codex 리뷰 실행/결과 파싱에 실패했습니다 (exitCode=${exitCode}). Claude 구현 결과는 유지됩니다.`,
        });
        resolve({
          executionOk: false,
          cancelled: false,
          review: {
            result: "WARNING",
            issues: [
              {
                severity: "high",
                file: "",
                message: `Codex 리뷰 실행에 실패했습니다 (exitCode=${exitCode}). 로그를 확인하세요.`,
              },
            ],
            raw: raw,
            startedAt,
            completedAt: new Date().toISOString(),
          },
        });
        return;
      }

      resolve({
        executionOk: true,
        cancelled: false,
        review: { ...parsed, startedAt, completedAt: new Date().toISOString() },
      });
    };

    child.on("error", (err) => {
      onLog({ stream: "stderr", text: `Codex CLI 실행 오류: ${err.message}` });
      finish(false, null, null);
    });

    child.on("close", (code) => {
      finish(code === 0, code, null);
    });
  });

  const handle: CodexRunHandle = {
    process: child,
    pid: child.pid,
    cancel: () => {
      cancelled = true;
      killProcessTree(child.pid);
    },
  };

  return { handle, result };
}

function parseCodexOutput(
  lastMessagePath: string,
): Pick<CodexReviewResult, "result" | "issues" | "raw"> | null {
  let raw: string;
  try {
    raw = fs.readFileSync(lastMessagePath, "utf8");
  } catch {
    return null;
  }
  if (!raw.trim()) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof data !== "object" || data === null) return null;
  const obj = data as Record<string, unknown>;
  const result = obj.result === "WARNING" ? "WARNING" : obj.result === "PASS" ? "PASS" : null;
  if (!result) return null;

  const issuesRaw = Array.isArray(obj.issues) ? obj.issues : [];
  const issues: CodexIssue[] = issuesRaw
    .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
    .map((i) => ({
      severity:
        i.severity === "high" || i.severity === "medium" || i.severity === "low"
          ? i.severity
          : "medium",
      file: typeof i.file === "string" ? i.file : "",
      message: typeof i.message === "string" ? i.message : "",
    }));

  return { result, issues, raw };
}
