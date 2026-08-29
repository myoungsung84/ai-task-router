import type { Discussion } from "./types";

/**
 * Stand-in data for the discussion room's first UX pass.
 *
 * Nothing server-side produces discussions yet, and the decisions that would
 * shape that server (docs/discussion-room-proposal.md §11) are still open. The
 * point of this pass is to put the screen in front of someone before any of it
 * is built, so the rooms below are hand-written to cover the states the layout
 * has to survive rather than to look impressive: one room mid-turn with an AI
 * composing, one where the AIs have stopped moving and the user has to break
 * the tie, and one already closed.
 *
 * Deliberately included, because each one broke an earlier sketch: a message
 * that was later corrected (the stream must not reorder or delete), a
 * participant sitting at 입장 유지 (must be visible without a message), and
 * rooms that span several repositories — a discussion is not scoped to one
 * repo, and a layout that quietly promotes the first one is wrong before it is
 * cramped.
 *
 * Each room also carries a `script`: what its participants would say if asked
 * again. That is the one thing a screen with no backend cannot work out for
 * itself, and it is what lets 계속 actually run a round.
 */

const HOUR = 3600_000;

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

export const MOCK_DISCUSSIONS: Discussion[] = [
  {
    id: "D-03",
    title: "미러 구조 수집 범위를 어디까지 유지할지",
    status: "active",
    revision: 62,
    summaryVersion: 15,
    lastEntryRef: 47,
    createdAt: ago(6 * HOUR),
    updatedAt: ago(2 * 60_000),
    repos: ["tools-hub", "ai-task-router", "mirror-archive"],
    participants: [
      { agent: "claude", state: "idle" },
      { agent: "codex", state: "writing" },
    ],
    summary: {
      facts: [
        "미러 재생성 비용이 수집 비용을 넘는 지점은 현재 데이터에 없다.",
        "수집 중단 시 복구에 필요한 시간은 측정된 적이 없다.",
      ],
      agreed: [
        "수집 자체는 유지한다.",
        "범위 축소는 측정 결과가 나온 뒤에 결정한다.",
        "미러 구조는 이번 논의에서 바꾸지 않는다.",
      ],
      open: ["축소 대상 선정 기준", "복구 시간 측정 방법"],
      decisions: ["기존 계획대로 수집을 계속한다. (14:07)"],
    },
    messages: [
      {
        id: "m1",
        author: "claude",
        at: ago(70 * 60_000),
        body: "수집을 전면 중단하는 쪽이 낫다.\n근거: 미러가 이미 있으므로 중복 비용이다.",
        entryRef: 44,
        amendedBy: "m3",
      },
      {
        id: "m2",
        author: "codex",
        at: ago(58 * 60_000),
        body: "중단은 이르다.\n근거: 미러 재생성 비용을 측정한 기록이 없어 중복이라는 근거가 성립하지 않는다.",
        entryRef: 45,
        sources: ["tools-hub/mirror/collect.ts"],
      },
      {
        id: "m3",
        author: "claude",
        at: ago(41 * 60_000),
        body: "측정 기록이 없다는 지적을 수용한다. 수집은 유지하되 범위를 축소하는 쪽으로 의견을 바꾼다.\n근거: 재생성 비용이 수집 비용을 넘는 지점이 확인되지 않았다.",
        entryRef: 47,
        sources: ["tools-hub/mirror/collect.ts", "mirror-archive/docs/notes.md"],
      },
      {
        id: "m4",
        author: "user",
        at: ago(9 * 60_000),
        body: "그럼 일단 기존 계획대로 가자. 축소는 측정하고 나서 정하는 걸로.",
        entryRef: null,
      },
    ],
    // Left null: rounds are driven live now, and a rail parked mid-stage that
    // never resolves is worse than no rail at all.
    composing: null,
    round: 2,
    lastSpeakers: ["claude"],
    script: {
      codex: [
        {
          grounds: true,
          body: "축소 대상은 재생성 비용이 측정된 것부터로 한정하자.\n근거: 측정 없는 대상을 먼저 줄이면 되돌릴 판단 근거가 안 남는다.",
          sources: ["mirror-archive/collect/plan.ts"],
        },
        { grounds: false },
      ],
      claude: [
        {
          grounds: true,
          body: "측정 우선 순서에 동의하되, 복구 시간 측정이 먼저다.\n근거: 축소 대상 선정도 복구 비용을 알아야 정할 수 있다.",
        },
        { grounds: false },
      ],
    },
  },
  {
    id: "D-02",
    title: "라우터 로그 보존 기간과 삭제 정책",
    status: "mediating",
    revision: 31,
    summaryVersion: 9,
    lastEntryRef: 22,
    createdAt: ago(30 * HOUR),
    updatedAt: ago(3 * HOUR),
    repos: ["ai-task-router", "ops-runbook"],
    participants: [
      { agent: "claude", state: "holding", holdingSince: ago(3 * HOUR) },
      { agent: "codex", state: "holding", holdingSince: ago(4 * HOUR) },
    ],
    summary: {
      facts: ["현재 로그는 삭제되지 않고 무한히 쌓인다."],
      agreed: ["보존 기간 상한은 필요하다."],
      open: ["상한을 30일로 둘지 90일로 둘지", "삭제를 하드 삭제로 할지 아카이브로 할지"],
      decisions: [],
    },
    messages: [
      {
        id: "m1",
        author: "claude",
        at: ago(5 * HOUR),
        body: "30일이면 충분하다.\n근거: 90일 이전 로그를 조회한 기록이 없다.",
        entryRef: 21,
      },
      {
        id: "m2",
        author: "codex",
        at: ago(4 * HOUR),
        body: "90일이 필요하다.\n근거: 분기 단위 회고에서 이전 분기 로그를 참조한다.",
        entryRef: 22,
        sources: ["ops-runbook/retro/quarterly.md"],
      },
    ],
    composing: null,
    round: 3,
    lastSpeakers: [],
    // Both are out of grounds — the room only moves again if the user breaks
    // the tie, which is what 조율 중 means.
    script: {
      claude: [{ grounds: false }],
      codex: [{ grounds: false }],
    },
  },
  {
    id: "D-01",
    title: "태스크 제목 자동 생성을 어느 시점에 할지",
    status: "closed",
    revision: 40,
    summaryVersion: 12,
    lastEntryRef: 8,
    createdAt: ago(80 * HOUR),
    updatedAt: ago(52 * HOUR),
    repos: ["ai-task-router"],
    participants: [
      { agent: "claude", state: "idle" },
      { agent: "codex", state: "idle" },
    ],
    summary: {
      facts: ["result.summary는 정제된 요약이 아니라 stdout 마지막 4000자다."],
      agreed: ["완료 시점 승격은 하지 않는다.", "리뷰 JSON에 title 필드를 추가하는 쪽을 검토한다."],
      open: [],
      decisions: ["생성 시점 제목 + 수동 rename 유지. (그저께)"],
    },
    messages: [
      {
        id: "m1",
        author: "codex",
        at: ago(60 * HOUR),
        body: "완료 시점에 result.summary로 제목을 다시 뽑는 건 성립하지 않는다.\n근거: 그 필드는 요약이 아니라 stdout 꼬리다.",
        entryRef: 8,
        sources: ["apps/server/src/tasks/task-executor.ts"],
      },
    ],
    composing: null,
    round: 4,
    lastSpeakers: [],
    script: {},
  },
];

export function findDiscussion(id: string): Discussion | undefined {
  return MOCK_DISCUSSIONS.find((d) => d.id === id);
}
