"use client";

import { useState } from "react";
import { cn } from "@/lib/format";
import { WORKFLOW_PRESETS } from "../types";
import type { WorkflowPresetId, WorkflowStepSpec } from "../types";
import { WorkflowStepEditor } from "./workflow-step-editor";

function specsEqual(a: WorkflowStepSpec[], b: WorkflowStepSpec[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Preset buttons (기본 개발 / 분석만 / 리뷰 없음 / Custom); selecting Custom (or editing a preset's steps) reveals the full Step editor. */
export function WorkflowPresetPicker({
  steps,
  onChange,
}: {
  steps: WorkflowStepSpec[];
  onChange: (steps: WorkflowStepSpec[]) => void;
}) {
  const matchingPreset = WORKFLOW_PRESETS.find(
    (p) => p.workflow && specsEqual(p.workflow.steps, steps),
  );
  const [selectedId, setSelectedId] = useState<WorkflowPresetId>(matchingPreset?.id ?? "custom");

  function selectPreset(id: WorkflowPresetId) {
    setSelectedId(id);
    const preset = WORKFLOW_PRESETS.find((p) => p.id === id);
    if (preset?.workflow) onChange(preset.workflow.steps);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {WORKFLOW_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => selectPreset(p.id)}
            title={p.description}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              selectedId === p.id
                ? "border-blue-500 bg-blue-600/20 text-white"
                : "border-[#232c38] text-[#8291a3] hover:text-white",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {selectedId === "custom" ? (
        <WorkflowStepEditor steps={steps} onChange={onChange} />
      ) : (
        <p className="rounded-md border border-[#232c38] bg-[#0e131a] p-3 text-xs text-[#8291a3]">
          {WORKFLOW_PRESETS.find((p) => p.id === selectedId)?.description}
        </p>
      )}
    </div>
  );
}
