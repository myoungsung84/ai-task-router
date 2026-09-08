/**
 * Why a CLI run did not produce a usable result.
 *
 * Before this existed, every one of these collapsed into `success: false` and
 * the dashboard showed one of two sentences ("리뷰 실행에 실패했습니다" /
 * "리뷰 결과 파싱에 실패했습니다"). That is the wrong grouping to show a
 * person: hitting a usage limit is waiting, an auth error is one command, and
 * a truncated response is a bug in this app. They are also the wrong grouping
 * to act on — a limit is worth retrying later and a schema violation never is.
 *
 * Shared by both runners so the wording and the classification exist once.
 */
export type RunFailureKind =
  /** The user cancelled the Task. Not an error. */
  | "CANCELLED"
  /** The CLI itself refused to start or died. Cause unknown beyond its exit code. */
  | "EXECUTION_FAILED"
  /** The CLI is not signed in, or its credentials expired. */
  | "AUTH_FAILED"
  /** The account's plan limit is reached — the run never got to answer. */
  | "USAGE_LIMIT"
  /** The CLI exited cleanly but stopped mid-answer (turn cap, interrupted stream). */
  | "RESPONSE_INCOMPLETE"
  /** The answer exceeded what this app kept, so what we parsed was never the whole answer. */
  | "RESPONSE_TRUNCATED"
  /** No JSON object could be found in the answer at all. */
  | "PARSE_FAILED"
  /** JSON was found, but it is not a review result. */
  | "SCHEMA_INVALID";

export interface RunFailure {
  kind: RunFailureKind;
  /**
   * One Korean line for the dashboard. Never carries CLI output verbatim —
   * a stderr line can hold a prompt fragment, a path, or a token, and this
   * string is stored in the Task record and rendered in the browser.
   */
  message: string;
}

const MESSAGES: Record<RunFailureKind, string> = {
  CANCELLED: "사용자가 작업을 중단했습니다.",
  EXECUTION_FAILED: "CLI가 비정상 종료했습니다. 실행 로그를 확인하세요.",
  AUTH_FAILED: "CLI 인증이 만료되었거나 로그인되어 있지 않습니다. 해당 CLI에서 다시 로그인하세요.",
  USAGE_LIMIT:
    "요금제 사용 한도에 도달해 응답을 받지 못했습니다. 한도가 초기화된 뒤 다시 실행하세요.",
  RESPONSE_INCOMPLETE: "CLI가 응답을 끝내지 못하고 중단했습니다. 다시 실행하세요.",
  RESPONSE_TRUNCATED:
    "리뷰 응답이 이 앱이 보관하는 한도를 넘어 잘렸습니다. 응답 자체는 정상일 수 있습니다.",
  PARSE_FAILED: "리뷰 응답에서 JSON 결과를 찾지 못했습니다.",
  SCHEMA_INVALID: "리뷰 응답의 JSON이 리뷰 결과 형식과 맞지 않습니다.",
};

export function runFailure(kind: RunFailureKind): RunFailure {
  return { kind, message: MESSAGES[kind] };
}

/**
 * Markers that identify *why* a CLI gave up, matched against its own output.
 *
 * Both CLIs report these as prose rather than as a distinct exit code, so
 * matching text is the only signal available. Deliberately narrow: a false
 * positive here mislabels a real failure and sends the user to fix the wrong
 * thing, which is worse than the honest "EXECUTION_FAILED". Anything not
 * matched stays unclassified.
 *
 * English and Korean both appear because either CLI's locale can change which
 * one it prints.
 */
const PATTERNS: ReadonlyArray<{ kind: RunFailureKind; test: RegExp }> = [
  {
    kind: "USAGE_LIMIT",
    test: /usage limit reached|rate.?limit|quota exceeded|한도에? (?:도달|초과)|사용량 한도/i,
  },
  {
    kind: "AUTH_FAILED",
    test: /not (?:logged in|authenticated)|invalid api key|authentication[_ ]error|please run .{0,20}login|로그인이? 필요|인증(?:에)? 실패/i,
  },
  {
    kind: "RESPONSE_INCOMPLETE",
    test: /max(?:imum)? turns|error_max_turns|stream (?:closed|interrupted)|턴 (?:한도|제한)/i,
  },
];

/**
 * Best-effort cause for a run that failed, from the lines the CLI produced.
 *
 * Returns `null` rather than guessing when nothing matches — the caller then
 * reports `EXECUTION_FAILED`, which says "it broke, read the log" instead of
 * naming a cause that was never observed.
 */
export function classifyFailure(outputLines: readonly string[]): RunFailureKind | null {
  // Newest first: the reason a run gave up is at the end of its output, and an
  // earlier line can mention a limit it then recovered from.
  for (let i = outputLines.length - 1; i >= 0; i--) {
    const line = outputLines[i];
    if (!line) continue;
    for (const { kind, test } of PATTERNS) {
      if (test.test(line)) return kind;
    }
  }
  return null;
}
