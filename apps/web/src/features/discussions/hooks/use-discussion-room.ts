"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { discussionsApi, type RoomView } from "../api/discussions-api";

/**
 * One room, kept current.
 *
 * The browser no longer decides anything about a round. It used to run the
 * turn engine itself against a scripted room, which was the right shape for
 * showing the rules and the wrong one for keeping them: the same rounds are
 * now scheduled on the server, where the MCP tools an agent calls can see
 * them. This hook fetches and posts.
 *
 * Polling rather than a stream, and at two speeds. A round is only ever open
 * because someone opened it, and while it is open the participants are agents
 * in their own sessions who may take a while to answer — so the room watches
 * closely while a round is live and rarely when the document is settled,
 * matching what the Task list already does for the same reason.
 */

const POLL_ACTIVE_MS = 2000;
const POLL_IDLE_MS = 15000;

export function useDiscussionRoom(id: string) {
  const [view, setView] = useState<RoomView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "muted" | "warning"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await discussionsApi.get(id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  const roundOpen = !!view?.turn.round;

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      // A hidden tab cannot be watched by anyone, so it stops asking and
      // catches up when it comes back.
      if (!document.hidden) await load();
      if (cancelled) return;
      timer.current = setTimeout(tick, roundOpen ? POLL_ACTIVE_MS : POLL_IDLE_MS);
    };

    void tick();
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, roundOpen]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || busy) return;
      setBusy(true);
      try {
        const result = await discussionsApi.post(id, text);
        setView({ discussion: result.discussion, turn: result.turn });
        setNotice(
          result.notice
            ? { tone: result.kind === "ambiguous" ? "warning" : "muted", text: result.notice }
            : null,
        );
      } catch (err) {
        setNotice({ tone: "warning", text: err instanceof Error ? err.message : String(err) });
      } finally {
        setBusy(false);
      }
    },
    [busy, id],
  );

  /** 계속 — open another round with nothing new from the user. */
  const advance = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await discussionsApi.advance(id);
      setView({ discussion: result.discussion, turn: result.turn });
      setNotice(null);
    } catch (err) {
      setNotice({ tone: "warning", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }, [busy, id]);

  /**
   * Gives up on an open round. Nothing already appended is undone, because it
   * cannot be — abandoning only clears the schedule, and the room then says
   * 재개 필요 rather than pretending it is idle.
   */
  const abandon = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await discussionsApi.abandonRound(id);
      await load();
    } finally {
      setBusy(false);
    }
  }, [busy, id, load]);

  return { view, loading, error, notice, busy, send, advance, abandon, refresh: load };
}
