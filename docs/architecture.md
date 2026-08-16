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

## Task purpose & Roles (replaces hand-built Workflow Steps)

A Task creator (the web UI, or an MCP `run_task`/`run_tasks` caller) declares
one **`TaskPurpose`**: `implement` (write) / `analyze` (read-only) / `review`
(read-only). It never assembles Workflow Steps directly. Three **Roles**
(`implementer` / `analyzer` / `reviewer`, `TaskRole` in `packages/shared`)
each have a configured Agent (`claude`/`codex`) + optional model, stored in
`Settings.roles` and editable on `/settings`. `resolveWorkflowSpecForPurpose`
(`packages/shared/src/workflow-purpose.ts`) is the single place that turns
`purpose` + `Settings.roles` (+ an optional per-Task `roleOverrides`) into the
actual `WorkflowSpec` — both the web UI's "who does this" preview and the
server's real Task creation (`taskService.createTask`) call the same
function, so they can never drift. `permission` is never client-controlled:
`implement`'s own Step is always `write`, every `analyze`/`review` Step is
always `read-only`, decided here regardless of what a caller sends.

`Claude 구현 → Codex 리뷰` is only `DEFAULT_ROLE_SETTINGS` — a recommended
starting point, not a pinned pairing. Any Role can point at either Agent, and
a Task can override a used Role's Agent/model for itself via `roleOverrides`
without touching Settings.

