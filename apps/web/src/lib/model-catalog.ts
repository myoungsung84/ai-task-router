import type { AgentName } from "@/features/tasks/types";

export interface ModelOption {
  /** Value actually sent to the server / CLI (`--model` / `-m`). `null` = "let the CLI use its own default", the recommended choice when nothing more specific is known. */
  value: string | null;
  label: string;
  /** One short line, shown under the chip row for the selected model only. Kept to a single clause — the picker is a choice, not a datasheet. */
  description: string;
  /**
   * Relative speed, when there is a basis for saying so — omitted otherwise.
   *
   * Claude's tiers are ordered by design and the CLI's alias names say which
   * is which. Codex reports no speed at all, and filling it in from the model
   * name is a guess dressed as a fact; the picker hides the icon rather than
   * show one that was invented.
   */
  speed?: "빠름" | "보통" | "느림";
  recommended?: boolean;
}

/**
 * Presentation-only catalog for the Settings Role cards' model picker — the
 * server never validates against this list (it just forwards whatever
 * string a Role's `model` holds to the CLI via `--model`/`-m`), so this can
 * stay a curated, human-friendly subset rather than a live enumeration of
 * every model the CLI happens to support.
 *
 * Claude CLI accepts short aliases ("sonnet"/"opus"/"haiku"/"fable") that
 * always resolve to that tier's current model, so the cards use those — they
 * don't go stale as Anthropic ships new snapshots. `claude --help` documents
 * the aliases alongside full names such as "claude-fable-5".
 *
 * Codex CLI has no equivalent alias: `-m` takes a concrete model name, so any
 * card here names one and can therefore go stale or name one a given install
 * does not have. "자동 선택" stays the recommendation for that reason, and the
 * advanced free-text field remains the way to reach anything not listed.
 *
 * **Curated means curated — do not paste the CLI's model list in here.** The
 * picker is one segmented row, and it stops being one control at around six
 * segments: a full enumeration (seven Codex models arrived that way once)
 * wraps into a block of chips, and captions written to cover every entry
 * collapse into near-duplicates that give nobody a reason to pick one. One
 * card per distinct job is the rule — most capable, the everyday default,
 * fast and cheap — and the CLI's own wording is the source for each caption.
 * Everything omitted is still reachable by typing its id into 직접 입력, which
 * is what that field is for. Models deliberately left out: gpt-5.6-terra
 * (overlaps Sol), gpt-5.5, gpt-5.4-mini, gpt-5.3-codex-spark (overlaps Luna).
 */
export const MODEL_CATALOG: Record<AgentName, ModelOption[]> = {
  claude: [
    {
      // Every agent's catalog must carry an explicit entry for `null`,
      // because `null` is a real, storable setting ("no --model flag, let the
      // CLI decide") and not an absence. Without one, `findModelOption`
      // returns nothing for a stored `null` and any UI that falls back to
      // "first option" silently claims a model the settings never contained.
      value: null,
      label: "자동 선택",
      description: "모델을 지정하지 않고 설치된 Claude의 기본값을 사용",
    },
    {
      value: "sonnet",
      label: "Sonnet",
      description: "속도와 성능의 균형 — 구현·분석·리뷰 전반에 적합",
      speed: "보통",
      recommended: true,
    },
    {
      value: "opus",
      label: "Opus",
      description: "높은 성능, 대신 느림 — 복잡한 구현과 어려운 리뷰에 적합",
      speed: "느림",
    },
    {
      // Alias, not "claude-fable-5-1", for the same reason the other cards use
      // one: the alias follows the tier. The account this was added on lists
      // Fable 5.1 as an available option, and the CLI's own --model help names
      // "fable" as a current alias.
      value: "fable",
      label: "Fable",
      description: "가장 높은 성능, 가장 느림 — 오래 걸리는 난이도 높은 작업에 적합",
      speed: "느림",
    },
    {
      value: "haiku",
      label: "Haiku",
      description: "가장 빠름 — 단순하고 명확한 작업에 적합",
      speed: "빠름",
    },
  ],
  codex: [
    {
      value: null,
      label: "자동 선택",
      description: "설치된 Codex가 알맞은 모델을 선택",
      recommended: true,
    },
    {
      value: "gpt-6-astra",
      label: "GPT-6 Astra",
      description: "가장 높은 성능 — 복잡하고 부담이 큰 작업에 적합",
    },
    {
      value: "gpt-5.6-sol",
      label: "GPT-5.6 Sol",
      description: "최신 세대의 기본 코딩 모델 — 전반적인 작업에 적합",
    },
    {
      value: "gpt-5.6-luna",
      label: "GPT-5.6 Luna",
      description: "빠르고 저렴함 — 단순하고 양이 많은 작업에 적합",
    },
  ],
};

/** Advanced/manual entry is always available in addition to the catalog above (see RoleCard) — this just finds a catalog entry's display info for a stored value, falling back to "직접 입력" when the value doesn't match a known card. */
export function findModelOption(
  agent: AgentName,
  value: string | null | undefined,
): ModelOption | null {
  return MODEL_CATALOG[agent].find((m) => (m.value ?? null) === (value ?? null)) ?? null;
}

/**
 * The model a Role/override should fall back to the moment its Agent
 * changes — a model value from the *previous* Agent is never a valid
 * `--model`/`-m` argument for the new one (Claude's "sonnet" means nothing
 * to the Codex CLI, and vice versa), so every "switch Agent" control in the
 * app must pair its Agent update with this, never carry the old model over.
 * Simply "whichever catalog entry is flagged recommended" — Claude's is
 * "sonnet", Codex's is `null` ("자동 선택") — so this never needs updating
 * by hand when the catalog changes.
 */
export function defaultModelForAgent(agent: AgentName): string | null {
  return MODEL_CATALOG[agent].find((m) => m.recommended)?.value ?? null;
}
