# Usage Panel

The band above the Task list reports, for both CLIs: which account is signed
in, how much of the 5-hour and 7-day plan windows is used, when each window
resets, and how many tokens were spent today (Asia/Seoul).

```
◆ Claude   bi99 · Max 5x          5h ▓▓░░░░░░  3%  9/5 12:10   7d ░░░░░░░░  0%  9/7 09:00   오늘 18.4M tok   08:03 기준
◆ Codex    myoungsung84 · Plus    5h ▓░░░░░░░  2%  9/5 12:20   7d ▓▓▓▓▓░░░ 67%  9/9 11:22   오늘 19.7k tok   08:03 기준
```

Nothing here calls an API. Every number is read off files the two CLIs already
write on this machine, through `GET /api/usage`
(`apps/server/src/usage/`), which caches a snapshot for 15 seconds.

## Where each number comes from

| | Tokens today | Plan limits |
| --- | --- | --- |
| Codex | `~/.codex/sessions/**/rollout-*.jsonl` | same file |
| Claude | `~/.claude/projects/**/*.jsonl` | **status line hook** (below) |

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

Add this to `~/.claude/statusline.sh` (or whatever `statusLine.command` points
at), after the point where the session JSON has been parsed:

```bash
if [ "${fh_pct:--1}" -ge 0 ] 2>/dev/null; then
  snap="$HOME/.claude/usage-snapshot.json"
  if printf '{"observedAt":%s,"fiveHour":{"usedPercent":%s,"resetsAt":%s},"sevenDay":{"usedPercent":%s,"resetsAt":%s}}\n' \
       "$(date +%s)" "${fh_pct:-0}" "${fh_reset:-0}" "${sd_pct:-0}" "${sd_reset:-0}" > "$snap.tmp" 2>/dev/null; then
    mv -f "$snap.tmp" "$snap" 2>/dev/null
  fi
fi
```

It expects four variables already pulled out of the status line's stdin JSON —
`rate_limits.five_hour.used_percentage` / `.resets_at` and the `seven_day`
pair. The write is tmp-then-move so a reader never catches a half-written file,
and it is skipped entirely when Claude reported no limits.

Without the hook the panel still shows Claude's account, plan and today's
tokens, and says `한도 스냅샷이 없습니다` in place of the gauges.

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
