/**
 * Deterministic, synchronous title generator shared by the web client (live
 * preview while the user types the instruction) and the server (final
 * guarantee — `taskService.createTask` calls this whenever `title` is
 * missing/empty). Using one function in both places means the live preview
 * the user edits from is never out of sync with what the server would have
 * produced anyway.
 *
 * No AI call: this only needs to be "short and clear enough to recognize the
 * Task in a list", not a perfect summary — a cheap heuristic is the right tool
 * so title generation stays instant and available offline. It is also only
 * ever a *default*: the create form pre-fills it for editing and a Task can be
 * renamed afterwards, so being occasionally wrong here is recoverable rather
 * than permanent.
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
 * The one backslash literal in this file, built from its code point so no
 * pattern below needs an escaped backslash.
 *
 * That escape is what broke the previous implementation: its "leaf filename"
 * class was written with both separators, degraded to forward-slash-only, and
 * so matched an entire Windows path as a single token — which is how list rows
 * ended up titled "01.src\home\tools-hub\ai-task-router-smoke-20260822.txt, ai…".
 */
const BACKSLASH = String.fromCharCode(92);

/** Both separators become `/`, so every pattern here is written against one. */
function normalizeSeparators(text: string): string {
  return text.split(BACKSLASH).join("/");
}

/**
 * Drive-anchored Windows paths, which may contain spaces ("C:/Program Files/…").
 *
 * A space is only accepted *inside* a directory segment — one that the
 * lookahead proves is followed by another separator. The final segment stays
 * space-free, so "D:/src/a.ts 참고해서" gives up the path and keeps the prose
 * rather than swallowing the rest of the sentence. Matched before `PATH_RUN`
 * because that pattern would otherwise cut this path in half at the space and
 * leave "C:/Program" behind as the title.
 */
const DRIVE_PATH_RUN = /[A-Za-z]:(?:\/[\w.~-]+(?: [\w.~-]+)*(?=\/))*\/[\w.~-]+/g;

/** A run of path-ish characters holding at least one separator. */
const PATH_RUN = /(?:[A-Za-z]:)?\/?[\w.~-]+(?:\/[\w.~-]+)+\/?/g;

/**
 * Zero-width and other invisible characters. They survive `trim()`, so a title
 * made only of them counts as "non-empty" and defeats the guarantee that every
 * Task is identifiable in a list.
 *
 * Line breaks and tabs are explicitly exempt even though they are `\p{Cc}`.
 * Removing them silently welded a multi-line instruction into one line, so the
 * "first line is the title" rule below had no lines to choose between and
 * titles ran on into the request's own bullet list. They are also already
 * handled: `trim()` treats them as whitespace, so an all-newline title still
 * falls back correctly.
 */
const INVISIBLE = /\p{Cf}|(?![\n\r\t])\p{Cc}/gu;

/** Strips characters that take no space, so emptiness checks mean what they say. */
export function stripInvisible(text: string): string {
  return text.replace(INVISIBLE, "");
}

/** Punctuation stranded at the front once a path is cut out of a phrase. */
const LEADING_PUNCT = /^[\s,.;:·\-–—]+/u;

/**
 * A Korean particle stranded at the front for the same reason ("`a/b.ts` 의
 * 로직" → "의 로직"). Only applied when a path really was removed: at the start
 * of ordinary prose these are demonstratives, and "이 프로젝트 구조 파악" must
 * not become "프로젝트 구조 파악"'s poorer sibling by losing its subject.
 */
const LEADING_PARTICLE = /^(?:의|를|을|이|가|은|는|에서|에|으로|로)\s+/u;

/** Politeness endings carry no meaning in a list and cost scarce title length. */
const TRAILING_REQUEST =
  /\s*(?:해\s*줘|해\s*주세요|해줘요|해주라|하라|해라|바랍니다|부탁\S*)\s*[.!]?$/u;

/** The leaf of a path — for callers that want the filename, not the whole run. */
export function baseName(pathLike: string): string {
  const parts = normalizeSeparators(pathLike).replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || pathLike;
}

function truncate(title: string, max = MAX_TITLE_LENGTH): string {
  const trimmed = title.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + "…";
}

function tidy(text: string, pathWasRemoved: boolean): string {
  let out = text.replace(/\s+/g, " ").trim().replace(LEADING_PUNCT, "");
  if (pathWasRemoved) out = out.replace(LEADING_PARTICLE, "");
  return out
    .replace(TRAILING_REQUEST, "")
    .replace(/[\s,.;:]+$/u, "")
    .trim();
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

/**
 * Intent first.
 *
 * The first sentence of the first non-empty line is the title candidate,
 * because people say what they want before piling on detail. Paths are removed
 * rather than promoted — the Task row already carries its 프로젝트 in its own
 * column — and only resurface as a bare filename when stripping them left
 * nothing else to say.
 */
export function generateTitleFromInstruction(instruction: string): string {
  const text = stripInvisible(instruction ?? "").trim();
  if (!text) return FALLBACK_TITLE;

  const normalized = normalizeSeparators(text);
  const firstLine = normalized.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";

  // Backticks come off but their contents stay — `auth.ts` is often the only
  // concrete noun in a short instruction.
  const unquoted = firstLine.replace(/`([^`\n]{1,80})`/g, "$1");
  // Drive-anchored paths first: they may contain spaces, which PATH_RUN would
  // cut in half (leaving "C:/Program" as the title of a "C:/Program Files/…"
  // instruction).
  const paths = [...(unquoted.match(DRIVE_PATH_RUN) ?? [])];
  const afterDrives = unquoted.replace(DRIVE_PATH_RUN, " ");
  paths.push(...(afterDrives.match(PATH_RUN) ?? []));
  const withoutPaths = afterDrives.replace(PATH_RUN, " ");

  // Detail after the first full stop is elaboration, not the title.
  const firstSentence = withoutPaths.split(/(?<=[.!?。])\s+/)[0] ?? withoutPaths;
  const candidate = firstSentence.trim().length >= 4 ? firstSentence : withoutPaths;
  const cleaned = tidy(candidate, paths.length > 0);

  if (cleaned.length >= 4) return truncate(cleaned);

  // Too little prose survived. Lead with the filename that was carrying the
  // meaning, and append whatever intent we can name — deduplicated, so
  // "src/x/Button.tsx 삭제" cannot come back as "삭제 삭제".
  const leaf = paths.length > 0 ? baseName(paths[0]!) : "";
  const action = detectAction(text);
  const tail = cleaned || action || "";

  if (leaf && tail && !leaf.includes(tail)) return truncate(`${leaf} ${tail}`);
  if (leaf) return truncate(leaf);
  if (tail) return truncate(tail);

  return truncate(tidy(normalized, false)) || FALLBACK_TITLE;
}
