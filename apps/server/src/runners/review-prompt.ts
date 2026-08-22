import type { ReviewIssue, ReviewIssueCategory, ReviewOutcome } from "@ai-task-router/shared";

/**
 * Shared by every agent that can run a `review` step (currently Claude and
 * Codex) so the prompt text and output parsing exist in exactly one place —
 * an agent-specific reviewer would otherwise duplicate this.
 */
export function buildReviewPrompt(taskTitle: string, instruction: string): string {
  return [
    `다음은 방금 수행된 작업에 대한 1회성 리뷰 요청이다.`,
    `리뷰 대상은 코드뿐 아니라 텍스트, 문서, 설정 파일 등 작업 지시사항에 따라 생성되거나 수정된 모든 파일이다.`,
    `이것은 "코드 리뷰"가 아니라 "이 작업이 지시사항대로 정확히 수행됐는지"에 대한 리뷰다.`,
    ``,
    `[원래 작업 지시사항 - 제목] ${taskTitle}`,
    `[원래 작업 지시사항 - 상세]`,
    instruction,
    ``,
    `git status, git diff 등을 직접 실행해 커밋되지 않은 현재 working tree 변경사항을 파악하라.`,
    `리뷰 범위는 오직 그 변경사항에 포함된 파일들뿐이다. git diff는 새로 추가된(untracked) 파일의`,
    `내용을 보여주지 않으므로, untracked 파일은 반드시 직접 열어서 내용을 읽고 정상적인 리뷰`,
    `대상으로 검토하라 — untracked라는 이유만으로 리뷰를 건너뛰거나 "확인할 수 없다"고 판단하지`,
    `마라.`,
    `git log 등으로 확인했을 때 이번 작업이 시작되기 전부터 이미 존재했던 것으로 보이는 변경사항은`,
    `이번 작업이 만든 변경으로 단정해 지적하지 마라 — 확실하지 않으면 issue로 만들지 마라.`,
    `git status/diff로 파악한 변경된 파일 목록에 없는 다른 파일이나 코드는 절대 열어보거나 검토하지`,
    `마라. lint, typecheck, test, build 등 프로젝트 전체를 대상으로 하는 명령을 실행하지 마라 —`,
    `그런 명령이 이번 변경사항과 무관한 파일에서 기존에 있던 문제를 찾아내더라도, 그것은 이번`,
    `작업의 리뷰 대상이 아니므로 issue로 보고하지 마라. 오직 git status/diff로 파악한 변경된 파일`,
    `자체의 내용만 근거로 판단하라.`,
    `이 저장소에 AGENTS.md 등 저장소 전역 작업 지침이나 "작업 후 체크리스트"가 있더라도, 그것은`,
    `실제 코드를 구현/수정하는 작업을 위한 것이지 지금 이 1회성 리뷰 작업에는 적용되지 않는다.`,
    `그 체크리스트나 지침에 있는 명령(lint/typecheck/test 등)을 이 리뷰를 위해 실행하지 말고,`,
    `그 지침 준수 여부를 이번 리뷰의 issue로 보고하지 마라.`,
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
    `- 위험한 구현 (예: 파괴적 명령)`,
    ``,
    `보안 관점 (변경된 파일 범위 내에서, 반드시 함께 확인하라):`,
    `- API Key / Token / Password 등 시크릿 하드코딩`,
    `- .env 값이나 그 밖의 Secret 값 노출`,
    `- 로그에 개인정보/민감정보 출력`,
    `- SQL Injection`,
    `- Command Injection`,
    `- XSS`,
    `- Path Traversal`,
    `- SSRF`,
    `- 인증 누락`,
    `- 인가/권한 검증 누락`,
    `- CORS 과도 허용`,
    `- 외부 입력 검증 누락`,
    `- 파일 업로드 검증 누락`,
    `- unsafe eval / dynamic execution`,
    `- shell 명령 구성 위험 (예: 사용자 입력을 그대로 셸 문자열에 삽입)`,
    `- 취약한 암호화/해싱 사용`,
    `- 내부 오류 메시지나 stack trace의 외부 노출`,
    `- 응답에 민감 데이터가 그대로 반환되는 경우`,
    `- 의존성 관련 명백한 보안 위험 (예: 알려진 취약점이 있다고 알려진 패키지의 신규 도입)`,
    ``,
    `단, 위 보안 관점을 확인하기 위해 npm audit, pnpm audit, Semgrep 등 별도 보안 스캐너나 lint,`,
    `typecheck, test, build를 새로 실행하지 마라 — 이 리뷰는 변경된 파일의 내용을 직접 읽고`,
    `판단하는 것만으로 수행한다. 위 항목에 해당하지 않는데 "혹시 모르니" 식으로 의심만으로 issue를`,
    `만들지 마라 — 변경된 코드에서 실제로 확인되는 문제만 보고하라.`,
    ``,
    `다음은 절대 지적하지 마라:`,
    `- 취향 수준의 코드 스타일`,
    `- 의미 없는 리팩터링 제안`,
    `- 과도한 구조 변경 제안`,
    `- 작업 범위를 벗어난 개선 제안`,
    `- 코드 변경이 없다는 이유, 또는 파일이 단순한 텍스트/문서/설정 파일이라는 이유만으로 "리뷰가`,
    `  불가능하다"거나 "리뷰가 부족하다"고 지적하는 것 — 요구사항 충족 여부, 파일 내용, 의도하지`,
    `  않은 변경 유무를 확인할 수 있다면 그것으로 리뷰는 충분하다.`,
    `- 작업 지시사항이 테스트나 빌드 실행을 요구하지 않았다면, 테스트/빌드를 실행하지 않았다는`,
    `  이유로 지적하는 것.`,
    `- 작업 지시사항이 저장소 루트에 파일을 만들도록 명시했다면, 그 파일이 루트에 있다는 이유로`,
    `  지적하는 것.`,
    `- 작업 지시사항에서 명시적으로 요청한 테스트용/표식용 파일을, 그런 파일이라는 이유만으로`,
    `  삭제하거나 정리하라고 제안하는 것. 위 지시사항이 특정 파일을 수정/삭제하지 말라고 명시했다면`,
    `  (예: "이 파일은 삭제하지 마세요"), 그 파일을 삭제/정리하라고 제안하는 것은 지시사항 위반을`,
    `  조장하는 것이므로 절대 하지 마라.`,
    `- lint/typecheck/test/build 등을 프로젝트 전체에 대해 실행해 이번 변경사항과 무관한 파일에서`,
    `  발견한 기존 문제를 지적하는 것 — 그 파일이 이번 git status/diff에 없다면 리뷰 대상이 아니다.`,
    ``,
    `위 항목에 해당하지 않는 실제 버그, 요구사항 누락, 의도하지 않은 변경, 위험 요소가 하나도`,
    `없다면 반드시 result를 "PASS", issues를 빈 배열로 응답하라. 요구사항 충족 여부와 파일 내용을`,
    `실제로 확인할 수 있는 상황에서 "리뷰를 수행할 수 없다"거나 "확인이 필요하다"는 이유만으로`,
    `WARNING을 반환하지 마라 — WARNING은 오직 위 리뷰 관점에 해당하는 실제 문제를 발견했을 때만`,
    `사용한다.`,
    `문제가 있으면 result를 "WARNING"으로 하고, 각 issue에 severity/category/file/message를`,
    `채워라. severity는 문제의 심각도에 따라 "low"/"medium"/"high"/"critical" 중 하나를 선택하라 —`,
    `critical은 즉시 사람이 확인해야 하는 수준(예: 실제로 악용 가능한 보안 취약점, 데이터 유실/손상`,
    `위험)에만 사용하고, 그 정도가 아니라면 high 이하로 판단하라. category는 다음 중 하나를`,
    `반드시 선택하라: "SECURITY"(위 보안 관점에 해당하는 문제), "REQUIREMENT"(요구사항 누락),`,
    `"CODE_QUALITY"(버그/타입/null 처리/예외 처리/회귀 등 나머지 코드 문제),`,
    `"OTHER"(위 어느 것에도 명확히 속하지 않는 경우). 확신이 없으면 "OTHER"를 사용하라 — 절대`,
    `"SECURITY"가 아닌 문제를 "SECURITY"로 표시하지 마라.`,
    `location(문제가 있는 줄 번호나 위치, 예: "L42" 또는 "12-18")과 suggestion(구체적인 수정 방법`,
    `제안)도 각 issue에 반드시 포함하라. 확신이 없거나 알 수 없으면 값을 생략하지 말고 반드시 null을`,
    `채워라 (location/suggestion 키 자체를 빼면 안 된다).`,
    `과도하게 넓은 범위를 다시 분석하지 말고, 변경된 파일 중심으로만 리뷰하라.`,
    `최종 응답은 반드시 다음 JSON 스키마 형식의 JSON 객체 하나여야 한다: {"result": "PASS"|"WARNING", "issues": [{"severity": "low"|"medium"|"high"|"critical", "category": "SECURITY"|"REQUIREMENT"|"CODE_QUALITY"|"OTHER", "file": string, "location": string|null, "message": string, "suggestion": string|null}]}`,
    `그 외의 설명 텍스트를 앞뒤에 덧붙이지 마라. JSON 객체만 응답하라.`,
  ].join("\n");
}

