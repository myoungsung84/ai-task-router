/**
 * Deterministic, synchronous title generator shared by the web client (live
 * preview while the user types the instruction) and the server (final
 * guarantee — `taskService.createTask` calls this whenever `title` is
 * missing/empty). Using one function in both places means the live preview
 * the user edits from is never out of sync with what the server would have
 * produced anyway.
 *
 * No AI call: this only needs to be "short and clear enough to recognize the
 * Task in a list", not a perfect summary — a cheap heuristic is the right
 * tool so title generation stays instant and available offline.
 */

const ACTION_KEYWORDS: { pattern: RegExp; label: string }[] = [
  { pattern: /삭제|제거|지워/, label: "삭제" },
  { pattern: /테스트/, label: "테스트 추가" },
  { pattern: /리뷰|검토/, label: "리뷰" },
  { pattern: /분석|파악|조사|요약/, label: "분석" },
  { pattern: /수정|고쳐|버그|고침|바꿔|변경|fix/i, label: "수정" },
  { pattern: /추가|생성|구현|만들|작성/, label: "구현" },
];

const MAX_TITLE_LENGTH = 60;
const FALLBACK_TITLE = "새 Task";

/**
 * Backtick-quoted spans first (`\`auth.ts\``), then bare path-like tokens
 * with a file extension. The negative lookahead excludes a mid-path
 * directory segment that merely contains a dot (e.g. "01.src" inside
 * "D:\01.src\home\tools-hub") — only a token *not* immediately followed by
 * another path separator counts as a plausible leaf filename.
 */
function extractFileNames(text: string): string[] {
  const backticked = [...text.matchAll(/`([^`\n]{1,80})`/g)].map((m) => m[1]!);
  const bare = [...text.matchAll(/\b[\w][\w./\\-]*\.[A-Za-z0-9]{1,8}\b(?![\\/])/g)].map(
    (m) => m[0],
  );
  const combined = [...backticked, ...bare]
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 60);
  return Array.from(new Set(combined)).slice(0, 2);
}

function truncate(title: string, max = MAX_TITLE_LENGTH): string {
  const trimmed = title.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Picks whichever action keyword occurs earliest in the text, not whichever
 * category happens to be listed first in ACTION_KEYWORDS — natural-language
 * instructions usually state their main verb first (e.g. "회원 탈퇴 API를
 * 추가해줘. 소프트 삭제로 처리하고..." is about *adding* something, even
 * though "삭제" appears later as an implementation detail).
 */
function detectAction(text: string): string | null {
  let bestIndex = Infinity;
  let bestLabel: string | null = null;
  for (const { pattern, label } of ACTION_KEYWORDS) {
    const index = text.search(pattern);
    if (index !== -1 && index < bestIndex) {
      bestIndex = index;
      bestLabel = label;
    }
  }
  return bestLabel;
}

export function generateTitleFromInstruction(instruction: string): string {
  const text = (instruction ?? "").trim();
  if (!text) return FALLBACK_TITLE;

  const action = detectAction(text);
  const files = extractFileNames(text);

  let title: string;
  if (files.length > 0 && action) {
    title = `${files.join(", ")} ${action}`;
  } else if (files.length > 0) {
    title = files.join(", ");
  } else if (action) {
    const firstLine = text.split(/\r?\n/)[0]!.trim();
    title = `${action}: ${firstLine}`;
  } else {
    title = text.split(/\r?\n/)[0]!.trim();
  }

  const result = truncate(title);
  return result || FALLBACK_TITLE;
}
