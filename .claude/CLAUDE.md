# cc-worktree-radar

A Claude Code mod (a plugin of function hooks) that adds `/radar`: a live
view, in the band above the prompt, of every local branch and worktree of
the repository and the order they can land on its base branch. The
repository is the plugin and its own marketplace (`cc-worktree-radar`, one
entry with `"source": "./"`). README.md has the user-facing behavior.

Work in progress: `ROADMAP.md` (gitignored, local) is the plan toward
v0.1.0, a checklist with context for each item. Start there when asked to
work on the next item.

## Scope: facts, never policy

- The mod reports what git and the running Claude sessions say. It never
  merges, rebases, tags, pushes, deletes a branch, removes a worktree or
  moves a ref. Its only writes to a repository are the unreferenced objects
  its simulated merges leave in `.git/objects`, which `git gc` prunes.
- No workflow conventions in this repository: merge style, test policy,
  version bumps, tags, release notes, messages to other sessions. Those
  belong to whoever drives the radar through its tool (a skill, a person).
  The test for a feature: would someone who squash-merges and never tags
  want it unchanged? If not, it is an option, or it is left to the caller.

## Layout

- `.claude-plugin/plugin.json`: the manifest. `displayName`, `supportUrl`
  (and `icon`, once there is one) are for Anthropic's directory listing;
  `marketplace.json` entries don't take them.
- `.claude-plugin/marketplace.json`: makes the repo installable with
  `/plugin install worktree-radar --marketplace floheissler/cc-worktree-radar`.
- `.claude/CLAUDE.md`: this file. It lives under `.claude/` because a
  `CLAUDE.md` at the plugin root fails `claude plugin validate --strict`.
- `.github/workflows/ci.yml`: validate and the tests on Ubuntu, Windows and
  macOS. Anthropic's directory scans it: install Claude Code there with
  npm, never a download piped into a shell.
- `types/index.d.ts`: the snapshot's types (the tool's JSON contract) and
  the `$.state` contract (`PluginState['worktree-radar']`).
- `hooks/register.tsx`: the hooks and the only file that touches `$`:
  `/radar`, the `radar` tool, the `AbovePrompt` band, `session.start`,
  `classic.SessionStart` and `session.end`.
- `hooks/host.ts`: the `Host` record the rest of the code takes instead of
  `$`, and the person's settings (`RadarOptions`).
- `hooks/radar.ts`: the radar at work while open: polls, reads, holds and
  notes, and what a read tells the session (wake prompts, notifications).
- `hooks/saved.ts`: the radar a session left open, kept in the store for
  its resume: the record, its checked reading, the save, the forget and
  the cap.
- `hooks/analysis.ts`: the read itself, ported from the owner's private
  `merge-pipeline` script (`pipeline.py snapshot`): lanes, simulated merges,
  stacking, knock-on conflicts, READY's ranking, the rebase order, and each
  branch's one-line `summary`.
- `hooks/repo.ts`: git's branches and worktrees, read and parsed; the base.
- `hooks/sessions.ts`: `claude agents --json`, and which worktree each
  session works in.
- `hooks/git.ts`: every git run, through one `Git` (`GIT_ENV`, the
  timeout, null for any failure); `mapLimit` for parallel runs.
- `hooks/changes.ts`: the events between two reads, the wake line, the
  marks of branches found due a rebase.
- `hooks/rows.ts`: the band's lines laid out in cells (pure);
  `hooks/view.tsx` draws them.
- `hooks/tool.ts`, `hooks/command.ts`: the tool's description, schema,
  input and JSON answer; `/radar`'s arguments.
- `hooks/text.ts`, `hooks/cell-widths.ts`, `scripts/cell-widths.mjs`: cell
  widths and `sanitize`, carried over from cc-file-explorer unchanged.
- `tests/`: `claude plugin test` suites. `fixtures/repo.ts` is a recording
  of every git run of one read of a real test repository (paths rewritten to
  `/work`), checked against `pipeline.py`'s own answers; `replay.ts` answers
  git from it. `band.test.ts` mounts the band and drives `/radar` and the
  tool through the engine, and sessions ending, starting and resuming over
  a store it reads.

## Rules the engine's static scan enforces

`claude plugin validate` reads the source the way the engine does and refuses
the module otherwise:

- Pass `$` only to functions declared at the top level of `register.tsx`.
  Everything else gets the `Host` that `hostOf($)` builds, where every engine
  call is spelled `$.noun.method(...)`.
- `read`/`update` take atoms that are `const`s of `register.tsx`, built with
  `atom({ plugin: 'worktree-radar', key: '…' } as const, …)` from literals,
  and every key must be declared in `types/index.d.ts`.
