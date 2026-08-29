import type { AgentName } from "@/features/tasks/types";
import type { DiscussionStatus, Participant } from "./types";

/**
 * Whose turn it is, and whether there should be a turn at all.
 *
 * Pure functions with no I/O, because the rules here are the part worth being
 * able to reason about on their own: everything else in a discussion is text
 * moving between a file and a screen, but this decides when an AI is allowed
 * to speak — and getting it wrong produces either a room that will not stop
 * talking or one that will not start.
 *
 * Two rules from the proposal do the work, read as turn rules rather than as
 * the content rules they are written as.
 *
 * §6 splits what the user said into 의견 and 결정. A 결정 is not something to
 * debate, so it starts no round at all — without that, announcing a decision
 * draws one "네, 합리적입니다" per participant, which is precisely the
 * groundless agreement §2 forbids, arriving on cue.
 *
 * §2 says an AI with no new fact, code, measurement or logic holds its
 * position instead of restating it. That is a gate on speaking, and it is what
 * lets a round be run unconditionally: everyone is asked, and whoever has
 * nothing goes quiet. Silence costs no vertical space because 입장 유지 lives
 * on the character, not in the stream.
 *
 * The round boundary is the loop breaker. An AI's turn never triggers another
 * AI's turn; a round is one pass over the participants and then control is
 * back with the user. Anyone who wants the counter-rebuttal types 계속, which
 * is a cheap way to keep a person in a loop that would otherwise run on its
 * own.
 */

/** §6's split, plus the case where the Router has to ask. */
export type UtteranceKind = "opinion" | "decision" | "ambiguous";

/**
 * Turn control the user spoke rather than clicked (§2 keeps the room free of
 * 채택/반박/동의 buttons, and turn-taking is no different).
 *
 * `order` and `only` shape the round but leave the 입장 유지 gate standing —
 * naming who goes first does not create something for them to say. `address`
 * is the one that opens it: being asked directly and answered with silence
 * reads as a broken room, not as a held position.
 */
export interface TurnDirective {
  order: AgentName[];
  only: AgentName[];
  address: AgentName[];
}

export const EMPTY_DIRECTIVE: TurnDirective = { order: [], only: [], address: [] };

export interface RoundPlan {
  round: number;
  /** The first round runs everyone at once; later rounds go one at a time. */
  parallel: boolean;
  order: AgentName[];
  /** Gate 2 is skipped for these — the user asked them directly. */
  addressed: AgentName[];
  /** Shown in the room so the ordering never looks arbitrary. */
  reason: string;
}

export type TurnOutcome = { agent: AgentName; kind: "spoke" } | { agent: AgentName; kind: "held" };

/**
 * Plans the round a user message should start, or `null` for the messages that
 * should start none.
 *
 * The first round is parallel and every later one is sequential, and the
 * asymmetry is deliberate. On the first round there is no prior opinion to
 * engage with, so ordering buys nothing and costs the only unanchored reading
 * anyone will get — two AIs answering the same document without having seen
 * each other's answer. It is also free: the document is append-only and each
 * AI appends its own entry, so simultaneous writers do not collide (only the
 * 요약 block, which the Router owns, ever needs serialising). From the second
 * round on, §2 wants each AI judging from the document as the previous one
 * left it, which requires an order.
 */
export function planRound(args: {
  round: number;
  participants: Participant[];
  kind: UtteranceKind;
  directive: TurnDirective;
  /** Who actually spoke last round — the default ordering rotates away from them. */
  lastSpeakers: AgentName[];
}): RoundPlan | null {
  const { round, participants, kind, directive, lastSpeakers } = args;

  // A decision is recorded, not debated.
  if (kind === "decision") return null;
  // The Router asks before it does anything else (§6).
  if (kind === "ambiguous") return null;

  const present = participants.map((p) => p.agent);
  const pool =
    directive.only.length > 0 ? present.filter((a) => directive.only.includes(a)) : present;
  if (pool.length === 0) return null;

  const parallel = round === 1;

  let order: AgentName[];
  let reason: string;

  if (directive.order.length > 0) {
    // What the user said wins over the default rotation.
    const named = directive.order.filter((a) => pool.includes(a));
    order = [...named, ...pool.filter((a) => !named.includes(a))];
    reason = "사용자가 순서를 지정함";
  } else if (parallel) {
    order = pool;
    reason = "첫 라운드 — 서로 읽지 않고 각자 답함";
  } else {
    // Rotate away from whoever just spoke, so one participant cannot lead
    // every round. No judgment involved, which keeps it predictable.
    const quiet = pool.filter((a) => !lastSpeakers.includes(a));
    order = [...quiet, ...pool.filter((a) => lastSpeakers.includes(a))];
    reason = quiet.length > 0 ? "직전 라운드에 발언하지 않은 쪽 먼저" : "등록 순서";
  }

  return {
    round,
    parallel,
    order,
    addressed: directive.address.filter((a) => order.includes(a)),
    reason: directive.only.length > 0 ? `${reason} · 참여자 제한` : reason,
  };
}

/**
 * Gate 2. `hasNewGrounds` is the agent's own judgment in the real system — new
 * fact, code, measurement or logic since it last spoke. Being addressed
 * directly overrides it.
 */
export function resolveTurn(args: {
  agent: AgentName;
  hasNewGrounds: boolean;
  addressed: boolean;
}): TurnOutcome {
  const speak = args.hasNewGrounds || args.addressed;
  return { agent: args.agent, kind: speak ? "spoke" : "held" };
}

/**
 * Where the room lands once a round finishes.
 *
 * Everyone holding with questions still open is the definition of a discussion
 * that has stopped moving on its own — §2's 합의되지 않는 쟁점은 사용자 조율이
 * 필요한 항목, and the only state here that a person has to break. It is the
 * discussion side's 확인 필요.
 *
 * Nothing here ever returns "closed": §9 gives that to the user alone.
 */
export function nextStatus(args: {
  current: DiscussionStatus;
  outcomes: TurnOutcome[];
  openIssues: number;
}): DiscussionStatus {
  const { current, outcomes, openIssues } = args;
  if (current === "closed") return "closed";
  if (outcomes.length === 0) return current;

  const allHeld = outcomes.every((o) => o.kind === "held");
  if (allHeld && openIssues > 0) return "mediating";
  // Someone moved — whatever deadlock there was is over.
  if (!allHeld) return "active";
  return current;
}

/**
 * Where the room lands once a 사용자 결정 is recorded.
 *
 * A decision starts no round (gate 1), and a first pass therefore left the
 * status alone — which stranded any room sitting at 조율 중. That state means
 * "the AIs have stopped and this is waiting on you", so the user speaking is
 * exactly the event that ends it. Open questions may well remain; the room is
 * simply no longer stalled, and leaving the badge up would ask the user for
 * something they have already given.
 */
export function statusAfterDecision(current: DiscussionStatus): DiscussionStatus {
  if (current === "closed") return "closed";
  if (current === "mediating") return "active";
  return current;
}

/** Participant states implied by a finished round, so the characters reflect it. */
export function applyOutcomes(participants: Participant[], outcomes: TurnOutcome[]): Participant[] {
  return participants.map((p) => {
    const outcome = outcomes.find((o) => o.agent === p.agent);
    if (!outcome) return p;
    return outcome.kind === "held"
      ? { ...p, state: "holding" as const, holdingSince: new Date().toISOString() }
      : { ...p, state: "idle" as const, holdingSince: undefined };
  });
}
