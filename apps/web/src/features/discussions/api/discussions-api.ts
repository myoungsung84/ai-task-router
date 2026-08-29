import { SERVER_URL } from "@/lib/config";
import type {
  AgentName,
  Discussion,
  DiscussionListItem,
  DiscussionTurnView,
  RoundState,
} from "@ai-task-router/shared";

/**
 * The discussion room's HTTP client.
 *
 * Nothing here decides anything. Whether a message was a decision, whose turn
 * is next, what the summary now says — all of it is settled on the server,
 * because the same questions are asked by the MCP tools an agent calls, and a
 * rule answered in two places is a rule that will eventually differ.
 */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SERVER_URL}/api/discussions${path}`, {
    cache: "no-store",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? `요청이 실패했습니다 (${res.status})`);
  }
  return (await res.json()) as T;
}

export interface RoomView {
  discussion: Discussion;
  turn: DiscussionTurnView;
}

export interface PostResult extends RoomView {
  kind: string;
  plan: RoundState | null;
  notice?: string;
}

export const discussionsApi = {
  list(): Promise<DiscussionListItem[]> {
    return request<DiscussionListItem[]>("");
  },

  get(id: string): Promise<RoomView> {
    return request<RoomView>(`/${id}`);
  },

  /** The raw append log, for the room 전체 기록 view. */
  async document(id: string): Promise<string> {
    const res = await fetch(`${SERVER_URL}/api/discussions/${id}/document`, { cache: "no-store" });
    if (!res.ok) throw new Error(`문서를 불러오지 못했습니다 (${res.status})`);
    return res.text();
  },

  create(input: {
    title: string;
    repos: string[];
    participants?: AgentName[];
    summary?: { facts?: string[]; agreed?: string[]; open?: string[] };
  }): Promise<Discussion> {
    return request<Discussion>("", { method: "POST", body: JSON.stringify(input) });
  },

  post(id: string, text: string): Promise<PostResult> {
    return request<PostResult>(`/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  },

  /** 계속 — open another round with nothing new from the user. */
  advance(id: string): Promise<RoomView & { plan: RoundState | null }> {
    return request<RoomView & { plan: RoundState | null }>(`/${id}/advance`, { method: "POST" });
  },

  /**
   * Drops an open round without replaying anything already written — an append
   * cannot be taken back, so abandoning is the only safe way out of a round
   * nobody is going to finish.
   */
  abandonRound(id: string): Promise<DiscussionTurnView> {
    return request<DiscussionTurnView>(`/${id}/turn`, { method: "DELETE" });
  },

  addRepo(id: string, repo: string): Promise<Discussion> {
    return request<Discussion>(`/${id}/repos`, {
      method: "POST",
      body: JSON.stringify({ repo }),
    });
  },

  close(id: string): Promise<Discussion> {
    return request<Discussion>(`/${id}/close`, { method: "POST" });
  },
};
