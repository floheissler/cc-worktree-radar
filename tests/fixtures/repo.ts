/**
 * Every git run of one radar read of a test repository, recorded from real
 * git (paths rewritten to /work) by a harness outside the plugin. Branches:
 * a stack (feat/parent, feat/child), a pair that conflicts only with each
 * other (feat/big, fix/small), two that conflict with main and each other
 * (feat/conflict, feat/conflict2), a READY branch feat/conflict2 waits for
 * (feat/ready-a), a held one (feat/clean), one with uncommitted changes in a
 * worktree (feat/wip) and one with nothing beyond main (chore/merged).
 */
export const RUNS: Readonly<Record<string, { readonly code: number; readonly stdout: string }>> = {
  "[\"/work\",\"rev-parse\",\"--path-format=absolute\",\"--show-toplevel\",\"--git-common-dir\"]": {
    "code": 0,
    "stdout": "/work\n/work/.git\n"
  },
  "[\"/work\",\"for-each-ref\",\"--format=%(refname)%00%(objectname)%00%(committerdate:unix)%00%(upstream:short)\",\"refs/heads\"]": {
    "code": 0,
    "stdout": "refs/heads/chore/merged\u000027e88ec2af9443a687a44fdd513183c8348d953a\u00001791538800\u0000\nrefs/heads/feat/big\u0000016bc82b92964349d699b1b71acb496ebddfb3d1\u00001791538800\u0000\nrefs/heads/feat/child\u0000d1021a8f713ec9796ff31fdd9169ca81456fd4ce\u00001791538800\u0000\nrefs/heads/feat/clean\u000052660242b478317617e5966227693a41ebdc75ef\u00001791538800\u0000\nrefs/heads/feat/conflict\u000003e2a582f391481fe39d9ad25b0ece57f4f71ca9\u00001791538800\u0000\nrefs/heads/feat/conflict2\u0000461a7d715db0d6f4c7a80691482b88b4242a8f7a\u00001791538830\u0000\nrefs/heads/feat/parent\u00003a32c3b64fe5cc90aea7ec244ba00a19d4525dde\u00001791538800\u0000\nrefs/heads/feat/ready-a\u0000583d4ddbd71e96df268fab8a074f6196e6fdf8e8\u00001791538830\u0000\nrefs/heads/feat/wip\u00001dc8893161e8328a7705d3852f0a3561589564e6\u00001791538800\u0000\nrefs/heads/fix/small\u00004c40c48d792275c7230befd68abb34f8a1ff9cae\u00001791538800\u0000\nrefs/heads/main\u00007b7b572154448bada5b773757710b1a8a182b81b\u00001791538800\u0000\n"
  },
  "[\"/work\",\"worktree\",\"list\",\"--porcelain\"]": {
    "code": 0,
    "stdout": "worktree /work\nHEAD 7b7b572154448bada5b773757710b1a8a182b81b\nbranch refs/heads/main\n\nworktree /work/.claude/worktrees/wip\nHEAD 1dc8893161e8328a7705d3852f0a3561589564e6\nbranch refs/heads/feat/wip\n\n"
  },
  "[\"/work\",\"symbolic-ref\",\"--quiet\",\"--short\",\"refs/remotes/origin/HEAD\"]": {
    "code": 1,
    "stdout": ""
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"7b7b572154448bada5b773757710b1a8a182b81b...27e88ec2af9443a687a44fdd513183c8348d953a\"]": {
    "code": 0,
    "stdout": "<7b7b572154448bada5b773757710b1a8a182b81b\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"7b7b572154448bada5b773757710b1a8a182b81b...016bc82b92964349d699b1b71acb496ebddfb3d1\"]": {
    "code": 0,
    "stdout": "<7b7b572154448bada5b773757710b1a8a182b81b\n>016bc82b92964349d699b1b71acb496ebddfb3d1\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"7b7b572154448bada5b773757710b1a8a182b81b...d1021a8f713ec9796ff31fdd9169ca81456fd4ce\"]": {
    "code": 0,
    "stdout": "<7b7b572154448bada5b773757710b1a8a182b81b\n>d1021a8f713ec9796ff31fdd9169ca81456fd4ce\n>3a32c3b64fe5cc90aea7ec244ba00a19d4525dde\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"7b7b572154448bada5b773757710b1a8a182b81b...52660242b478317617e5966227693a41ebdc75ef\"]": {
    "code": 0,
    "stdout": "<7b7b572154448bada5b773757710b1a8a182b81b\n>52660242b478317617e5966227693a41ebdc75ef\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"7b7b572154448bada5b773757710b1a8a182b81b...03e2a582f391481fe39d9ad25b0ece57f4f71ca9\"]": {
    "code": 0,
    "stdout": "<7b7b572154448bada5b773757710b1a8a182b81b\n>03e2a582f391481fe39d9ad25b0ece57f4f71ca9\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"7b7b572154448bada5b773757710b1a8a182b81b...461a7d715db0d6f4c7a80691482b88b4242a8f7a\"]": {
    "code": 0,
    "stdout": ">461a7d715db0d6f4c7a80691482b88b4242a8f7a\n<7b7b572154448bada5b773757710b1a8a182b81b\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"7b7b572154448bada5b773757710b1a8a182b81b...3a32c3b64fe5cc90aea7ec244ba00a19d4525dde\"]": {
    "code": 0,
    "stdout": "<7b7b572154448bada5b773757710b1a8a182b81b\n>3a32c3b64fe5cc90aea7ec244ba00a19d4525dde\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"7b7b572154448bada5b773757710b1a8a182b81b...583d4ddbd71e96df268fab8a074f6196e6fdf8e8\"]": {
    "code": 0,
    "stdout": ">583d4ddbd71e96df268fab8a074f6196e6fdf8e8\n<7b7b572154448bada5b773757710b1a8a182b81b\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"7b7b572154448bada5b773757710b1a8a182b81b...016bc82b92964349d699b1b71acb496ebddfb3d1\"]": {
    "code": 0,
    "stdout": "3\t1\tb.txt\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"7b7b572154448bada5b773757710b1a8a182b81b...d1021a8f713ec9796ff31fdd9169ca81456fd4ce\"]": {
    "code": 0,
    "stdout": "1\t0\tchild.txt\n1\t0\tp.txt\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"7b7b572154448bada5b773757710b1a8a182b81b...52660242b478317617e5966227693a41ebdc75ef\"]": {
    "code": 0,
    "stdout": "1\t1\tc.txt\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"7b7b572154448bada5b773757710b1a8a182b81b...03e2a582f391481fe39d9ad25b0ece57f4f71ca9\"]": {
    "code": 0,
    "stdout": "1\t1\ta.txt\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"7b7b572154448bada5b773757710b1a8a182b81b...461a7d715db0d6f4c7a80691482b88b4242a8f7a\"]": {
    "code": 0,
    "stdout": "3\t1\ta.txt\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"7b7b572154448bada5b773757710b1a8a182b81b...3a32c3b64fe5cc90aea7ec244ba00a19d4525dde\"]": {
    "code": 0,
    "stdout": "1\t0\tp.txt\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"7b7b572154448bada5b773757710b1a8a182b81b...583d4ddbd71e96df268fab8a074f6196e6fdf8e8\"]": {
    "code": 0,
    "stdout": "1\t1\ta.txt\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"7b7b572154448bada5b773757710b1a8a182b81b...1dc8893161e8328a7705d3852f0a3561589564e6\"]": {
    "code": 0,
    "stdout": ">1dc8893161e8328a7705d3852f0a3561589564e6\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"7b7b572154448bada5b773757710b1a8a182b81b\",\"016bc82b92964349d699b1b71acb496ebddfb3d1\"]": {
    "code": 0,
    "stdout": "0f777c38c7c0fd8f20c513421c5d55d554c8e288\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"7b7b572154448bada5b773757710b1a8a182b81b\",\"d1021a8f713ec9796ff31fdd9169ca81456fd4ce\"]": {
    "code": 0,
    "stdout": "4cee1776aef42f64f9ebf47bfc32ea2a261b0498\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"7b7b572154448bada5b773757710b1a8a182b81b\",\"52660242b478317617e5966227693a41ebdc75ef\"]": {
    "code": 0,
    "stdout": "98ff9f8125a72a57099f52b7352cebbcf6d013e0\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"7b7b572154448bada5b773757710b1a8a182b81b\",\"03e2a582f391481fe39d9ad25b0ece57f4f71ca9\"]": {
    "code": 1,
    "stdout": "c451711b819e348a85d6509476b026f680133dc8\na.txt\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"7b7b572154448bada5b773757710b1a8a182b81b\",\"461a7d715db0d6f4c7a80691482b88b4242a8f7a\"]": {
    "code": 1,
    "stdout": "9cbf3d8a30dcc41042128c79cc4559e4d8c55929\na.txt\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"7b7b572154448bada5b773757710b1a8a182b81b\",\"3a32c3b64fe5cc90aea7ec244ba00a19d4525dde\"]": {
    "code": 0,
    "stdout": "d218a406ce87593592318fd038845e4bfd31d312\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"7b7b572154448bada5b773757710b1a8a182b81b\",\"583d4ddbd71e96df268fab8a074f6196e6fdf8e8\"]": {
    "code": 0,
    "stdout": "2b0bab5eaa7d98b8e7cfaee3e2f810f3d0971806\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"7b7b572154448bada5b773757710b1a8a182b81b...1dc8893161e8328a7705d3852f0a3561589564e6\"]": {
    "code": 0,
    "stdout": "1\t0\tw.txt\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"7b7b572154448bada5b773757710b1a8a182b81b\",\"1dc8893161e8328a7705d3852f0a3561589564e6\"]": {
    "code": 0,
    "stdout": "e26e0eceeb13b7f61302ab0131ed5201f1a0356f\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"7b7b572154448bada5b773757710b1a8a182b81b...4c40c48d792275c7230befd68abb34f8a1ff9cae\"]": {
    "code": 0,
    "stdout": "<7b7b572154448bada5b773757710b1a8a182b81b\n>4c40c48d792275c7230befd68abb34f8a1ff9cae\n"
  },
  "[\"/work/.claude/worktrees/wip\",\"status\",\"--porcelain\",\"--untracked-files=normal\"]": {
    "code": 0,
    "stdout": " M w.txt\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"7b7b572154448bada5b773757710b1a8a182b81b...4c40c48d792275c7230befd68abb34f8a1ff9cae\"]": {
    "code": 0,
    "stdout": "1\t1\tb.txt\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"7b7b572154448bada5b773757710b1a8a182b81b\",\"4c40c48d792275c7230befd68abb34f8a1ff9cae\"]": {
    "code": 0,
    "stdout": "30450c61833d4a1411a4ddc5252a8b3e29f6f52e\n"
  },
  "[\"/work\",\"commit-tree\",\"0f777c38c7c0fd8f20c513421c5d55d554c8e288\",\"-p\",\"7b7b572154448bada5b773757710b1a8a182b81b\",\"-p\",\"016bc82b92964349d699b1b71acb496ebddfb3d1\",\"-m\",\"worktree-radar simulation\"]": {
    "code": 0,
    "stdout": "9cb04fb4915de2ee3bf54fb2534fe97d0dcdcf7e\n"
  },
  "[\"/work\",\"commit-tree\",\"4cee1776aef42f64f9ebf47bfc32ea2a261b0498\",\"-p\",\"7b7b572154448bada5b773757710b1a8a182b81b\",\"-p\",\"d1021a8f713ec9796ff31fdd9169ca81456fd4ce\",\"-m\",\"worktree-radar simulation\"]": {
    "code": 0,
    "stdout": "702d652eb4612bfb4114cb95da3ebc3927407e08\n"
  },
  "[\"/work\",\"commit-tree\",\"d218a406ce87593592318fd038845e4bfd31d312\",\"-p\",\"7b7b572154448bada5b773757710b1a8a182b81b\",\"-p\",\"3a32c3b64fe5cc90aea7ec244ba00a19d4525dde\",\"-m\",\"worktree-radar simulation\"]": {
    "code": 0,
    "stdout": "f4b30d860d2f154ad799a809f6392b72a4221b79\n"
  },
  "[\"/work\",\"commit-tree\",\"30450c61833d4a1411a4ddc5252a8b3e29f6f52e\",\"-p\",\"7b7b572154448bada5b773757710b1a8a182b81b\",\"-p\",\"4c40c48d792275c7230befd68abb34f8a1ff9cae\",\"-m\",\"worktree-radar simulation\"]": {
    "code": 0,
    "stdout": "30f1a716009da6fea28d332c6acc3337b5daea9a\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"9cb04fb4915de2ee3bf54fb2534fe97d0dcdcf7e\",\"4c40c48d792275c7230befd68abb34f8a1ff9cae\"]": {
    "code": 1,
    "stdout": "66ad92535d2c983046b96d44fddab00f74e5bbbe\nb.txt\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"702d652eb4612bfb4114cb95da3ebc3927407e08\",\"3a32c3b64fe5cc90aea7ec244ba00a19d4525dde\"]": {
    "code": 0,
    "stdout": "4cee1776aef42f64f9ebf47bfc32ea2a261b0498\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"f4b30d860d2f154ad799a809f6392b72a4221b79\",\"d1021a8f713ec9796ff31fdd9169ca81456fd4ce\"]": {
    "code": 0,
    "stdout": "4cee1776aef42f64f9ebf47bfc32ea2a261b0498\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"30f1a716009da6fea28d332c6acc3337b5daea9a\",\"016bc82b92964349d699b1b71acb496ebddfb3d1\"]": {
    "code": 1,
    "stdout": "7e9dbd33828cc70ec647c069628df14bf8fd5cb2\nb.txt\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"583d4ddbd71e96df268fab8a074f6196e6fdf8e8\",\"461a7d715db0d6f4c7a80691482b88b4242a8f7a\"]": {
    "code": 1,
    "stdout": "b7310bdc472b9a01aae033f5cb2ce4c5661f661d\na.txt\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"583d4ddbd71e96df268fab8a074f6196e6fdf8e8\",\"03e2a582f391481fe39d9ad25b0ece57f4f71ca9\"]": {
    "code": 0,
    "stdout": "cd1f22ca00dd4c5b3e88ddb0bcf344766e24afd3\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"461a7d715db0d6f4c7a80691482b88b4242a8f7a\",\"03e2a582f391481fe39d9ad25b0ece57f4f71ca9\"]": {
    "code": 1,
    "stdout": "d044b4f572e2e13b158747ca5f60a9f0822b1566\na.txt\n"
  },
  "[\"/work\",\"status\",\"--porcelain\",\"--untracked-files=no\"]": {
    "code": 0,
    "stdout": ""
  }
}

export const HOLDS = {"feat/clean":{"reason":"waiting on review","at":1}}

/**
 * What the read must say, checked against the Python pipeline this port
 * came from.
 */
export const EXPECTED = [
  {
    "name": "feat/parent",
    "lane": "READY",
    "rank": 1,
    "waitsFor": null,
    "stackedOn": null,
    "conflicts": [],
    "breaks": [],
    "summary": "merges cleanly into main · feat/child stacked on it"
  },
  {
    "name": "feat/ready-a",
    "lane": "READY",
    "rank": 2,
    "waitsFor": null,
    "stackedOn": null,
    "conflicts": [],
    "breaks": [],
    "summary": "merges cleanly into main"
  },
  {
    "name": "feat/big",
    "lane": "READY",
    "rank": 3,
    "waitsFor": null,
    "stackedOn": null,
    "conflicts": [],
    "breaks": [
      "fix/small"
    ],
    "summary": "merges cleanly into main · landing it forces a rebase of fix/small (b.txt)"
  },
  {
    "name": "fix/small",
    "lane": "READY",
    "rank": 4,
    "waitsFor": null,
    "stackedOn": null,
    "conflicts": [],
    "breaks": [
      "feat/big"
    ],
    "summary": "merges cleanly into main · landing it forces a rebase of feat/big (b.txt)"
  },
  {
    "name": "feat/conflict2",
    "lane": "NEEDS_REBASE",
    "rank": null,
    "waitsFor": [
      "feat/ready-a"
    ],
    "stackedOn": null,
    "conflicts": [
      "a.txt"
    ],
    "breaks": [],
    "summary": "conflicts with main: a.txt · rebase waits for feat/ready-a to land first"
  },
  {
    "name": "feat/conflict",
    "lane": "NEEDS_REBASE",
    "rank": null,
    "waitsFor": [
      "feat/conflict2"
    ],
    "stackedOn": null,
    "conflicts": [
      "a.txt"
    ],
    "breaks": [],
    "summary": "conflicts with main: a.txt · rebase waits for feat/conflict2 to land first"
  },
  {
    "name": "feat/child",
    "lane": "STACKED",
    "rank": null,
    "waitsFor": null,
    "stackedOn": "feat/parent",
    "conflicts": [],
    "breaks": [],
    "summary": "stacked on feat/parent (+1 own): feat/parent lands first"
  },
  {
    "name": "feat/wip",
    "lane": "IN_PROGRESS",
    "rank": null,
    "waitsFor": null,
    "stackedOn": null,
    "conflicts": [],
    "breaks": [],
    "summary": "merges cleanly into main · 1 uncommitted file"
  },
  {
    "name": "feat/clean",
    "lane": "HOLD",
    "rank": null,
    "waitsFor": null,
    "stackedOn": null,
    "conflicts": [],
    "breaks": [],
    "summary": "on hold: waiting on review · merges cleanly into main"
  },
  {
    "name": "chore/merged",
    "lane": "CLEANUP",
    "rank": null,
    "waitsFor": null,
    "stackedOn": null,
    "conflicts": null,
    "breaks": [],
    "summary": "no commits beyond main"
  }
]

export const NEXT = "feat/parent"
