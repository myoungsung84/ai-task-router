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
   ├─ Task Manager   (tasks/task-service.ts, task-store.ts)
   ├─ Task Executor  (tasks/task-executor.ts)   — orchestrates one task's lifecycle
   ├─ Git Manager    (git/git-manager.ts)
   ├─ Claude Runner  (runners/claude/claude-runner.ts)
   ├─ Codex Runner   (runners/codex/codex-runner.ts)
   ├─ Event Bus/SSE  (stream/event-bus.ts, stream/sse.ts)
   └─ Notifications  (notifications/notifier.ts)
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

Plain TypeScript types only (`Task`, `TaskStatus`, `CodexReviewResult`, SSE
event payloads, `CreateTaskInput`). Both apps import from here so the wire
contract can't drift. This is also the contract the MCP layer speaks, since
`TaskService` (see below) is UI/HTTP agnostic.

### `apps/server`

- `tasks/task-service.ts` — the only place with business rules
  (validation, the same-project concurrency guard, orchestration kickoff).
  It takes no `req`/`res` — this is intentional: both the REST routes
  (`tasks/task-routes.ts`) and the MCP tools (`mcp/tools/task-tools.ts`) call
  `taskService.createTask()` / `.startTask()` / `.cancelTask()` / etc.
  directly, so Task business logic exists in exactly one place.
- `tasks/task-executor.ts` — runs one task end-to-end: git prepare → Claude →
  Codex review → final status. Fully async, reports progress through the
  event bus + task store, never through return values (nothing is awaiting it
  synchronously outside the fire-and-forget call in `task-service`).
- `tasks/task-store.ts` — JSON-file persistence. One directory per task under
  `apps/server/data/tasks/<id>/`: `task.json` for metadata, `logs.jsonl` for
  append-only logs. No database, per the v1 scope.
- `git/git-manager.ts` — every git operation used goes through `execFile`
  with an argv array (never a shell string). Only non-destructive commands
  are used: `status`, `diff`, `rev-parse`, `show-ref`, `checkout`,
  `checkout -b`. Nothing here ever runs `reset --hard`, `clean -fd`, `push
--force`, merge, or rebase.
- `runners/claude/claude-runner.ts` — spawns
  `claude -p "<instruction>" --permission-mode <mode>` with `cwd` set to the
  task's project path, streams stdout/stderr line by line.
- `runners/codex/codex-runner.ts` — spawns
  `codex exec --json -o <file> --output-schema <file> --sandbox read-only
"<review prompt>"`. Deliberately plain `codex exec`, not `codex exec
review` — the `review` subcommand has its own fixed free-text report
  format that ignores `--output-schema`, while plain `exec` honors it and
  returns exactly the `{ result, issues[] }` JSON read back from the `-o`
  file after the process exits. `--sandbox read-only` is what actually
  guarantees Codex cannot modify any file during this pass; the
  "review uncommitted changes only" scope is stated in the prompt itself,
  since `exec` (unlike `exec review`) has no `--uncommitted` flag.
- `runners/common/process-utils.ts` — `cross-spawn` (safe on Windows even for
  `.cmd` shims like the Codex CLI) + `taskkill /T /F` based tree-kill for
  cancellation.
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

- `app/*` — thin route files only; each page renders one component from
  `features/tasks/components`.
- `features/tasks/api` — typed `fetch` wrappers around the server's REST API
  - the SSE URL builder.
- `features/tasks/hooks` — `useTaskList` (polling, for the dashboard table)
  and `useTask` (SSE-driven, for the detail page — first SSE message is
  always a full snapshot including logs collected so far).
- `features/tasks/components` — list, create form, detail view, log panels
  (per source: system/claude/codex), Codex review panel, diff view.

## Concurrency model

Different project paths run fully in parallel — each task owns its own
`ChildProcess` handles, tracked in `task-executor.ts`'s `activeRuns` map,
keyed by task id. Before starting a task, `task-service.startTask()` checks
whether another active run already targets the same (case-insensitively
normalized) project path and rejects the start with a 409 if so — running
two git checkouts/Claude sessions against the same working tree concurrently
is not supported in v1 (no worktrees).

See [task-lifecycle.md](./task-lifecycle.md) for the state machine itself.
