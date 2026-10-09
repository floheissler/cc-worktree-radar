# worktree-radar

A Claude Code mod for running several Claude sessions in parallel, each on its
own branch or worktree. `/radar` shows a live view of them in the band above
the prompt: which branches merge cleanly into the base branch, which conflict,
which are stacked on another, which a Claude session is still working on,
and the order to land them in.

```
╭────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│  # BRANCH         LANE        AHEAD  AGE  NOTE                                                      h: help c: compact x: exit │
│  1 feat/checkout  ready          +4  12m                                                                                       │
│  2 fix/totals     ready          +1   3m  forces a rebase of feat/coupons                                                      │
│  - feat/coupons   needs rebase   +6  20m  conflicts: cart.ts · rebase after #2 fix/totals                                      │
│  - feat/search    in progress    +2   1m  search-worker busy                                                                   │
│────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────│
│ ◜ Worktree Radar · shop [main] · 2 ready · 1 needs rebase · 1 in progress · land next → feat/checkout   release v0.4.1 pending │
╰────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

It only looks. It never merges, rebases, tags, pushes or moves a ref.

Status: in development, not released yet.

## Requirements

- Claude Code with mods (2.1.295 or later).
- git 2.38 or later (`git merge-tree --write-tree`).

## Install

```
/plugin install worktree-radar --marketplace floheissler/cc-worktree-radar
```

Answer `y` to add the marketplace, then pick a scope.

## Use

| Command | Does |
|---|---|
| `/radar` | Opens the radar on the session's repository, or closes it |
| `/radar <base>` | Opens it with another base branch than the detected one (`origin/HEAD`, else `main`, else `master`) |
| `/radar help` | Opens it on its help: what each lane and note means |
| `/radar hold <branch> [reason]` | Parks a branch, say one that is done but waits on a review: it leaves the landing order (the ready lane and `next`) whatever else it shows. Only the radar records it: the branch and git stay as they are. Every session of the repository on this machine sees the hold until it is let go |
| `/radar unhold <branch>` | Lets it go again |
| `/radar off` | Closes the radar |

The band is framed like a panel, with three controls in its header:

| Control | Does |
|---|---|
| `h: help` | switches between the queue and a help that explains every lane, note and control |
| `c: compact` | folds the radar into one line: what lands next, then the counts; `c: expand` brings the queue back |
| `x: exit` | closes the radar, as `/radar` does |

Under a divider, the status line reads left to right: the sweep (`◜`, in
Claude orange, turning while the radar checks the repository; standing
still means the radar stalled) and the title, the
repository and its base (`shop [main]`), what each lane holds, and what
lands next. Its right end holds messages: a skill's status line, uncommitted
files in the main worktree, a failed read. On a narrow band the messages go
first, then the long lane labels (`2 rebase`, `1 wip`), the title, the
repository and the counts; `land next` stays to the end. Compact, the band
is that status line alone.

Click the controls, or give the band the keyboard (Ctrl+X Tab, or a click) and press
the letter. On a band narrower than 90 columns the labels shorten to
`h: ?`, `c: -` and `x: ×`. The `[-]` beside the band is Claude Code's own: it
hides the band (Ctrl+X Ctrl+A), and a mod cannot move it into the frame. It updates by itself while open: every few seconds the radar checks the
branch tips, the worktrees and the running Claude sessions, and reads the
repository again once a change has settled.

### The lanes

| Lane | Meaning |
|---|---|
| ready | no uncommitted changes, no busy session, merges cleanly; ranked, land #1 first |
| needs rebase | conflicts with the base; `rebase due` once nothing that lands before it still conflicts with it, else `rebase after <branch>` |
| stacked | holds every commit of another open branch, plus its own: land that one first |
| in progress | uncommitted changes, a rebase under way, or a busy Claude session in its worktree; also a branch with no commits yet whose session is open |
| on hold | parked with `/radar hold` or the tool |
| cleanup | nothing left to land: `landed in main` when its tip reached the base through a merge (even with its session still open), else no commits and no session |

The ranking: stack parents first, then the landing that forces the least
rebase work on the other branches (in a conflicting pair the bigger one lands
and the smaller one rebases), then the branch that finished first.

Two blind spots: branches that merge cleanly can still break each other
(only tests after each landing catch that), and an idle session is not
necessarily done.

## Driving it from a skill

The mod gives the model a tool, `mcp__worktree-radar__radar`, so a skill of
your own can open the radar and act on what it sees. Allow it in the skill's
`allowed-tools` (or your permissions) to skip the prompt.

| Action | Input | Does |
|---|---|---|
| `open` | `base?`, `wake?` | Opens the radar and answers the snapshot |
| `snapshot` | | Reads now and answers the snapshot |
| `close` | | Closes the radar |
| `hold`, `unhold` | `branch`, `reason?` | Parks a branch, or lets it go |
| `note` | `branch`, `text` | A short note on the branch's row, shown until its tip moves; empty text clears it |
| `status` | `text` | One line under the queue (`release v0.4.1 pending`); empty text clears it |

`wake` lists the events that wake the session with a one-line prompt
(`worktree-radar: feat/a is ready to land (#1) · …`): `ready`, `conflict`,
`rebase-due`, `stacked`, `cleanup`, `base-moved`, `session-idle`. Each event
wakes once per branch tip. `/radar` itself wakes nothing.

The snapshot is JSON (`schema: 1`): the repository, the base (`name`, `sha`,
`upstream`, uncommitted files in the main worktree), whether sessions could be
listed, `next`, and per branch: `name`, `sha`, `lane`, `rank`, `ahead`,
`behind`, `fileCount`, `insertions`, `deletions`, `lastCommitAt`, `upstream`,
`conflicts`, `stackedOn`, `dependents`, `sharesWith`, `breaks` (branches that
would conflict once it landed), `rebaseCost`, `waitsFor`, `isRebaseDue`,
`isLanded` (nothing left to land, its tip off the base's first-parent line),
`hold`, `note`, `worktree` (path, uncommitted files, rebase under way,
sessions) and a one-line `summary`.

## Settings

In `/config`, under the plugin:

- **Notify when a branch is ready** (on): a desktop notification when a
  branch becomes ready to land.
- **Seconds between checks** (4): how often the open radar checks for a change.

## Privacy

Everything stays on your machine. The radar runs `git` in your repository
(reads, plus the in-memory merges of `git merge-tree` and `git commit-tree`,
whose unreferenced objects `git gc` prunes; no ref, index or worktree is
touched) and `claude agents --json` to see which sessions work where. It
sends nothing anywhere. Holds are kept in Claude Code's plugin store on this
machine.

## Develop

```sh
claude plugin validate --strict .
claude plugin test .
tsc -p .
```

`tsc` needs `.claude-plugin/types/`, which Claude Code writes when a session
loads the mod with `claude --plugin-dir .`.

## License

MIT, see [LICENSE](LICENSE).
