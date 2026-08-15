"use client";

import { useEffect, useState } from "react";
import type { WorkflowStepSpec } from "@ai-task-router/shared";
import { useSettings } from "../hooks/use-settings";
import { WorkflowPresetPicker } from "@/features/tasks/components/workflow-preset-picker";
import { Card } from "@/components/card";
import { Button } from "@/components/button";

export function DefaultWorkflowSettings() {
  const { settings, loading, error, updateDefaultWorkflow } = useSettings();
  const [steps, setSteps] = useState<WorkflowStepSpec[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings && steps === null) setSteps(settings.defaultWorkflow.steps);
  }, [settings, steps]);

  async function onSave() {
    if (!steps) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await updateDefaultWorkflow({ steps });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card title="기본 Workflow">
        <p className="text-sm text-[#8291a3]">불러오는 중...</p>
      </Card>
    );
  }
  if (error) {
    return (
      <Card title="기본 Workflow">
        <p className="text-sm text-red-400">{error}</p>
      </Card>
    );
  }

  return (
    <Card title="기본 Workflow">
      <p className="mb-3 text-xs text-[#8291a3]">
        Task 생성 시 Workflow를 따로 지정하지 않으면 이 기본값이 사용됩니다. MCP의
        run_task/run_tasks도 workflow를 생략하면 이 값을 사용합니다.
      </p>
      <WorkflowPresetPicker steps={steps ?? []} onChange={setSteps} />
      {saveError ? <p className="mt-2 text-sm text-red-400">{saveError}</p> : null}
      {saved ? <p className="mt-2 text-sm text-emerald-400">저장되었습니다.</p> : null}
      <div className="mt-4 flex justify-end">
        <Button onClick={onSave} disabled={saving || !steps}>
          {saving ? "저장 중..." : "저장"}
        </Button>
      </div>
    </Card>
  );
}
