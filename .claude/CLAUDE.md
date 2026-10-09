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
- The code's layout is written with ROADMAP item A1; keep this list current.

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
