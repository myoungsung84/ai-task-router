import crypto from "node:crypto";
import type {
  AgentName,
  Discussion,
  DiscussionListItem,
  DiscussionStatus,
  DiscussionSummary,
  DiscussionTurnView,
  Participant,
  RoundState,
  TurnOutcome,
} from "@ai-task-router/shared";
import {
  applyOutcomes,
  classifyUtterance,
  contentOf,
  nextStatus,
  parseDirective,
  planRound,
  resolveTurn,
  statusAfterDecision,
} from "@ai-task-router/shared";
import { documentStore, DocumentStoreError } from "./document-store";

/**
 * The discussion room's server side.
 *
 * Two kinds of state live here and they are kept strictly apart.
 *
 * The **record** is the append-only document, and the store owns it. Nothing
 * in this file rewrites anything; every change is one more block on the end.
 *
 * The **schedule** — whose turn it is, which round is open — is memory only.
 * It is not in the document because a document is a record of what was said,
 * not of who was about to say it, and mixing them would leave the permanent
 * file carrying rows that are meaningless the moment the process exits. A
 * restart drops the queue and hands control back to the user, which is the
 * same call `recover-interrupted.ts` makes for Tasks.
 *
 * That analogy stops at the queue, though, and the difference matters. An
 * interrupted Task is recoverable because RUNNING → FAILED is reversible; an
 * append is not, since removing one is the single thing this format forbids.
 * So a round that was interrupted after an entry landed must never be replayed
 * blindly: every write carries an idempotency key, the log is its own record
 * of which keys have been used, and a room whose round was cut short is shown
 * as 재개 필요 rather than quietly restarted.
 *
 * The AIs are not driven from here. They participate by pull — a Claude or
 * Codex session asks whether it is its turn and submits when it has one —
 * which is what the proposal's entry point actually describes and keeps the
 * Router from having to own an agent's lifecycle to have a conversation.
 */

export class DiscussionServiceError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

interface OpenRound extends RoundState {
  /** Outcomes gathered so far this round. */
  outcomes: TurnOutcome[];
}

interface RoomRuntime {
  round: number;
  lastSpeakers: AgentName[];
  open: OpenRound | null;
  /** A round was open when the process last stopped, or a turn was abandoned. */
  needsResume: boolean;
}

const DEFAULT_PARTICIPANTS: Participant[] = [
  { agent: "claude", state: "idle" },
  { agent: "codex", state: "idle" },
];

function idem(...parts: (string | number)[]): string {
  return crypto.createHash("sha1").update(parts.join(":")).digest("hex").slice(0, 16);
}

export class DiscussionService {
  private runtime = new Map<string, RoomRuntime>();

  init(): void {
    documentStore.init();
    // Every room the store knows about starts with an empty schedule. Rooms
    // are not marked 재개 필요 here: nothing was interrupted from this
    // process's point of view, and claiming otherwise on every boot would make
    // the badge meaningless.
    for (const roomId of documentStore.list()) {
      this.runtime.set(roomId, { round: 1, lastSpeakers: [], open: null, needsResume: false });
    }
  }

  private rt(roomId: string): RoomRuntime {
    let r = this.runtime.get(roomId);
    if (!r) {
      r = { round: 1, lastSpeakers: [], open: null, needsResume: false };
      this.runtime.set(roomId, r);
    }
    return r;
  }

  private load(roomId: string): Discussion {
    let doc: Discussion | null;
    try {
      doc = documentStore.read(roomId);
    } catch (err) {
      if (err instanceof DocumentStoreError) throw new DiscussionServiceError(err.message, 400);
      throw err;
    }
    if (!doc) throw new DiscussionServiceError(`논의를 찾을 수 없습니다: ${roomId}`, 404);
    const r = this.rt(roomId);
    return { ...doc, round: r.round, lastSpeakers: r.lastSpeakers };
  }

  private nextRoomId(): string {
    const used = documentStore
      .list()
      .map((id) => Number(/^D-(\d+)$/.exec(id)?.[1] ?? NaN))
      .filter((n) => Number.isFinite(n));
    return `D-${(used.length > 0 ? Math.max(...used) : 0) + 1}`;
  }

