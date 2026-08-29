import { FolderGit2 } from "lucide-react";
import { cn } from "@/lib/format";

/**
 * The repositories a discussion covers, all of them, as equals.
 *
 * A first pass showed `repos[0] +2`, borrowing the Task list's treatment of a
 * Task's single project. That was wrong about what a discussion is. A Task
 * runs somewhere; a discussion is usually *about* how several places relate —
 * whether the collector in one repo can be trimmed given the mirror in
 * another — so the set is part of the question, and promoting whichever
 * happened to be registered first invents a primary that does not exist.
 *
 * §4 also makes this list the AIs' investigation boundary: they read these and
 * nothing else. That makes it something to be able to check at a glance, not
 * a filing detail — if a repository is missing, every answer in the room is
 * narrower than it looks.
 */
export function RepoScope({
  repos,
  max,
  className,
}: {
  repos: string[];
  /** Cap for dense rows; the room header shows every one. */
  max?: number;
  className?: string;
}) {
  if (repos.length === 0) {
    return <span className={cn("text-xs text-fg-faint", className)}>저장소 미지정</span>;
  }

  const shown = max ? repos.slice(0, max) : repos;
  const hidden = repos.length - shown.length;

  return (
    <span
      className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}
      title={repos.join(", ")}
    >
      <FolderGit2 className="h-3 w-3 shrink-0 text-fg-faint" aria-hidden />
      {shown.map((repo) => (
        <span
          key={repo}
          className="mono truncate rounded bg-fg/[0.06] px-1.5 py-0.5 text-xs text-fg-muted"
        >
          {repo}
        </span>
      ))}
      {hidden > 0 ? <span className="mono text-xs text-fg-faint">+{hidden}</span> : null}
    </span>
  );
}
