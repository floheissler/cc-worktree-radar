# cc-worktree-radar

A Claude Code mod (a plugin of function hooks) that adds `/radar`: a live
view, in the band above the prompt, of every local branch and worktree of
the repository and the order they can land on its base branch. The
repository is the plugin and its own marketplace (`cc-worktree-radar`, one
entry with `"source": "./"`). README.md has the user-facing behavior.

The maintainer keeps a local, gitignored `ROADMAP.md`: where it exists
and you are asked for the next item, start there.

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
  and `icon` (the SVG in assets: a radar in cc-file-explorer's frame and
  colors, its blips the lanes') are for Anthropic's directory listing;
  `marketplace.json` entries don't take them. Name a bundled image only in
  Markdown image syntax, as the README shows the demo, never in backticks or
  a code block: the directory's review flags that.
- `.claude-plugin/marketplace.json`: makes the repo installable with
  `/plugin install worktree-radar --marketplace floheissler/cc-worktree-radar`.
- `.claude/CLAUDE.md`: this file. It lives under `.claude/` because a
  `CLAUDE.md` at the plugin root fails `claude plugin validate --strict`.
- `assets/`: the icon, and the README's demo GIF and screenshot, shrunk for
  GitHub (the GIF 1600 px wide with a 128-color octree palette, under 1 MB).
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
  comments, and what a read tells the session (wake prompts, notifications).
- `hooks/saved.ts`: the radar a session left open, kept in the store for
  its resume: the record, its checked reading, the save, the forget and
  the cap.
- `hooks/analysis.ts`: the read itself: lanes, simulated merges, stacking,
  knock-on conflicts, READY's ranking, the rebase order, and each branch's
  one-line `summary`.
- `hooks/repo.ts`: git's branches and worktrees, read and parsed; the base.
- `hooks/sessions.ts`: `claude agents --json`, and which worktree each
  session works in; Claude Code's worktree locks, and which worktree each
  subagent works in.
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
  `/work`); `replay.ts` answers git from it. `band.test.ts` mounts the band
  and drives `/radar` and the tool through the engine, and sessions ending,
  starting and resuming over a store it reads.

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

- A branch with nothing left to land reads `isLanded` when its work reached
  the base, and an idle session left in its worktree then keeps it in
  CLEANUP; on a branch that never had work, the session keeps it IN_PROGRESS
  "no commits yet". It landed through a merge when its tip is off the base's
  first-parent line (`git rev-list --first-parent`, up to
  `FIRST_PARENT_COMMITS`). A fast-forward leaves no merge, its tip on that
  line like a fresh branch's, so the branch's own reflog decides
  (`ownWorkOf`, `git reflog show`): it landed when its latest own work is in
  the base (`git merge-base
  --is-ancestor`). Own work is an entry git writes for a commit made on the
  branch (`commit`, `commit (amend)`, `cherry-pick`, `revert`, `am`; not
  `commit (merge)`), or a rebase's `(finish)` after one; creation,
  fast-forwards and resets bring none. These are literals in git's source,
  never translated (checked in `branch.c`, `builtin/commit.c`, `sequencer.c`,
  `builtin/am.c`, and live on git 2.53). Without a reflog (none kept,
  expired) a branch reads fresh; a squash merge, its
  commits rewritten, stays undetected. To check a
  change against real git, run `hooks/analysis.ts` under Node (type
  stripping, with a resolve hook that adds `.ts`) on a throwaway repository
  and compare its answer with what git shows there. Re-record
  `tests/fixtures/repo.ts` that way when the git runs change. The
  recording predates the reflog read: its reflog runs replay as missing (no
  reflog), and the reflog's path is tested with runs a test adds.
- A read runs only once a change has settled (`SETTLE_MS`), one at a time
  (`readNow` queues at most one more), and again every `REFRESH_MS` with no
  change seen. A poll is cheap: the branch tips, the worktree list, the
  holds in the store, the state of the session's own agents that work in a
  worktree (`$.agent.list()`) and, every `SESSIONS_EVERY` polls, `claude
  agents --json`. The holds and the agents are in the fingerprint because
  neither moves a ref: without them another session's hold showed only at
  the next `REFRESH_MS` read (63 s in a live run), and an agent that
  finished while its worktree's lock stayed read as at work until then. A
  live run on 2.1.295 missed an agent's `ready` and `finished` wakes, the
  agent still read at work 10 s after its hand-back; this is the likeliest
  cause, not proven: on 2.1.296 (instrumented, twice) the lock went with
  the agent's last state, which the poll caught anyway.
