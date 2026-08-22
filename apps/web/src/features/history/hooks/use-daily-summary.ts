"use client";

import { useCallback, useEffect, useState } from "react";
import type { DailySummary } from "@ai-task-router/shared";
import { historyApi } from "../api/history-api";

export function useDailySummary(date: string) {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await historyApi.dailySummary(date));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { summary, loading, error, refresh };
}
