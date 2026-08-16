import type { RoleConfig, RoleOverride, RoleSettings, TaskPurpose, WorkflowSpec } from "./types";

/**
 * Turns "what this Task is for" (`purpose`) + the configured Role Settings
 * into the concrete Workflow Steps that actually run — the one place this
 * mapping exists, so the web UI's live "누가 할지" preview and the server's
 * real Task creation (`taskService.createTask`) can never drift apart, the
 * same pattern `generateTitleFromInstruction` uses for titles.
 *
 * `permission` is never taken from the caller — it's fixed by purpose/role
 * here: the implementer's own Step is "write", every review/analyze Step is
 * "read-only". A per-Task `overrides` entry can swap which Agent/model a
 * Role uses, but never which Role runs or what it's allowed to touch.
 */
export function resolveWorkflowSpecForPurpose(
  purpose: TaskPurpose,
  roles: RoleSettings,
  overrides?: Partial<Record<keyof RoleSettings, RoleOverride>> | null,
): WorkflowSpec {
  function resolve(role: keyof RoleSettings): RoleConfig {
    const base = roles[role];
    const override = overrides?.[role];
    return {
      agent: override?.agent ?? base.agent,
      model: override?.model !== undefined ? override.model : base.model,
    };
  }

  if (purpose === "implement") {
    const implementer = resolve("implementer");
    const reviewer = resolve("reviewer");
    return {
      steps: [
        {
          agent: implementer.agent,
          action: "implement",
          permission: "write",
          model: implementer.model,
        },
        { agent: reviewer.agent, action: "review", permission: "read-only", model: reviewer.model },
      ],
    };
  }

  if (purpose === "analyze") {
    const analyzer = resolve("analyzer");
    return {
      steps: [
        {
          agent: analyzer.agent,
          action: "analyze",
          permission: "read-only",
          model: analyzer.model,
        },
      ],
    };
  }

  // "review"
  const reviewer = resolve("reviewer");
  return {
    steps: [
      { agent: reviewer.agent, action: "review", permission: "read-only", model: reviewer.model },
    ],
  };
}

/** Which Role(s) a purpose actually uses, in run order — drives both the server's Step order and the web UI's "누가 할지" preview/override fields. */
export function rolesForPurpose(purpose: TaskPurpose): (keyof RoleSettings)[] {
  if (purpose === "implement") return ["implementer", "reviewer"];
  if (purpose === "analyze") return ["analyzer"];
  return ["reviewer"];
}
