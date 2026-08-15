import { SERVER_URL } from "@/lib/config";
import type { CreateTaskInput, Task, TaskDiff, TaskListItem } from "../types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
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

export const tasksApi = {
  list: () => request<TaskListItem[]>("/api/tasks"),
  get: (id: string) => request<Task>(`/api/tasks/${id}`),
  create: (input: CreateTaskInput) =>
    request<Task>("/api/tasks", { method: "POST", body: JSON.stringify(input) }),
  start: (id: string) => request<Task>(`/api/tasks/${id}/start`, { method: "POST" }),
  cancel: (id: string) => request<Task>(`/api/tasks/${id}/cancel`, { method: "POST" }),
  diff: (id: string) => request<TaskDiff>(`/api/tasks/${id}/diff`),
  eventsUrl: (id: string) => `${SERVER_URL}/api/tasks/${id}/events`,
};