  list(): DiscussionListItem[] {
    return documentStore
      .list()
      .map((roomId) => {
        try {
          return this.load(roomId);
        } catch {
          return null;
        }
      })
      .filter((d): d is Discussion => d !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ messages: _messages, ...rest }) => rest);
  }

  get(roomId: string): Discussion {
    return this.load(roomId);
  }

  /** The file itself — this is what an AI reads before it answers. */
  document(roomId: string): string {
    this.load(roomId);
    return documentStore.raw(roomId);
  }

  turnView(roomId: string): DiscussionTurnView {
    const r = this.rt(roomId);
    const { outcomes: _outcomes, ...round } = r.open ?? { outcomes: [] as TurnOutcome[] };
    return {
      round: r.open ? (round as RoundState) : null,
      needsResume: r.needsResume,
    };
  }

  async create(input: {
    title: string;
    repos: string[];
    summary?: Partial<DiscussionSummary>;
    participants?: AgentName[];
  }): Promise<Discussion> {
    const title = input.title.trim();
    if (!title) throw new DiscussionServiceError("논의 제목이 필요합니다.");
    // A discussion spans as many repositories as its question does, so this is
    // a list and not a project field — but it may not be empty, because it is
    // also the boundary of what the AIs are allowed to read.
    const repos = input.repos.map((r) => r.trim()).filter(Boolean);
    if (repos.length === 0) {
      throw new DiscussionServiceError("관련 저장소를 하나 이상 등록해야 합니다.");
    }

    const roomId = this.nextRoomId();
    const participants: Participant[] = (input.participants ?? ["claude", "codex"]).map(
      (agent) => ({
        agent,
        state: "idle",
      }),
    );

    await documentStore.appendMeta(
      roomId,
      {
        title,
        status: "active",
        repos,
        participants: participants.length > 0 ? participants : DEFAULT_PARTICIPANTS,
      },
      idem("meta", roomId, "create"),
    );
    await documentStore.appendSummary(
      roomId,
      {
        facts: input.summary?.facts ?? [],
        agreed: input.summary?.agreed ?? [],
        open: input.summary?.open ?? [],
        decisions: [],
      },
      idem("summary", roomId, "create"),
    );

    this.runtime.set(roomId, { round: 1, lastSpeakers: [], open: null, needsResume: false });
    return this.load(roomId);
  }

  /**
   * Records something the user said and, if it warrants one, opens a round.
   *
   * The message is split before anything is written: the discussion content
   * goes into the document and the turn instructions do not. Recording "코덱스가
   * 먼저" as a 사용자 의견 would put a line in the record that no later reader
   * can act on.
   */
  async postUserMessage(
    roomId: string,
    text: string,
  ): Promise<{ discussion: Discussion; kind: string; plan: RoundState | null; notice?: string }> {
    const doc = this.load(roomId);
    if (doc.status === "closed") throw new DiscussionServiceError("종료된 논의입니다.", 409);

    const raw = text.trim();
    if (!raw) throw new DiscussionServiceError("메시지가 비어 있습니다.");

    const kind = classifyUtterance(raw);
    const directive = parseDirective(raw);
    const content = contentOf(raw);

    if (kind === "ambiguous") {
      // Never infer a decision from a question. Ask, rather than record
      // something the user would later have to strike through.
      return {
        discussion: doc,
        kind,
        plan: null,
        notice: "결정인지 의견인지 분명하지 않습니다. 확정이면 그렇게 말해 주세요.",
      };
    }

    if (content) {
      await documentStore.appendUser(
        roomId,
        kind === "decision" ? "decision" : "opinion",
        content,
        idem("user", roomId, doc.revision, content),
      );
    }

    if (kind === "decision") {
      // A decision starts no round, but it is not a no-op: it is appended, it
      // forces a fresh summary, and it ends 조율 중 — that state means the room
      // is waiting on the user, and the user has just spoken.
      const summary: DiscussionSummary = {
        ...doc.summary,
        decisions: [...doc.summary.decisions, content],
      };
      await documentStore.appendSummary(roomId, summary, idem("summary", roomId, doc.revision + 1));
      const status = statusAfterDecision(doc.status);
      if (status !== doc.status) await this.writeStatus(roomId, status);
      return {
        discussion: this.load(roomId),
        kind,
        plan: null,
        notice: "사용자 결정으로 기록했습니다. 결정에는 턴이 돌지 않습니다.",
      };
    }

    const r = this.rt(roomId);
    const plan = planRound({
      round: r.round,
      participants: doc.participants,
      kind,
      directive,
      lastSpeakers: r.lastSpeakers,
    });
    if (!plan) return { discussion: this.load(roomId), kind, plan: null };

    r.open = {
      roundId: `${roomId}-r${r.round}-${Date.now().toString(36)}`,
      round: plan.round,
      parallel: plan.parallel,
      queue: [...plan.order],
      addressed: plan.addressed,
      reason: plan.reason,
      startedAt: new Date().toISOString(),
      claimed: [],
      outcomes: [],
    };
    r.needsResume = false;

    const { outcomes: _o, ...state } = r.open;
    return {
      discussion: this.load(roomId),
      kind,
      plan: state as RoundState,
      notice: content ? undefined : "턴 지시로만 읽었습니다 — 문서에는 기록하지 않습니다.",
    };
  }

  /** Opens another round with nothing new from the user. */
  advance(roomId: string): RoundState | null {
    const doc = this.load(roomId);
    if (doc.status === "closed") throw new DiscussionServiceError("종료된 논의입니다.", 409);
    const r = this.rt(roomId);
    if (r.open) return this.turnView(roomId).round;

    const plan = planRound({
      round: r.round,
      participants: doc.participants,
      kind: "opinion",
      directive: { order: [], only: [], address: [] },
      lastSpeakers: r.lastSpeakers,
    });
    if (!plan) return null;

    r.open = {
      roundId: `${roomId}-r${r.round}-${Date.now().toString(36)}`,
      round: plan.round,
      parallel: plan.parallel,
      queue: [...plan.order],
      addressed: plan.addressed,
      reason: plan.reason,
      startedAt: new Date().toISOString(),
      claimed: [],
      outcomes: [],
    };
    r.needsResume = false;
    return this.turnView(roomId).round;
  }

  /**
   * What an agent asks before it does anything: is it my turn, and against
   * which revision am I reading?
   *
   * The revision comes back with the answer so the agent can hand it to
   * `submitTurn` — the check that nothing landed underneath it while it was
   * thinking.
   */
  claimTurn(
    roomId: string,
    agent: AgentName,
  ): {
    yourTurn: boolean;
    roundId: string | null;
    revision: number;
    addressed: boolean;
    reason: string | null;
  } {
    const doc = this.load(roomId);
    const r = this.rt(roomId);
    const open = r.open;
    if (!open) {
      return {
        yourTurn: false,
        roundId: null,
        revision: doc.revision,
        addressed: false,
        reason: null,
      };
    }
    // A parallel round lets everyone still queued go at once; a sequential one
    // only the agent at the head.
    const yourTurn = open.parallel ? open.queue.includes(agent) : open.queue[0] === agent;
    // Recorded so the room can show that this agent went to the document
    // before answering — the one part of a turn the Router can actually see.
    if (yourTurn && !open.claimed.includes(agent)) open.claimed.push(agent);
    return {
      yourTurn,
      roundId: open.roundId,
      revision: doc.revision,
      addressed: open.addressed.includes(agent),
      reason: open.reason,
    };
  }

  /**
   * Takes one agent's turn.
   *
   * `grounds: false` is a held position and writes nothing — that is the whole
   * point of the gate, and a hold that appended a block would grow the file
   * with the fact that nothing happened. Being addressed directly overrides the
   * gate, and an agent with nothing new then has to say so rather than either
   * going silent or inventing an argument.
   *
   * `baseRevision` is the conflict check. It is advisory rather than fatal for
   * a detail append, because two details never contend — each is its own block
   * and neither touches the other. It matters for what the agent *concluded*,
   * so a mismatch comes back in the result and the agent decides whether to
   * re-read.
   */
  async submitTurn(
    roomId: string,
    input: {
      agent: AgentName;
      grounds: boolean;
      body?: string;
      sources?: string[];
      baseRevision?: number;
      summaryDelta?: Partial<DiscussionSummary>;
    },
  ): Promise<{
    discussion: Discussion;
    outcome: TurnOutcome;
    stale: boolean;
    roundClosed: boolean;
  }> {
    const doc = this.load(roomId);
    if (doc.status === "closed") throw new DiscussionServiceError("종료된 논의입니다.", 409);

    const r = this.rt(roomId);
    const open = r.open;
    if (!open) throw new DiscussionServiceError("진행 중인 라운드가 없습니다.", 409);

    const allowed = open.parallel
      ? open.queue.includes(input.agent)
      : open.queue[0] === input.agent;
    if (!allowed) throw new DiscussionServiceError(`${input.agent}의 차례가 아닙니다.`, 409);

    const addressed = open.addressed.includes(input.agent);
    const outcome = resolveTurn({
      agent: input.agent,
      hasNewGrounds: input.grounds,
      addressed,
    });
    const stale = input.baseRevision !== undefined && input.baseRevision !== doc.revision;

    if (outcome.kind === "spoke") {
      const body =
        input.body?.trim() ||
        "새로운 근거가 없어 기존 입장을 유지한다.\n근거: 직전 발언 이후 추가된 사실·측정값이 없다.";
      // Keyed on the round and the agent, so a retry after a crash between the
      // append and the acknowledgement returns the original entry instead of
      // writing the same opinion twice.
      await documentStore.appendDetail(
        roomId,
        { agent: input.agent, body, sources: input.sources, roundId: open.roundId },
        idem("detail", roomId, open.roundId, input.agent),
      );
    }

    open.outcomes.push(outcome);
    open.queue = open.queue.filter((a) => a !== input.agent);

    let roundClosed = false;
    if (open.queue.length === 0) {
      await this.closeRound(roomId, open, input.summaryDelta);
      roundClosed = true;
    }

    return { discussion: this.load(roomId), outcome, stale, roundClosed };
  }

  /**
   * Ends a round: one summary block, appended after every detail has landed.
   *
   * The Router writes it rather than whichever agent happened to finish last,
   * so it is written against a document that is no longer moving. The content
   * still comes from whoever has the judgment — an agent may hand up a delta
   * with its turn — because the Router can order writes but cannot decide what
   * is now agreed.
   */
  private async closeRound(
    roomId: string,
    open: OpenRound,
    delta?: Partial<DiscussionSummary>,
  ): Promise<void> {
    const doc = this.load(roomId);
    const r = this.rt(roomId);
    const spoke = open.outcomes.filter((o) => o.kind === "spoke");

    if (spoke.length > 0 || delta) {
      const summary: DiscussionSummary = {
        facts: delta?.facts ?? doc.summary.facts,
        agreed: delta?.agreed ?? doc.summary.agreed,
        open: delta?.open ?? doc.summary.open,
        decisions: delta?.decisions ?? doc.summary.decisions,
      };
      await documentStore.appendSummary(roomId, summary, idem("summary", roomId, open.roundId));
    }

    const after = this.load(roomId);
    const status = nextStatus({
      current: after.status,
      outcomes: open.outcomes,
      openIssues: after.summary.open.length,
    });
    const participants = applyOutcomes(after.participants, open.outcomes);
    await this.writeMeta(roomId, {
      title: after.title,
      status,
      repos: after.repos,
      participants,
    });

    r.round += 1;
    r.lastSpeakers = spoke.map((o) => o.agent);
    r.open = null;
    r.needsResume = false;
  }

  /** Abandons an open round without replaying anything already written. */
  abandonRound(roomId: string): void {
    const r = this.rt(roomId);
    if (!r.open) return;
    r.open = null;
    // Visible rather than silent: a round that stopped without finishing does
    // not resume on its own, and the same reasoning that makes 조율 중 a badge
    // applies here.
    r.needsResume = true;
  }

  async setStatus(roomId: string, status: DiscussionStatus): Promise<Discussion> {
    this.load(roomId);
    await this.writeStatus(roomId, status);
    return this.load(roomId);
  }

  private async writeStatus(roomId: string, status: DiscussionStatus): Promise<void> {
    const doc = this.load(roomId);
    await this.writeMeta(roomId, {
      title: doc.title,
      status,
      repos: doc.repos,
      participants: doc.participants,
    });
  }

  private async writeMeta(
    roomId: string,
    meta: {
      title: string;
      status: DiscussionStatus;
      repos: string[];
      participants: Participant[];
    },
  ): Promise<void> {
    const doc = this.load(roomId);
    await documentStore.appendMeta(roomId, meta, idem("meta", roomId, doc.revision, meta.status));
  }

  /** Adds a repository to the investigation scope, keeping the room as one record. */
  async addRepo(roomId: string, repo: string): Promise<Discussion> {
    const doc = this.load(roomId);
    const next = repo.trim();
    if (!next) throw new DiscussionServiceError("저장소 이름이 비어 있습니다.");
    if (doc.repos.includes(next)) return doc;
    await this.writeMeta(roomId, {
      title: doc.title,
      status: doc.status,
      repos: [...doc.repos, next],
      participants: doc.participants,
    });
    return this.load(roomId);
  }
}

export const discussionService = new DiscussionService();
