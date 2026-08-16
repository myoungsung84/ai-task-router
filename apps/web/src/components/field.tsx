import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/format";

/**
 * One control skin for every text entry point in the app — same radius
 * (`md`), same border, same focus ring. `Input` is locked to the standard
 * 36px control height so it lines up with `Button`/`SelectMenu` in a row;
 * `Textarea` uses the same paddings but grows.
 */
const baseFieldClass =
  "w-full rounded-md border bg-fg/[0.03] px-3 text-sm text-fg placeholder:text-fg-faint " +
  "transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-focus/40 disabled:cursor-not-allowed disabled:opacity-45";

function borderClass(error?: boolean) {
  return error ? "border-danger focus:border-danger" : "border-border focus:border-brand";
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { error?: boolean }
>(function Input({ className, error, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(baseFieldClass, "h-9", borderClass(error), className)}
      {...props}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }
>(function Textarea({ className, error, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(baseFieldClass, "py-2.5 leading-relaxed", borderClass(error), className)}
      {...props}
    />
  );
});

/** The one label style: same size, weight and gap on every screen, so a form never looks assembled from two different kits. */
export function FieldLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("block text-sm font-medium text-fg-secondary", className)}>{children}</span>
  );
}

/** Label + control + optional hint/error. `htmlFor`-less by design: the control is nested, so the browser associates them without an id round-trip. Pass `as="div"` when the control renders its own `<button>` (a nested button inside a `<label>` would steal the click). */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  as: Tag = "label",
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
  as?: "label" | "div";
}) {
  return (
    <Tag className={cn("block", className)}>
      <span className="mb-2 flex items-baseline gap-1">
        <FieldLabel>{label}</FieldLabel>
        {required ? (
          <span className="text-danger" aria-hidden>
            *
          </span>
        ) : null}
      </span>
      {children}
      {error ? (
        <p className="mt-2 text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-2 text-xs text-fg-muted">{hint}</p>
      ) : null}
    </Tag>
  );
}

/** Checkbox + label as one 36px-tall row, so it can sit in a footer next to a Button without either looking misaligned. */
export function Checkbox({
  checked,
  onChange,
  children,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "inline-flex h-9 cursor-pointer select-none items-center gap-2 text-sm text-fg-secondary",
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 rounded-sm accent-brand"
      />
      {children}
    </label>
  );
}
