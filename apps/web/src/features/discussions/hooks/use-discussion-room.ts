"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentName } from "@/features/tasks/types";
import { AGENT_LABEL } from "@/features/tasks/workflow-labels";
import {
  applyOutcomes,
  nextStatus,
  planRound,
  resolveTurn,
  statusAfterDecision,
  EMPTY_DIRECTIVE,
  type RoundPlan,
  type TurnOutcome,
} from "../turn-engine";
import { classifyUtterance, contentOf, parseDirective } from "../utterance";
import { COMPOSE_STAGES, type ComposeStage, type Discussion, type ScriptedTurn } from "../types";

/**
 * Runs rounds in the browser so the turn rules can be watched instead of read.
 *
 * Everything the real system would decide on a server happens here against the
 * room's hand-written script, with one exception that is not simulation: the
 * ordering, the two gates and the status transition all come from
 * `turn-engine.ts` unchanged. What this hook adds is time — walking each turn
 * through §7's five stages so the compose rail has something to draw, and
 * spacing the turns so a sequential round visibly goes one at a time.
 */

const STAGE_MS = 380;

interface Composing {
  agent: AgentName;
  stage: ComposeStage;
}

export interface RoomState extends Omit<Discussion, "composing"> {
  composing: Composing[];
}

/** What the Router says about a message it did not turn into a round. */
export interface Notice {
  tone: "muted" | "warning";
  text: string;
}