- Write hook matchers as literals (`{ command: 'radar' }`), so validation and
  an administrator's review read exactly what each hook matches.
- A `ui.render` hook never writes state; write from a handler or another hook.

## Conventions

- The analysis stays behavior-compatible with `pipeline.py snapshot` for
  every fact the script computes, minus releases and hand-backs, and one
  deliberate difference: a branch with nothing left to land whose tip is off
  the base's first-parent line (`isLanded`, read with `git rev-list
  --first-parent`) landed through a merge, so an idle session left in its
  worktree keeps it in CLEANUP, where the script showed IN_PROGRESS "no
  commits yet". A fast-forward or a tip older than `FIRST_PARENT_COMMITS`
  reads as fresh, as before. To check a
  change against real git, run `hooks/analysis.ts` under Node (type
  stripping, with a resolve hook that adds `.ts`) on a throwaway repository
  and compare with `pipeline.py -C <repo> snapshot --json`. Re-record
  `tests/fixtures/repo.ts` the same way when the git runs change.
- A read runs only once a change has settled (`SETTLE_MS`), one at a time
  (`readNow` queues at most one more), and again every `REFRESH_MS` with no
  change seen. A poll is cheap: the branch tips, the worktree list and,
  every `SESSIONS_EVERY` polls, `claude agents --json`.
- The rebase order counts a branch as being rebased when its worktree is
  mid-rebase, or when it was found due a rebase (`dueMarks`) and is in
  progress since. `pipeline.py` used its private hand-back records here.
- Events wake the session only for the kinds the caller listed at `open`,
  once per branch tip (`reported`, the module's), never on the first read.
  `/radar` lists none.
- Holds live in `$.store` under `holds:` and the repository's shared `.git`
  folder (`folderKeyOf`), one key per repository, so every worktree and
  session of it sees the same holds. What the store holds is checked
  (`holdsIn`).
- The radar belongs to its conversation. `$.state` dies with the process
  and `/clear`, `/resume`, `/branch` reset it, so an open radar is also kept
  in `$.store` under `resume:` and the session's id (`saved.ts`), one key per
  session: saved at open (`openRadar`, so a process that dies still
  resumes it) and as it stands at `session.end` (the config with the
  caller's wake list, `compact`, `status`, `notes`, `dueMarks`; not the read,
  not the help); a close forgets it, a closed radar writes nothing.
  `session.start` in an interactive new process reopens what its
  `$.session.id()` left (`claude --continue`, `--resume`). In the process,
  `classic.SessionStart` reopens: `resume` what `e.session_id` left, or
  nothing; `clear` and `fork` (`/branch`) carry on what `session.end` just
  read (`ended`), `clear` without the wake list, which the cleared
  conversation asked for. At a process's start that hook fires before
  `session.start` and stands aside (`hasStarted`). An open's save drops the
  oldest past `SAVED_SESSIONS` (`pruneSaved`); what the store holds is
  checked (`savedRadarIn`). A `--fork-session` start comes back closed: no
  API names the session it forked.
- The tool hook matches its tool by a pattern (`/^mcp__worktree-radar__radar$/`):
  the laid MCP types do not list a plugin's own tool, so a literal fails
  `tsc`.
- Lanes are colored with theme keys (`LANE_COLORS`), and every line is
  fitted to `bodyColumns` in cells; `rows.test.ts` sweeps 1–160 columns,
  the queue and the help alike.
- The queue is a table (`tableColumnsOf`): the branch column as wide as the
  longest name shown, up to a share of the row; the other columns fixed, so
  every row of a drawing lines up under the column names. Fixed widths for
  the branch column too were tried and dropped: short names left a wide
  gap. Wide (from `WIDE_COLUMNS`) `#`, branch, lane, ahead, age, note; medium
  drops ahead and shortens the lane labels; narrow keeps `#`, branch and
  lane. A ready row's note says only what else there is (a stack on it, a
  rebase it forces): "merges cleanly" is what ready means. Its first row names the columns (`columnHeaderOf`), the
  controls at its end. Under a dotted dim rule (`dividerOf`, inside the
  padding), the foot is a status line read left to right
  (`statusLayoutsOf`): the title, `repo [base]`, the counts,
  `land next →`; messages (a caller's status, what to know) right-aligned.
  Short of room it gives up, in order, the long lane labels, the title,
  the place and the counts; a message may push out the labels
  and the title (`MESSAGE_OUTRANKS`), never more. Compact, the band is that
  status line alone. `fitWhole` keeps whole pieces where a cut one would
  read wrong. Other dividers were tried and dropped: a solid dim rule, the
  rule in the frame's color reaching its sides (it split the panel in two,
  without joints, as a mod cannot draw on the border) and a `╰` hook before
  the status line, which read as a stray corner.
