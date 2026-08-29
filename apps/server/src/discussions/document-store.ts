import fs from "node:fs";
import path from "node:path";
import type {
  AgentName,
  Discussion,
  DiscussionMessage,
  DiscussionStatus,
  DiscussionSummary,
  Participant,
} from "@ai-task-router/shared";
import { EMPTY_SUMMARY } from "@ai-task-router/shared";
import { config } from "../config";

/**
 * The discussion document: one append-only markdown file per room.
 *
 * Nothing here ever rewrites or removes a line. That single constraint is what
 * the rest of the design leans on — an entry keeps its number forever, so a
 * chat message can cite it permanently, and the change history is the file
 * rather than a second structure that has to be kept honest. It is also what
 * makes one particular mistake expensive: a duplicate append cannot be taken
 * back, which is why every write carries an idempotency key.
 *
 * The file is the record, not a rendering of one. There is no JSON copy to
 * drift out of sync; the reader below folds the log up into a `Discussion`.
 * Each block carries a machine-readable header comment followed by ordinary
 * markdown, so the same file is what an agent reads, what git diffs, and what
 * this parser consumes.
 *
 * Writes are serialised per room. Append-only makes a write non-destructive;
 * it does not make two concurrent writers agree on an order, and the order is
 * the record.
 */

const HEADER = "<!-- entry: ";
const HEADER_END = " -->";
const ROOM_ID = /^[A-Za-z0-9_-]{1,64}$/;
// Written as a code point rather than an escape: this file is edited by tools
// often enough that a lone backslash has already been eaten once.
const NEWLINE = String.fromCharCode(10);

export type BlockKind = "meta" | "detail" | "user" | "summary";

interface BaseHeader {
  kind: BlockKind;
  /** The document revision once this block is in it. Equal to the block count. */
  seq: number;
  at: string;
  /**
   * Set by the caller so a retry after a crash is a no-op. The log is its own
   * idempotency record — there is nowhere else a key could live that would
   * survive the same failure the key exists to survive.
   */
  idem?: string;
}

interface MetaHeader extends BaseHeader {
  kind: "meta";
  title: string;
  status: DiscussionStatus;
  repos: string[];
  participants: Participant[];
}

interface DetailHeader extends BaseHeader {
  kind: "detail";
  agent: AgentName;
  /** Permanent anchor. Assigned by the document, never chosen by the writer. */
  entryRef: number;
  sources?: string[];
  roundId?: string;
}

interface UserHeader extends BaseHeader {
  kind: "user";
  role: "opinion" | "decision";
}

interface SummaryHeader extends BaseHeader {
  kind: "summary";
  summaryVersion: number;
  summary: DiscussionSummary;
}

type Header = MetaHeader | DetailHeader | UserHeader | SummaryHeader;

interface Block {
  header: Header;
  body: string;
}

export class DocumentStoreError extends Error {}

export interface AppendResult {
  header: Header;
  /** True when the idempotency key matched an entry that was already there. */
  duplicate: boolean;
}

export class DiscussionDocumentStore {
  private root: string;
  /** One promise chain per room — the serialiser. */
  private writeChains = new Map<string, Promise<unknown>>();

  constructor(root: string = config.discussionsDir) {
    this.root = path.resolve(root);
  }

  init(): void {
    fs.mkdirSync(this.root, { recursive: true });
  }

  /**
   * Resolves a room file inside the permitted root and refuses anything that
   * lands outside it. Room ids become file names, so they may not contain
   * anything that could climb out.
   */
  private filePath(roomId: string): string {
    if (!ROOM_ID.test(roomId)) {
      throw new DocumentStoreError(`논의 ID 형식이 올바르지 않습니다: ${roomId}`);
    }
    const resolved = path.resolve(this.root, `${roomId}.md`);
    const rel = path.relative(this.root, resolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new DocumentStoreError(`허용된 저장 경로를 벗어납니다: ${roomId}`);
    }
    return resolved;
  }

  exists(roomId: string): boolean {
    return fs.existsSync(this.filePath(roomId));
  }

