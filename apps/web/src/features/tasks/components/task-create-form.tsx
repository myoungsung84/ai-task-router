"use client";

import { useEffect, useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { tasksApi } from "../api/tasks-api";
import { useSettings } from "@/features/settings/hooks/use-settings";
import { Button } from "@/components/button";
import { Checkbox, FieldLabel, Textarea } from "@/components/field";
import { Alert } from "@/components/alert";
import { LoadingState } from "@/components/states";
import { cn } from "@/lib/format";
import { ProjectPathField } from "./project-path-field";
import { PurposePicker } from "./purpose-picker";
import { BranchField, type BranchMode } from "./branch-field";
import { RoleOverridePanel, type RoleOverrideMap } from "./role-override-panel";
import { findPathLikeToken } from "../lib/paste-path-detect";
import { DEFAULT_ROLE_SETTINGS } from "../types";
import type { TaskPurpose } from "../types";
import type { ProjectValidation } from "../api/projects-api";
import type { FollowUpPrefill } from "../lib/follow-up";

/**
 * The one task-creation form. Rendered by `NewTaskModal`, both for a blank
 * new task and, via `prefill`, for a 확인 필요 follow-up.
 *
 * One vertical flow, every region starting on the same left edge and
 * spanning the same width, in the order the decisions are actually made:
 * where the work happens (프로젝트 · 브랜치) → what to do (작업 지시) → what
 * kind of work it is (작업 유형) → who does it, only if the defaults aren't
 * right (담당 AI 변경) → how to run it (footer). No title field (the server
 * always generates one) and no hand-assembled workflow editor (purpose plus
 * the configured roles decide the workflow; see
 * `resolveWorkflowSpecForPurpose`).
 *
 * `surface` only controls how the action bar attaches: inside a dialog it
 * sticks to the bottom of the scroll area and bleeds to the dialog's edges;
 * `"page"` leaves it an ordinary bordered row, for embedding the form
 * outside a dialog.
 */
export function TaskCreateForm({
  onCreated,
  prefill,
  surface = "page",
}: {
  onCreated: (jobId: string) => void;
  prefill?: FollowUpPrefill;
  surface?: "dialog" | "page";
}) {
  const { settings, loading: settingsLoading } = useSettings();
  const [projectPath, setProjectPath] = useState(prefill?.projectPath ?? "");
  const [instruction, setInstruction] = useState(prefill?.instruction ?? "");
  const [purpose, setPurpose] = useState<TaskPurpose>(prefill?.purpose ?? "implement");
  const [roleOverrides, setRoleOverrides] = useState<RoleOverrideMap>(prefill?.roleOverrides ?? {});
  const [branchMode, setBranchMode] = useState<BranchMode>(prefill?.branch ? "new" : "current");
  const [branch, setBranch] = useState(prefill?.branch ?? "");
  const [baseBranch, setBaseBranch] = useState(prefill?.baseBranch ?? "");
  const [autoStart, setAutoStart] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pendingPaste, setPendingPaste] = useState<string | null>(null);
  const [clipboardError, setClipboardError] = useState<string | null>(null);

  const [suggestedPath, setSuggestedPath] = useState<string | null>(null);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [validation, setValidation] = useState<ProjectValidation | null>(null);

  const roles = settings?.roles ?? DEFAULT_ROLE_SETTINGS;
  const showBranch = purpose === "implement";

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

  async function handlePasteClick() {
    setClipboardError(null);
    let clip: string;
    try {
      clip = await navigator.clipboard.readText();
    } catch {
      setClipboardError(
        "클립보드를 읽을 수 없습니다. 주소창의 자물쇠 아이콘에서 클립보드 권한을 허용하거나 Ctrl+V로 붙여넣으세요.",
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

  const projectReady = !!validation?.isGitRepo;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectReady) {
      setError("Git 저장소를 선택하세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const task = await tasksApi.create({
        projectPath: projectPath.trim(),
        instruction: instruction.trim(),
        purpose,
        roleOverrides: Object.keys(roleOverrides).length > 0 ? roleOverrides : null,
        branch: branchMode === "new" ? branch.trim() || null : null,
        baseBranch: branchMode === "new" ? baseBranch.trim() || null : null,
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

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={showBranch ? undefined : "sm:col-span-2"}>
          <ProjectPathField
            value={projectPath}
            onChange={setProjectPath}
            onValidated={setValidation}
          />
        </div>
        {showBranch ? (
          <BranchField
            mode={branchMode}
            onModeChange={setBranchMode}
            branch={branch}
            onBranchChange={setBranch}
            baseBranch={baseBranch}
            onBaseBranchChange={setBaseBranch}
          />
        ) : null}
      </div>

      {suggestedPath ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-fg/[0.02] px-3 py-2 text-xs">
          <span className="min-w-0 flex-1 truncate text-fg-secondary">
            지시 내용에서 경로를 찾았습니다: <span className="mono text-fg">{suggestedPath}</span>
          </span>
          <span className="flex shrink-0 gap-3">
            <button
              type="button"
              onClick={() => {
                setProjectPath(suggestedPath);
                setSuggestedPath(null);
              }}
              className="font-medium text-brand hover:underline"
            >
              사용
            </button>
            <button
              type="button"
              onClick={() => {
                setDismissedSuggestions((prev) => new Set(prev).add(suggestedPath));
                setSuggestedPath(null);
              }}
              className="text-fg-muted hover:text-fg"
            >
              무시
            </button>
          </span>
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <FieldLabel>
            작업 지시{" "}
            <span className="text-danger" aria-hidden>
              *
            </span>
          </FieldLabel>
          <button
            type="button"
            onClick={() => void handlePasteClick()}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-fg-muted transition-colors hover:bg-fg/[0.06] hover:text-fg"
          >
            <ClipboardPaste className="h-3.5 w-3.5" aria-hidden />
            붙여넣기
          </button>
        </div>
        <Textarea
          className="min-h-[11rem] resize-y"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="예: 회원 탈퇴 API를 추가한다. 소프트 삭제로 처리하고 관련 테스트도 추가한다."
          required
        />
        {clipboardError ? <p className="mt-2 text-xs text-warning">{clipboardError}</p> : null}
        {pendingPaste !== null ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-border bg-fg/[0.02] px-3 py-2 text-xs">
            <span className="min-w-0 flex-1 text-fg-secondary">
              이미 입력된 내용이 있습니다. 클립보드 내용을 어떻게 반영할까요?
            </span>
            <span className="flex shrink-0 gap-3">
              <button
                type="button"
                onClick={() => applyPendingPaste("append")}
                className="font-medium text-brand hover:underline"
              >
                뒤에 추가
              </button>
              <button
                type="button"
                onClick={() => applyPendingPaste("overwrite")}
                className="font-medium text-warning hover:underline"
              >
                덮어쓰기
              </button>
              <button
                type="button"
                onClick={() => setPendingPaste(null)}
                className="text-fg-muted hover:text-fg"
              >
                취소
              </button>
            </span>
          </div>
        ) : null}
      </div>

      <div>
        <FieldLabel className="mb-2">작업 유형</FieldLabel>
        {settingsLoading ? (
          <LoadingState label="설정을 불러오는 중" />
        ) : (
          <PurposePicker value={purpose} onChange={setPurpose} roles={roles} />
        )}
      </div>

      {!settingsLoading ? (
        <RoleOverridePanel
          purpose={purpose}
          roles={roles}
          overrides={roleOverrides}
          onChange={setRoleOverrides}
        />
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 border-t border-border",
          surface === "dialog"
            ? "sticky bottom-0 -mb-6 -ml-6 -mr-6 bg-surface-raised px-6 py-4"
            : "pt-4",
        )}
      >
        <Checkbox checked={!autoStart} onChange={(checked) => setAutoStart(!checked)}>
          지금 실행하지 않고 대기열에만 추가
        </Checkbox>
        <Button type="submit" size="lg" loading={submitting} disabled={!projectReady}>
          {autoStart ? "작업 시작" : "대기열에 추가"}
        </Button>
      </div>
    </form>
  );
}
