"use client";

import { useEffect, useState } from "react";
import type { RoleSettings as RoleSettingsType } from "@ai-task-router/shared";
import { useSettings } from "../hooks/use-settings";
import { RoleCard } from "./role-card";
import { Button } from "@/components/button";
import { LoadingState, ErrorState } from "@/components/states";
import { Alert } from "@/components/alert";
import { useToast } from "@/components/toast";
import type { TaskRole } from "@/features/tasks/types";

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-border bg-fg/[0.02] px-4 py-1.5 text-xs font-medium text-fg-muted">
      {children}
    </div>
  );
}

/**
 * Every task's workflow is derived from these three assignments (see
 * `resolveWorkflowSpecForPurpose`), so the screen's job is to make the
 * current assignment comparable at a glance and the relationship between
 * roles legible — grouped by the kind of work that triggers them, rather
 * than three identical rows that happen to sit next to each other. Edits
 * are staged locally and committed by one save action at the bottom of the
 * same list, so "what will change" and "commit it" are never in different
 * parts of the page.
 */
export function RoleSettings() {
  const { settings, loading, error, updateRoles, refresh } = useSettings();
  const { showToast } = useToast();
  const [roles, setRoles] = useState<RoleSettingsType | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // At most one role's editor open at a time — expanding a second one
  // closes whichever was open, instead of every editor piling up down the
  // page at once.
  const [expandedRole, setExpandedRole] = useState<TaskRole | null>(null);

  useEffect(() => {
    if (settings && roles === null) setRoles(settings.roles);
  }, [settings, roles]);

  async function onSave() {
    if (!roles) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateRoles(roles);
      // A toast, not an inline banner — a save confirmation that pushes the
      // rest of the section down (and back up a moment later) reads as the
      // page twitching every time someone saves; a toast gives the same
      // feedback without touching layout at all.
      showToast("success", "설정을 저장했습니다.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="설정을 불러오는 중" />;
  if (error || !roles) {
    return <ErrorState message={error ?? "설정을 불러오지 못했습니다."} onRetry={refresh} />;
  }

  const dirty = settings ? JSON.stringify(roles) !== JSON.stringify(settings.roles) : false;

  function roleProps(role: TaskRole) {
    return {
      role,
      value: roles![role],
      expanded: expandedRole === role,
      onToggle: () => setExpandedRole((r) => (r === role ? null : role)),
      onChange: (next: RoleSettingsType[TaskRole]) => setRoles({ ...roles!, [role]: next }),
    };
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-fg">담당 AI</h2>
        <p className="text-sm text-fg-muted">
          작업 유형에 따라 아래 담당이 실행됩니다. 개별 작업을 만들 때 그 작업에만 다른 AI를 지정할
          수도 있습니다.
        </p>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        <GroupLabel>구현 작업</GroupLabel>
        <RoleCard {...roleProps("implementer")} />
        <RoleCard {...roleProps("reviewer")} note="구현 완료 후 실행" />
        <GroupLabel>분석 작업</GroupLabel>
        <RoleCard {...roleProps("analyzer")} />

        <div className="flex items-center justify-end gap-3 bg-fg/[0.02] px-4 py-3">
          <span className="text-xs text-fg-muted">
            {dirty ? "저장하지 않은 변경 사항이 있습니다" : "변경 사항 없음"}
          </span>
          <Button size="sm" onClick={onSave} loading={saving} disabled={!dirty && !saving}>
            저장
          </Button>
        </div>
      </div>

      <p className="text-xs text-fg-muted">리뷰만 요청한 작업도 리뷰 담당이 그대로 실행합니다.</p>

      {saveError ? <Alert tone="danger">{saveError}</Alert> : null}
    </section>
  );
}
