"use client";

import { cn } from "@/lib/format";
import { Field, FieldLabel, Input } from "@/components/field";

export type BranchMode = "current" | "new";

const MODES: { value: BranchMode; label: string }[] = [
  { value: "current", label: "현재 브랜치" },
  { value: "new", label: "새 브랜치" },
];

/**
 * Renders as grid *cells*, not a self-contained block: the mode toggle sits
 * in the same two-column row as the project field (same label style, same
 * 36px control height, same left edge), and choosing "새 브랜치" adds a
 * full-width row underneath for the name and base — so the extra inputs
 * extend the form's grid instead of opening a floating panel over it. Not
 * mounted at all for read-only purposes (analyze/review); see
 * TaskCreateForm.
 */
export function BranchField({
  mode,
  onModeChange,
  branch,
  onBranchChange,
  baseBranch,
  onBaseBranchChange,
}: {
  mode: BranchMode;
  onModeChange: (mode: BranchMode) => void;
  branch: string;
  onBranchChange: (v: string) => void;
  baseBranch: string;
  onBaseBranchChange: (v: string) => void;
}) {
  return (
    <>
      <div>
        <FieldLabel className="mb-2">브랜치</FieldLabel>
        <div
          role="radiogroup"
          aria-label="브랜치"
          className="inline-flex h-9 w-full items-center rounded-md border border-border bg-fg/[0.03] p-0.5"
        >
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={mode === m.value}
              onClick={() => onModeChange(m.value)}
              className={cn(
                "h-8 flex-1 rounded-[0.3125rem] px-3 text-sm font-medium transition-colors duration-fast",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                mode === m.value ? "bg-fg/[0.1] text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "new" ? (
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
          <Field label="새 브랜치 이름">
            <Input
              className="mono text-xs"
              value={branch}
              onChange={(e) => onBranchChange(e.target.value)}
              placeholder="feature/withdraw-api"
              autoFocus
            />
          </Field>
          <Field label="기준 브랜치" hint="비워 두면 현재 브랜치에서 분기합니다.">
            <Input
              className="mono text-xs"
              value={baseBranch}
              onChange={(e) => onBaseBranchChange(e.target.value)}
              placeholder="main"
            />
          </Field>
        </div>
      ) : null}
    </>
  );
}