- A worktree's `sessions` holds who works there: the sessions `claude
  agents` lists, and subagents (`kind: 'agent'`). A session belongs to the
  worktree whose `claude session` lock names its pid, else to the deepest
  one holding its folder (`sessionsByWorktree`). The lock comes first
  because the CLI can list a session in the folder it started from after it
  moved into a worktree: seen live, a background job's new worktree read
  CLEANUP and woke `cleanup` while its worker was in it. Claude Code unlocks
  a worktree a session leaves and keeps, and releases stale locks. A
  subagent runs inside its parent's process, so the CLI lists no session in
  its worktree; the radar knows it by the worktree's lock
  (`agentsByWorktree`): an agent of the radar's own session while
  `$.agent.list()` says it is not over (its task, `description`, with it),
  another session's while that session's pid is listed. A running agent puts
  its branch IN_PROGRESS like a busy session; one that was at work and is
  gone wakes `session-idle` ("finished"). The row's detail is `agent:
  <task>`, or `agent of <session>`.
- A worktree on its way out (`isBeingRemoved`): Claude Code removes a closed
  job's or a finished agent's worktree entry by entry, its `.git` file last,
  then drops git's record of it, then (not always) deletes the branch
  (2.1.296). Meanwhile git lists it as before and its status counts every
  deleted file. In a live run that took about a minute on `/mnt/c`
  (`node_modules`), and a simulation of it read IN_PROGRESS "landed in main,
  new work under way · 9 uncommitted files". It reads as removal when nobody
  works there and the status holds tracked files gone (` D`) and nothing
  else but untracked ones, which a deleted `.gitignore` uncovers
  (`isDeletionOnly`): the row says `worktree being removed`, and a branch
  with nothing left to land stays CLEANUP. A branch with commits stays
  IN_PROGRESS, so files gone never make it READY.
- The rebase order counts a branch as being rebased when its worktree is
  mid-rebase, or when it was found due a rebase (`dueMarks`) and is in
  progress since.
- Events wake the session only for the kinds the caller listed at `open`,
  once per branch tip (`reported`, the module's), never on the first read.
  `/radar` lists none. A wake goes out through an outbox (`sendWakes`) that
  nothing waits on: `$.prompt.submit` settles only once its turn starts,
  after the turn the session is in. A read that awaited it stalled the
  polls for that whole turn (found live: an event 23 s late), and a
  `snapshot` the session's own tool ran waited on a wake that could start
  only after it. The events found while a wake waits go out together, in
  one wake, once the session takes it; closing the radar empties the
  outbox. The wake line (`wakeTextOf`) is the events, then
  `WAKE_NOTE`: a report from a read-only view, not a request, to act on only
  as the user or the session's instructions say. Without it a woken model
  took "is ready to land" as its user's request and merged (below).
- Holds live in `$.store` under `holds:` and the repository's shared `.git`
  folder (`folderKeyOf`), one key per repository, so every worktree and
  session of it sees the same holds. What the store holds is checked
  (`holdsIn`).
- The radar belongs to its conversation. `$.state` dies with the process
  and `/clear`, `/resume`, `/branch` reset it, so an open radar is also kept
  in `$.store` under `resume:` and the session's id (`saved.ts`), one key per
  session: saved at open (`openRadar`), after each change a person or a
  caller makes (`keepChange`: folding, the status line, a comment), and as
  it stands at `session.end` (the config with the caller's wake list,
  `compact`, `status`, `comments`, `dueMarks`; not the read, not the help);
  a close forgets it, a closed radar writes nothing. So a process that dies
  still resumes it as it was (found live: saved at open and end alone, a
  `kill -9` lost the fold). Saves go under `savedAs`, the session it opened
  or reopened in, not `$.session.id()`, which lags a `/resume` or
  `/branch` (below); the due marks a read finds ride along, never saved
  from a read.
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
- Colors are theme keys, so the band follows the person's theme, with one
  exception: the base (`[main]`) in the status line is a raw orange chosen
  by the theme setting (`baseColorOf`, the `themeSetting` state, read from
  `$.config.list()` at each read and on `config.set` for `theme`). Dark
  themes get xterm's 208 (`#ff8700`), as the owner's own status line names
  the branch; light themes 130 (`#af5f00`, 4.7:1 on white); `auto`, a custom
  theme or none read 166 (`#d75f00`, 3.8:1 on white, 4.4:1 on `#1e1e1e`).
  Checked live on 2.1.296 (light theme, tmux, the capture's colors
  measured): 208 read 2.4:1 on white, the band's one color under 4.4:1; no
  theme key is an orange that reads on white (`claude` is 3.2:1), and a mod
  cannot learn which theme `auto` resolved to. Picking a theme in a lab
  session's `/theme` writes the person's own `~/.claude/settings.json`:
  start the lab with `--settings '{"theme":"light"}'` instead.
