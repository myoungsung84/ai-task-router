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

  /**
   * Where discussion documents are appended.
   *
   * A default, not a fixed path. Deployments keep their official record
   * elsewhere (a work-log tree, say), and when they do the file naming and
   * layout follow that convention rather than this one. Everything the store
   * writes resolves under this root and nothing may escape it, so an agent
   * cannot name an absolute path of its own — otherwise the registered
   * repository list, which is supposed to bound what an AI reads, means
   * nothing.
   */
  discussionsDir: process.env.DISCUSSIONS_DIR
    ? path.resolve(process.env.DISCUSSIONS_DIR)
    : path.resolve(
        process.env.DATA_DIR
          ? path.resolve(process.env.DATA_DIR)
          : path.resolve(__dirname, "..", "data"),
        "discussions",
      ),

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
};
