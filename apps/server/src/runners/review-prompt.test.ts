import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyFailure } from "./common/run-failure";
import { extractLastJsonObject, parseReviewJson } from "./review-prompt";

/**
 * A review answer shaped like the one that actually failed, built rather than
 * copied.
 *
 * The real case is in this app's own Task history: a review with eight
 * Acceptance Criteria, each with a paragraph of reasoning. What matters for
 * the regression is only its *size* — it has to run past the 4000-character
 * buffer the runner used to parse from — so the text here is generic and
 * carries no real path, account, or repository content. (This repository is
 * public; see AGENTS.md.)
 */
function buildLongReview(): string {
  const sentence =
    "무엇을 확인했고 어디를 근거로 삼았는지, 통과라면 왜 통과인지 적는 것이 리뷰 응답의 " +
    "정상적인 형태다. 응답이 충실할수록 길어지고, 길어질수록 예전 구현에서는 반드시 " +
    "파싱에 실패했다. ";
  // 길이를 눈대중으로 맞추지 않는다. 조건 8개 × 이 길이면 전체가 4000자를 확실히 넘고,
  // 문장을 손볼 때 픽스처가 조용히 4000자 밑으로 내려가는 일도 없다.
  const reason = sentence.repeat(Math.ceil(400 / sentence.length));
  const acceptanceCriteria = Array.from({ length: 8 }, (_, i) => ({
    id: `AC-${i + 1}`,
    text: `여덟 개 완료 조건 중 ${i + 1}번. 사용자가 결과물을 보고 직접 확인할 수 있는 수준으로 적혀 있다.`,
    result: i === 6 ? "FAIL" : "PASS",
    reason,
  }));

  return JSON.stringify({
    result: "WARNING",
    issues: [
      {
        severity: "medium",
        category: "CODE_QUALITY",
        file: "src/example/sample.ts",
        location: "L62-66",
        message: `Promise 를 변수에만 담아 두고 나중에 await 한다. ${reason}`,
        suggestion: "즉시 처리 경로를 붙인다.",
      },
      {
        severity: "low",
        category: "OTHER",
        file: "docs/sample.md",
        location: null,
        message: `문서가 코드보다 뒤처져 있다. ${reason}`,
        suggestion: null,
      },
    ],
    acceptanceCriteria,
    needsClarification: true,
    riskyChangeDetected: false,
  });
}

/** What the runner used to hand the parser: the last 4000 characters, nothing more. */
function keepTailOnly(text: string): string {
  return text.slice(-4000);
}

