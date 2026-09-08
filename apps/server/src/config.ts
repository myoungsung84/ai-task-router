import path from "node:path";
import dotenv from "dotenv";

// Loads apps/server/.env if present. Safe to call even when the file is
// missing — dotenv just no-ops, and every value below already has a default.
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

/**
 * All environment-driven configuration in one place.
 * Nothing here throws — every value has a sane local-dev default.
 */
export const config = {
  port: Number(process.env.PORT ?? 9914),

  /** Where task metadata + per-task logs are persisted (JSON files, no DB). */
  dataDir: process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(__dirname, "..", "data"),

  claudeBin: process.env.CLAUDE_BIN ?? "claude",
  codexBin: process.env.CODEX_BIN ?? "codex",

  /**
   * Permission mode passed to `claude -p`. Non-interactive runs cannot answer
   * prompts, so something other than the interactive default is required.
   * "acceptEdits" auto-accepts file edits but still gates riskier tool use.
   * Override with CLAUDE_PERMISSION_MODE if a project needs e.g. bypassPermissions.
   */
  claudePermissionMode: process.env.CLAUDE_PERMISSION_MODE ?? "acceptEdits",

  /** Codex model override, empty = Codex CLI default. */
  codexModel: process.env.CODEX_MODEL ?? "",

  /** CORS origin for the web dashboard. */
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:9913",

  /**
   * Show the Codex account's email on the usage panel. Off by default.
   *
   * This used to be a decision about reading a credential file: the email was
   * pulled out of `~/.codex/auth.json`, which also holds live access and
   * refresh tokens. That is no longer how it is obtained — `codex app-server`
   * answers `account/read` with the email, and `auth.json` is never opened.
   *
   * The flag stays because displaying an account address is still a choice
   * worth having off by default on a dashboard that gets screenshotted and
   * screen-shared. Turning it off costs only the label; the plan and the
   * limits come from the same CLI answer either way. Claude is unaffected: its
   * profile lives in `~/.claude.json`, which holds no tokens.
   */
  usageShowAccount: (process.env.USAGE_SHOW_ACCOUNT ?? "").toLowerCase() === "true",
};
