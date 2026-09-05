import { SERVER_URL } from "@/lib/config";
import type { UsageSnapshot } from "@ai-task-router/shared";

export const usageApi = {
  snapshot: async (): Promise<UsageSnapshot> => {
    const res = await fetch(`${SERVER_URL}/api/usage`, { cache: "no-store" });
    if (!res.ok) throw new Error(`요청에 실패했습니다 (${res.status})`);
    return res.json() as Promise<UsageSnapshot>;
  },
};