describe("리뷰 응답 파싱", () => {
  it("4000자 tail 로 자르면 결과를 얻을 수 없다 (실제 실패의 원인)", () => {
    const full = buildLongReview();
    assert.ok(full.length > 4000, "픽스처가 4000자를 넘어야 회귀를 재현한다");

    const parsed = parseReviewJson(keepTailOnly(full));

    // 앞부분이 잘려 여는 중괄호가 사라진다. 어떤 형태로든 PASS 로 해석되면 안 된다.
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.ok(parsed.kind === "PARSE_FAILED" || parsed.kind === "SCHEMA_INVALID");
    }
  });

  it("같은 응답을 자르지 않으면 완료 조건 8개까지 그대로 파싱된다", () => {
    const parsed = parseReviewJson(buildLongReview());

    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.review.result, "WARNING");
    assert.equal(parsed.review.issues.length, 2);
    assert.equal(parsed.review.acceptanceCriteria?.length, 8);
    assert.equal(parsed.review.needsClarification, true);
    assert.equal(parsed.review.riskyChangeDetected, false);
  });

  it("message 안의 중괄호를 구조로 세지 않는다", () => {
    // 역방향 중괄호 스캔이 깨지던 형태 — 리뷰 message 는 코드를 자주 인용한다.
    const raw = JSON.stringify({
      result: "WARNING",
      issues: [
        {
          severity: "high",
          category: "CODE_QUALITY",
          file: "src/a.ts",
          location: null,
          message: "닫는 중괄호 } 가 남고 여는 중괄호 { 는 문자열 안에만 있다",
          suggestion: "`${value}` 보간을 확인한다",
        },
      ],
      acceptanceCriteria: [],
      needsClarification: false,
      riskyChangeDetected: false,
    });

    const parsed = parseReviewJson(raw);

    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.review.issues.length, 1);
    assert.match(parsed.review.issues[0]!.message, /닫는 중괄호/);
  });

  it("코드블록과 앞뒤 설명이 붙어 있어도 파싱된다", () => {
    const body = JSON.stringify({
      result: "PASS",
      issues: [],
      acceptanceCriteria: [],
      needsClarification: false,
      riskyChangeDetected: false,
    });
    const raw = [
      "변경사항을 확인했습니다. 결과는 아래와 같습니다 (참고: {중괄호} 포함 설명).",
      "```json",
      body,
      "```",
      "추가 설명은 없습니다.",
    ].join("\n");

    const parsed = parseReviewJson(raw);

    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.review.result, "PASS");
  });

  it("JSON 이 아예 없으면 PARSE_FAILED 다", () => {
    const parsed = parseReviewJson("리뷰를 수행했지만 형식을 지키지 못했습니다.");

    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.equal(parsed.kind, "PARSE_FAILED");
  });

  it("result 가 없는 JSON 은 SCHEMA_INVALID 이고 PASS 가 아니다", () => {
    const parsed = parseReviewJson(JSON.stringify({ issues: [], summary: "문제 없음" }));

    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.equal(parsed.kind, "SCHEMA_INVALID");
  });

  it("boolean 이어야 하는 값이 문자열이면 조용히 false 로 넘기지 않는다", () => {
    const parsed = parseReviewJson(
      JSON.stringify({
        result: "WARNING",
        issues: [],
        acceptanceCriteria: [],
        needsClarification: "true",
        riskyChangeDetected: false,
      }),
    );

    // 예전에는 `=== true` 라서 문자열 "true" 가 false 가 되고, Auto Fix Loop 가
    // 사람 판단이 필요한 건을 자동으로 고치려 들 수 있었다.
    assert.equal(parsed.ok, false);
  });

  it("issues 가 객체 배열이 아니면 '문제 없음' 으로 넘기지 않는다", () => {
    const parsed = parseReviewJson(
      JSON.stringify({
        result: "WARNING",
        issues: ["버그가 있습니다", "타입이 틀렸습니다"],
        acceptanceCriteria: [],
        needsClarification: false,
        riskyChangeDetected: false,
      }),
    );

    assert.equal(parsed.ok, false);
  });

  it("완료 조건 항목 하나만 남은 조각을 PASS 리뷰로 읽지 않는다", () => {
    // 잘린 응답에서 마지막까지 살아남는 것이 완료조건 항목일 수 있다. 그 항목도
    // result: "PASS" 를 갖고 있어서, envelope 으로 읽으면 잃어버린 응답이 깨끗한
    // 통과로 바뀐다. issues 를 필수로 둔 이유가 이것이다.
    const criterionOnly = JSON.stringify({
      id: "AC-8",
      text: "마지막 조건",
      result: "PASS",
      reason: "통과",
    });

    const parsed = parseReviewJson(criterionOnly);

    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.equal(parsed.kind, "SCHEMA_INVALID");
  });

  it("완료 조건이 하나라도 FAIL 이면 PASS 응답도 WARNING 이 된다", () => {
    const parsed = parseReviewJson(
      JSON.stringify({
        result: "PASS",
        issues: [],
        acceptanceCriteria: [{ id: "AC-1", text: "조건", result: "FAIL", reason: null }],
        needsClarification: false,
        riskyChangeDetected: false,
      }),
    );

    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.review.result, "WARNING");
  });
});

describe("extractLastJsonObject", () => {
  it("객체가 여러 개면 마지막으로 파싱되는 것을 고른다", () => {
    const raw = '앞선 예시 {"result": "PASS"} 뒤에 실제 결과 {"result": "WARNING"} 가 온다';

    assert.equal(extractLastJsonObject(raw), '{"result": "WARNING"}');
  });

  it("여는 중괄호가 잘려 나가면 null 이다", () => {
    assert.equal(extractLastJsonObject('"result": "PASS", "issues": []}'), null);
  });
});

describe("실패 원인 분류", () => {
  it("사용 한도와 인증 실패를 구분한다", () => {
    assert.equal(classifyFailure(["Claude usage limit reached. Try again later."]), "USAGE_LIMIT");
    assert.equal(classifyFailure(["요금제 한도에 도달했습니다"]), "USAGE_LIMIT");
    assert.equal(classifyFailure(["Invalid API key · Please run /login"]), "AUTH_FAILED");
    assert.equal(classifyFailure(["error_max_turns"]), "RESPONSE_INCOMPLETE");
  });

  it("마지막 줄을 우선한다", () => {
    // 앞에서 한도를 언급하고 회복한 뒤 다른 이유로 죽는 경우가 있다.
    assert.equal(classifyFailure(["rate limit, retrying...", "Invalid API key"]), "AUTH_FAILED");
  });

  it("근거가 없으면 원인을 추측하지 않는다", () => {
    assert.equal(classifyFailure(["Something went wrong", ""]), null);
  });
});
