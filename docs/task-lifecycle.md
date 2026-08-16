# Task Lifecycle

> How a Task's `workflow.steps[]` gets decided in the first place —
> `TaskPurpose` + Settings' Role config, not something assembled by hand — is
> covered in [architecture.md](./architecture.md#task-purpose--roles-replaces-hand-built-workflow-steps).
> Everything below is what happens once that Workflow exists, which hasn't
> changed.

## Status values

| status      | meaning                                                                  |
| ----------- | ------------------------------------------------------------------------ |
| `QUEUED`    | created, not started yet (or reset after a FAILED/CANCELLED restart)     |
| `RUNNING`   | git prepared, an `implement`/`analyze` Step in progress                  |
| `REVIEWING` | a `review` Step in progress                                              |
| `READY`     | every Step finished with no review reporting `WARNING`                   |
| `WARNING`   | some `review` Step reported issues, or a review Step's own run failed    |
| `FAILED`    | git preparation failed, or an `implement`/`analyze` Step exited non-zero |
| `CANCELLED` | user cancelled while a Step was RUNNING                                  |

Each `Task.workflow.steps[]` entry tracks its own `status` (`PENDING |
RUNNING | SUCCESS | SKIPPED | FAILED | CANCELLED`) independently, so the
dashboard can show e.g. "Claude ✅ / Codex 리뷰 중" while the overall `status`
is still `REVIEWING`. Which Agent (`claude`/`codex`) runs a given Step, and
whether that Step `implement`s, `analyze`s, or `review`s, is entirely up to
the Task's Workflow — nothing in the executor assumes Claude implements and
Codex reviews.

## Flow

```
create (QUEUED, workflow = Task's own or Settings' default)
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
status = RUNNING
   ▼
for each Step in workflow.steps, in order:
   │
   ├─ action == "review"?
   │     git diff empty? → Step SKIPPED (skipReason=NO_CHANGES), no CLI spawned, continue
   │
   ├─ Step status = RUNNING
   │     status = "REVIEWING" if action=="review" else "RUNNING"
   │     spawn the Step's agent (claude -p / codex exec) with the Step's
   │     permission mapped to the CLI's own sandbox/permission flag
   │     (write → can edit files; read-only → cannot)
   │     stdout/stderr streamed line-by-line over SSE as they arrive
   │
   ├─ cancelled mid-run?             → Step CANCELLED, status = CANCELLED (stop)
   ├─ non-review Step failed?        → Step FAILED, status = FAILED (stop; later Steps stay PENDING)
   ├─ review Step's own run failed?  → Step FAILED, task keeps going (WARNING at the end,
   │                                    earlier Steps' results are never discarded)
   └─ succeeded                      → Step SUCCESS, continue to next Step
   ▼
all Steps done: any review Step reported "WARNING"? → status = WARNING
                                         otherwise    → status = READY
   ▼
completedAt set, Markdown history written/updated, Windows notification
fired for READY / WARNING / FAILED
```

## Review Steps only run when there's something to review

Before a `review`-action Step runs, the executor checks `git diff` /
`git status` in the project. No changes → the Step is marked `SKIPPED` with
`skipReason: "NO_CHANGES"` and the reviewing CLI is never spawned — an
`analyze`-only Workflow (or any Workflow whose earlier Steps made no
changes) never burns a Codex/Claude review call for nothing.

## Explicit non-goals (by design, not oversight)

- A `WARNING` review never triggers another implement/analyze run. There is
  no auto-fix loop. The user reads the issues and decides what to do next.
- Each `review` Step runs **at most once** per Task attempt.
- Cancelling only kills that Task's own active Step's process tree
  (`taskkill /T /F` on Windows) — other tasks, including ones on the same
  project path, are unaffected (though same-project concurrent starts are
  already blocked — see architecture.md).
- No `git reset --hard`, `git clean -fd`, `git push --force`, merge, rebase,
  or worktree creation anywhere in this codebase.

## Legacy data

Tasks stored before the Workflow model existed have no `workflow` field on
disk. `apps/server/src/tasks/legacy-task-normalizer.ts` synthesizes an
equivalent two-Step Workflow (`claude/implement` → `codex/review`) from
their old `claudeStatus`/`codexStatus`/`claudeResult`/`codexReviewResult`
fields the first time the server loads them, and persists that Workflow
(and a backfilled Job ID) back — additively, without touching `logs` or the
original result fields. See `docs/architecture.md`.
