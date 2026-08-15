"use client";

import { useEffect, useState } from "react";
import { tasksApi } from "../api/tasks-api";
import { useSettings } from "@/features/settings/hooks/use-settings";
import { Button } from "@/components/button";
import { cn } from "@/lib/format";
import { WorkflowPresetPicker } from "./workflow-preset-picker";
import { ProjectPathField } from "./project-path-field";
import { findPathLikeToken } from "../lib/paste-path-detect";
import { generateTitleFromInstruction } from "../types";
import type { WorkflowStepSpec } from "../types";
import type { ProjectValidation } from "../api/projects-api";
import type { FollowUpPrefill } from "../lib/follow-up";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium text-[#c8d1db]">{label}</div>
      {children}
      {hint ? <div className="mt-1 text-xs text-[#8291a3]">{hint}</div> : null}
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-[#232c38] bg-[#0e131a] px-3 py-2 text-sm text-white placeholder:text-[#546274] focus:border-blue-500 focus:outline-none";

/**
 * Used inside the New Task modal (primary path, also reused for WARNING
 * follow-ups via `prefill`) and the /tasks/new fallback page — same form
 * either way.
 */
export function TaskCreateForm({
  onCreated,
  prefill,
}: {
  onCreated: (jobId: string) => void;
  prefill?: FollowUpPrefill;
}) {
  const { settings } = useSettings();
  const [title, setTitle] = useState(prefill?.title ?? "");
  // A prefilled follow-up title ("T-1 — 리뷰 수정") is already specific —
  // don't let the generic instruction-based generator immediately overwrite
  // it. A from-scratch dialog starts untouched so the live preview kicks in.
  const [titleTouched, setTitleTouched] = useState(!!prefill?.title);
  const [projectPath, setProjectPath] = useState(prefill?.projectPath ?? "");
  const [instruction, setInstruction] = useState(prefill?.instruction ?? "");
  const [baseBranch, setBaseBranch] = useState(prefill?.baseBranch ?? "");
  const [branch, setBranch] = useState(prefill?.branch ?? "");
  const [autoStart, setAutoStart] = useState(true);
  const [steps, setSteps] = useState<WorkflowStepSpec[] | null>(prefill?.workflowSteps ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pendingPaste, setPendingPaste] = useState<string | null>(null);
  const [clipboardError, setClipboardError] = useState<string | null>(null);

  const [suggestedPath, setSuggestedPath] = useState<string | null>(null);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [normalizedPath, setNormalizedPath] = useState<string | null>(null);

  // Once Settings load, seed the picker with the current default workflow —
  // but only if nothing else (prefill, project memory, manual edit) has.
  const effectiveSteps = steps ?? settings?.defaultWorkflow.steps ?? [];

  // Live title preview from the instruction, until the user edits the title
  // field directly — same pattern as a URL-slug field that stops
  // auto-deriving once hand-edited.
  useEffect(() => {
    if (titleTouched) return;
    setTitle(instruction.trim() ? generateTitleFromInstruction(instruction) : "");
  }, [instruction, titleTouched]);

  // Scans the instruction for a path-like token and offers it as a
  // dismissible suggestion — never auto-fills the project path field.
  useEffect(() => {
    const found = findPathLikeToken(instruction);
    if (!found || found === projectPath.trim() || dismissedSuggestions.has(found)) {
      setSuggestedPath(null);
      return;
    }
    setSuggestedPath(found);
  }, [instruction, projectPath, dismissedSuggestions]);

  function onPathValidated(result: ProjectValidation | null) {
    setNormalizedPath(result?.normalizedPath ?? null);
    // Only seed from project memory if nothing has set steps yet (no
    // prefill, no manual edit, no earlier seed for a different path).
    if (result?.lastWorkflow && steps === null) {
      setSteps(result.lastWorkflow.steps);
    }
  }

  async function handlePasteClick() {
    setClipboardError(null);
    let clip: string;
    try {
      clip = await navigator.clipboard.readText();
    } catch {
      setClipboardError(
        "클립보드를 읽을 수 없습니다 — 브라우저가 권한을 차단했을 수 있습니다. 주소창의 자물쇠 아이콘에서 클립보드 권한을 허용하거나 Ctrl+V로 직접 붙여넣으세요.",
      );
      return;
    }
    if (!clip || !clip.trim()) {
      setClipboardError("클립보드가 비어 있습니다.");
      return;
    }
    if (!instruction.trim()) {
      setInstruction(clip);
      return;
    }
    setPendingPaste(clip);
  }

  function applyPendingPaste(mode: "overwrite" | "append") {
    if (pendingPaste === null) return;
    setInstruction(
      mode === "overwrite"
        ? pendingPaste
        : `${instruction}${instruction.endsWith("\n") ? "" : "\n\n"}${pendingPaste}`,
    );
    setPendingPaste(null);
  }

  function useSuggestedPath() {
    if (!suggestedPath) return;
    setProjectPath(suggestedPath);
    setSuggestedPath(null);
  }

  function dismissSuggestedPath() {
    if (!suggestedPath) return;
    setDismissedSuggestions((prev) => new Set(prev).add(suggestedPath));
    setSuggestedPath(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const task = await tasksApi.create({
        title: title.trim() || undefined,
        projectPath: projectPath.trim(),
        instruction: instruction.trim(),
        baseBranch: baseBranch.trim() || null,
        branch: branch.trim() || null,
        workflow: steps ? { steps } : null,
        parentTaskId: prefill?.parentTaskId ?? null,
        linkKind: prefill?.linkKind ?? null,
      });
      if (autoStart) {
        try {
          await tasksApi.start(task.id);
        } catch (startErr) {
          // Task was created even if start failed (e.g. same-project busy) —
          // the caller still navigates to the detail page where that's visible.
          console.warn("자동 시작 실패:", startErr);
        }
      }
      onCreated(task.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  const hasBranchSettings = !!(prefill?.branch || prefill?.baseBranch);

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <Field
        label="제목"
        hint={titleTouched ? undefined : "비워두면 작업 지시사항으로부터 자동 생성됩니다."}
      >
        <input
          className={inputClass}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleTouched(true);
          }}
          placeholder="예: Backend 회원 탈퇴 API (비워두면 자동 생성)"
        />
      </Field>

      <Field label="프로젝트 경로">
        <ProjectPathField
          value={projectPath}
          onChange={setProjectPath}
          onValidated={onPathValidated}
        />
        {suggestedPath ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-xs text-[#c8d1db]">
            <span className="mono truncate">
              📁 지시서에서 경로를 발견했습니다: {suggestedPath}
            </span>
            <div className="ml-auto flex shrink-0 gap-2">
              <button
                type="button"
                onClick={useSuggestedPath}
                className="rounded border border-blue-500/40 px-2 py-1 text-blue-300 hover:bg-blue-500/10"
              >
                이 경로 사용하기
              </button>
              <button
                type="button"
                onClick={dismissSuggestedPath}
                className="rounded px-2 py-1 text-[#8291a3] hover:text-white"
              >
                무시
              </button>
            </div>
          </div>
        ) : null}
      </Field>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-medium text-[#c8d1db]">작업 지시사항</span>
          <button
            type="button"
            onClick={() => void handlePasteClick()}
            className="rounded-md border border-[#232c38] px-2 py-1 text-xs text-[#8291a3] hover:border-[#33404f] hover:text-white"
          >
            📋 붙여넣기
          </button>
        </div>
        <textarea
          className={cn(inputClass, "min-h-[260px] resize-y")}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="예: 회원 탈퇴 API를 추가해줘. 소프트 삭제로 처리하고 관련 테스트도 추가해줘."
          required
        />
        {clipboardError ? <p className="mt-1 text-xs text-amber-400">{clipboardError}</p> : null}
        {pendingPaste !== null ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-[#232c38] bg-[#0e131a] px-3 py-2 text-xs text-[#c8d1db]">
            <span>기존 내용이 있습니다. 클립보드 내용을 어떻게 반영할까요?</span>
            <div className="ml-auto flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => applyPendingPaste("append")}
                className="rounded border border-[#232c38] px-2 py-1 hover:bg-white/10"
              >
                뒤에 추가
              </button>
              <button
                type="button"
                onClick={() => applyPendingPaste("overwrite")}
                className="rounded border border-amber-500/40 px-2 py-1 text-amber-300 hover:bg-amber-500/10"
              >
                덮어쓰기
              </button>
              <button
                type="button"
                onClick={() => setPendingPaste(null)}
                className="rounded px-2 py-1 text-[#8291a3] hover:text-white"
              >
                취소
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <details className="rounded-md border border-[#232c38] bg-[#0e131a]" open={hasBranchSettings}>
        <summary className="cursor-pointer select-none px-3 py-2 text-sm text-[#c8d1db]">
          고급 설정 (브랜치)
        </summary>
        <div className="space-y-3 border-t border-[#232c38] p-3">
          <Field label="branch" hint="비워두면 현재 브랜치에서 작업합니다.">
            <input
              className={cn(inputClass, "mono")}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="feature/withdraw-api"
            />
          </Field>
          <Field
            label="baseBranch"
            hint={
              branch.trim()
                ? "새 branch를 만들 때 기준이 되는 브랜치입니다."
                : "새 branch를 만들 때만 사용됩니다 — branch를 먼저 입력하세요."
            }
          >
            <input
              className={cn(inputClass, "mono")}
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              placeholder="main"
              disabled={!branch.trim()}
            />
          </Field>
        </div>
      </details>

      <Field
        label="Workflow"
        hint="비워두면 이 프로젝트의 마지막 Workflow, 없으면 Settings 기본값이 사용됩니다."
      >
        <WorkflowPresetPicker
          key={normalizedPath ?? "default"}
          steps={effectiveSteps}
          onChange={setSteps}
        />
      </Field>

      <div>
        <div className="mb-1 text-sm font-medium text-[#c8d1db]">실행 방식</div>
        <div className="inline-flex rounded-lg border border-[#232c38] bg-[#0e131a] p-1">
          <button
            type="button"
            onClick={() => setAutoStart(true)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              autoStart ? "bg-white/10 text-white" : "text-[#8291a3] hover:text-white",
            )}
          >
            바로 실행
          </button>
          <button
            type="button"
            onClick={() => setAutoStart(false)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              !autoStart ? "bg-white/10 text-white" : "text-[#8291a3] hover:text-white",
            )}
          >
            대기열에 추가
          </button>
        </div>
        <p className="mt-1 text-xs text-[#8291a3]">
          {autoStart
            ? "생성 즉시 실행합니다."
            : "생성만 하고 대기 상태로 둡니다 — 대시보드의 실행 버튼으로 나중에 시작할 수 있습니다."}
        </p>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "생성 중..." : autoStart ? "생성 및 실행" : "대기열에 추가"}
        </Button>
      </div>
    </form>
  );
}