- Lanes are colored with theme keys (`LANE_COLORS`), and every line is
  fitted to `bodyColumns` in cells; `rows.test.ts` sweeps 1–160 columns,
  the queue and the help alike.
- The queue takes at most `maxRows` lines (`bandLinesOf`, swept 1–45 rows
  in `rows.test.ts`): short of rows, lanes fold into a line each
  (`FOLD_ORDER`: cleanup first, needs rebase last), then the ready lane's
  tail folds behind its head (`ready (+N): …`), then the lanes lowest in
  the order are cut; the foot always stays. Past `maxRows` Claude Code cuts
  the band's bottom itself ("↓ 14 more"), the status line with it: seen
  live with 33 branches in a 50-row terminal, when only the lanes that need
  nobody could fold.
- The queue is a table (`tableColumnsOf`): the branch column as wide as the
  longest name shown, up to a share of the row; the other columns fixed, so
  every row of a drawing lines up under the column names. Fixed widths for
  the branch column too were tried and dropped: short names left a wide
  gap. Wide (from `WIDE_COLUMNS`) `#`, branch, lane, ahead, age, detail and,
  while a row shown has one, comment; medium drops ahead and the comments
  and shortens the lane labels; narrow keeps `#`, branch and lane. Its
  first row names the columns (`columnHeaderOf`), the controls at its end.
