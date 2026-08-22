import { SERVER_URL } from "@/lib/config";
import type { DailySummary } from "@ai-task-router/shared";

export const historyApi = {
  /** `date` omitted = today (Asia/Seoul), matching the server's own default. */
  dailySummary: async (date?: string): Promise<DailySummary> => {
    const qs = date ? `?date=${encodeURIComponent(date)}` : "";
    const res = await fetch(`${SERVER_URL}/api/history/daily${qs}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`요청에 실패했습니다 (${res.status})`);
    return res.json() as Promise<DailySummary>;
  },
};
