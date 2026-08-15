# Task Lifecycle

## Status values

| status      | meaning                                                              |
| ----------- | -------------------------------------------------------------------- |
| `QUEUED`    | created, not started yet (or reset after a FAILED/CANCELLED restart) |
| `RUNNING`   | git prepared, Claude CLI in progress                                 |
| `REVIEWING` | Claude finished successfully, Codex review in progress               |
| `READY`     | Codex review returned `PASS`                                         |
| `WARNING`   | Codex review returned issues, or the review itself failed to run     |
| `FAILED`    | git preparation failed, or Claude exited non-zero                    |
| `CANCELLED` | user cancelled while RUNNING or REVIEWING                            |

`claudeStatus` and `codexStatus` (`PENDING | RUNNING | SUCCESS | FAILED |
SKIPPED | CANCELLED`) track each runner independently, so the dashboard can
show e.g. `Claude ✅ / Codex REVIEWING` while the overall `status` is still
`REVIEWING`.

## Flow

```
create (QUEUED)
   │  POST /api/tasks/:id/start
   ▼
validate projectPath exists
   ▼
git: is repo? capture current branch, uncommitted-changes flag
   ▼
git: resolve branch
   - branch given + exists        → checkout it
   - branch given + doesn't exist → checkout -b <branch> [<baseBranch>]
   - branch not given             → stay on current branch
   (any checkout conflict from uncommitted changes → FAILED, nothing forced)
   ▼
status = RUNNING, claudeStatus = RUNNING
   ▼
spawn `claude -p "<instruction>"` with cwd = projectPath
   stdout/stderr streamed line-by-line over SSE as they arrive
   ▼
Claude exits
   ├─ non-zero exit code           → status = FAILED, codexStatus = SKIPPED (stop)
   ├─ cancelled mid-run            → status = CANCELLED, codexStatus = SKIPPED (stop)
   └─ exit code 0                  → claudeStatus = SUCCESS, continue
   ▼
status = REVIEWING, codexStatus = RUNNING
   ▼
spawn `codex exec review --json --uncommitted --output-schema ...`
   with cwd = projectPath, reviewing task instruction + git status/diff
   exactly once — no retries, no auto re-invocation of Claude
   ▼
Codex exits
   ├─ cancelled mid-run                        → status = CANCELLED, codexStatus = CANCELLED
   ├─ crashed / result unparseable              → codexStatus = FAILED, status = WARNING
   │                                               (Claude's result is preserved either way)
   ├─ result.result === "PASS"                  → status = READY,   codexStatus = SUCCESS
   └─ result.result === "WARNING"                → status = WARNING, codexStatus = SUCCESS
   ▼
completedAt set, Windows notification fired for READY / WARNING / FAILED
```

## Explicit non-goals (by design, not oversight)

- Codex returning `WARNING` never triggers another Claude run. There is no
  auto-fix loop. The user reads the issues and decides what to do next.
- Codex review runs **exactly once** per task attempt.
- Cancelling only kills that task's own Claude/Codex process tree
  (`taskkill /T /F` on Windows) — other tasks, including ones on the same
  project path, are unaffected (though same-project concurrent starts are
  already blocked — see architecture.md).
- No `git reset --hard`, `git clean -fd`, `git push --force`, merge, rebase,
  or worktree creation anywhere in this codebase.