- A row's text comes in two columns, by who wrote it. DETAIL (`detailOf`) is
  the radar's own, from the facts alone: why the branch is in its lane and
  what comes next. A ready row's detail says only what else there is (a
  stack on it, a rebase it forces): "merges cleanly" is what ready means; a
  cleanup row's says `has a worktree`, its path being the snapshot's.
  COMMENT (`commentOf`) is a caller's, set through the tool's `comment`, on
  the branch's tip (`CallerComment.sha`), or kept (`keep: true`, `isKept`)
  on every tip until the branch lands or is gone, when a read ends it
  (`commentsAfter`), so it does not come back on new work or a new branch of
  that name. Kept comments came from a live run: "merge once READY", set on
  a branch with no commits yet, went with its first commit. A comment is
  Claude's words, as only a model calls the tool, so marked with the `✻`
  Claude Code draws its own lines with, in `claude`, and quoted in italics
  in `inactive` (light grey on a dark theme), cut inside its quotes. With a
  comment shown, DETAIL is as wide as its longest, up to `DETAIL_SHARE` of
  what the branch leaves, and COMMENT takes the rest, from
  `COMMENT_MIN_CELLS`. COMMENT reaches the row's end, under the header's
  controls, so it is also at least as wide as the controls plus its name,
  the detail giving up cells for that; with the detail left under
  `DETAIL_MIN_CELLS`, the comments go. Seen live: a long branch name left a
  26-cell comment column starting where the controls did, its name gone from
  the header. The facts (branch, ahead, age, detail) are in the theme's text
  color; dim is for what is not data (the column names, the ` · `
  separators, the `-` off the landing order, a folded lane's line), so the
  grey comment is the one quiet thing on a row. The detail was dim before,
  the same grey as a comment. A caller's comment used to lead the note, in
  blue and joined by ` · `; the owner could not tell where it ended and the
  radar's words began. The caller's status line stays a blue badge,
  unquoted: it is a status, not a comment. Under the frame, not in it
  (`view.tsx`), the foot is a status line read left to right
  (`statusLayoutsOf`): the title, `repo [base]`, the counts, `land next →`;
  messages (a caller's status, what to know) right-aligned. What to know
  includes the main worktree: who works there but the radar's own session
  (`mainWorktreeSessions`, left out by `$.session.id()`, which is `claude
  agents`' `sessionId`) and what is uncommitted there, in one message (`main
  worktree: session fix-menu, 2 uncommitted`). Seen live: two workers
  started in the main worktree, the coordinator's own, where their work
  showed on no row and a `git checkout -b` would have moved it off the base.
  Short of room it gives up, in order, the long lane labels, the title, the
  place and the counts; a message may push out the labels and the title
  (`MESSAGE_OUTRANKS`), never more. Compact, the frame goes and the band is
  that status line alone (`headerOf`, the same `statusLayoutsOf`), the
  controls at its end where the messages were, a failed read the one message
  kept; an empty row above it so it stands apart from Claude Code's spinner
  and tips as the frame's top edge does. `fitWhole` keeps whole pieces where
  a cut one would read wrong. Dividers inside the frame were tried and
  dropped for the frame itself: a solid dim rule, a dotted dim rule, the
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
  lines are laid out for the room inside it. The frame holds the table (or
  the help); the status line sits under it and the compact line has none,
  both kept `INSET` cells from the band's sides, so every line starts and
  ends where the table's text does. Narrower, there is no frame and the
  lines follow one another. The `[-]` beside the band is
  the engine's, in the five cells `bodyColumns` leaves out: a mod can
  neither move it into the frame nor hide it.
- The header ends in three controls (`controlsOf`, their width
  `controlsCellsOf`): `h: help`/`back` (`helpShown`), `c: compact`/`expand`
  (`compact`, both `$.state`) and `x: exit`; below `SHORT_CONTROLS_BELOW`
  their labels shorten to one character. Compact, the band is its header
  alone: the status line, which gives up the title, the place and the
  counts before `land next →`, as the foot does. A hotkey
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

## Wake prompts

Checked live on Claude Code 2.1.295 (2026-10-09): fresh Haiku sessions in
auto mode in a throwaway repository opened the radar with `wake: ["ready"]`,
then a branch became ready.

- Claude Code shows a `$.prompt.submit` text as "The worktree-radar plugin
  sent a message: <text>", followed by its own line: "This is how Claude
  Code surfaces a prompt a plugin submits between turns — it starts this
  turn in the user's place. Address the message above."
- With the bare line (`worktree-radar: feat/x is ready to land (#1)`), one
  session merged the branch on its own and another asked to.
- With `WAKE_NOTE` after the events, two sessions told only to open the
  radar merged nothing ("the radar message is a report"), and one told to
  merge ready branches without asking merged at once: the note stops a
  report from passing as the user's request, and leaves a caller's own
  instructions in force. A handful of runs, not a measure.

## Subagents' worktrees

Checked live on Claude Code 2.1.295 (2026-10-09), with two Agent-tool
subagents (`isolation: "worktree"`) watched through the radar.

- Each gets a worktree `.claude/worktrees/agent-<id>` on a branch
  `worktree-agent-<id>`, from the base's tip, locked with the reason
  `claude agent agent-<id> (pid <n> start <n>)`: the pid of the parent
  session's process, and its start time (`/proc/<pid>/stat`, field 22).
  `claude -w` locks its worktrees the same way: `claude session <name> (pid
  …)`, as do a background job and EnterWorktree. The lock is gone once the
  agent finished; a worktree it left unchanged is removed with its branch.
  Where Claude Code cannot read the start time it writes `(pid <n>)` alone;
  `claudeLockOf` takes both.
- `claude agents --json` lists the parent session (its `pid` is the lock's)
  and no session in the agent's worktree, so by the CLI alone an agent at
  work read CLEANUP, then IN_PROGRESS only once it had uncommitted files.
- `$.agent.list()` gives the session's own agents, their id the lock's
  `<id>`, with the Agent call's `description` and a `status`.

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
