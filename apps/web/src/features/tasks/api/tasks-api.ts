import { SERVER_URL } from "@/lib/config";
import type { CreateTaskInput, Task, TaskDiff, TaskListItem } from "../types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...init,
    // charset=utf-8 explicit: fetch() always UTF-8-encodes a string body and
    // Express's json() parser already defaults to utf-8, but stating it
    // removes any ambiguity end-to-end.
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

async function requestNoContent(path: string, init?: RequestInit): Promise<void> {
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
}

export const tasksApi = {
  list: () => request<TaskListItem[]>("/api/tasks"),
  get: (id: string) => request<Task>(`/api/tasks/${id}`),
  create: (input: CreateTaskInput) =>
    request<Task>("/api/tasks", { method: "POST", body: JSON.stringify(input) }),
  start: (id: string) => request<Task>(`/api/tasks/${id}/start`, { method: "POST" }),
  cancel: (id: string) => request<Task>(`/api/tasks/${id}/cancel`, { method: "POST" }),
  /** "검토 후 완료 처리" — WARNING-only; rejected server-side if the review process itself failed/didn't parse or an implement/analyze Step failed. */
  resolveWarning: (id: string) =>
    request<Task>(`/api/tasks/${id}/resolve-warning`, { method: "POST" }),
  /** Deletes a completed Task's JSON/logs. RUNNING/REVIEWING tasks are rejected server-side. */
  remove: (id: string) => requestNoContent(`/api/tasks/${id}`, { method: "DELETE" }),
  diff: (id: string) => request<TaskDiff>(`/api/tasks/${id}/diff`),
  eventsUrl: (id: string) => `${SERVER_URL}/api/tasks/${id}/events`,
};
