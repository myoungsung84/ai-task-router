import type { Config } from "tailwindcss";

/** `rgb(var(--x) / <alpha-value>)` — resolves to the CSS variable defined in globals.css and still supports Tailwind's `/opacity` modifiers (e.g. `bg-brand/10`, `border-warning/40`). */
function token(name: string) {
  return `rgb(var(--${name}) / <alpha-value>)`;
}

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      maxWidth: {
        // The one shared outer-frame width for the header and every main
        // page (Home/Settings/Task Detail) — defined once here so they
        // can't drift apart; a page that also wants a narrower reading
        // column for long text nests that *inside* this width rather than
        // using a different root width of its own (see TaskDetail).
        content: "68rem", // 1088px
        // Comfortable measure for running prose (instructions, step
        // summaries, review messages) — used *inside* `content`, never as a
        // competing page width.
        reading: "44rem", // 704px
      },
      colors: {
        bg: token("bg"),
        surface: token("surface"),
        "surface-raised": token("surface-raised"),
        "surface-sunken": token("surface-sunken"),
        border: {
          DEFAULT: token("border"),
          strong: token("border-strong"),
        },
        fg: {
          DEFAULT: token("fg"),
          secondary: token("fg-secondary"),
          muted: token("fg-muted"),
          faint: token("fg-faint"),
        },
        brand: {
          DEFAULT: token("brand"),
          strong: token("brand-strong"),
        },
        focus: token("focus"),
        success: {
          DEFAULT: token("success"),
          strong: token("success-strong"),
        },
        warning: {
          DEFAULT: token("warning"),
          strong: token("warning-strong"),
        },
        danger: {
          DEFAULT: token("danger"),
          strong: token("danger-strong"),
        },
        info: token("info"),
        reviewing: token("reviewing"),
        neutral: token("neutral"),
        agent: {
          claude: token("agent-claude"),
          codex: token("agent-codex"),
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
      },
      fontFamily: {
        // `--font-sans` is set on <html> by next/font/local (see
        // src/lib/fonts.ts) to Pretendard Variable; the rest is the
        // pre-Pretendard fallback stack, kept so text stays legible for the
        // brief moment before the variable font finishes loading.
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Cascadia Code", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
