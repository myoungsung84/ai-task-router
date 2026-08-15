/**
 * Best-effort scan for a local filesystem path inside free-form text (e.g. an
 * instruction pasted from elsewhere that happens to mention the project
 * directory). Used only to *suggest* "이 경로 사용하기" — never applied
 * automatically, so a false positive just means an ignorable suggestion, not
 * a silently wrong field.
 */
const WINDOWS_PATH_RE = /[A-Za-z]:\\(?:[^\\\n\r"'`]+\\)*[^\\\n\r"'`]+/g;
const POSIX_PATH_RE = /(?:\/[^\s"'`\n\r]+){2,}/g;

export function findPathLikeToken(text: string): string | null {
  if (!text) return null;
  const windowsMatches = text.match(WINDOWS_PATH_RE);
  if (windowsMatches && windowsMatches.length > 0) {
    return windowsMatches[0].replace(/[.,;:)]+$/, "").trim();
  }
  const posixMatches = text.match(POSIX_PATH_RE);
  if (posixMatches && posixMatches.length > 0) {
    return posixMatches[0].replace(/[.,;:)]+$/, "").trim();
  }
  return null;
}
