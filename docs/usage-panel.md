# Usage Panel

The band above the Task list reports, for both CLIs: which account is signed
in, how much of each plan window is used, when each window resets, and how
many tokens were spent today (Asia/Seoul).

```
◆ Claude       alice · Max 5x   5h ▓▓░░░░░░  3%  9/5 12:10   7d ░░░░░░░░  0%  9/7 09:00   오늘 18.4M tok   08:03 기준
◆ Codex  +1    Plus                       –     7d ▓▓▓▓▓░░░ 67%  9/9 11:22               오늘 19.7k tok   08:03 기준
```

Three things in that second row are deliberate and used to be wrong.

**The window labels are read, not assumed.** Each window carries its own
`windowMinutes` and the label is rendered from it. The two slots are `primary`
and `secondary`, which is all the CLIs promise; they were once called
`fiveHour` and `sevenDay` in code, and Codex — which had been reporting
`window_minutes` all along, unread — turned out to put a **7-day** window in
`primary` on at least one plan. That row rendered its 7-day usage under a "5h"
heading and left "7d" blank.

**미확인 is not 0%.** A window with no reading shows no fill and says 미확인.
An empty gauge next to "0%" is a claim that the plan is barely touched, and
that claim was being made for expired windows and failed reads alike.

**계정 미확인 says the pairing was not checked.** See below.

Nothing here calls an API. Every number is read off files the two CLIs already
write on this machine, through `GET /api/usage`
(`apps/server/src/usage/`), which caches a snapshot for 60 seconds.

## Where each number comes from

|        | Tokens today                           | Plan limits                    |
| ------ | -------------------------------------- | ------------------------------ |
| Codex  | `~/.codex/sessions/**/rollout-*.jsonl` | **`codex app-server`** (below) |
| Claude | `~/.claude/projects/**/*.jsonl`        | **status line hook** (below)   |

**Codex limits come from the CLI, not from files.** `codex app-server --stdio`
answers `account/read` (email, plan) and `account/rateLimits/read` (the
windows, and `rateLimitsByLimitId` for per-model limits). No model request is
sent — only those two queries — and a failed query is reported as 한도 미확인
rather than falling back to session records, because the account those records
belong to cannot be established. The query gives up after 15 seconds.

Each window carries `windowDurationMins`. **Do not assume which duration lands
in which slot.** This document once said primary = 300 minutes and secondary =
10080; on a real account primary carries the 10080-minute window and secondary
is absent entirely. The reported duration is the only answer.

**Codex's token total still comes from the rollout files**, summing each turn's
`last_token_usage` rather than the session's cumulative `total_token_usage`, so
a session that began yesterday contributes only the part of it that happened
today. The CLI exposes no token total, and this figure is per-machine anyway
(see 오늘 로컬 below).

**Claude** records per-message `usage` in its transcripts, which is where
today's token figure comes from. Its plan limits are the awkward one: Claude
Code hands the 5-hour and 7-day percentages to the status line command on stdin
and stores them nowhere — not under `~/.claude`, not in a CLI subcommand, and
not in `claude -p --output-format json`'s result. The status line is the only
place they surface, so the hook below copies them to a file.

The server caches a whole snapshot for 60 seconds and the band re-reads it on
the same cadence, pausing while the tab is hidden and refetching the moment it
comes back.

## The status line hook

Claude's plan limits need one piece of local setup. Install it with:

```bash
pnpm setup:usage-hook
```

It prints exactly what it will change to `~/.claude/settings.json`, waits for
confirmation (`--yes` skips the prompt), backs the file up, and is a no-op if
already installed. `pnpm uninstall:usage-hook` puts the previous status line
back from the record it kept. `CLAUDE_CONFIG_DIR` is respected throughout.

What it installs is a _wrapper_, not a snippet pasted into your status line:
`scripts/usage-snapshot.mjs` becomes the `statusLine.command`, records the
limits from the payload, then runs your original command with that same payload
so your terminal looks exactly as it did. If you had no status line, it prints a
minimal one (directory | model) rather than a blank strip.

Wrapping is why this works for anyone. An earlier version appended a shell
snippet that read variables one particular `statusline.sh` happened to have
already parsed — fine on the machine it was written on, useless anywhere else.

Without the hook the panel still shows Claude's account, plan and today's
tokens, and says `한도 스냅샷이 없습니다` in place of the gauges. Codex needs no
setup at all.

