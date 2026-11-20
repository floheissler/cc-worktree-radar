/**
 * Git runs of radar reads with a feature branch as the base, recorded from
 * real git (paths rewritten to /work).
 */

/**
 * One read, before and after the fix that keeps the default branch out of
 * the lanes: the union of both, so a read that still listed main replays
 * too. main has two commits of its own; feat/big, cut from it, is checked
 * out in the main worktree, and two agent worktrees were cut from feat/big:
 * worktree-agent-a with a commit of its own, worktree-agent-b merged back
 * into feat/big (--no-ff).
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
  "[\"/work\",\"reflog\",\"show\",\"--format=%H%x00%gs\",\"refs/heads/feat/big\",\"--\"]": {
    "code": 0,
    "stdout": "a9e4471df0fb6fa990032094a649313f4ce71b8c\u0000merge worktree-agent-b: Merge made by the 'ort' strategy.\n06fa57dac7837d8d08d1e23bf4cc8eaa233bfa43\u0000commit: big: start\n102f6014d81784161d0c281dcef98f0298dcd2e5\u0000branch: Created from HEAD\n"
  },
  "[\"/work\",\"reflog\",\"show\",\"--format=%H%x00%gs\",\"refs/heads/main\",\"--\"]": {
    "code": 0,
    "stdout": "102f6014d81784161d0c281dcef98f0298dcd2e5\u0000commit: main: second\n7f7b5c23ddcb6a25764787065996e95bc5a82435\u0000commit (initial): initial\n"
  },
  "[\"/work\",\"reflog\",\"show\",\"--format=%H%x00%gs\",\"refs/heads/worktree-agent-a\",\"--\"]": {
    "code": 0,
    "stdout": "3412cd1e6ece530acf662c2ec83227eff77c77fa\u0000commit: agent a\n06fa57dac7837d8d08d1e23bf4cc8eaa233bfa43\u0000branch: Created from feat/big\n"
  },
  "[\"/work\",\"reflog\",\"show\",\"--format=%H%x00%gs\",\"refs/heads/worktree-agent-b\",\"--\"]": {
    "code": 0,
    "stdout": "b0d65b416e668a45425889460892fcc838e74779\u0000commit: agent b\n06fa57dac7837d8d08d1e23bf4cc8eaa233bfa43\u0000branch: Created from feat/big\n"
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
  "[\"/work\",\"reflog\",\"show\",\"--format=%H%x00%gs\",\"refs/heads/feat/big\",\"--\"]": {
    "code": 0,
    "stdout": "a9e4471df0fb6fa990032094a649313f4ce71b8c\u0000merge worktree-agent-b: Merge made by the 'ort' strategy.\n06fa57dac7837d8d08d1e23bf4cc8eaa233bfa43\u0000commit: big: start\n102f6014d81784161d0c281dcef98f0298dcd2e5\u0000branch: Created from HEAD\n"
  },
  "[\"/work\",\"reflog\",\"show\",\"--format=%H%x00%gs\",\"refs/heads/worktree-agent-a\",\"--\"]": {
    "code": 0,
    "stdout": "3412cd1e6ece530acf662c2ec83227eff77c77fa\u0000commit: agent a\n06fa57dac7837d8d08d1e23bf4cc8eaa233bfa43\u0000branch: Created from feat/big\n"
  },
  "[\"/work\",\"reflog\",\"show\",\"--format=%H%x00%gs\",\"refs/heads/worktree-agent-b\",\"--\"]": {
    "code": 0,
    "stdout": "b0d65b416e668a45425889460892fcc838e74779\u0000commit: agent b\n06fa57dac7837d8d08d1e23bf4cc8eaa233bfa43\u0000branch: Created from feat/big\n"
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

/**
 * Reads with feat/big and with feat/big-ui as the base, of a repository
 * where main has feat/big (git checkout -b), feat/other (git branch
 * feat/other main, where feat/big was made) and chore/old (from main~1);
 * feat/big has two agent worktrees (git worktree add -b, worktree-agent-b
 * merged back) and then feat/big-ui (git worktree add -b), which has
 * feat/big-ui-part (git worktree add -b ... feat/big-ui); then main moved on
 * and fix/late was cut from it (git checkout -b).
 */
