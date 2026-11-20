/**
 * Every git run of one radar read with a feature branch as its base,
 * recorded from real git (paths rewritten to /work), before and after the
 * fix that keeps the default branch out of the lanes: the union of both, so
 * a read that still listed main replays too. main has two commits of its
 * own; feat/big, cut from it, is checked out in the main worktree, and two
 * agent worktrees were cut from feat/big: worktree-agent-a with a commit
 * of its own, worktree-agent-b merged back into feat/big (--no-ff).
 */
export const FEATURE_BASE_RUNS: Readonly<Record<string, { readonly code: number; readonly stdout: string }>> = {
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c...3412cd1e6ece530acf662c2ec83227eff77c77fa\"]": {
    "code": 0,
    "stdout": "1\t0\tagent-a.txt\n"
  },
  "[\"/work\",\"for-each-ref\",\"--format=%(refname)%00%(objectname)%00%(committerdate:unix)%00%(upstream:short)\",\"refs/heads\"]": {
    "code": 0,
    "stdout": "refs/heads/feat/big\u0000a9e4471df0fb6fa990032094a649313f4ce71b8c\u00001791538800\u0000\nrefs/heads/main\u0000102f6014d81784161d0c281dcef98f0298dcd2e5\u00001791538800\u0000\nrefs/heads/worktree-agent-a\u00003412cd1e6ece530acf662c2ec83227eff77c77fa\u00001791538800\u0000\nrefs/heads/worktree-agent-b\u0000b0d65b416e668a45425889460892fcc838e74779\u00001791538800\u0000\n"
  },
  "[\"/work\",\"merge-base\",\"--is-ancestor\",\"102f6014d81784161d0c281dcef98f0298dcd2e5\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c\"]": {
    "code": 0,
    "stdout": ""
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c\",\"3412cd1e6ece530acf662c2ec83227eff77c77fa\"]": {
    "code": 0,
    "stdout": "ec0f2348229d21ee87aaa8dbeba6d295fe5167f5\n"
  },
  "[\"/work\",\"reflog\",\"show\",\"--format=%H%x00%gs\",\"refs/heads/main\",\"--\"]": {
    "code": 0,
    "stdout": "102f6014d81784161d0c281dcef98f0298dcd2e5\u0000commit: main: second\n7f7b5c23ddcb6a25764787065996e95bc5a82435\u0000commit (initial): initial\n"
  },
  "[\"/work\",\"rev-list\",\"--first-parent\",\"--max-count=10000\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c\"]": {
    "code": 0,
    "stdout": "a9e4471df0fb6fa990032094a649313f4ce71b8c\n06fa57dac7837d8d08d1e23bf4cc8eaa233bfa43\n102f6014d81784161d0c281dcef98f0298dcd2e5\n7f7b5c23ddcb6a25764787065996e95bc5a82435\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"--count\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c...102f6014d81784161d0c281dcef98f0298dcd2e5\"]": {
    "code": 0,
    "stdout": "3\t0\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c...102f6014d81784161d0c281dcef98f0298dcd2e5\"]": {
    "code": 0,
    "stdout": "<a9e4471df0fb6fa990032094a649313f4ce71b8c\n<06fa57dac7837d8d08d1e23bf4cc8eaa233bfa43\n<b0d65b416e668a45425889460892fcc838e74779\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c...3412cd1e6ece530acf662c2ec83227eff77c77fa\"]": {
    "code": 0,
    "stdout": "<a9e4471df0fb6fa990032094a649313f4ce71b8c\n>3412cd1e6ece530acf662c2ec83227eff77c77fa\n<b0d65b416e668a45425889460892fcc838e74779\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c...b0d65b416e668a45425889460892fcc838e74779\"]": {
    "code": 0,
    "stdout": "<a9e4471df0fb6fa990032094a649313f4ce71b8c\n"
  },
  "[\"/work\",\"rev-parse\",\"--path-format=absolute\",\"--show-toplevel\",\"--git-common-dir\"]": {
    "code": 0,
    "stdout": "/work\n/work/.git\n"
  },
  "[\"/work\",\"status\",\"--porcelain\",\"--untracked-files=no\"]": {
    "code": 0,
    "stdout": ""
  },
  "[\"/work\",\"symbolic-ref\",\"--quiet\",\"--short\",\"refs/remotes/origin/HEAD\"]": {
    "code": 1,
    "stdout": ""
  },
  "[\"/work\",\"worktree\",\"list\",\"--porcelain\"]": {
    "code": 0,
    "stdout": "worktree /work\nHEAD a9e4471df0fb6fa990032094a649313f4ce71b8c\nbranch refs/heads/feat/big\n\nworktree /work/.claude/worktrees/agent-a\nHEAD 3412cd1e6ece530acf662c2ec83227eff77c77fa\nbranch refs/heads/worktree-agent-a\n\nworktree /work/.claude/worktrees/agent-b\nHEAD b0d65b416e668a45425889460892fcc838e74779\nbranch refs/heads/worktree-agent-b\n\n"
  },
  "[\"/work/.claude/worktrees/agent-a\",\"status\",\"--porcelain\",\"--untracked-files=normal\"]": {
    "code": 0,
    "stdout": ""
  },
  "[\"/work/.claude/worktrees/agent-b\",\"status\",\"--porcelain\",\"--untracked-files=normal\"]": {
    "code": 0,
    "stdout": ""
  }
}

/**
 * The same read once main moved on: a commit landed on main after feat/big
 * left it.
 */
export const TRUNK_MOVED_RUNS: Readonly<Record<string, { readonly code: number; readonly stdout: string }>> = {
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c...3412cd1e6ece530acf662c2ec83227eff77c77fa\"]": {
    "code": 0,
    "stdout": "1\t0\tagent-a.txt\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c...828086e38f3a3bbd91c6f9ac307b094f595ee093\"]": {
    "code": 0,
    "stdout": "1\t0\tfix.txt\n"
  },
  "[\"/work\",\"for-each-ref\",\"--format=%(refname)%00%(objectname)%00%(committerdate:unix)%00%(upstream:short)\",\"refs/heads\"]": {
    "code": 0,
    "stdout": "refs/heads/feat/big\u0000a9e4471df0fb6fa990032094a649313f4ce71b8c\u00001791538800\u0000\nrefs/heads/main\u0000828086e38f3a3bbd91c6f9ac307b094f595ee093\u00001791538900\u0000\nrefs/heads/worktree-agent-a\u00003412cd1e6ece530acf662c2ec83227eff77c77fa\u00001791538800\u0000\nrefs/heads/worktree-agent-b\u0000b0d65b416e668a45425889460892fcc838e74779\u00001791538800\u0000\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c\",\"3412cd1e6ece530acf662c2ec83227eff77c77fa\"]": {
    "code": 0,
    "stdout": "ec0f2348229d21ee87aaa8dbeba6d295fe5167f5\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c\",\"828086e38f3a3bbd91c6f9ac307b094f595ee093\"]": {
    "code": 0,
    "stdout": "3e3e4cce5272eeee48e222226dd369442db98d15\n"
  },
  "[\"/work\",\"rev-list\",\"--first-parent\",\"--max-count=10000\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c\"]": {
    "code": 0,
    "stdout": "a9e4471df0fb6fa990032094a649313f4ce71b8c\n06fa57dac7837d8d08d1e23bf4cc8eaa233bfa43\n102f6014d81784161d0c281dcef98f0298dcd2e5\n7f7b5c23ddcb6a25764787065996e95bc5a82435\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"--count\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c...828086e38f3a3bbd91c6f9ac307b094f595ee093\"]": {
    "code": 0,
    "stdout": "3\t1\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c...3412cd1e6ece530acf662c2ec83227eff77c77fa\"]": {
    "code": 0,
    "stdout": "<a9e4471df0fb6fa990032094a649313f4ce71b8c\n>3412cd1e6ece530acf662c2ec83227eff77c77fa\n<b0d65b416e668a45425889460892fcc838e74779\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c...828086e38f3a3bbd91c6f9ac307b094f595ee093\"]": {
    "code": 0,
    "stdout": ">828086e38f3a3bbd91c6f9ac307b094f595ee093\n<a9e4471df0fb6fa990032094a649313f4ce71b8c\n<06fa57dac7837d8d08d1e23bf4cc8eaa233bfa43\n<b0d65b416e668a45425889460892fcc838e74779\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c...b0d65b416e668a45425889460892fcc838e74779\"]": {
    "code": 0,
    "stdout": "<a9e4471df0fb6fa990032094a649313f4ce71b8c\n"
  },
  "[\"/work\",\"rev-parse\",\"--path-format=absolute\",\"--show-toplevel\",\"--git-common-dir\"]": {
    "code": 0,
    "stdout": "/work\n/work/.git\n"
  },
  "[\"/work\",\"status\",\"--porcelain\",\"--untracked-files=no\"]": {
    "code": 0,
    "stdout": ""
  },
  "[\"/work\",\"symbolic-ref\",\"--quiet\",\"--short\",\"refs/remotes/origin/HEAD\"]": {
    "code": 1,
    "stdout": ""
  },
  "[\"/work\",\"worktree\",\"list\",\"--porcelain\"]": {
    "code": 0,
    "stdout": "worktree /work\nHEAD a9e4471df0fb6fa990032094a649313f4ce71b8c\nbranch refs/heads/feat/big\n\nworktree /work/.claude/worktrees/agent-a\nHEAD 3412cd1e6ece530acf662c2ec83227eff77c77fa\nbranch refs/heads/worktree-agent-a\n\nworktree /work/.claude/worktrees/agent-b\nHEAD b0d65b416e668a45425889460892fcc838e74779\nbranch refs/heads/worktree-agent-b\n\n"
  },
  "[\"/work/.claude/worktrees/agent-a\",\"status\",\"--porcelain\",\"--untracked-files=normal\"]": {
    "code": 0,
    "stdout": ""
  },
  "[\"/work/.claude/worktrees/agent-b\",\"status\",\"--porcelain\",\"--untracked-files=normal\"]": {
    "code": 0,
    "stdout": ""
  }
}
