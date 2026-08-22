import type {
  AcceptanceCriterion,
  ReviewIssue,
  ReviewIssueCategory,
  ReviewOutcome,
} from "@ai-task-router/shared";

/** The Acceptance Criteria section of the review prompt — grading instructions when the Task already has them, derivation instructions when it doesn't (never both). */
function acceptanceCriteriaPromptSection(
  acceptanceCriteria: AcceptanceCriterion[] | null | undefined,
): string[] {
  if (acceptanceCriteria && acceptanceCriteria.length > 0) {
    return [
      `[완료 조건 (Acceptance Criteria)]`,
      ...acceptanceCriteria.map((c) => `${c.id}: ${c.text}`),
      ``,
      `위 완료 조건 각각에 대해 이번 변경사항이 실제로 만족하는지 PASS/FAIL로 판정하라. id는 위에`,
      `주어진 것을 그대로 사용하고, 새로 만들거나 번호를 바꾸지 마라. 하나라도 FAIL이면 전체 result는`,
      `"WARNING"이어야 한다 (모든 완료 조건이 PASS일 때만 result가 "PASS"일 수 있다).`,
      ``,
    ];
  }
  return [
    `[완료 조건 (Acceptance Criteria)]`,
    `이 작업에는 미리 정의된 완료 조건이 없다. 위 작업 지시사항으로부터 이 작업이 실제로 만족해야`,
    `하는 핵심 완료 조건을 스스로 3~7개 도출하라 — 세부 구현 방법이 아니라 사용자가 결과물을 보고`,
    `직접 확인할 수 있는 수준으로 작성하라 (예: "기존 집계 로직을 변경하지 않는다"). 지시사항이`,
    `단순해서 3개조차 자연스럽게 나오지 않으면 1~2개만 도출해도 된다 — 억지로 개수를 채우거나`,
    `지나치게 잘게 쪼개지 마라. id는 "AC-1", "AC-2"... 형식으로 스스로 부여하고, 도출한 각 조건에`,
    `대해 이번 변경사항이 만족하는지 PASS/FAIL로 판정하라. 하나라도 FAIL이면 전체 result는`,
    `"WARNING"이어야 한다.`,
    ``,
  ];
}

/**
 * Shared by every agent that can run a `review` step (currently Claude and
 * Codex) so the prompt text and output parsing exist in exactly one place —
 * an agent-specific reviewer would otherwise duplicate this.
 *
 * `acceptanceCriteria` is the Task's own completion conditions if it has any
 * — omit/empty and the agent derives its own from `instruction` in the same
 * call (see `acceptanceCriteriaPromptSection`), so Acceptance Criteria never
 * costs a second AI call.
 */
