"use client";

import { useRef, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/format";
import { Popover } from "./popover";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * The app's own dropdown select — used anywhere a native `<select>` would
 * otherwise show the OS's unstyled menu (a jarring white system popup
 * against this dark theme).
 *
 * Deliberately a *single* ARIA pattern rather than a pile of nested roles:
 * a `button` trigger (`aria-haspopup="listbox"` / `aria-expanded` /
 * `aria-controls`) opening a `ul[role=listbox]` whose children are
 * `li[role=option]` — no `button` inside an `option`, which would give the
 * option two conflicting roles and two conflicting activation behaviours.
 *
 * Keyboard contract, implemented once here:
 *   trigger  Enter / Space / ↓ / ↑   open (native for Enter/Space)
 *   listbox  ↓ ↑ Home End            move the roving focus
 *            Enter / Space           choose the focused option, close,
 *                                    focus returns to the trigger
 *            Escape                  close without choosing (Popover), focus
 *                                    returns to the trigger
 *            Tab                     close and continue past the trigger —
 *                                    never a trip around the whole page
 * Opening focuses the currently selected option (first option when nothing
 * is selected yet) via Popover's `data-popover-autofocus` hook.
 */
export function SelectMenu({
  value,
  onChange,
  options,
  placeholder = "선택",
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Accessible name for the trigger when no visible `<label>` wraps it. */
  label?: string;
  className?: string;
}) {
  const current = options.find((o) => o.value === value);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  function focusOption(index: number) {
    const clamped = Math.max(0, Math.min(options.length - 1, index));
    optionRefs.current[clamped]?.focus();
  }

  function indexOfActive(): number {
    return optionRefs.current.findIndex((el) => el === document.activeElement);
  }

  function onListKeyDown(e: KeyboardEvent<HTMLUListElement>, close: () => void) {
    const active = indexOfActive();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusOption(active + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusOption(active - 1);
        break;
      case "Home":
        e.preventDefault();
        focusOption(0);
        break;
      case "End":
        e.preventDefault();
        focusOption(options.length - 1);
        break;
      case " ":
      case "Enter": {
        e.preventDefault();
        const opt = options[active];
        if (opt) onChange(opt.value);
        close();
        break;
      }
      case "Tab":
        // Not prevented: closing returns focus to the trigger first, so the
        // browser's own Tab then continues from there to the next control.
        close();
        break;
      default:
        break;
    }
  }

  return (
    <Popover
      align="end"
      panelClassName="min-w-[13rem]"
      trigger={({ open, toggle, setOpen }) => (
        <button
          type="button"
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (!open) setOpen(true);
            }
          }}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label}
          className={cn(
            "flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors duration-fast",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
            open
              ? "border-border-strong bg-fg/[0.06] text-fg"
              : "border-border bg-fg/[0.03] text-fg-secondary hover:border-border-strong hover:text-fg",
            className,
          )}
        >
          <span className="max-w-[11rem] truncate">{current?.label ?? placeholder}</span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-fg-muted transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      )}
    >
      {({ close }) => (
        <ul
          role="listbox"
          aria-label={label}
          className="max-h-72 overflow-y-auto p-1"
          onKeyDown={(e) => onListKeyDown(e, close)}
        >
          {options.map((opt, i) => {
            const selected = opt.value === value;
            return (
              <li
                key={opt.value}
                ref={(el) => {
                  optionRefs.current[i] = el;
                }}
                role="option"
                aria-selected={selected}
                tabIndex={i === selectedIndex ? 0 : -1}
                data-popover-autofocus={i === selectedIndex ? "" : undefined}
                onClick={() => {
                  onChange(opt.value);
                  close();
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-fast",
                  "focus:outline-none focus:bg-fg/[0.08] hover:bg-fg/[0.06]",
                  selected ? "text-fg" : "text-fg-secondary",
                )}
              >
                <span className="truncate">{opt.label}</span>
                {selected ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Popover>
  );
}
