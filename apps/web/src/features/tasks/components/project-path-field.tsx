"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FolderGit2, FolderOpen, Loader2 } from "lucide-react";
import { cn, projectName } from "@/lib/format";
import { Popover } from "@/components/popover";
import { Field, Input } from "@/components/field";
import { Button } from "@/components/button";
import { projectsApi, type ProjectValidation, type RecentProject } from "../api/projects-api";

const DEBOUNCE_MS = 500;

/**
 * A labelled, full-width control that reads as the form's first field —
 * same height, radius and border as every input beside it — rather than a
 * chip floating above the form. Opens onto a list of recent projects (name
 * primary, path secondary) plus a manual-path fallback. A debounced
 * existence/Git-repo check runs on whatever path is current and reports
 * through the field's own hint line, so the answer to "is this usable?"
 * appears where a validation message is expected instead of as a separate
 * floating status.
 */
export function ProjectPathField({
  value,
  onChange,
  onValidated,
}: {
  value: string;
  onChange: (v: string) => void;
  onValidated?: (result: ProjectValidation | null) => void;
}) {
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [recentLoaded, setRecentLoaded] = useState(false);
  const [status, setStatus] = useState<"idle" | "checking" | ProjectValidation>("idle");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const seededDefault = useRef(false);

  useEffect(() => {
    void projectsApi
      .recent()
      .then((list) => {
        setRecent(list);
        // Default to the most recently used project so a first-time visitor
        // never has to type a path just to get started.
        if (!seededDefault.current && !value.trim() && list[0]) {
          seededDefault.current = true;
          onChange(list[0].projectPath);
        }
      })
      .catch(() => setRecent([]))
      .finally(() => setRecentLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = value.trim();
    if (!trimmed) {
      // Bump the request id even here — an in-flight validate() for
      // whatever the field held right before it was cleared must not be
      // allowed to land later and overwrite this "idle" state (or, worse,
      // re-enable submission) with a stale result for a path that's no
      // longer even shown.
      requestIdRef.current++;
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
          if (myRequestId !== requestIdRef.current) return; // a newer selection superseded this
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

  const validated = typeof status === "object" ? status : null;
  const invalid = !!validated && !validated.isGitRepo;

  const hint =
    status === "idle" ? (
      <span className="text-fg-muted">Git 저장소를 선택하세요</span>
    ) : status === "checking" ? (
      <span className="text-fg-muted">경로 확인 중</span>
    ) : validated?.isGitRepo ? (
      <span className="mono break-all text-fg-muted">{value}</span>
    ) : !validated?.exists ? (
      <span className="text-warning">경로를 찾을 수 없습니다</span>
    ) : (
      <span className="text-warning">Git 저장소가 아닙니다</span>
    );

  return (
    <Field as="div" label="프로젝트" required hint={hint}>
      <Popover
        align="start"
        panelClassName="w-[min(28rem,90vw)]"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            title={value || undefined}
            aria-haspopup="dialog"
            aria-expanded={open}
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-md border px-3 text-sm transition-colors duration-fast",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              invalid
                ? "border-warning/60 bg-warning/[0.04]"
                : open
                  ? "border-border-strong bg-fg/[0.06]"
                  : "border-border bg-fg/[0.03] hover:border-border-strong",
            )}
          >
            <FolderGit2 className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
            <span className={cn("truncate", value.trim() ? "text-fg" : "text-fg-faint")}>
              {value.trim() ? projectName(value) : "프로젝트 선택"}
            </span>
            <ChevronDown
              className={cn(
                "ml-auto h-3.5 w-3.5 shrink-0 text-fg-muted transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        )}
      >
        {({ close }) => (
          <div className="max-h-96 overflow-y-auto p-1">
            {!recentLoaded ? (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-fg-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> 최근 프로젝트 불러오는 중
              </div>
            ) : recent.length === 0 ? (
              <p className="px-3 py-4 text-sm text-fg-muted">최근 사용한 프로젝트가 없습니다.</p>
            ) : (
              <ul>
                {recent.map((r, i) => {
                  const selected = r.projectPath === value;
                  return (
                    <li key={r.projectPath}>
                      <button
                        type="button"
                        data-popover-autofocus={selected || (i === 0 && !value) ? "" : undefined}
                        onClick={() => {
                          onChange(r.projectPath);
                          close();
                        }}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors duration-fast hover:bg-fg/[0.06] focus:bg-fg/[0.08] focus:outline-none",
                          selected && "bg-brand/[0.08]",
                        )}
                      >
                        <FolderGit2 className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-fg">
                            {projectName(r.projectPath)}
                          </span>
                          <span className="mono block truncate text-xs text-fg-muted">
                            {r.projectPath}
                          </span>
                        </span>
                        {selected ? (
                          <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-1 border-t border-border p-1">
              {manualOpen ? (
                <div className="flex gap-2 p-1">
                  <Input
                    autoFocus
                    className="mono text-xs"
                    placeholder="D:\01.src\company\backend"
                    value={manualDraft}
                    onChange={(e) => setManualDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onChange(manualDraft);
                        close();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="md"
                    onClick={() => {
                      onChange(manualDraft);
                      close();
                    }}
                  >
                    사용
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setManualDraft(value);
                    setManualOpen(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-fg-muted transition-colors hover:bg-fg/[0.06] hover:text-fg focus:bg-fg/[0.08] focus:outline-none"
                >
                  <FolderOpen className="h-4 w-4" aria-hidden />
                  경로 직접 입력
                </button>
              )}
            </div>
          </div>
        )}
      </Popover>
    </Field>
  );
}