  list(): string[] {
    if (!fs.existsSync(this.root)) return [];
    return fs
      .readdirSync(this.root)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3))
      .filter((id) => ROOM_ID.test(id));
  }

  private readBlocks(roomId: string): Block[] {
    const file = this.filePath(roomId);
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, "utf8");
    const blocks: Block[] = [];

    let cursor = raw.indexOf(HEADER);
    while (cursor !== -1) {
      const endOfHeader = raw.indexOf(HEADER_END, cursor);
      if (endOfHeader === -1) break;
      const json = raw.slice(cursor + HEADER.length, endOfHeader);
      const next = raw.indexOf(HEADER, endOfHeader);
      const body = raw.slice(endOfHeader + HEADER_END.length, next === -1 ? undefined : next);
      try {
        blocks.push({ header: JSON.parse(json) as Header, body: stripHeading(body) });
      } catch {
        // A block whose header will not parse is skipped rather than fatal:
        // one bad hand-edit should not make the rest of the record unreadable.
        console.warn(`[discussions] ${roomId}: 블록 헤더 파싱 실패, 건너뜁니다`);
      }
      cursor = next;
    }
    return blocks;
  }

  /** True when a write with this key already landed — the crash-safety check. */
  hasEntry(roomId: string, idemKey: string): boolean {
    return this.readBlocks(roomId).some((b) => b.header.idem === idemKey);
  }

  /**
   * Folds the log into the room as it currently stands.
   *
   * The latest `meta` and the latest `summary` win; every earlier one is
   * history. Details and user messages accumulate in file order, which is why
   * that order has to be authoritative.
   */
  read(roomId: string): Discussion | null {
    const blocks = this.readBlocks(roomId);
    if (blocks.length === 0) return null;

    let meta: MetaHeader | null = null;
    let summary: DiscussionSummary = EMPTY_SUMMARY;
    let summaryVersion = 0;
    let lastEntryRef = 0;
    const messages: DiscussionMessage[] = [];

    for (const { header, body } of blocks) {
      switch (header.kind) {
        case "meta":
          meta = header;
          break;
        case "summary":
          summary = header.summary;
          summaryVersion = header.summaryVersion;
          break;
        case "detail":
          lastEntryRef = Math.max(lastEntryRef, header.entryRef);
          messages.push({
            id: `e${header.seq}`,
            author: header.agent,
            at: header.at,
            body,
            entryRef: header.entryRef,
            sources: header.sources,
          });
          break;
        case "user":
          messages.push({
            id: `e${header.seq}`,
            author: "user",
            at: header.at,
            body,
            entryRef: null,
          });
          break;
      }
    }

    if (!meta) return null;
    const createdAt = blocks[0]?.header.at ?? new Date().toISOString();
    const updatedAt = blocks[blocks.length - 1]?.header.at ?? createdAt;

    return {
      id: roomId,
      roomId,
      title: meta.title,
      status: meta.status,
      revision: blocks.length,
      summaryVersion,
      lastEntryRef,
      createdAt,
      updatedAt,
      repos: meta.repos,
      participants: meta.participants,
      summary,
      messages,
      // Round bookkeeping is scheduling rather than record, so it is not in
      // the log and is not guessed from it — the log cannot tell a finished
      // round from an interrupted one. The service owns it in memory.
      round: 1,
      lastSpeakers: [],
    };
  }

  private render(header: Header, body: string): string {
    const heading =
      header.kind === "detail"
        ? `## ${header.agent} 상세 의견 #${header.entryRef} · ${header.at}`
        : header.kind === "summary"
          ? `## 요약 v${header.summaryVersion} · ${header.at}`
          : header.kind === "user"
            ? `## 사용자 ${header.role === "decision" ? "결정" : "의견"} · ${header.at}`
            : `## 논의 정보 · ${header.at}`;
    return `\n${HEADER}${JSON.stringify(header)}${HEADER_END}\n\n${heading}\n\n${body.trim()}\n`;
  }

  /**
   * Appends one block, serialised against every other write to the same room.
   *
   * Returns the block that landed — or the one that was already there, when
   * the idempotency key matches. A caller retrying after a crash gets the
   * original back rather than a second copy of the same opinion, which is the
   * one mistake this format cannot undo.
   */
  private append(
    roomId: string,
    build: (seq: number) => { header: Header; body: string },
    idemKey?: string,
  ): Promise<AppendResult> {
    const previous = this.writeChains.get(roomId) ?? Promise.resolve();
    const run = previous.then((): AppendResult => {
      if (idemKey) {
        const existing = this.readBlocks(roomId).find((b) => b.header.idem === idemKey);
        if (existing) return { header: existing.header, duplicate: true };
      }
      const file = this.filePath(roomId);
      const seq = this.readBlocks(roomId).length + 1;
      const { header, body } = build(seq);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, this.render(header, body), "utf8");
      return { header, duplicate: false };
    });
    // The chain survives a failed write, or one error would wedge every later
    // write to the same room.
    this.writeChains.set(
      roomId,
      run.catch(() => undefined),
    );
    return run;
  }

  appendMeta(
    roomId: string,
    meta: {
      title: string;
      status: DiscussionStatus;
      repos: string[];
      participants: Participant[];
    },
    idemKey?: string,
  ): Promise<AppendResult> {
    return this.append(
      roomId,
      (seq) => ({
        header: { kind: "meta", seq, at: new Date().toISOString(), idem: idemKey, ...meta },
        body: [
          `- 제목: ${meta.title}`,
          `- 상태: ${meta.status}`,
          `- 관련 저장소: ${meta.repos.join(", ") || "(없음)"}`,
          `- 참여자: ${meta.participants.map((p) => p.agent).join(", ") || "(없음)"}`,
        ].join("\n"),
      }),
      idemKey,
    );
  }

  appendDetail(
    roomId: string,
    entry: { agent: AgentName; body: string; sources?: string[]; roundId?: string },
    idemKey?: string,
  ): Promise<AppendResult> {
    return this.append(
      roomId,
      (seq) => {
        const current = this.read(roomId);
        return {
          header: {
            kind: "detail",
            seq,
            at: new Date().toISOString(),
            idem: idemKey,
            agent: entry.agent,
            // The document hands out the anchor. A writer choosing its own
            // could give the same number to two entries and silently break
            // every link pointing at it.
            entryRef: (current?.lastEntryRef ?? 0) + 1,
            sources: entry.sources,
            roundId: entry.roundId,
          },
          body: entry.body,
        };
      },
      idemKey,
    );
  }

  appendUser(
    roomId: string,
    role: "opinion" | "decision",
    body: string,
    idemKey?: string,
  ): Promise<AppendResult> {
    return this.append(
      roomId,
      (seq) => ({
        header: { kind: "user", seq, at: new Date().toISOString(), idem: idemKey, role },
        body,
      }),
      idemKey,
    );
  }

  appendSummary(
    roomId: string,
    summary: DiscussionSummary,
    idemKey?: string,
  ): Promise<AppendResult> {
    return this.append(
      roomId,
      (seq) => {
        const current = this.read(roomId);
        return {
          header: {
            kind: "summary",
            seq,
            at: new Date().toISOString(),
            idem: idemKey,
            summaryVersion: (current?.summaryVersion ?? 0) + 1,
            summary,
          },
          body: [
            renderList("확인된 사실", summary.facts),
            renderList("합의된 내용", summary.agreed),
            renderList("미결정 쟁점", summary.open),
            renderList("사용자 결정", summary.decisions),
          ].join("\n\n"),
        };
      },
      idemKey,
    );
  }

  /** The file exactly as written, for the room 전체 기록 view. */
  raw(roomId: string): string {
    const file = this.filePath(roomId);
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  }
}

/**
 * Drops the human-readable heading `render` adds above each block.
 *
 * The file is written for two readers at once: a person or an agent scanning
 * markdown, and this parser. The heading exists for the first and would be
 * duplicated into every chat bubble if handed to the second — the message
 * already shows who spoke and when.
 */
function stripHeading(raw: string): string {
  const text = raw.trim();
  if (!text.startsWith("## ")) return text;
  const newline = text.indexOf(NEWLINE);
  return newline === -1 ? "" : text.slice(newline + 1).trim();
}

function renderList(title: string, items: string[]): string {
  if (items.length === 0) return `### ${title}\n\n- (없음)`;
  return `### ${title}\n\n${items.map((i) => `- ${i}`).join("\n")}`;
}

export const documentStore = new DiscussionDocumentStore();
