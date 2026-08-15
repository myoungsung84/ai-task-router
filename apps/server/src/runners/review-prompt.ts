import type { ReviewIssue, ReviewOutcome } from "@ai-task-router/shared";

/**
 * Shared by every agent that can run a `review` step (currently Claude and
 * Codex) so the prompt text and output parsing exist in exactly one place —
 * an agent-specific reviewer would otherwise duplicate this.
 */
export function buildReviewPrompt(taskTitle: string, instruction: string): string {
  return [
    `다음은 방금 수행된 작업에 대한 1회성 코드 리뷰 요청이다.`,
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
    `최종 응답은 반드시 다음 JSON 스키마 형식의 JSON 객체 하나여야 한다: {"result": "PASS"|"WARNING", "issues": [{"severity": "low"|"medium"|"high", "file": string, "message": string}]}`,
    `그 외의 설명 텍스트를 앞뒤에 덧붙이지 마라. JSON 객체만 응답하라.`,
  ].join("\n");
}

export const REVIEW_OUTPUT_SCHEMA = {
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

/** Scans backward for the last balanced top-level `{...}` block — used when an agent's plain-text output should be exactly one trailing JSON object but might have stray prose around it. */
export function extractLastJsonObject(text: string): string | null {
  const trimmed = text.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // fall through to bracket scanning below
  }
  let depth = 0;
  let end = -1;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    if (trimmed[i] === "}") {
      if (depth === 0) end = i;
      depth++;
    } else if (trimmed[i] === "{") {
      depth--;
      if (depth === 0 && end !== -1) return trimmed.slice(i, end + 1);
    }
  }
  return null;
}

export function parseReviewJson(
  raw: string,
): Pick<ReviewOutcome, "result" | "issues" | "raw"> | null {
  const jsonText = extractLastJsonObject(raw);
  if (!jsonText) return null;

  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;

  const obj = data as Record<string, unknown>;
  const result = obj.result === "WARNING" ? "WARNING" : obj.result === "PASS" ? "PASS" : null;
  if (!result) return null;

  const issuesRaw = Array.isArray(obj.issues) ? obj.issues : [];
  const issues: ReviewIssue[] = issuesRaw
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
