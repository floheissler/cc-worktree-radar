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
  `/radar`, the `radar` tool, the `AbovePrompt` band, `session.start`.
- `hooks/host.ts`: the `Host` record the rest of the code takes instead of
  `$`, and the person's settings (`RadarOptions`).
- `hooks/radar.ts`: the radar at work while open: polls, reads, holds and
  notes, and what a read tells the session (wake prompts, notifications).
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
  tool through the engine.

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
  every fact the script computes, minus releases and hand-backs. To check a
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
- The tool hook matches its tool by a pattern (`/^mcp__worktree-radar__radar$/`):
  the laid MCP types do not list a plugin's own tool, so a literal fails
  `tsc`.
- Lanes are colored with theme keys (`LANE_COLORS`), and every line is
  fitted to `bodyColumns` in cells; `rows.test.ts` sweeps 1–160 columns.

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
