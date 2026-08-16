"use client";

import { useEffect, useRef, useState } from "react";
import { Gauge, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/format";
import { Input } from "@/components/field";
import { MODEL_CATALOG, findModelOption } from "@/lib/model-catalog";
import type { AgentName } from "@/features/tasks/types";

const SPEED_ICON = { 빠름: Zap, 보통: Gauge, 느림: Gauge } as const;

const CUSTOM = "__custom__";

/**
 * A single segmented row of model choices — every catalog model plus a
 * trailing "직접 입력" segment — with one short caption line underneath for
 * whichever is selected. One control, one selected state, no grid of
 * bordered option cards.
 *
 * The open/closed state of the custom-id field is *derived from* the value
 * coming in, not stored independently: whenever `value` or `agent` changes
 * from the outside (Settings resetting a Role to its Agent's default model,
 * a follow-up prefilling overrides, a "기본값으로" reset), the field snaps
 * back to whichever segment actually matches the stored value. Without that,
 * the value silently becomes "sonnet" while the UI still shows an open text
 * box — a screen that disagrees with what will be sent. The one change that
 * must NOT re-derive is this component's own typing into that text box, so
 * those edits are flagged on `selfEditRef` and skipped: otherwise the field
 * would close under the cursor the moment it was cleared to type a new id.
 */
export function ModelPicker({
  agent,
  value,
  onChange,
}: {
  agent: AgentName;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const catalog = MODEL_CATALOG[agent];
  const matched = findModelOption(agent, value);
  const [customOpen, setCustomOpen] = useState(!matched && !!value);
  // Strictly what the stored value matches — never "…else the first option".
  // A stored `null` means 자동 선택, which every catalog now carries as a real
  // entry; falling back to `catalog[0]` would paint whichever model happens
  // to sit first as if it had been chosen, and the collapsed summary (which
  // reads the same stored value) would then disagree with this editor.
  const selected = customOpen ? null : matched;
  const selfEditRef = useRef(false);

  useEffect(() => {
    if (selfEditRef.current) {
      selfEditRef.current = false;
      return;
    }
    setCustomOpen(!findModelOption(agent, value) && !!value);
  }, [agent, value]);

  const segments = [
    ...catalog.map((m) => ({ key: m.label, model: m })),
    { key: CUSTOM, model: null },
  ];
  // `null` when nothing matches and the custom field isn't open either — a
  // state the catalogs make unreachable today, but leaving no segment marked
  // is the honest rendering if it ever happens.
  const activeKey = customOpen ? CUSTOM : (selected?.label ?? null);

  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-md border border-border bg-fg/[0.03] p-0.5">
        {segments.map(({ key, model }) => {
          const isActive = key === activeKey;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isActive}
              onClick={() => {
                if (model) {
                  setCustomOpen(false);
                  onChange(model.value);
                } else {
                  setCustomOpen(true);
                }
              }}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-[0.3125rem] px-3 text-xs font-medium transition-colors duration-fast",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                isActive ? "bg-fg/[0.1] text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {model ? model.label : "직접 입력"}
              {model?.recommended ? <Sparkles className="h-3 w-3 text-brand" aria-hidden /> : null}
            </button>
          );
        })}
      </div>

      {customOpen ? (
        <Input
          className="mono max-w-sm text-xs"
          placeholder="예: claude-opus-4-20250514"
          value={value ?? ""}
          onChange={(e) => {
            selfEditRef.current = true;
            onChange(e.target.value.trim() || null);
          }}
        />
      ) : selected ? (
        <p className="flex items-center gap-1.5 text-xs text-fg-muted">
          {(() => {
            const Icon = SPEED_ICON[selected.speed];
            return <Icon className="h-3 w-3 shrink-0 text-fg-faint" aria-hidden />;
          })()}
          {selected.description}
        </p>
      ) : null}
    </div>
  );
}
