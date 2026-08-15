import { SERVER_URL } from "@/lib/config";
import type { Settings, WorkflowSpec } from "@ai-task-router/shared";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json; charset=utf-8", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let message = `요청에 실패했습니다 (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore parse failure, fall back to generic message
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const settingsApi = {
  get: () => request<Settings>("/api/settings"),
  updateDefaultWorkflow: (defaultWorkflow: WorkflowSpec) =>
    request<Settings>("/api/settings/default-workflow", {
      method: "PUT",
      body: JSON.stringify({ defaultWorkflow }),
    }),
};