// Codex's Structured Outputs (--output-schema) requires every property to be
// listed in `required` — there is no "optional property" concept, only
// "optional value" via a nullable type. location/suggestion are therefore
// `["string", "null"]` and always present in `required`, and the agent is
// instructed (see buildReviewPrompt) to answer `null` rather than omit them.
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
        required: ["severity", "category", "file", "location", "message", "suggestion"],
        properties: {
          severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
          category: { type: "string", enum: ["SECURITY", "REQUIREMENT", "CODE_QUALITY", "OTHER"] },
          file: { type: "string" },
          location: { type: ["string", "null"] },
          message: { type: "string" },
          suggestion: { type: ["string", "null"] },
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

  const VALID_CATEGORIES: ReviewIssueCategory[] = ["SECURITY", "REQUIREMENT", "CODE_QUALITY", "OTHER"];

  const issuesRaw = Array.isArray(obj.issues) ? obj.issues : [];
  const issues: ReviewIssue[] = issuesRaw
    .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
    .map((i) => ({
      severity:
        i.severity === "critical" || i.severity === "high" || i.severity === "medium" || i.severity === "low"
          ? i.severity
          : "medium",
      // Missing/unrecognized category is left undefined rather than
      // defaulted to "OTHER" — an older agent response (or a caller that
      // hasn't adopted the field yet) shouldn't be forced into a category it
      // never claimed; `securityIssuesOf` already treats undefined as "not
      // Security", same as it treats a genuinely absent field.
      category:
        typeof i.category === "string" &&
        (VALID_CATEGORIES as string[]).includes(i.category)
          ? (i.category as ReviewIssueCategory)
          : undefined,
      file: typeof i.file === "string" ? i.file : "",
      location: typeof i.location === "string" && i.location.trim() ? i.location : null,
      message: typeof i.message === "string" ? i.message : "",
      suggestion: typeof i.suggestion === "string" && i.suggestion.trim() ? i.suggestion : null,
    }));

  return { result, issues, raw };
}
