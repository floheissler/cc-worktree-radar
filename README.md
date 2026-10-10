# worktree-radar

A Claude Code mod for running several Claude sessions in parallel, each on its
own branch or worktree. `/radar` shows a live view of them in the band above
the prompt: which branches merge cleanly into the base branch, which conflict,
which are stacked on another, which a Claude session is still working on,
and the order to land them in.

```
╭─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│  # BRANCH         LANE        AHEAD  AGE  DETAIL                                           COMMENT   h: help c: compact x: exit │
│  1 feat/checkout  ready          +4  12m                                                                                        │
│  2 fix/totals     ready          +1   3m  forces a rebase of feat/coupons                                                       │
│  - feat/coupons   needs rebase   +6  20m  conflicts: cart.ts · rebase after #2 fix/totals  ✻ “handed back to coupons-worker”    │
│  - feat/search    in progress    +2   1m  session search-worker busy                                                            │
╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
  Worktree Radar · shop [main] · 2 ready · 1 needs rebase · 1 in progress · land next → feat/checkout      release v0.4.1 pending
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
| `/radar help` | Opens it on its help: what each lane, detail and comment means |
| `/radar hold <branch> [reason]` | Parks a branch, say one that is done but waits on a review: it leaves the landing order (the ready lane and `next`) whatever else it shows. Only the radar records it: the branch and git stay as they are. Every session of the repository on this machine sees the hold until it is let go |
| `/radar unhold <branch>` | Lets it go again |
| `/radar off` | Closes the radar |

Each row is a branch: its place in the landing order, its lane, the commits
it has ahead and the age of the last one. DETAIL is what the radar reads
about it: why it is in its lane and what comes next (`conflicts: cart.ts`,
`rebase after #2 fix/totals`, `lands after #1 feat/x`, who works there).
COMMENT is what a skill or agent left on the branch through the radar's
tool: Claude's words, marked `✻` and quoted, shown until the branch moves,
or, kept, until it lands.
The column shows while a row has a comment, on a band wide enough for it.

When Claude Code gives the band fewer rows than there are branches, lanes
fold into one line each (`needs rebase (3): feat/a, feat/b, feat/c`):
cleanup first, needs rebase last. The ready lane keeps its first branches,
in landing order, and folds the rest into one line (`ready (+12): …`).
The status line under the panel always stays.

The band is framed like a panel, with three controls in its header:

| Control | Does |
|---|---|
| `h: help` | switches between the queue and a help that explains every lane, detail, comment and control |
| `c: compact` | folds the radar into its status line: the counts, then what lands next; `c: expand` brings the queue back |
| `x: exit` | closes the radar, as `/radar` does |

