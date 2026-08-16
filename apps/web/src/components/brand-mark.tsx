import { cn } from "@/lib/format";

/**
 * The app's brand symbol: a four-point spark with a smaller companion spark
 * — the "AI" cue this product category reads instantly — drawn as two plain
 * filled paths in `currentColor`. Deliberately not a circular mascot and not
 * a wordmark: at 20–24px it has to stay a crisp silhouette next to 14px
 * type, so it carries no gradient, no stroke detail and no enclosed face.
 *
 * `boxed` (the default) sets it on a very faint brand-tinted rounded square,
 * which is what gives the header's left edge a definite anchor without
 * turning into a logo tile. Pass `boxed={false}` where the glyph alone is
 * wanted — a favicon-ish mark, an empty state, a future about screen.
 */
export function BrandMark({
  size = 22,
  boxed = true,
  className,
}: {
  /** Glyph size in px. Keep within 20–24 for headers and inline use. */
  size?: number;
  boxed?: boolean;
  className?: string;
}) {
  const glyph = (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn("shrink-0", !boxed && className)}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M10 2.6c.35 0 .63.27.66.62.32 3.65 2.47 5.8 6.12 6.12a.66.66 0 0 1 0 1.32c-3.65.32-5.8 2.47-6.12 6.12a.66.66 0 0 1-1.32 0c-.32-3.65-2.47-5.8-6.12-6.12a.66.66 0 0 1 0-1.32c3.65-.32 5.8-2.47 6.12-6.12.03-.35.31-.62.66-.62Z"
      />
      <path
        fill="currentColor"
        opacity="0.55"
        d="M18 14.2c.3 0 .54.23.57.53.17 1.79 1.11 2.73 2.9 2.9a.57.57 0 0 1 0 1.14c-1.79.17-2.73 1.11-2.9 2.9a.57.57 0 0 1-1.14 0c-.17-1.79-1.11-2.73-2.9-2.9a.57.57 0 0 1 0-1.14c1.79-.17 2.73-1.11 2.9-2.9.03-.3.27-.53.57-.53Z"
      />
    </svg>
  );

  if (!boxed) return glyph;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md bg-brand/10 p-1 text-brand",
        className,
      )}
    >
      {glyph}
    </span>
  );
}
