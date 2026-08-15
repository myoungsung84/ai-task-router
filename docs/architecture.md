# Architecture

```
Browser                          ChatGPT Desktop (or any MCP client)
   │                                       │
   ▼                                       ▼
Next.js Web (apps/web)          MCP endpoint (apps/server/src/mcp, /mcp)
   │  HTTP (REST) + SSE                    │  tools: run_task, run_tasks,
   │                                       │  list_tasks, get_task,
   │                                       │  get_task_result, cancel_task
   ▼                                       ▼
Node Task Server (apps/server)    — all process/git/state management
   ├─ Task Manager    (tasks/task-service.ts, task-store.ts)
   ├─ Task Executor   (tasks/task-executor.ts)   — runs one Task's Workflow Steps in order
   ├─ Agent Runner    (runners/agent-runner.ts)  — dispatches a Step to Claude or Codex
   ├─ Git Manager     (git/git-manager.ts)
   ├─ Settings        (settings/settings-service.ts, settings-store.ts)
   ├─ History         (history/history-service.ts) — Markdown record per finished Task
   ├─ Event Bus/SSE   (stream/event-bus.ts, stream/sse.ts)
   └─ Notifications   (notifications/notifier.ts)
          │
          ▼
     Local Projects (arbitrary paths on disk, each a Git repo)
```