export function buildReviewPrompt(
  taskTitle: string,
  instruction: string,
  acceptanceCriteria?: AcceptanceCriterion[] | null,
  implementationReport?: string | null,
): string {
  return [
    `다음은 방금 수행된 작업에 대한 1회성 리뷰 요청이다.`,
    `리뷰 대상은 코드뿐 아니라 텍스트, 문서, 설정 파일 등 작업 지시사항에 따라 생성되거나 수정된 모든 파일이다.`,
    `이것은 "코드 리뷰"가 아니라 "이 작업이 지시사항대로 정확히 수행됐는지"에 대한 리뷰다.`,
    ``,
    `[원래 작업 지시사항 - 제목] ${taskTitle}`,
    `[원래 작업 지시사항 - 상세]`,
    instruction,
    ``,
    `[구현 Agent 결과 보고]`,
    implementationReport?.trim() || "(구현/분석 Step 결과 보고 없음)",
    ``,
    ...acceptanceCriteriaPromptSection(acceptanceCriteria),
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
    `- 변경 범위가 작업 지시사항에 비해 과도하거나 부족한지`,
    `- 작업 지시사항이 검증 명령이나 검증 결과 보고를 명시적으로 요구했다면, 위 [구현 Agent 결과`,
    `  보고]에 해당 명령을 실행했다는 내용과 성공/실패 결과가 빠짐없이 포함되어 있는지`,
    ``,
    `검증 수행 여부 판단 규칙:`,
    `- Reviewer가 lint, typecheck, test, build나 다른 검증 명령을 직접 실행하지 마라.`,
    `- 작업 지시사항 또는 완료 조건이 특정 검증을 요구한 경우에만 구현 Agent의 결과 보고에서 그`,
    `  수행 여부와 결과를 확인하라. 명시적으로 요구된 검증의 실행 또는 결과 보고가 누락되었다면`,
    `  REQUIREMENT 또는 CODE_QUALITY issue와 WARNING으로 판정하라.`,
    `- 구현 Agent가 검증 실패를 보고했다면 숨기거나 PASS로 간주하지 말고, 변경사항의 신뢰성에`,
    `  영향을 주는 실제 문제로 보고하라.`,
    `- 작업 지시사항이 검증을 요구하지 않았다면 검증 결과가 없다는 이유만으로 issue를 만들지 마라.`,
    `- 결과 보고는 수행 여부를 판단하는 근거이며, 보고 내용과 실제 diff가 모순되면 그 모순을`,
    `  REQUIREMENT 또는 CODE_QUALITY issue로 보고하라.`,
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
    ``,
    `needsClarification: 요구사항 자체가 모호하거나, 서로 다른 요구사항이 상충하거나, 여러 구현`,
    `방식 중 사용자가 직접 선택해야 하는 문제라서 "코드를 더 고친다고" 해결되지 않는다고 판단되면`,
    `true로, 그렇지 않으면 false로 응답하라. 단순히 구현이 부족하거나 버그가 있는 경우는 여기 해당`,
    `하지 않는다 (그건 issue로만 보고하라) — needsClarification은 오직 "사람의 판단/선택이 반드시`,
    `필요하다"고 확신할 때만 true로 하라.`,
    `riskyChangeDetected: 이 WARNING을 고치려면 DB Migration, 데이터/대량 파일 삭제, 인증·인가`,
    `정책 변경, Secret/환경 설정 변경, 배포·인프라 관련 변경 중 하나가 필요하다고 판단되면 true로,`,
    `그렇지 않으면 false로 응답하라.`,
    `과도하게 넓은 범위를 다시 분석하지 말고, 변경된 파일 중심으로만 리뷰하라.`,
    `최종 응답은 반드시 다음 JSON 스키마 형식의 JSON 객체 하나여야 한다: {"result": "PASS"|"WARNING", "issues": [{"severity": "low"|"medium"|"high"|"critical", "category": "SECURITY"|"REQUIREMENT"|"CODE_QUALITY"|"OTHER", "file": string, "location": string|null, "message": string, "suggestion": string|null}], "acceptanceCriteria": [{"id": string, "text": string, "result": "PASS"|"FAIL", "reason": string|null}], "needsClarification": boolean, "riskyChangeDetected": boolean}`,
    `acceptanceCriteria는 위 [완료 조건] 섹션에서 판정/도출한 항목을 모두 포함해야 하며, 완료 조건이`,
    `전혀 없다고 스스로 판단했다면 빈 배열로 응답하라. text는 기존에 주어진 조건이면 그대로, 새로`,
    `도출했다면 방금 만든 문구를 그대로 채워라.`,
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
  required: ["result", "issues", "acceptanceCriteria", "needsClarification", "riskyChangeDetected"],
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
    acceptanceCriteria: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text", "result", "reason"],
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          result: { type: "string", enum: ["PASS", "FAIL"] },
          reason: { type: ["string", "null"] },
        },
      },
    },
    needsClarification: { type: "boolean" },
    riskyChangeDetected: { type: "boolean" },
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

/** Parses the trailing JSON object out of `raw` — the shared first step both `parseReviewJson` and `parseAcceptanceCriteriaDefinitions` build on, so the extraction/parse logic exists exactly once. */
function parseReviewObject(raw: string): Record<string, unknown> | null {
  const jsonText = extractLastJsonObject(raw);
  if (!jsonText) return null;
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  return data as Record<string, unknown>;
}

