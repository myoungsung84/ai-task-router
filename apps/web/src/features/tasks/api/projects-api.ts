import { SERVER_URL } from "@/lib/config";
import type { WorkflowSpec } from "../types";

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, { cache: "no-store" });
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

export interface RecentProject {
  projectPath: string;
  lastUsedAt: string;
}

export interface ProjectValidation {
  ok: boolean;
  exists: boolean;
  isGitRepo: boolean;
  normalizedPath?: string;
  lastWorkflow?: WorkflowSpec | null;
  error?: string;
}

export const projectsApi = {
  recent: () => request<RecentProject[]>("/api/projects/recent"),
  validate: (path: string) =>
    request<ProjectValidation>(`/api/projects/validate?path=${encodeURIComponent(path)}`),
};