### The limit of it

The hook only runs when a status line renders, which means **interactive Claude
sessions only**. Headless `claude -p` runs — including every Task this app
launches — never refresh it. In practice that is fine for anyone who works in
Claude Code, and when it is not, the row fades and its `기준` time says how old
the reading is.

## Optional: the Codex account label

`USAGE_SHOW_ACCOUNT=true` in `apps/server/.env` adds the Codex account's email
to its row. Off by default.

This used to be a decision about reading a credential file — the email came out
of `~/.codex/auth.json`, which also holds live access and refresh tokens. It
does not any more: `account/read` returns the email and `auth.json` is never
opened. The flag stays because showing an account address is still worth having
off by default on a dashboard that gets screenshotted and screen-shared.
Turning it off costs only the label; the plan and the limits arrive from the
same CLI answer regardless.

Claude's account label is unconditional — `~/.claude.json` is a profile file
with no tokens in it.

## Reading the row honestly

Claude only records its limits **while it runs**, so its reading is a snapshot
rather than a live value: the status-line hook refreshes it on every
interactive turn, and a day away from Claude Code leaves a real but old number.
Codex is queried live, so its reading is current whenever the query succeeds.

**Rows fade as their reading ages** (an hour, then a day), and the wall-clock
`기준` time at the end of each row says exactly when it was taken. The fade is
what you notice without looking; the time is what you check once you have.

A window whose `resets_at` has already passed reports **미확인**, not 0% and not
its last-seen percentage. Both of the alternatives are wrong in different
directions: the old percentage describes a window that no longer exists, and 0%
is a claim about the new window that nothing has read yet. Only the CLI's next
run can supply that.

Token counts include cache reads alongside fresh input. They are the largest
part of a coding session, and excluding them would both understate the work and
stop matching Codex's `total_tokens`, whose input already includes its cached
portion.

**"오늘" is a time scope, not an account scope.** The figure sums every
transcript on the machine, whichever account produced it — the field is
`todayTokensScope: "LOCAL_ALL_SESSIONS"`, and the token figure's own tooltip
says so. The label carried 로컬 for a while and that made the row's longest
phrase out of its least urgent fact; what matters in the label is 오늘, because
the gauges beside it are per-account and this is per-machine and per-day.

## Whose limits are these?

The account name and the limits do not always come from the same place, and
when they don't, nothing ties them together — so signing in as a different
account left the previous account's percentages rendering under the new name,
with no expiry and nothing to catch it.

**Codex asks its CLI for both in one session.** `codex app-server --stdio`
answers `account/read` (email, plan) and `account/rateLimits/read` (the
windows, plus `rateLimitsByLimitId` for per-model limits), so the account and
the limits arrive from the same place and there is nothing to reconcile. That
replaced reading rollout files, which could not identify an account at all.

**Claude has no such command**, so its status-line hook stamps the snapshot
with `accountUuid` (an opaque id from `~/.claude.json`; the email is
deliberately not copied) and the server compares it with the account currently
signed in.

`accountMatch` is the result:

| Value          | Meaning                      | Shown?                                  |
| -------------- | ---------------------------- | --------------------------------------- |
| `VERIFIED`     | one answer, or ids match     | yes                                     |
| `MISMATCHED`   | provably a different account | no — the row says so instead            |
| `UNVERIFIABLE` | nothing to compare           | yes, labelled with a `?` on the account |

`UNVERIFIABLE` is not the normal state for either agent any more. A Claude
snapshot written before the stamp existed stays on disk until the next
interactive turn overwrites it, and blanking the panel in the meantime would be
worse than labelling it; a Codex read reaches it only when the CLI query fails,
in which case there are no limits to show either.

The snapshot cache is keyed on the signed-in account as well as on age, so a sign-in as someone else takes effect on the next request rather than
whenever the timer happens to lapse.

## Per-model limits

Codex reports limits per model as well as per account (`rateLimitsByLimitId`).
Those go in a collapsed disclosure under the two rows rather than in the band
itself: an account can have several, and the band's fixed two-line height is
the whole reason it can appear without shifting the Task list beneath it. The
disclosure is not rendered at all when there is nothing in it.

## What this does not do

Per-Task token attribution. That needs the usage of each individual CLI run,
which means either switching `claude -p` to `--output-format stream-json` (and
rewriting how its logs stream) or matching transcripts to Steps by time and
working directory. Neither is done here.
