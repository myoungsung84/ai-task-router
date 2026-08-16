import type { AgentName } from "@/features/tasks/types";

export interface ModelOption {
  /** Value actually sent to the server / CLI (`--model` / `-m`). `null` = "let the CLI use its own default", the recommended choice when nothing more specific is known. */
  value: string | null;
  label: string;
  /** One short line, shown under the chip row for the selected model only. Kept to a single clause — the picker is a choice, not a datasheet. */
  description: string;
  speed: "빠름" | "보통" | "느림";
  recommended?: boolean;
}

/**
 * Presentation-only catalog for the Settings Role cards' model picker — the
 * server never validates against this list (it just forwards whatever
 * string a Role's `model` holds to the CLI via `--model`/`-m`), so this can
 * stay a curated, human-friendly subset rather than a live enumeration of
 * every model the CLI happens to support.
 *
 * Claude CLI accepts short aliases ("sonnet"/"opus"/"haiku") that always
 * resolve to that tier's current model, so the recommended cards use those
 * — they don't go stale as Anthropic ships new snapshots. Codex CLI has no
 * equivalent stable alias, so its catalog only offers "자동 선택" plus the
 * advanced free-text field — recommending a specific dated model name here
 * would risk recommending one the user's installed CLI doesn't support.
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
      speed: "보통",
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
      description: "최고 성능, 대신 느림 — 복잡한 구현과 어려운 리뷰에 적합",
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
      speed: "보통",
      recommended: true,
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
