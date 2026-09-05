# Usage Panel

The band above the Task list reports, for both CLIs: which account is signed
in, how much of the 5-hour and 7-day plan windows is used, when each window
resets, and how many tokens were spent today (Asia/Seoul).

```
◆ Claude   alice · Max 5x        5h ▓▓░░░░░░  3%  9/5 12:10   7d ░░░░░░░░  0%  9/7 09:00   오늘 18.4M tok   08:03 기준
◆ Codex    Plus                  5h ▓░░░░░░░  2%  9/5 12:20   7d ▓▓▓▓▓░░░ 67%  9/9 11:22   오늘 19.7k tok   08:03 기준
```

Nothing here calls an API. Every number is read off files the two CLIs already
write on this machine, through `GET /api/usage`
(`apps/server/src/usage/`), which caches a snapshot for 15 seconds.

## Where each number comes from

|        | Tokens today                           | Plan limits                  |
| ------ | -------------------------------------- | ---------------------------- |
| Codex  | `~/.codex/sessions/**/rollout-*.jsonl` | same file                    |
| Claude | `~/.claude/projects/**/*.jsonl`        | **status line hook** (below) |

**Codex** writes a `token_count` event per turn carrying both its running token
totals and its `rate_limits` (`primary` = the 300-minute window, `secondary` =
the 10080-minute one), each with `used_percent` and a `resets_at` timestamp.
Today's figure sums each turn's `last_token_usage`, not the session's
cumulative `total_token_usage`, so a session that began yesterday contributes
only the part of it that happened today.

**Claude** records per-message `usage` in its transcripts, which is where
today's token figure comes from. Its plan limits are the awkward one: Claude
Code hands the 5-hour and 7-day percentages to the status line command on stdin
and stores them nowhere — not under `~/.claude`, not in a CLI subcommand, and
not in `claude -p --output-format json`'s result. The status line is the only
place they surface, so the hook below copies them to a file.

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
Claude Code, and the `기준` time on the row says how old the reading is when it
is not.

## Optional: the Codex account label

`USAGE_SHOW_ACCOUNT=true` in `apps/server/.env` adds the Codex account's email
to its row. It is off by default because that email is the only reason to open
`~/.codex/auth.json`, and that file also holds live access and refresh tokens.
Left off, no credential file is read at all: the Codex plan comes from the
session rollout, and only the label is missing.

Claude's account label is unconditional — `~/.claude.json` is a profile file
with no tokens in it.

## Reading the row honestly

Both CLIs only record their limits **while they run**, so every reading is a
snapshot rather than a live value — which is what the `기준` time at the end of
each row states. Claude's refreshes on every interactive turn, so it is usually
current; Codex's only moves when Codex runs, so a day without it leaves a real
but old number. Rows fade as their reading ages (an hour, then a day).

A window whose `resets_at` has already passed is reported as **0%**, not as its
last-seen percentage: that window genuinely rolled over, so the old number
describes something that no longer exists.

Token counts include cache reads alongside fresh input. They are the largest
part of a coding session, and excluding them would both understate the work and
stop matching Codex's `total_tokens`, whose input already includes its cached
portion.

## What this does not do

Per-Task token attribution. That needs the usage of each individual CLI run,
which means either switching `claude -p` to `--output-format stream-json` (and
rewriting how its logs stream) or matching transcripts to Steps by time and
working directory. Neither is done here.