export const NESTED_RUNS: Readonly<Record<string, { readonly code: number; readonly stdout: string }>> = {
  "[\"/work\",\"commit-tree\",\"3a42a983fe0c28531350bec7342fe47ab5ee9af9\",\"-p\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c\",\"-p\",\"8302ee24c305696751b0afd3226b2fc8dce7b3af\",\"-m\",\"worktree-radar simulation\"]": {
    "code": 0,
    "stdout": "809bef1e82686d3bb217a9e9e8507f7da22e1093\n"
  },
  "[\"/work\",\"commit-tree\",\"af6ebd3d12130ea26fe7eaac0aaaa226e8fdce2f\",\"-p\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c\",\"-p\",\"29b8caaa2d52a47de5c3c17844102e6a7490528d\",\"-m\",\"worktree-radar simulation\"]": {
    "code": 0,
    "stdout": "eb7c988821bb71aea42549fe0701da6cde34a15c\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"8302ee24c305696751b0afd3226b2fc8dce7b3af...29b8caaa2d52a47de5c3c17844102e6a7490528d\"]": {
    "code": 0,
    "stdout": "1\t0\tpart.txt\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c...29b8caaa2d52a47de5c3c17844102e6a7490528d\"]": {
    "code": 0,
    "stdout": "1\t0\tpart.txt\n1\t0\tui.txt\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c...3412cd1e6ece530acf662c2ec83227eff77c77fa\"]": {
    "code": 0,
    "stdout": "1\t0\tagent-a.txt\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c...8302ee24c305696751b0afd3226b2fc8dce7b3af\"]": {
    "code": 0,
    "stdout": "1\t0\tui.txt\n"
  },
  "[\"/work\",\"for-each-ref\",\"--format=%(refname)%00%(objectname)%00%(committerdate:unix)%00%(upstream:short)\",\"refs/heads\"]": {
    "code": 0,
    "stdout": "refs/heads/chore/old\u00007f7b5c23ddcb6a25764787065996e95bc5a82435\u00001791538800\u0000\nrefs/heads/feat/big\u0000a9e4471df0fb6fa990032094a649313f4ce71b8c\u00001791538800\u0000\nrefs/heads/feat/big-ui\u00008302ee24c305696751b0afd3226b2fc8dce7b3af\u00001791538800\u0000\nrefs/heads/feat/big-ui-part\u000029b8caaa2d52a47de5c3c17844102e6a7490528d\u00001791538800\u0000\nrefs/heads/feat/other\u00002bf99f8448a8d9d2638039f27d35eed8a74a16a9\u00001791538800\u0000\nrefs/heads/fix/late\u00009df36479e4c0987f232212c42e4d1d1b11bdf671\u00001791538800\u0000\nrefs/heads/main\u000031550b1923201bc85682b9fe8e3859b445a69d5d\u00001791538800\u0000\nrefs/heads/worktree-agent-a\u00003412cd1e6ece530acf662c2ec83227eff77c77fa\u00001791538800\u0000\nrefs/heads/worktree-agent-b\u0000b0d65b416e668a45425889460892fcc838e74779\u00001791538800\u0000\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"809bef1e82686d3bb217a9e9e8507f7da22e1093\",\"29b8caaa2d52a47de5c3c17844102e6a7490528d\"]": {
    "code": 0,
    "stdout": "af6ebd3d12130ea26fe7eaac0aaaa226e8fdce2f\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"8302ee24c305696751b0afd3226b2fc8dce7b3af\",\"29b8caaa2d52a47de5c3c17844102e6a7490528d\"]": {
    "code": 0,
    "stdout": "af6ebd3d12130ea26fe7eaac0aaaa226e8fdce2f\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c\",\"29b8caaa2d52a47de5c3c17844102e6a7490528d\"]": {
    "code": 0,
    "stdout": "af6ebd3d12130ea26fe7eaac0aaaa226e8fdce2f\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c\",\"3412cd1e6ece530acf662c2ec83227eff77c77fa\"]": {
    "code": 0,
    "stdout": "ec0f2348229d21ee87aaa8dbeba6d295fe5167f5\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c\",\"8302ee24c305696751b0afd3226b2fc8dce7b3af\"]": {
    "code": 0,
    "stdout": "3a42a983fe0c28531350bec7342fe47ab5ee9af9\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"eb7c988821bb71aea42549fe0701da6cde34a15c\",\"8302ee24c305696751b0afd3226b2fc8dce7b3af\"]": {
    "code": 0,
    "stdout": "af6ebd3d12130ea26fe7eaac0aaaa226e8fdce2f\n"
  },
  "[\"/work\",\"reflog\",\"show\",\"--format=%H%x00%gs\",\"refs/heads/chore/old\",\"--\"]": {
    "code": 0,
    "stdout": "7f7b5c23ddcb6a25764787065996e95bc5a82435\u0000branch: Created from main~1\n"
  },
  "[\"/work\",\"reflog\",\"show\",\"--format=%H%x00%gs\",\"refs/heads/feat/big\",\"--\"]": {
    "code": 0,
    "stdout": "a9e4471df0fb6fa990032094a649313f4ce71b8c\u0000merge worktree-agent-b: Merge made by the 'ort' strategy.\n06fa57dac7837d8d08d1e23bf4cc8eaa233bfa43\u0000commit: big: start\n102f6014d81784161d0c281dcef98f0298dcd2e5\u0000branch: Created from HEAD\n"
  },
  "[\"/work\",\"reflog\",\"show\",\"--format=%H%x00%gs\",\"refs/heads/feat/big-ui\",\"--\"]": {
    "code": 0,
    "stdout": "8302ee24c305696751b0afd3226b2fc8dce7b3af\u0000commit: ui\na9e4471df0fb6fa990032094a649313f4ce71b8c\u0000branch: Created from HEAD\n"
  },
  "[\"/work\",\"reflog\",\"show\",\"--format=%H%x00%gs\",\"refs/heads/feat/big-ui-part\",\"--\"]": {
    "code": 0,
    "stdout": "29b8caaa2d52a47de5c3c17844102e6a7490528d\u0000commit: ui part\n8302ee24c305696751b0afd3226b2fc8dce7b3af\u0000branch: Created from feat/big-ui\n"
  },
  "[\"/work\",\"reflog\",\"show\",\"--format=%H%x00%gs\",\"refs/heads/feat/other\",\"--\"]": {
    "code": 0,
    "stdout": "2bf99f8448a8d9d2638039f27d35eed8a74a16a9\u0000commit: other\n102f6014d81784161d0c281dcef98f0298dcd2e5\u0000branch: Created from main\n"
  },
  "[\"/work\",\"reflog\",\"show\",\"--format=%H%x00%gs\",\"refs/heads/fix/late\",\"--\"]": {
    "code": 0,
    "stdout": "9df36479e4c0987f232212c42e4d1d1b11bdf671\u0000commit: late\n31550b1923201bc85682b9fe8e3859b445a69d5d\u0000branch: Created from HEAD\n"
  },
  "[\"/work\",\"reflog\",\"show\",\"--format=%H%x00%gs\",\"refs/heads/worktree-agent-a\",\"--\"]": {
    "code": 0,
    "stdout": "3412cd1e6ece530acf662c2ec83227eff77c77fa\u0000commit: agent a\n06fa57dac7837d8d08d1e23bf4cc8eaa233bfa43\u0000branch: Created from HEAD\n"
  },
  "[\"/work\",\"reflog\",\"show\",\"--format=%H%x00%gs\",\"refs/heads/worktree-agent-b\",\"--\"]": {
    "code": 0,
    "stdout": "b0d65b416e668a45425889460892fcc838e74779\u0000commit: agent b\n06fa57dac7837d8d08d1e23bf4cc8eaa233bfa43\u0000branch: Created from HEAD\n"
  },
  "[\"/work\",\"rev-list\",\"--first-parent\",\"--max-count=10000\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c\"]": {
    "code": 0,
    "stdout": "a9e4471df0fb6fa990032094a649313f4ce71b8c\n06fa57dac7837d8d08d1e23bf4cc8eaa233bfa43\n102f6014d81784161d0c281dcef98f0298dcd2e5\n7f7b5c23ddcb6a25764787065996e95bc5a82435\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"--count\",\"8302ee24c305696751b0afd3226b2fc8dce7b3af...31550b1923201bc85682b9fe8e3859b445a69d5d\"]": {
    "code": 0,
    "stdout": "4\t1\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"--count\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c...31550b1923201bc85682b9fe8e3859b445a69d5d\"]": {
    "code": 0,
    "stdout": "3\t1\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"8302ee24c305696751b0afd3226b2fc8dce7b3af...29b8caaa2d52a47de5c3c17844102e6a7490528d\"]": {
    "code": 0,
    "stdout": ">29b8caaa2d52a47de5c3c17844102e6a7490528d\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c...29b8caaa2d52a47de5c3c17844102e6a7490528d\"]": {
    "code": 0,
    "stdout": ">29b8caaa2d52a47de5c3c17844102e6a7490528d\n>8302ee24c305696751b0afd3226b2fc8dce7b3af\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c...3412cd1e6ece530acf662c2ec83227eff77c77fa\"]": {
    "code": 0,
    "stdout": "<a9e4471df0fb6fa990032094a649313f4ce71b8c\n>3412cd1e6ece530acf662c2ec83227eff77c77fa\n<b0d65b416e668a45425889460892fcc838e74779\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"a9e4471df0fb6fa990032094a649313f4ce71b8c...8302ee24c305696751b0afd3226b2fc8dce7b3af\"]": {
    "code": 0,
    "stdout": ">8302ee24c305696751b0afd3226b2fc8dce7b3af\n"
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
    "stdout": "worktree /work\nHEAD a9e4471df0fb6fa990032094a649313f4ce71b8c\nbranch refs/heads/feat/big\n\nworktree /work/.claude/worktrees/agent-a\nHEAD 3412cd1e6ece530acf662c2ec83227eff77c77fa\nbranch refs/heads/worktree-agent-a\n\nworktree /work/.claude/worktrees/agent-b\nHEAD b0d65b416e668a45425889460892fcc838e74779\nbranch refs/heads/worktree-agent-b\n\nworktree /work/.claude/worktrees/other\nHEAD 2bf99f8448a8d9d2638039f27d35eed8a74a16a9\nbranch refs/heads/feat/other\n\nworktree /work/.claude/worktrees/ui\nHEAD 8302ee24c305696751b0afd3226b2fc8dce7b3af\nbranch refs/heads/feat/big-ui\n\nworktree /work/.claude/worktrees/ui-part\nHEAD 29b8caaa2d52a47de5c3c17844102e6a7490528d\nbranch refs/heads/feat/big-ui-part\n\n"
  },
  "[\"/work/.claude/worktrees/agent-a\",\"status\",\"--porcelain\",\"--untracked-files=normal\"]": {
    "code": 0,
    "stdout": ""
  },
  "[\"/work/.claude/worktrees/agent-b\",\"status\",\"--porcelain\",\"--untracked-files=normal\"]": {
    "code": 0,
    "stdout": ""
  },
  "[\"/work/.claude/worktrees/ui\",\"status\",\"--porcelain\",\"--untracked-files=normal\"]": {
    "code": 0,
    "stdout": ""
  },
  "[\"/work/.claude/worktrees/ui-part\",\"status\",\"--porcelain\",\"--untracked-files=normal\"]": {
    "code": 0,
    "stdout": ""
  }
}