The previous "hand-assemble a list of Workflow Steps" UI (`WorkflowPresetPicker`
/ `WorkflowStepEditor`) has been removed from the general product surface, and
so has the per-project "last Workflow used on this path" implicit carry-over
(`project-memory-store.ts` now only remembers recent project _paths_, for the
New Task screen's project picker — never a Workflow). An explicit `workflow`
in `CreateTaskInput` still works end-to-end (old stored Tasks, and any MCP
caller not yet updated to send `purpose`) — it's treated as a full override
that bypasses `purpose`/`roleOverrides` entirely. A `CreateTaskInput` with
neither `purpose` nor `workflow` defaults to `purpose: "implement"` rather
than being rejected, so an old caller that predates this change keeps working.

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

Plain TypeScript types and small pure functions, imported by both apps so the
wire contract can't drift — also the contract the MCP layer speaks, since
`TaskService` (see below) is UI/HTTP agnostic.

- `types.ts` — `Task`, `TaskStatus`, `Workflow`/`WorkflowStep`,
  `TaskPurpose`/`TaskRole`/`RoleConfig`/`RoleOverride`, `Settings`, SSE event
  payloads, `CreateTaskInput`. A Task's execution is a **Workflow**: an
  ordered `steps[]`, each an `agent` (`claude`|`codex`) × `action`
  (`implement`|`analyze`|`review`) × `permission` (`write`|`read-only`) ×
  optional `model`. No code anywhere pins Claude to implementing or Codex to
  reviewing — that pairing is just `DEFAULT_ROLE_SETTINGS`, expressed as
  data. `ClaudeResult`/`CodexReviewResult`/`claudeStatus`/`codexStatus` still
  exist on `Task`, and `defaultWorkflow` still exists on `Settings`, as
  `@deprecated` optional fields purely so already-stored JSON keeps
  typechecking; no new code reads them (see "Legacy data" below).
- `workflow-purpose.ts` — `resolveWorkflowSpecForPurpose(purpose, roles,
overrides?)`, the one function that turns a `TaskPurpose` + `Settings.roles`
  (+ an optional per-Task `roleOverrides`) into a `WorkflowSpec`. Both the web
  UI's "who does this" preview (New Task screen) and the server's real Task
  creation (`taskService.createTask`) call this same function — see "Task
  purpose & Roles" above.
- `title.ts` — `generateTitleFromInstruction`, used by both the web UI's live
  title preview (now gone from the general New Task UI, but still the
  server's guarantee every stored Task has a title) and
  `taskService.createTask`.

### `apps/server`

- `tasks/task-service.ts` — the only place with business rules
  (validation, the same-project concurrency guard, orchestration kickoff).
  It takes no `req`/`res` — this is intentional: both the REST routes
  (`tasks/task-routes.ts`) and the MCP tools (`mcp/tools/task-tools.ts`) call
  `taskService.createTask()` / `.startTask()` / `.cancelTask()` / etc.
  directly, so Task business logic exists in exactly one place.
  `createTask()`'s Workflow source, in priority order: an explicit
  `workflow` (legacy/advanced) > `purpose` + `roleOverrides` resolved via
  `resolveWorkflowSpecForPurpose` against `settingsService.get().roles` >
  `purpose` defaulted to `"implement"` when a caller sends neither.
- `tasks/task-input.ts` — the zod shape (`taskSpecShape`) both
  `task-routes.ts`'s POST body and every MCP tool's input validate against,
  so the REST and MCP entry points can't accept different shapes for
  "create a task". Carries `purpose`, `roleOverrides`, and the legacy
  `workflow` escape hatch.
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
  schema for a Workflow spec (used to validate an explicit legacy `workflow`
  in `task-input.ts`) and the function that turns a validated/resolved spec
  into a runnable `Workflow` (fresh Step ids, `PENDING` status, `model`
  carried through unchanged).
- `tasks/task-store.ts` — JSON-file persistence. One directory per task under
  `apps/server/data/tasks/<id>/`: `task.json` for metadata, `logs.jsonl` for
  append-only logs. No database, per the v1 scope.
- `projects/project-memory-store.ts` — remembers recently-used project
  _paths_ only (`data/project-memory.json`), for the New Task screen's
  project picker default/recent list. No longer remembers a per-project
  Workflow — see "Task purpose & Roles" above.
- `projects/project-routes.ts` — `GET /api/projects/recent` and
  `GET /api/projects/validate` (existence + Git-repo check), backing the New
  Task screen's project picker.
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
--permission-mode <mode>` (plus `--model <model>` when the Step has one) with
  `cwd` set to the project path. `permission: "write"` → `acceptEdits`;
  `"read-only"` → `plan` (Claude reasons/reports but the CLI itself blocks
  edits). For a `review` Step the prompt asks for the `{result, issues[]}`
  JSON directly (Claude's `-p` mode has no schema-enforcement flag equivalent
  to Codex's `--output-schema`), parsed back out of the trailing output.
- `runners/codex/codex-runner.ts` — for `implement`/`analyze` Steps, spawns
  `codex exec --json --sandbox <read-only|workspace-write> "<instruction>"`.
  For `review` Steps, spawns `codex exec --json -o <file> --output-schema
<file> --sandbox read-only "<review prompt>"` — deliberately plain
  `codex exec`, not `codex exec review`: the `review` subcommand has its own
  fixed free-text report format that ignores `--output-schema`, while plain
  `exec` honors it and returns exactly the `{ result, issues[] }` JSON read
  back from the `-o` file. `--sandbox` is what actually guarantees Codex
  can(not) modify files, not just prompt wording. `-m <model>` is added when
  the Step has one, else falling back to the `CODEX_MODEL` env var.
- `runners/common/process-utils.ts` — `cross-spawn` (safe on Windows even for
  `.cmd` shims like the Codex CLI) + `taskkill /T /F` based tree-kill for
  cancellation.
- `settings/settings-service.ts` + `settings-store.ts` — the three Roles'
  Agent/model (`data/settings.json`, `{ roles: { implementer, analyzer,
reviewer } }`). `settings-store.ts`'s `readRoles()` additively migrates an
  old pre-Role `settings.json` (a single `defaultWorkflow`) into `roles` on
  load — by inspecting which Agent each of that Workflow's Steps used per
  action — and never writes `defaultWorkflow` back out.
  `taskService.createTask()` reads `settingsService.get().roles` whenever a
  Task doesn't fully override a Role it needs.
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
  input (zod, via `task-input.ts`'s `taskSpecShape`) and calls `taskService`;
  none of them spawn Claude/Codex or touch git directly, and none of them
  await task completion — `run_task`/`run_tasks` return as soon as
  `taskService.startTask()` records the RUNNING transition, not when
  Claude/Codex finish. `run_task`/`run_tasks`'s tool description is the
  documented interface for an external MCP client (e.g. a ChatGPT custom
  skill, which lives outside this repo and is never edited here) to pass
  `purpose` and a per-Task `roleOverrides` — see README's MCP section.
- `mcp/tools/format.ts` — response shaping shared by `get_task` /
  `get_task_result` (dashboard URL, diff truncation, log-free task summaries)
  so neither tool duplicates that logic.

### `apps/web`

#### Design system

Every screen is built from one set of design tokens and one set of common
components — no screen hand-rolls its own colors, spacing, or status pill.

- **Tokens** (`app/globals.css`) — semantic CSS custom properties as `R G B`
  triples (`--bg`, `--surface`, `--border`, `--fg`/`--fg-secondary`/
  `--fg-muted`/`--fg-faint`, `--brand`, `--focus`, `--success`/`--warning`/
  `--danger`/`--info`/`--reviewing`/`--neutral`, `--agent-claude`/
  `--agent-codex`, plus `--radius-*`/`--shadow-*`/`--duration-*`), defined
  once on `:root` (dark, the only active theme today) and again under
  `:root[data-theme="light"]` (defined but not switched to by any UI yet —
  see below). `tailwind.config.ts` maps each token to a Tailwind color name
  via `rgb(var(--x) / <alpha-value>)`, so ordinary utility classes
  (`bg-surface`, `text-fg-muted`, `border-warning/40`) resolve through the
  token and still support Tailwind's `/opacity` modifier. No component
  reaches for a raw hex value or Tailwind's default color palette
  (`text-blue-300`, `bg-[#121821]`, …) — the whole light-theme path is "add a
  `data-theme="light"` toggle somewhere and set the attribute", not "edit
  every component".
- **Shape** — `--radius-sm/md/lg/xl` (4/6/8/12px) picked by _size_, not by
  importance: `md` for every control (button, input, select, list row, menu
  item), `lg` for a grouping surface (card, panel, log/diff pane), `xl` for
  a floating layer (dialog, popover). A fully rounded pill is deliberately
  **not** the house style — it is reserved for `Badge` (status/severity/
  count chips, which are values rather than controls) and the segmented
  status filter on Home. A tinted fill _and_ a border _and_ a shadow on the
  same box is likewise avoided: one of them carries the boundary.
- **Spacing and control height** — only Tailwind steps `1/2/3/4/6/8/12`
  (4→48px) are used, in that order of scope (icon↔label → inside a control →
  related items → related blocks → sections → page regions), and every
  standard control is `h-9` (36px), with `h-8` for compact/secondary and
  `h-10` for a dialog's primary action. A row that mixes control heights is
  a bug, not a style choice. See the comment block in `globals.css`.
- **Typography** — Pretendard Variable, self-hosted through
  `next/font/local` (`lib/fonts.ts`, `src/fonts/pretendard/`). Page title
  `text-xl semibold`, task title `text-2xl semibold`, section labels via
  `SectionLabel` (`text-xs semibold`, `fg-muted` — never `fg-faint`), body
  `text-sm fg-secondary`, metadata `text-xs fg-muted`. Monospace (`.mono`,
  `tabular-nums`) is only for machine-shaped values: paths, branches, Job
  IDs, model ids, logs and diffs.
- **`components/`** — the shared building blocks every screen composes
  instead of re-implementing: `button.tsx` (`Button`/`IconButton`, 5
  variants × loading/disabled states, fixed heights), `field.tsx`
  (`Input`/`Textarea`/`Field`/`FieldLabel`/`Checkbox`), `card.tsx`
  (`Card` + `SectionLabel`), `badge.tsx` (`Badge`, one tone system reused
  by Task status, Step status and review severity), `agent-icon.tsx`
  (`AgentIcon`/`AgentAvatar` — Claude/Codex's one visual identity
  everywhere, see below), `agent-picker.tsx` + `model-picker.tsx` (the
  settings role editor and the per-task override use the same two
  components), `alert.tsx` (attention/success/error banners), `states.tsx`
  (`EmptyState`/`LoadingState`/`ErrorState`), `tabs.tsx` (an
  underlined tab strip, so the tab row shares the content's left baseline),
  `dialog.tsx` (portal + scroll lock + focus trap + optional pinned footer)
  / `confirm-dialog.tsx`, `popover.tsx` (the anchored-panel
  plumbing behind every custom dropdown: portal, position tracking, outside
  click, Escape, and focus-into-panel-on-open), `select-menu.tsx` (a single
  `button` → `listbox`/`option` ARIA pattern with the full ↓↑/Home/End/
  Enter/Escape/Tab contract implemented once), `copy-button.tsx`,
  `toast.tsx`, `brand-mark.tsx` (the four-point spark used in the header),
  `theme-toggle.tsx`, `app-header.tsx`.
- **Claude/Codex visual identity** (`components/agent-icon.tsx`) — two
  original, simple single-path SVG glyphs (not a reproduction of either
  company's logo/wordmark): Claude is a soft four-point spark (warm
  clay/orange, `--agent-claude`), Codex is `</>` code brackets (teal,
  `--agent-codex`). Both render via `currentColor` so a wrapping
  `text-agent-claude`/`text-agent-codex` class sets the color; `AgentAvatar`
  adds the circular brand-tinted badge used on role cards, task rows, and
  the workflow timeline. No emoji, no remote image URLs — everything is an
  inline SVG shipped in the bundle. General-purpose UI icons use
  `lucide-react` throughout, for the same reason (local, tree-shakeable, no
  runtime fetch).
- `app/*` — thin route files only. Three routes: the Dashboard (`/`), Task
  Detail (`/tasks/[id]`, accepts UUID or Job ID) and Settings
  (`/settings`), each rendering one component from
  `features/tasks/components` or `features/settings/components`. Task
  creation has no route of its own — it is a dialog available from every
  screen (see `NewTaskModal`).
- `features/tasks/api` — typed `fetch` wrappers around the server's REST API
  - the SSE URL builder. `features/tasks/api/projects-api.ts` does the same
    for `/api/projects/*`; `features/settings/api` for `/api/settings`.
- `features/tasks/hooks` — `useTaskList` (polling, for the dashboard's list)
  and `useTask` (SSE-driven — first SSE message is always a full snapshot
  including logs collected so far; used by both the detail page and each
  `ActiveTaskRow`, so only currently-active Tasks pay for a live stream).
- `features/tasks/components` — `TaskList` (the Home dashboard: one
  bordered list with a column-header row, rows always ordered 진행 중 →
  확인 필요 → 완료, and group headings rendered _only_ when more than one
  group is present so a small workspace never grows empty subheadings),
  `task-row.tsx` (`TaskListHeader` + `TaskRow` + `ActiveTaskRow` — one set
  of column widths shared by the header and every row; the active variant
  adds a brand flag and a live log tail without becoming a second layout),
  `WorkflowTimeline` (the shared visual language for a Step's
  agent/action/status), the New Task dialog (`Dialog` + `TaskCreateForm` +
  `ProjectPathField` (the app's own dropdown, not a native `<datalist>`) +
  `PurposePicker` + `RoleOverridePanel` + `BranchField`, ordered
  프로젝트·브랜치 → 작업 지시 → 작업 유형 → 담당 AI 변경 → action bar),
  `ConfirmDialog`-gated cancel/delete/resolve, and `TaskDetail` (status +
  title + actions header, then two columns on `lg`: the outcome — key
  `Alert`, step summaries, instruction, changed files, 리뷰/변경 내용/실행
  로그 tabs — beside a narrow metadata column holding `WorkflowTimeline`
  and project/branch/AI/time, so technical detail never precedes the result
  and no block switches measure partway down the page).
- `features/settings/components` — `RoleSettings` (three `RoleCard` rows —
  구현/분석/리뷰 담당 — grouped by the kind of work that triggers them, each
  collapsed to role + description + the assigned AI/model in a fixed column
  so the three are comparable straight down, and expanding one opens an
  `AgentPicker` + `ModelPicker` inline; at most one is open at a time, and
  one save action sits at the foot of the same list) and the completed-task
  cleanup list. `lib/model-catalog.ts` is the presentation-only model
  catalog behind `ModelPicker` (Claude's stable `sonnet`/`opus`/`haiku`
  aliases as recommended options; Codex has no equivalent stable alias, so
  its only recommended option is "자동 선택" — both always pair with a
  "직접 입력" free-text fallback, whose open/closed state is derived from
  the incoming value so the screen can never disagree with what will be
  sent). None of this is validated server-side beyond
  "is it a string" — the server just forwards whatever string a Role holds
  to the CLI's `--model`/`-m` flag.

## Concurrency model

Different project paths run fully in parallel — each task owns its own
`ChildProcess` handles, tracked in `task-executor.ts`'s `activeRuns` map,
keyed by task id. Before starting a task, `task-service.startTask()` checks
whether another active run already targets the same (case-insensitively
normalized) project path and rejects the start with a 409 if so — running
two git checkouts/agent sessions against the same working tree concurrently
is not supported in v1 (no worktrees).

See [task-lifecycle.md](./task-lifecycle.md) for the state machine itself.