- The frame's border is Claude Code's, drawn over anything a mod lays on it:
  checked live on 2.1.295, a title placed with `position: "absolute"` over
  the top edge did not show, and overlays reach the padding cells only. So
  the title leads the status line, not the frame. A turning sweep before
  it was built (per check, then a one-cell Raster repainted by `$.ui.blit`,
  which works) and dropped by the owner's taste.
- The band is framed (`frameOf`: a rounded border in `promptBorder` and a
  cell of padding, 4 cells and 2 rows) from `FRAME_MIN_COLUMNS` on; the
  lines are laid out for the room inside it. The `[-]` beside the band is
  the engine's, in the five cells `bodyColumns` leaves out: a mod can
  neither move it into the frame nor hide it.
- The header ends in three controls (`controlsOf`, their width
  `controlsCellsOf`): `h: help`/`back` (`helpShown`), `c: compact`/`expand`
  (`compact`, both `$.state`) and `x: exit`; below `SHORT_CONTROLS_BELOW`
  their labels shorten to one character. Compact, the band is the header
  alone, `next →` first so a narrow band cuts the counts, not it. A hotkey
  works only while the band has the keyboard (Ctrl+X Tab, a click); no digit
  hotkeys, as a bare digit in an empty prompt presses a band Button.

## Sessions, resumes and resets

Checked live on Claude Code 2.1.295 (2026-10-09) with a probe mod logging
every step, in tmux on a throwaway repository.

- A new process (`claude`, `-c`, `--resume <id>`, `--resume` and its
  picker, `--fork-session`) fires `classic.SessionStart` (`startup`,
  `resume` or `fork`) about 0.5 s before `session.start`; both already see
  the session's id. `-c` and `--resume` keep the resumed session's own id;
  `--fork-session` gets a new one, and the session it forked is named only
  in the transcript file (`forkedFrom`), which no API reads. `$.state`
  starts empty.
- `/clear`: `session.end` (`clear`, the old id, `$.state` still readable),
  then `classic.SessionStart` (`clear`, the new id; `$.state` reset). No
  `session.start`.
- `/resume`: `session.end` (`resume`), then `classic.SessionStart`
  (`resume`) whose `e.session_id` is the resumed id while `$.session.id()`
  still answers the old one; it has caught up by the next command.
  `/branch` is the same with `fork` and a new id.
- `$.store.get` on a key never set creates no store file. A `--plugin-dir`
  copy keeps its own (`worktree-radar_inline-….json`): delete it after a
  probe.
- A `ready` wake reached a resumed session (`-c`) after a branch appeared,
  so the wake list travels with the save. Haiku in auto mode then merged
  the branch on its own: what a woken model does is the caller's business.

## Carried over from cc-file-explorer

Engine facts checked there on Claude Code 2.1.293/2.1.294; check again after
updates.

- Git runs only through one `runGit`: `GIT_OPTIONAL_LOCKS=0` (a read never
  takes a lock or writes the index), `LC_ALL=C`, a timeout, and null for any
  failure.
- Changes are polled, not watched: `$` offers no file watcher, and inotify
  sees nothing on `/mnt/c`. A poll is a chain of `$.clock.after` waits, never
  `$.clock.every`, whose slow callbacks overlap; a generation counter keeps
  a stale poll from scheduling another.
- Untrusted text (branch names, paths, session names, git's messages) goes
  through `sanitize` before it is drawn or measured, and rows are fitted in
  cells (`text.ts`), never in `.length`.
- A Button can neither be colored at rest nor shrink. A `Text` takes theme
  keys (`success`, `warning`, `error`, `suggestion`, …), which follow the
  person's theme: color lanes with those, not with fixed colors.
- A hotkey is one lowercase letter or digit.
- The version lives in `.claude-plugin/plugin.json` alone; the band shows
  none. Bump it per release, or `claude plugin update` delivers nothing.

## Develop

Before every commit, from the repo root:

```sh
claude plugin validate --strict .
claude plugin test .
tsc -p .
```

`tsc` needs `.claude-plugin/types/` (git-ignored), which Claude Code writes
when it loads the mod with `claude --plugin-dir .`; start one such session
after a Claude Code update to refresh the types. The types file is the API
reference for the running build: grep it for an event or method name.

For daily use, install the mod from this folder as a local marketplace
(`worktree-radar@cc-worktree-radar`, read in place) and run
`/reload-plugins` after an edit. File watching is unreliable under `/mnt/c`,
so do not count on `--plugin-dir` hot reloading here.

Docs: https://code.claude.com/docs/en/plugins/mods/overview (create, interface,
events, api, test, reference pages). Anthropic's own mods, including `/diff`,
are at https://github.com/anthropics/claude-code/tree/main/mods.