Both entry points (the dashboard's REST API and the MCP tools) are adapters
in front of the same `TaskService` and the same `TaskStore` — a Task created
through either one is immediately visible to the other. Neither entry point
spawns Claude/Codex itself; only `TaskExecutor` does that.

## Why a separate server process

Next.js Route Handlers run inside the Next.js server process and are not a
good place to own long-lived child processes: dev-mode hot reload restarts
that process, and there is no first-class place to keep a registry of
in-flight `ChildProcess` handles across requests. `apps/server` is a plain
Express + Node process whose only job is:

- own every Claude/Codex `child_process`
- own Git state transitions for each task's project path
- own the task state machine and its persistence
- expose that state over HTTP + SSE

`apps/web` never spawns a process or touches git. It only calls the server's
HTTP API and subscribes to its SSE stream.

## Package responsibilities

### `packages/shared`

Plain TypeScript types only (`Task`, `TaskStatus`, `Workflow`/`WorkflowStep`,
`Settings`, SSE event payloads, `CreateTaskInput`). Both apps import from
here so the wire contract can't drift. This is also the contract the MCP
layer speaks, since `TaskService` (see below) is UI/HTTP agnostic.

A Task's execution is a **Workflow**: an ordered `steps[]`, each an
`agent` (`claude`|`codex`) × `action` (`implement`|`analyze`|`review`) ×
`permission` (`write`|`read-only`). No code anywhere pins Claude to
implementing or Codex to reviewing — that pairing is just the default
Workflow, expressed as data. `ClaudeResult`/`CodexReviewResult`/
`claudeStatus`/`codexStatus` still exist on `Task` as `@deprecated` optional
fields purely so already-stored JSON keeps typechecking; no new code reads
them (see "Legacy data" below).

### `apps/server`

- `tasks/task-service.ts` — the only place with business rules
  (validation, the same-project concurrency guard, orchestration kickoff).
  It takes no `req`/`res` — this is intentional: both the REST routes
  (`tasks/task-routes.ts`) and the MCP tools (`mcp/tools/task-tools.ts`) call
  `taskService.createTask()` / `.startTask()` / `.cancelTask()` / etc.
  directly, so Task business logic exists in exactly one place.
- `tasks/task-executor.ts` — runs one Task's `workflow.steps[]` end-to-end,
  in order: git prepare → Step 1 → Step 2 → ... → final status. A `review`
  Step is skipped (no CLI spawned) when there's no git diff to review — see
  `docs/task-lifecycle.md`. Fully async, reports progress through the event
  bus + task store, never through return values (nothing awaits it
  synchronously outside the fire-and-forget call in `task-service`).
- `tasks/job-id.ts` — allocates the short, permanent `jobId` (`T-1042`)
  every Task gets at creation. A file-backed counter
  (`data/job-id-counter.json`); the whole read→increment→write happens
  synchronously with no `await` in between, which is enough to be race-safe
  for concurrent callers on Node's single JS thread — no file locking needed.
- `tasks/legacy-task-normalizer.ts` + `tasks/task-store.ts`'s `init()` —
  one-time, additive migration: a stored Task with no `workflow`/`jobId` gets
  both synthesized (from its old `claudeStatus`/`codexStatus`/`claudeResult`/
  `codexReviewResult` fields) and written back, without touching `logs` or
  the original result fields. `TaskStore.resolve(identifier)` is the single
  resolver every caller (REST, MCP, SSE) uses to accept either the UUID or
  the Job ID.
- `tasks/workflow-builder.ts` / `tasks/workflow-spec-schema.ts` — the zod
  schema for a Workflow spec (shared by REST body validation, Settings, and
  the MCP tools) and the function that turns a validated spec into a
  runnable `Workflow` (fresh Step ids, `PENDING` status).
- `tasks/task-store.ts` — JSON-file persistence. One directory per task under
  `apps/server/data/tasks/<id>/`: `task.json` for metadata, `logs.jsonl` for
  append-only logs. No database, per the v1 scope.
- `git/git-manager.ts` — every git operation used goes through `execFile`
  with an argv array (never a shell string), `-c core.quotepath=false` (so
  non-ASCII filenames aren't octal-escaped in status/diff output), and an
  explicit `encoding: "utf8"`. Only non-destructive commands are used:
  `status`, `diff`, `rev-parse`, `show-ref`, `checkout`, `checkout -b`.
  Nothing here ever runs `reset --hard`, `clean -fd`, `push --force`, merge,
  or rebase.
- `runners/agent-runner.ts` — the one place that decides _which_ runner
  handles a Step (`agent === "claude"` → `claude-runner.ts`, else
  `codex-runner.ts`); the executor never spawns a CLI directly.
- `runners/review-prompt.ts` — the review prompt text, the JSON Schema
  `{ result, issues[] }`, and the output parser, shared by both agents so a
  Claude-reviews-Codex Workflow and a Codex-reviews-Claude Workflow produce
  identically-shaped results.
- `runners/claude/claude-runner.ts` — spawns `claude -p "<prompt>"
--permission-mode <mode>` with `cwd` set to the project path.
  `permission: "write"` → `acceptEdits`; `"read-only"` → `plan` (Claude
  reasons/reports but the CLI itself blocks edits). For a `review` Step the
  prompt asks for the `{result, issues[]}` JSON directly (Claude's `-p` mode
  has no schema-enforcement flag equivalent to Codex's `--output-schema`),
  parsed back out of the trailing output.
- `runners/codex/codex-runner.ts` — for `implement`/`analyze` Steps, spawns
  `codex exec --json --sandbox <read-only|workspace-write> "<instruction>"`.
  For `review` Steps, spawns `codex exec --json -o <file> --output-schema
<file> --sandbox read-only "<review prompt>"` — deliberately plain
  `codex exec`, not `codex exec review`: the `review` subcommand has its own
  fixed free-text report format that ignores `--output-schema`, while plain
  `exec` honors it and returns exactly the `{ result, issues[] }` JSON read
  back from the `-o` file. `--sandbox` is what actually guarantees Codex
  can(not) modify files, not just prompt wording.
- `runners/common/process-utils.ts` — `cross-spawn` (safe on Windows even for
  `.cmd` shims like the Codex CLI) + `taskkill /T /F` based tree-kill for
  cancellation.
- `settings/settings-service.ts` + `settings-store.ts` — the one default
  Workflow (`data/settings.json`), validated through the same
  `workflow-spec-schema.ts` used elsewhere. `taskService.createTask()` falls
  back to it whenever a Task (or an MCP `run_task`/`run_tasks` call) doesn't
  specify its own `workflow`.
- `history/history-service.ts` — on every terminal status
  (`generateHistoryForTask`, called from `task-executor.ts`), renders a
  human-readable Markdown record to `data/history/YYYY-MM/<jobId>-<title>.md`
  (filename characters Windows forbids are stripped; Korean/other non-ASCII
  text is kept as-is). Always overwrites the same path rather than
  appending a new one, so a Task that's restarted and completes again
  updates its one history file instead of duplicating it.
- `stream/event-bus.ts` + `stream/sse.ts` — one `EventEmitter` per task id;
  the SSE handler sends a full task snapshot first (so a page refresh shows
  history immediately) then forwards live `log`/`status` events.
- `notifications/notifier.ts` — Windows toast via `node-notifier`, wrapped so
  a missing/broken notification backend can never crash the pipeline
  (`Notifier` interface + no-op fallback on non-Windows).
- `mcp/mcp-server.ts` — builds an `McpServer` (from `@modelcontextprotocol/sdk`)
  and registers the task tools. A fresh instance is created per client
  session (cheap — it only wires up handlers).
- `mcp/mcp-router.ts` — the official SDK "stateful Streamable HTTP" pattern:
  one `StreamableHTTPServerTransport` per `Mcp-Session-Id`, mounted at
  `/mcp` in `server/app.ts`. Handles POST (tool calls / initialize), GET and
  DELETE (session lifecycle) exactly like the SDK's own example server.
- `mcp/tools/task-tools.ts` — `run_task`, `run_tasks`, `list_tasks`,
  `get_task`, `get_task_result`, `cancel_task`. Every handler just validates
  input (zod) and calls `taskService`; none of them spawn Claude/Codex or
  touch git directly, and none of them await task completion —
  `run_task`/`run_tasks` return as soon as `taskService.startTask()` records
  the RUNNING transition, not when Claude/Codex finish.
- `mcp/tools/format.ts` — response shaping shared by `get_task` /
  `get_task_result` (dashboard URL, diff truncation, log-free task summaries)
  so neither tool duplicates that logic.

### `apps/web`

- `app/*` — thin route files only; the Dashboard (`/`), Task Detail
  (`/tasks/[id]`, accepts UUID or Job ID), Settings (`/settings`), and the
  `/tasks/new` fallback page each render one component from
  `features/tasks/components` or `features/settings/components`.
- `features/tasks/api` — typed `fetch` wrappers around the server's REST API
  - the SSE URL builder. `features/settings/api` does the same for
    `/api/settings`.
- `features/tasks/hooks` — `useTaskList` (polling, for the dashboard's list)
  and `useTask` (SSE-driven — first SSE message is always a full snapshot
  including logs collected so far; used by both the detail page and each
  active `RunningTaskCard`, so only currently-active Tasks pay for a live
  stream).
- `features/tasks/components` — status summary/filter/search, running-task
  cards, `WorkflowTimeline`/`WorkflowStepBadge` (the shared visual language
  for a Step's agent/action/status, used on both cards and the detail page),
  the New Task modal (`Dialog` + `TaskCreateForm` + `WorkflowPresetPicker`),
  `ConfirmDialog`-gated cancel, and the tabbed detail view.
- `features/settings/components` — the default-Workflow editor
  (`WorkflowPresetPicker`/`WorkflowStepEditor`, reused from `features/tasks`)
  and the completed-Task cleanup list.

## Concurrency model

Different project paths run fully in parallel — each task owns its own
`ChildProcess` handles, tracked in `task-executor.ts`'s `activeRuns` map,
keyed by task id. Before starting a task, `task-service.startTask()` checks
whether another active run already targets the same (case-insensitively
normalized) project path and rejects the start with a 409 if so — running
two git checkouts/agent sessions against the same working tree concurrently
is not supported in v1 (no worktrees).

See [task-lifecycle.md](./task-lifecycle.md) for the state machine itself.