function nextId(): string {
  return `m${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
}

export function useDiscussionRoom(initial: Discussion) {
  const [state, setState] = useState<RoomState>(() => ({
    ...initial,
    composing: initial.composing ? [initial.composing] : [],
  }));
  const [plan, setPlan] = useState<RoundPlan | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // The script queues live in a ref, not in state. Consuming a turn is a side
  // effect, and a state updater has to stay pure — React calls it twice in
  // development, which would burn two scripted turns per round and
  // double-count who spoke.
  const script = useRef<Discussion["script"]>({ ...initial.script });

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const wait = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      timers.current.push(setTimeout(resolve, ms));
    });
  }, []);

  const running = plan !== null;

  const runRound = useCallback(
    async (roundPlan: RoundPlan) => {
      setPlan(roundPlan);
      // A parallel round advances everyone together; a sequential one takes
      // the participants one at a time, which is the only visible difference
      // between the first round and the rest.
      const groups = roundPlan.parallel ? [roundPlan.order] : roundPlan.order.map((a) => [a]);
      const outcomes: TurnOutcome[] = [];
      let spoke = 0;

      for (const group of groups) {
        for (const stage of COMPOSE_STAGES) {
          setState((s) => ({ ...s, composing: group.map((agent) => ({ agent, stage })) }));
          await wait(STAGE_MS);
        }

        const turns: { agent: AgentName; scripted: ScriptedTurn }[] = [];
        for (const agent of group) {
          const [head, ...rest] = script.current[agent] ?? [];
          script.current[agent] = rest;
          const scripted: ScriptedTurn = head ?? { grounds: false };
          const addressed = roundPlan.addressed.includes(agent);
          const outcome = resolveTurn({ agent, hasNewGrounds: scripted.grounds, addressed });
          outcomes.push(outcome);
          if (outcome.kind === "spoke") turns.push({ agent, scripted });
        }
        spoke += turns.length;

        // One append per spoken turn, in a fixed order. Being append-only makes
        // a write non-destructive; it does not make two concurrent writers
        // agree on order, and the order is the record. Entry numbers come off
        // the document counter rather than the script, so an anchor is never
        // handed out twice and never points at a gap.
        setState((s) => {
          let entry = s.lastEntryRef;
          const posted = turns.map(({ agent, scripted }) => {
            entry += 1;
            return {
              id: nextId(),
              author: agent,
              at: new Date().toISOString(),
              // Asked directly with nothing new, the honest answer is to say
              // so. Silence reads as a broken room, and inventing a fresh
              // argument is what the no-repetition rule forbids.
              body:
                scripted.body ??
                "새로운 근거가 없어 기존 입장을 유지한다.\n근거: 직전 발언 이후 추가된 사실·측정값이 없다.",
              entryRef: entry,
              sources: scripted.sources,
            };
          });
          return {
            ...s,
            messages: [...s.messages, ...posted],
            lastEntryRef: entry,
            revision: s.revision + posted.length,
          };
        });
      }

      setState((s) => ({
        ...s,
        composing: [],
        round: s.round + 1,
        lastSpeakers: outcomes.filter((o) => o.kind === "spoke").map((o) => o.agent),
        participants: applyOutcomes(s.participants, outcomes),
        status: nextStatus({ current: s.status, outcomes, openIssues: s.summary.open.length }),
        // The summary block goes on once, after every detail for the round has
        // landed, so it is written against a document that is no longer moving.
        revision: spoke > 0 ? s.revision + 1 : s.revision,
        summaryVersion: spoke > 0 ? s.summaryVersion + 1 : s.summaryVersion,
        updatedAt: new Date().toISOString(),
      }));

      if (outcomes.length > 0 && outcomes.every((o) => o.kind === "held")) {
        setNotice({
          tone: "warning",
          text: "전원 입장 유지 — 새 근거가 없습니다. 쟁점이 남아 있으면 조율이 필요합니다.",
        });
      }
      setPlan(null);
    },
    [wait],
  );

  const send = useCallback(
    (text: string) => {
      const raw = text.trim();
      if (!raw || running) return;

      const kind = classifyUtterance(raw);
      const directive = parseDirective(raw);
      // Routing clauses are stripped before anything is written down.
      const content = contentOf(raw);
      const recorded = content.length > 0 && kind !== "ambiguous";

      setState((s) => ({
        ...s,
        messages: [
          ...s.messages,
          { id: nextId(), author: "user", at: new Date().toISOString(), body: raw, entryRef: null },
        ],
        // A message that was nothing but an instruction earns no revision:
        // none of it reached the document, so nothing in it changed.
        revision: recorded ? s.revision + 1 : s.revision,
        updatedAt: new Date().toISOString(),
      }));

      if (kind === "ambiguous") {
        // Never infer a decision from a question. Ask, rather than record
        // something the user would later have to strike through.
        setNotice({
          tone: "warning",
          text: "결정인지 의견인지 분명하지 않습니다. 확정이면 그렇게 말해 주세요 — 그때까지는 기록하지 않습니다.",
        });
        return;
      }

      if (kind === "decision") {
        // A decision starts no round, but it is still an event the document
        // and the room have to answer for: it is appended, it forces a fresh
        // summary, and it ends 조율 중 — that state means "waiting on you",
        // and the user has just spoken.
        setState((s) => ({
          ...s,
          summary: { ...s.summary, decisions: [...s.summary.decisions, content] },
          revision: s.revision + 1,
          summaryVersion: s.summaryVersion + 1,
          status: statusAfterDecision(s.status),
        }));
        setNotice({
          tone: "muted",
          text: "사용자 결정으로 기록했습니다. 결정에는 턴이 돌지 않고, 요약과 상태를 다시 계산합니다.",
        });
        return;
      }

      const roundPlan = planRound({
        round: state.round,
        participants: state.participants,
        kind,
        directive,
        lastSpeakers: state.lastSpeakers,
      });
      if (!roundPlan) return;

      const notices: string[] = [];
      if (!recorded) notices.push("턴 지시로만 읽었습니다 — 문서에는 기록하지 않습니다.");
      if (directive.address.length > 0) {
        notices.push(
          `${directive.address.map((a) => AGENT_LABEL[a]).join(", ")}에게 직접 물었습니다 — 입장 유지 없이 답합니다.`,
        );
      }
      setNotice(notices.length > 0 ? { tone: "muted", text: notices.join(" ") } : null);
      void runRound(roundPlan);
    },
    [running, runRound, state.round, state.participants, state.lastSpeakers],
  );

  /** 계속 — another round with no new content from the user. */
  const advance = useCallback(() => {
    if (running) return;
    const roundPlan = planRound({
      round: state.round,
      participants: state.participants,
      kind: "opinion",
      directive: EMPTY_DIRECTIVE,
      lastSpeakers: state.lastSpeakers,
    });
    if (!roundPlan) return;
    setNotice(null);
    void runRound(roundPlan);
  }, [running, runRound, state.round, state.participants, state.lastSpeakers]);

  return { state, plan, notice, running, send, advance };
}
