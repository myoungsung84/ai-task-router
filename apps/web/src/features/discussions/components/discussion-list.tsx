import Link from "next/link";
import { Badge, type Tone } from "@/components/badge";
import { EmptyState } from "@/components/states";
import { cn } from "@/lib/format";
import { ParticipantChip } from "./participant-chip";
import { RepoScope } from "./repo-scope";
import { MOCK_DISCUSSIONS } from "../mock";
import { DISCUSSION_STATUS_LABEL, type Discussion, type DiscussionStatus } from "../types";

/**
 * The discussion index, built on the same list grammar as the Task list: one
 * bordered surface holding every row, a 3px status rail on the left edge, and
 * a second line only when it has something to say that the badge does not.
 *
 * That last rule is the one the Task list had to be corrected on — a row whose
 * subtitle restates its own badge spends a line saying nothing. Here the
 * second line is the open-question count and the last thing to happen, which
 * the status word never carries.
 */

const STATUS_TONE: Record<DiscussionStatus, Tone> = {
  active: "brand",
  mediating: "warning",
  closed: "neutral",
};

const STATUS_RAIL: Record<DiscussionStatus, string> = {
  active: "bg-brand",
  mediating: "bg-warning",
  closed: "bg-neutral/40",
};

function sinceLabel(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function DiscussionRow({ discussion }: { discussion: Discussion }) {
  const { summary, participants, composing } = discussion;

  return (
    <div className="group relative flex items-center gap-4 px-4 py-4 transition-colors duration-fast hover:bg-fg/[0.03]">
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-[3px]", STATUS_RAIL[discussion.status])}
      />
      <div className="w-20 shrink-0">
        <Badge tone={STATUS_TONE[discussion.status]}>
          {DISCUSSION_STATUS_LABEL[discussion.status]}
        </Badge>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="mono shrink-0 text-xs text-fg-faint">{discussion.id}</span>
          <Link
            href={`/discussions/${discussion.id}`}
            className="min-w-0 truncate text-sm font-medium text-fg after:absolute after:inset-0 after:content-[''] group-hover:underline"
          >
            {discussion.title}
          </Link>
        </div>
        <p className="mt-1 flex min-w-0 items-baseline gap-1.5 truncate text-xs text-fg-muted">
          {composing ? (
            <span className="text-fg-secondary">작성 중</span>
          ) : summary.open.length > 0 ? (
            <span>미결정 쟁점 {summary.open.length}</span>
          ) : (
            <span>쟁점 없음</span>
          )}
          <span className="text-fg-faint">·</span>
          <span className="text-fg-faint">{sinceLabel(discussion.updatedAt)}</span>
        </p>
      </div>

      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        {participants.map((p) => (
          <ParticipantChip key={p.agent} participant={p} />
        ))}
      </div>

      {/* Two repos then a count — enough to tell rooms apart at a glance
          without letting the widest scope set the column's width. The room
          header spells the full set out. */}
      <div className="hidden w-44 shrink-0 md:block">
        <RepoScope repos={discussion.repos} max={2} className="flex-nowrap overflow-hidden" />
      </div>

      <div className="mono w-10 shrink-0 text-right text-xs text-fg-faint">
        v{discussion.summaryVersion}
      </div>
    </div>
  );
}

export function DiscussionList() {
  const discussions = MOCK_DISCUSSIONS;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {discussions.length === 0 ? (
          <EmptyState
            title="아직 논의가 없습니다"
            description="안건과 배경을 정리하면 Claude와 Codex가 원본 문서를 읽고 의견을 남깁니다."
          />
        ) : (
          <div className="divide-y divide-border">
            {discussions.map((d) => (
              <DiscussionRow key={d.id} discussion={d} />
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-fg-faint">
        화면 확인용 목 데이터입니다. 논의 생성과 저장은 아직 구현되지 않았습니다 — 설계는{" "}
        <span className="mono">docs/discussion-room-ux.md</span>에 있습니다.
      </p>
    </div>
  );
}