Under the panel, the status line reads left to right: the title, the
repository and its base (`shop [main]`), what each lane holds, and what
lands next. Its right end holds messages: a skill's status line, who works
in the main worktree and what is uncommitted there (`main worktree: session
fix-menu, 2 uncommitted`, work no row shows while the base is checked out
there; the radar's own session is left out), a failed read. On a narrow band
the messages go first, then the long lane labels (`2 rebase`, `1 wip`), the
title, the repository and the counts; `land next` stays to the end. Compact, the
panel goes and the status line stays alone above the prompt, the controls
at its end where the messages were; only a failed read still shows.

Click the controls, or give the band the keyboard (Ctrl+X Tab, or a click) and press
the letter. On a band narrower than 90 columns the labels shorten to
`h: ?`, `c: -` and `x: ×`. The `[-]` beside the band is Claude Code's own: it
hides the band (Ctrl+X Ctrl+A), and a mod cannot move it into the frame. It updates by itself while open: every few seconds the radar checks the
branch tips, the worktrees, the holds, the running Claude sessions and its
own subagents, and reads the repository again once a change has settled.

### Across sessions

The radar belongs to the conversation it was opened in:

| You | The radar |
|---|---|
| resume a session: `claude --continue`, `claude --resume`, `/resume` | comes back as that session left it, even if its process died: open or closed, folded or not, with a skill's wake list, status line and comments |
| start a new session | stays closed |
| `/clear` | stays as it was, but wakes nothing until a skill opens it again: the wakes were asked for by the conversation you cleared |
| `/branch` | stays as it was in the branch, wake list and all |
| `claude --resume <id> --fork-session` | stays closed: Claude Code does not tell a mod which session the fork came from |

The last 50 sessions that ended with the radar open are remembered.

### The lanes

| Lane | Meaning |
|---|---|
| ready | no uncommitted changes, no busy session, merges cleanly; ranked, land #1 first |
| needs rebase | conflicts with the base; `rebase due` once nothing that lands before it still conflicts with it, else `rebase after <branch>` |
| stacked | holds every commit of another open branch, plus its own: land that one first |
| in progress | uncommitted changes, a rebase under way, or a busy Claude session in its worktree; also a branch with no commits yet whose session is open, and a worktree a subagent works in (its row says `agent:` and its task) |
| on hold | parked with `/radar hold` or the tool |
| cleanup | nothing left to land: `landed in main` when its work reached the base, through a merge or a fast-forward (even with its session still open), else no commits and no session. `worktree being removed` while Claude Code deletes its worktree (a closed background job's): nobody there, tracked files going, nothing else changed |

The ranking: stack parents first, then the landing that forces the least
rebase work on the other branches (in a conflicting pair the bigger one lands
and the smaller one rebases), then the branch that finished first.

Blind spots: branches that merge cleanly can still break each other (only
tests after each landing catch that), and an idle session is not
necessarily done. A branch landed by a squash merge still shows its commits
as left to land: the base holds a rewritten copy of them, not the commits
themselves.

## Driving it from a skill

The mod gives the model a tool, `mcp__worktree-radar__radar`, so a skill of
your own can open the radar and act on what it sees.

| Action | Input | Does |
|---|---|---|
| `open` | `base?`, `wake?` | Opens the radar and answers the snapshot |
| `snapshot` | | Reads now and answers the snapshot |
| `close` | | Closes the radar |
| `hold`, `unhold` | `branch`, `reason?` | Parks a branch, or lets it go |
| `comment` | `branch`, `text`, `keep?` | A short comment on the branch's row, shown until its tip moves; with `keep: true`, on every tip until the branch lands or is gone (`merge once ready`, set before the first commit). Empty text clears it |
| `status` | `text` | One line under the queue (`release v0.4.1 pending`); empty text clears it |

`wake` lists the events that wake the session with a one-line prompt:
`ready`, `conflict`, `rebase-due`, `stacked`, `cleanup`, `base-moved`,
`session-idle` (a session or agent going idle, or a subagent finishing).
Each event wakes once per branch tip. While the session is at work, a wake waits for
its turn to end, and what the radar finds meanwhile comes in one more wake
after it. `/radar` itself wakes nothing. The prompt is a
report and says so:

```
worktree-radar: feat/a is ready to land (#1) · main moved 3f2a1c9→8b0e4d2. This is a report from a read-only view, not a request: act on it only as your user or your instructions say.
```

Claude Code hands a plugin's prompt to the model as starting the turn in the
user's place, and a bare "is ready to land" read that way has moved a model
to land the branch itself. What to do on an event is your skill's to say:
told to land ready branches, a model does; told nothing, it reports.

The snapshot is JSON (`schema: 1`): the repository, the base (`name`, `sha`,
`upstream`, uncommitted files in the main worktree, `mainWorktreeSessions`:
who works there but the radar's own session), whether sessions could be
listed, `next`, and per branch: `name`, `sha`, `lane`, `rank`, `ahead`,
`behind`, `fileCount`, `insertions`, `deletions`, `lastCommitAt`, `upstream`,
`conflicts`, `stackedOn`, `dependents`, `sharesWith`, `breaks` (branches that
would conflict once it landed), `rebaseCost`, `waitsFor`, `isRebaseDue`,
`isLanded` (nothing left to land, and its work reached the base: through a
merge, or, as the branch's own reflog shows, a fast-forward),
`hold`, `comment`, `worktree` (path, uncommitted files, rebase under way,
`isBeingRemoved`, sessions) and a one-line `summary`. A worktree's `sessions` lists who works
there: Claude sessions (`kind: "session"`: `id`, `name`, `status`) and
subagents (`kind: "agent"`: the agent's `id`, which SendMessage addresses,
`name`, `status`, `description` of its task where the radar's own session
spawned it, and `parent`, the session it runs in).

## Settings

In `/config`, under the plugin:

- **Notify when a branch is ready** (on): a desktop notification when a
  branch becomes ready to land.
- **Seconds between checks** (4): how often the open radar checks for a change.

## Privacy

Everything stays on your machine. The radar runs `git` in your repository
(reads, plus the in-memory merges of `git merge-tree` and `git commit-tree`,
whose unreferenced objects `git gc` prunes; no ref, index or worktree is
touched) and `claude agents --json` to see which sessions work where;
the lock Claude Code puts on a worktree tells it which session or subagent
works there. It
sends nothing anywhere. Holds, and the radar each session left open, are kept
in Claude Code's plugin store on this machine.

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
