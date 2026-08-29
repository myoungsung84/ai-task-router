import type { AgentName } from "./types";
import type { DiscussionStatus, Participant } from "./discussion";

/**
 * Whose turn it is, and whether there should be a turn at all.
 *
 * Pure functions with no I/O, and shared rather than duplicated per caller:
 * the browser runs them to show a round and the server runs them to schedule
 * one, and two copies of a rule about who may speak would drift into two
 * different rooms.
 *
 * Two rules from the proposal do the work, read as turn rules rather than as
 * the content rules they are written as.
 *
 * The first splits what the user said into 의견 and 결정. A 결정 is not
 * something to debate, so it starts no round at all — without that, announcing
 * a decision draws one agreeable sentence per participant, which is precisely
 * the groundless agreement the proposal forbids, arriving on cue.
 *
 * The second says an AI with no new fact, code, measurement or logic holds its
 * position instead of restating it. That is a gate on speaking, and it is what
 * lets a round be run unconditionally: everyone is asked, and whoever has
 * nothing goes quiet. Silence costs no vertical space because 입장 유지 lives
 * on the character, not in the stream.
 *
 * The round boundary is the loop breaker. An AI turn never triggers another AI
 * turn; a round is one pass over the participants and then control is back
 * with the user. Anyone who wants the counter-rebuttal asks for another round,
 * which is a cheap way to keep a person inside a loop that would otherwise run
 * on its own.
 */

/** The user-utterance split, plus the case where the Router has to ask. */
export type UtteranceKind = "opinion" | "decision" | "ambiguous";

/**
 * Turn control the user spoke rather than clicked — the room has no
 * 채택/반박/동의 buttons and turn-taking is no different.
 *
 * `order` and `only` shape the round but leave the 입장 유지 gate standing:
 * naming who goes first does not create something for them to say. `address`
 * is the one that opens it, because being asked directly and answered with
 * silence reads as a broken room rather than as a held position.
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
  /** Gate 2 is skipped for these. */
  addressed: AgentName[];
  /** Shown in the room so the ordering never looks arbitrary. */
  reason: string;
}

export type TurnOutcome = { agent: AgentName; kind: "spoke" } | { agent: AgentName; kind: "held" };

/**
 * Plans the round a user message should start, or `null` for the messages that
 * should start none.
 *
 * The first round is parallel and every later one sequential, and the asymmetry
 * is deliberate. On the first round there is no prior opinion to engage with,
 * so ordering buys nothing and costs the only unanchored reading anyone gets —
 * two AIs answering the same document without having seen each other's answer.
 * From the second round on, each AI is meant to judge from the document as the
 * previous one left it, which requires an order.
 *
 * Note that parallel applies to judgment only. Appends are serialised
 * regardless: being append-only makes a write non-destructive, not concurrent.
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

  // A decision is recorded, not debated; an unclear message is asked about
  // before anything is written down.
  if (kind === "decision" || kind === "ambiguous") return null;

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
    // Rotate away from whoever just spoke so one participant cannot lead every
    // round. No judgment involved, which keeps it predictable.
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
 * Gate 2. `hasNewGrounds` is the agent's own judgment — new fact, code,
 * measurement or logic since it last spoke. Being addressed directly overrides
 * it.
 */
export function resolveTurn(args: {
  agent: AgentName;
  hasNewGrounds: boolean;
  addressed: boolean;
}): TurnOutcome {
  return { agent: args.agent, kind: args.hasNewGrounds || args.addressed ? "spoke" : "held" };
}

/**
 * Where the room lands once a round finishes.
 *
 * Everyone holding with questions still open is the definition of a discussion
 * that has stopped moving on its own, and the only state here a person has to
 * break. It is the discussion side of 확인 필요.
 *
 * Nothing here ever returns "closed": ending a discussion belongs to the user.
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
  // Someone moved, so whatever deadlock there was is over.
  if (!allHeld) return "active";
  return current;
}

/**
 * Where the room lands once a 사용자 결정 is recorded.
 *
 * A decision starts no round, and a first pass therefore left the status alone
 * — which stranded any room sitting at 조율 중. That state means the AIs have
 * stopped and this is waiting on you, so the user speaking is exactly the
 * event that ends it. Open questions may well remain; the room is simply no
 * longer stalled, and leaving the badge up would ask the user for something
 * they have already given.
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
      : { ...p, state: "idle" as const, holdingSince: null };
  });
}