export function parseReviewJson(
  raw: string,
): Pick<
  ReviewOutcome,
  "result" | "issues" | "raw" | "acceptanceCriteria" | "needsClarification" | "riskyChangeDetected"
> | null {
  const obj = parseReviewObject(raw);
  if (!obj) return null;

  let result: "PASS" | "WARNING" | null =
    obj.result === "WARNING" ? "WARNING" : obj.result === "PASS" ? "PASS" : null;
  if (!result) return null;

  const VALID_CATEGORIES: ReviewIssueCategory[] = [
    "SECURITY",
    "REQUIREMENT",
    "CODE_QUALITY",
    "OTHER",
  ];

  const issuesRaw = Array.isArray(obj.issues) ? obj.issues : [];
  const issues: ReviewIssue[] = issuesRaw
    .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
    .map((i) => ({
      severity:
        i.severity === "critical" ||
        i.severity === "high" ||
        i.severity === "medium" ||
        i.severity === "low"
          ? i.severity
          : "medium",
      // Missing/unrecognized category is left undefined rather than
      // defaulted to "OTHER" — an older agent response (or a caller that
      // hasn't adopted the field yet) shouldn't be forced into a category it
      // never claimed; `securityIssuesOf` already treats undefined as "not
      // Security", same as it treats a genuinely absent field.
      category:
        typeof i.category === "string" && (VALID_CATEGORIES as string[]).includes(i.category)
          ? (i.category as ReviewIssueCategory)
          : undefined,
      file: typeof i.file === "string" ? i.file : "",
      location: typeof i.location === "string" && i.location.trim() ? i.location : null,
      message: typeof i.message === "string" ? i.message : "",
      suggestion: typeof i.suggestion === "string" && i.suggestion.trim() ? i.suggestion : null,
    }));

  const acceptanceCriteriaRaw = Array.isArray(obj.acceptanceCriteria) ? obj.acceptanceCriteria : [];
  const acceptanceCriteria = acceptanceCriteriaRaw
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => ({
      id: typeof c.id === "string" && c.id.trim() ? c.id : "",
      result: c.result === "FAIL" ? ("FAIL" as const) : ("PASS" as const),
      reason: typeof c.reason === "string" && c.reason.trim() ? c.reason : null,
    }))
    .filter((c) => c.id !== "");

  // Defensive invariant, not just a prompt instruction: a required Criterion
  // that FAILed can never coexist with an overall PASS, regardless of what
  // the agent itself answered for `result`.
  if (result === "PASS" && acceptanceCriteria.some((c) => c.result === "FAIL")) {
    result = "WARNING";
  }

  return {
    result,
    issues,
    raw,
    acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : null,
    needsClarification: obj.needsClarification === true,
    riskyChangeDetected: obj.riskyChangeDetected === true,
  };
}

/**
 * Extracts just `{id, text}` from the same review JSON `parseReviewJson`
 * reads — used exactly once per Task, right after its first review, to
 * backfill `Task.acceptanceCriteria` when the Task didn't supply its own
 * (see `buildReviewPrompt`'s derivation instructions). Kept as a separate
 * function rather than added to `parseReviewJson`'s return shape because
 * `Task.acceptanceCriteria` (the fixed id+text definitions) and
 * `ReviewOutcome.acceptanceCriteria` (one run's PASS/FAIL grading of those
 * same ids) are deliberately different shapes.
 */
export function parseAcceptanceCriteriaDefinitions(raw: string): AcceptanceCriterion[] | null {
  const obj = parseReviewObject(raw);
  if (!obj) return null;
  const rawList = Array.isArray(obj.acceptanceCriteria) ? obj.acceptanceCriteria : [];
  const defs = rawList
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => ({
      id: typeof c.id === "string" && c.id.trim() ? c.id : "",
      text: typeof c.text === "string" && c.text.trim() ? c.text : "",
    }))
    .filter((c) => c.id !== "" && c.text !== "");
  return defs.length > 0 ? defs : null;
}
