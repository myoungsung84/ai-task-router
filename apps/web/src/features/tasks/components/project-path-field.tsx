"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/format";
import { projectsApi, type ProjectValidation, type RecentProject } from "../api/projects-api";
import { projectName } from "@/lib/format";

const inputClass =
  "w-full rounded-md border border-[#232c38] bg-[#0e131a] px-3 py-2 text-sm text-white placeholder:text-[#546274] focus:border-blue-500 focus:outline-none";

const DEBOUNCE_MS = 500;

/**
 * Project path input with a native `<datalist>` of recently-used paths
 * (most-recent-first, from `GET /api/projects/recent`) and a debounced live
 * existence/Git-repo check (`GET /api/projects/validate`). Purely
 * informational — never blocks submission, since a "대기열에 추가" Task can
 * legitimately point at a path that isn't ready yet.
 */
export function ProjectPathField({
  value,
  onChange,
  onValidated,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Fired with the latest validation result (or null once the field is cleared). */
  onValidated?: (result: ProjectValidation | null) => void;
}) {
  const listId = useId();
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [status, setStatus] = useState<"idle" | "checking" | ProjectValidation>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    void projectsApi
      .recent()
      .then(setRecent)
      .catch(() => setRecent([]));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = value.trim();
    if (!trimmed) {
      setStatus("idle");
      onValidated?.(null);
      return;
    }
    setStatus("checking");
    const myRequestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(() => {
      void projectsApi
        .validate(trimmed)
        .then((result) => {
          if (myRequestId !== requestIdRef.current) return; // a newer keystroke superseded this
          setStatus(result);
          onValidated?.(result);
        })
        .catch(() => {
          if (myRequestId !== requestIdRef.current) return;
          setStatus("idle");
          onValidated?.(null);
        });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div>
      <input
        className={cn(inputClass, "mono")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="D:\01.src\company\backend"
        list={listId}
        required
      />
      <datalist id={listId}>
        {recent.map((r) => (
          <option key={r.projectPath} value={r.projectPath}>
            {projectName(r.projectPath)} — {r.projectPath}
          </option>
        ))}
      </datalist>
      <div className="mt-1 text-xs">
        {status === "idle" ? (
          <span className="text-[#8291a3]">
            Claude/Codex가 실행될 로컬 디렉터리 (Git 저장소여야 합니다)
          </span>
        ) : status === "checking" ? (
          <span className="text-[#8291a3]">확인 중...</span>
        ) : status.isGitRepo ? (
          <span className="text-emerald-400">✓ Git 저장소입니다.</span>
        ) : !status.exists ? (
          <span className="text-amber-400">⚠ 경로를 찾을 수 없습니다.</span>
        ) : (
          <span className="text-amber-400">⚠ Git 저장소가 아닙니다.</span>
        )}
      </div>
    </div>
  );
}
