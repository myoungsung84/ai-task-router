import type { AgentName } from "@/features/tasks/types";
import { EMPTY_DIRECTIVE, type TurnDirective, type UtteranceKind } from "./turn-engine";

/**
 * Reads a user message for the two things the Router has to know about it:
 * whether it is an 의견, a 결정 or too unclear to treat as either (§6), and
 * whether it carries turn control.
 *
 * **The classifier is a stand-in.** In the built system it belongs to the
 * discussion skill, where the criteria are still open (§11-3), and getting it
 * wrong there is expensive: §6 forbids inferring a decision from silence, a
 * question or plain agreement, and a decision recorded by mistake has to be
 * struck through rather than removed. Keyword matching is enough to drive the
 * screen and is meant to be deleted.
 *
 * The split is not a stand-in. A message can be both content and instruction —
 *
 *   "재생성 비용이 더 클 것 같은데, 코덱스가 먼저 봐줘"
 *
 * — and the halves go to different places: the opinion is appended to the
 * document, the ordering goes to the turn queue and is never written down.
 * Recording it would fill 사용자 의견 with lines like "코덱스가 먼저 발언했으면
 * 한다", which is not an opinion about anything under discussion.
 */

const AGENT_WORDS: { agent: AgentName; words: string[] }[] = [
  { agent: "claude", words: ["클로드", "claude"] },
  { agent: "codex", words: ["코덱스", "코덱", "codex"] },
];

/** Phrases that make a message a 결정 rather than an 의견. */
const DECISION_MARKERS = [
  "이걸로 하자",
  "이걸로 가자",
  "이걸로 결정",
  "그렇게 하자",
  "그렇게 가자",
  "그대로 가자",
  "계획대로 가자",
  "확정",
  "결정할게",
  "결정한다",
  "정했",
  "채택한다",
  "제외한다",
  "안 하기로",
];

/**
 * Hedges that turn an apparent decision back into something to ask about. §6
 * is explicit that a question is not a decision, and this is what keeps
 * `ambiguous` a state the Router actually reaches rather than a case that
 * exists only in the type.
 */
const HEDGE_MARKERS = ["?", "할까", "될까", "괜찮을까", "어떨까", "아마", "일단은", "같기도"];

/** Being asked directly — the only thing that opens the 입장 유지 gate. */
const ADDRESS_MARKERS = [
  "어떻게 생각",
  "의견 줘",
  "의견줘",
  "의견 좀",
  "봐줘",
  "말해봐",
  "답해",
  "어때",
];

const FIRST_MARKERS = ["먼저", "우선", "첫", "스타트"];
const ONLY_MARKERS = ["만 ", "만봐", "만 봐", "만 답", "혼자"];

const DIRECTIVE_MARKERS = [...FIRST_MARKERS, ...ONLY_MARKERS, ...ADDRESS_MARKERS];

function mentioned(text: string): AgentName[] {
  const found: AgentName[] = [];
  for (const { agent, words } of AGENT_WORDS) {
    if (words.some((w) => text.includes(w))) found.push(agent);
  }
  return found;
}

export function classifyUtterance(text: string): UtteranceKind {
  const t = text.toLowerCase();
  const decisive = DECISION_MARKERS.some((m) => t.includes(m));
  if (!decisive) return "opinion";
  // "이걸로 갈까?" is a question about a decision, not one. §6: the Router asks
  // rather than recording it and making the user strike it through later.
  if (HEDGE_MARKERS.some((m) => t.includes(m))) return "ambiguous";
  return "decision";
}

export function parseDirective(text: string): TurnDirective {
  const t = text.toLowerCase();
  const named = mentioned(t);
  if (named.length === 0) return EMPTY_DIRECTIVE;

  const wantsFirst = FIRST_MARKERS.some((m) => t.includes(m));
  const wantsOnly = ONLY_MARKERS.some((m) => t.includes(m));
  const wantsAnswer = ADDRESS_MARKERS.some((m) => t.includes(m));

  return {
    order: wantsFirst ? named : [],
    only: wantsOnly ? named : [],
    // Naming someone *and* asking them something is an address; naming them to
    // set the order is not, which is why 먼저 wins when both appear.
    address: wantsAnswer && !wantsFirst ? named : [],
  };
}

/** Splits on the boundaries a Korean sentence actually uses for this. */
function segments(text: string): string[] {
  return text
    .split(/[,·]|(?<=[.!?])\s+/)
    .map((seg) => seg.trim())
    .filter(Boolean);
}

/** A clause that only routes the turn — an agent named next to an instruction about when or whether it speaks. */
function isDirectiveOnly(segment: string): boolean {
  const t = segment.toLowerCase();
  return mentioned(t).length > 0 && DIRECTIVE_MARKERS.some((m) => t.includes(m));
}

/**
 * What the Router writes into the document: the message with its routing
 * clauses removed.
 *
 * Returns an empty string when the message was nothing but an instruction —
 * "코덱스가 먼저 봐줘" is a thing to do, not a thing anyone said about the
 * subject, and appending it would put a line in 사용자 의견 that no later
 * reader can act on. The room still shows it in the chat; the document simply
 * does not gain a revision for it.
 */
export function contentOf(text: string): string {
  const kept = segments(text).filter((seg) => !isDirectiveOnly(seg));
  return kept.join(", ").trim();
}
