"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CornerDownLeft, Play, RotateCcw } from "lucide-react";
import { Badge, type Tone } from "@/components/badge";
import { Button } from "@/components/button";
import { ErrorState, LoadingState } from "@/components/states";
import { cn } from "@/lib/format";
import type { DiscussionStatus } from "@ai-task-router/shared";
import { ChatMessage } from "./chat-message";
import { ComposeTrack } from "./compose-track";
import { DocumentRail } from "./document-rail";
import { ParticipantChip } from "./participant-chip";
import { RepoScope } from "./repo-scope";
import { useDiscussionRoom } from "../hooks/use-discussion-room";
import { DISCUSSION_STATUS_LABEL } from "../types";

/**
 * The room: a resident one-line header, the chat as the stage, and the source
 * document collapsed beside it.
 *
 * The layout is the argument. Chat gets the width because the room is supposed
 * to feel like an ordinary messenger and not a meeting console; the document
 * gets a permanent strip because it is the only thing anyone is actually
 * judging from. Neither can be the whole screen without breaking the other
 * half of the spec.
 *
 * Turn control is typed, not clicked — "코덱스가 먼저 봐줘" rather than a
 * dropdown — which is the same reason the room has no 채택/반박/동의 buttons.
 * 계속 is the one button, and only because "run another round with nothing new
 * from me" is the one instruction with no natural sentence.
 *
 * Note what the room cannot do: there is no control here that writes a file,
 * runs a test, switches a branch or commits. A discussion is forbidden all of
 * it, and keeping the domain in its own routes and components means the rule
 * holds because the door was never built.
 */

const STATUS_TONE: Record<DiscussionStatus, Tone> = {
  active: "brand",
  mediating: "warning",
  closed: "neutral",
};

function sinceLabel(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function DiscussionRoom({ id }: { id: string }) {
  const { view, loading, error, notice, busy, send, advance, abandon, refresh } =
    useDiscussionRoom(id);
  const [draft, setDraft] = useState("");

  if (loading && !view) return <LoadingState label="논의를 불러오는 중" padding="md" />;
  if (error && !view) return <ErrorState message={error} onRetry={refresh} />;
  if (!view) return null;

  const { discussion, turn } = view;
  const closed = discussion.status === "closed";
  const round = turn.round;

  function submit() {
    if (!draft.trim() || busy || closed) return;
    void send(draft);
    setDraft("");
  }

  return (
    <div className="space-y-4">
      <Link
        href="/discussions"
        className="inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors duration-fast hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        논의 목록
      </Link>

      <div className="space-y-2 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-fg">
            {discussion.title}
          </h1>
          <Badge tone={STATUS_TONE[discussion.status]}>
            {DISCUSSION_STATUS_LABEL[discussion.status]}
          </Badge>
          {/* A round that stopped without finishing does not restart on its
              own, and an append cannot be replayed safely, so it is a state to
              be seen rather than one to be silently retried. */}
          {turn.needsResume ? <Badge tone="warning">재개 필요</Badge> : null}
          <span className="flex items-center gap-2">
            {discussion.participants.map((p) => (
              <ParticipantChip key={p.agent} participant={p} />
            ))}
          </span>
          <span className="mono shrink-0 text-xs text-fg-faint">
            v{discussion.summaryVersion} · {sinceLabel(discussion.updatedAt)}
          </span>
        </div>
        {/* The repositories under discussion, spelled out. A room spans as many
            as the question does, so this is part of the subject rather than a
            filing detail — see RepoScope. */}
        <RepoScope repos={discussion.repos} />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-5">
          {discussion.messages.map((m) => (
            <ChatMessage key={m.id} message={m} />
          ))}

          {/*
            A rail per participant still owed a turn. It only exists while a
            round is open; once the turn is submitted it collapses into an
            ordinary message, the same call made for finished Task rows and
            more important here, because a chat grows downward forever and a
            stack of spent rails would bury the conversation.
          */}
          {round?.queue.map((agent) => (
            <ComposeTrack
              key={agent}
              agent={agent}
              claimed={round.claimed.includes(agent)}
              className="ml-11"
            />
          ))}

          {round ? (
            <p className="ml-11 flex flex-wrap items-center gap-2 text-xs text-fg-faint">
              <span>
                라운드 {round.round} · {round.parallel ? "병렬" : "순차"} · {round.reason}
              </span>
              <button
                type="button"
                onClick={() => void abandon()}
                disabled={busy}
                className="inline-flex items-center gap-1 text-fg-faint underline-offset-2 transition-colors duration-fast hover:text-fg-muted hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <RotateCcw className="h-3 w-3" aria-hidden />
                라운드 중단
              </button>
            </p>
          ) : null}

          {notice ? (
            <p
              className={cn(
                "ml-11 text-xs",
                notice.tone === "warning" ? "text-warning" : "text-fg-muted",
              )}
            >
              {notice.text}
            </p>
          ) : null}

          <div className="pt-1">
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2",
                (closed || busy) && "opacity-60",
              )}
            >
              <input
                type="text"
                value={draft}
                disabled={closed || busy}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
                placeholder={
                  closed
                    ? "종료된 논의입니다"
                    : '메시지 입력 — "코덱스가 먼저 봐줘" 처럼 순서도 말로'
                }
                className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-faint"
              />
              <button
                type="button"
                onClick={submit}
                disabled={!draft.trim() || closed || busy}
                aria-label="보내기"
                className="flex h-7 w-7 items-center justify-center rounded-md text-fg-faint transition-colors duration-fast hover:bg-fg/[0.06] hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <CornerDownLeft className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                icon={<Play className="h-3.5 w-3.5" />}
                onClick={() => void advance()}
                disabled={closed || busy || !!round}
              >
                계속
              </Button>
              <p className="text-xs text-fg-faint">
                라운드는 참여자 1회씩만 돌고 사용자에게 돌아옵니다. 발언은 각 AI가 자기 세션에서
                제출합니다.
              </p>
            </div>
          </div>
        </div>

        <DocumentRail
          discussionId={discussion.roomId}
          summary={discussion.summary}
          version={discussion.summaryVersion}
          className="w-full shrink-0 lg:w-72"
        />
      </div>
    </div>
  );
}
