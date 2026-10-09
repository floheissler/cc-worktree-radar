/**
 * Every git run of one radar read of a test repository, recorded from real
 * git (paths rewritten to /work) by a harness outside the plugin. Branches:
 * a stack (feat/parent, feat/child), a pair that conflicts only with each
 * other (feat/big, fix/small), two that conflict with main and each other
 * (feat/conflict, feat/conflict2), a READY branch feat/conflict2 waits for
 * (feat/ready-a), a held one (feat/clean), one with uncommitted changes in a
 * worktree (feat/wip), one with nothing beyond main (chore/merged) and one
 * that landed in main through a merge, its worktree still there (feat/landed).
 */
export const RUNS: Readonly<Record<string, { readonly code: number; readonly stdout: string }>> = {
  "[\"/work\",\"rev-parse\",\"--path-format=absolute\",\"--show-toplevel\",\"--git-common-dir\"]": {
    "code": 0,
    "stdout": "/work\n/work/.git\n"
  },
  "[\"/work\",\"for-each-ref\",\"--format=%(refname)%00%(objectname)%00%(committerdate:unix)%00%(upstream:short)\",\"refs/heads\"]": {
    "code": 0,
    "stdout": "refs/heads/chore/merged\u000027e88ec2af9443a687a44fdd513183c8348d953a\u00001791538800\u0000\nrefs/heads/feat/big\u0000016bc82b92964349d699b1b71acb496ebddfb3d1\u00001791538800\u0000\nrefs/heads/feat/child\u0000d1021a8f713ec9796ff31fdd9169ca81456fd4ce\u00001791538800\u0000\nrefs/heads/feat/clean\u000052660242b478317617e5966227693a41ebdc75ef\u00001791538800\u0000\nrefs/heads/feat/conflict\u000003e2a582f391481fe39d9ad25b0ece57f4f71ca9\u00001791538800\u0000\nrefs/heads/feat/conflict2\u0000461a7d715db0d6f4c7a80691482b88b4242a8f7a\u00001791538830\u0000\nrefs/heads/feat/landed\u00003ae7e8ddef2f201bdf96a26e6cb7afd06945852e\u00001791543884\u0000\nrefs/heads/feat/parent\u00003a32c3b64fe5cc90aea7ec244ba00a19d4525dde\u00001791538800\u0000\nrefs/heads/feat/ready-a\u0000583d4ddbd71e96df268fab8a074f6196e6fdf8e8\u00001791538830\u0000\nrefs/heads/feat/wip\u00001dc8893161e8328a7705d3852f0a3561589564e6\u00001791538800\u0000\nrefs/heads/fix/small\u00004c40c48d792275c7230befd68abb34f8a1ff9cae\u00001791538800\u0000\nrefs/heads/main\u0000160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\u00001791543884\u0000\n"
  },
  "[\"/work\",\"worktree\",\"list\",\"--porcelain\"]": {
    "code": 0,
    "stdout": "worktree /work\nHEAD 160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\nbranch refs/heads/main\n\nworktree /work/.claude/worktrees/landed\nHEAD 3ae7e8ddef2f201bdf96a26e6cb7afd06945852e\nbranch refs/heads/feat/landed\n\nworktree /work/.claude/worktrees/wip\nHEAD 1dc8893161e8328a7705d3852f0a3561589564e6\nbranch refs/heads/feat/wip\n\n"
  },
  "[\"/work\",\"symbolic-ref\",\"--quiet\",\"--short\",\"refs/remotes/origin/HEAD\"]": {
    "code": 1,
    "stdout": ""
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...27e88ec2af9443a687a44fdd513183c8348d953a\"]": {
    "code": 0,
    "stdout": "<160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\n<3ae7e8ddef2f201bdf96a26e6cb7afd06945852e\n<7b7b572154448bada5b773757710b1a8a182b81b\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...016bc82b92964349d699b1b71acb496ebddfb3d1\"]": {
    "code": 0,
    "stdout": "<160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\n<3ae7e8ddef2f201bdf96a26e6cb7afd06945852e\n>016bc82b92964349d699b1b71acb496ebddfb3d1\n<7b7b572154448bada5b773757710b1a8a182b81b\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...d1021a8f713ec9796ff31fdd9169ca81456fd4ce\"]": {
    "code": 0,
    "stdout": "<160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\n<3ae7e8ddef2f201bdf96a26e6cb7afd06945852e\n>d1021a8f713ec9796ff31fdd9169ca81456fd4ce\n<7b7b572154448bada5b773757710b1a8a182b81b\n>3a32c3b64fe5cc90aea7ec244ba00a19d4525dde\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...52660242b478317617e5966227693a41ebdc75ef\"]": {
    "code": 0,
    "stdout": "<160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\n<3ae7e8ddef2f201bdf96a26e6cb7afd06945852e\n>52660242b478317617e5966227693a41ebdc75ef\n<7b7b572154448bada5b773757710b1a8a182b81b\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...03e2a582f391481fe39d9ad25b0ece57f4f71ca9\"]": {
    "code": 0,
    "stdout": "<160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\n<3ae7e8ddef2f201bdf96a26e6cb7afd06945852e\n>03e2a582f391481fe39d9ad25b0ece57f4f71ca9\n<7b7b572154448bada5b773757710b1a8a182b81b\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...461a7d715db0d6f4c7a80691482b88b4242a8f7a\"]": {
    "code": 0,
    "stdout": "<160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\n<3ae7e8ddef2f201bdf96a26e6cb7afd06945852e\n>461a7d715db0d6f4c7a80691482b88b4242a8f7a\n<7b7b572154448bada5b773757710b1a8a182b81b\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...3ae7e8ddef2f201bdf96a26e6cb7afd06945852e\"]": {
    "code": 0,
    "stdout": "<160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...3a32c3b64fe5cc90aea7ec244ba00a19d4525dde\"]": {
    "code": 0,
    "stdout": "<160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\n<3ae7e8ddef2f201bdf96a26e6cb7afd06945852e\n>3a32c3b64fe5cc90aea7ec244ba00a19d4525dde\n<7b7b572154448bada5b773757710b1a8a182b81b\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...016bc82b92964349d699b1b71acb496ebddfb3d1\"]": {
    "code": 0,
    "stdout": "3\t1\tb.txt\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...d1021a8f713ec9796ff31fdd9169ca81456fd4ce\"]": {
    "code": 0,
    "stdout": "1\t0\tchild.txt\n1\t0\tp.txt\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...52660242b478317617e5966227693a41ebdc75ef\"]": {
    "code": 0,
    "stdout": "1\t1\tc.txt\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...03e2a582f391481fe39d9ad25b0ece57f4f71ca9\"]": {
    "code": 0,
    "stdout": "1\t1\ta.txt\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...461a7d715db0d6f4c7a80691482b88b4242a8f7a\"]": {
    "code": 0,
    "stdout": "3\t1\ta.txt\n"
  },
  "[\"/work/.claude/worktrees/landed\",\"status\",\"--porcelain\",\"--untracked-files=normal\"]": {
    "code": 0,
    "stdout": ""
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...3a32c3b64fe5cc90aea7ec244ba00a19d4525dde\"]": {
    "code": 0,
    "stdout": "1\t0\tp.txt\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...583d4ddbd71e96df268fab8a074f6196e6fdf8e8\"]": {
    "code": 0,
    "stdout": "<160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\n<3ae7e8ddef2f201bdf96a26e6cb7afd06945852e\n>583d4ddbd71e96df268fab8a074f6196e6fdf8e8\n<7b7b572154448bada5b773757710b1a8a182b81b\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\",\"016bc82b92964349d699b1b71acb496ebddfb3d1\"]": {
    "code": 0,
    "stdout": "7da88c6a405b19539393068d267166cbfc902fe9\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\",\"d1021a8f713ec9796ff31fdd9169ca81456fd4ce\"]": {
    "code": 0,
    "stdout": "e2ec58f65870e55301d24b76522ad821349c24bb\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\",\"52660242b478317617e5966227693a41ebdc75ef\"]": {
    "code": 0,
    "stdout": "03035eaa518dce8f76dd8db578e09fe9edc7aeea\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\",\"03e2a582f391481fe39d9ad25b0ece57f4f71ca9\"]": {
    "code": 1,
    "stdout": "d258ca592cabf107b3c39ce47255f12cfc2f1c3a\na.txt\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\",\"461a7d715db0d6f4c7a80691482b88b4242a8f7a\"]": {
    "code": 1,
    "stdout": "74da2f0585b3b621b9015bebf441c3d6c7f00b49\na.txt\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\",\"3a32c3b64fe5cc90aea7ec244ba00a19d4525dde\"]": {
    "code": 0,
    "stdout": "eda67ea3e09cc64c5895fe748c7d3b229b2fae84\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...583d4ddbd71e96df268fab8a074f6196e6fdf8e8\"]": {
    "code": 0,
    "stdout": "1\t1\ta.txt\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...1dc8893161e8328a7705d3852f0a3561589564e6\"]": {
    "code": 0,
    "stdout": "<160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\n<3ae7e8ddef2f201bdf96a26e6cb7afd06945852e\n>1dc8893161e8328a7705d3852f0a3561589564e6\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\",\"583d4ddbd71e96df268fab8a074f6196e6fdf8e8\"]": {
    "code": 0,
    "stdout": "116417c1934ffc78e4c0cd5b61ee47edb6e82a30\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...1dc8893161e8328a7705d3852f0a3561589564e6\"]": {
    "code": 0,
    "stdout": "1\t0\tw.txt\n"
  },
  "[\"/work\",\"rev-list\",\"--left-right\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...4c40c48d792275c7230befd68abb34f8a1ff9cae\"]": {
    "code": 0,
    "stdout": "<160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\n<3ae7e8ddef2f201bdf96a26e6cb7afd06945852e\n>4c40c48d792275c7230befd68abb34f8a1ff9cae\n<7b7b572154448bada5b773757710b1a8a182b81b\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\",\"1dc8893161e8328a7705d3852f0a3561589564e6\"]": {
    "code": 0,
    "stdout": "61eac6524092dc1d704693bbe2f8b4b27e4a37a7\n"
  },
  "[\"/work\",\"diff\",\"--numstat\",\"--no-renames\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b...4c40c48d792275c7230befd68abb34f8a1ff9cae\"]": {
    "code": 0,
    "stdout": "1\t1\tb.txt\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\",\"4c40c48d792275c7230befd68abb34f8a1ff9cae\"]": {
    "code": 0,
    "stdout": "4bd6fdb18e77d61bf156e4ea38175ada9f5e755b\n"
  },
  "[\"/work/.claude/worktrees/wip\",\"status\",\"--porcelain\",\"--untracked-files=normal\"]": {
    "code": 0,
    "stdout": " M w.txt\n"
  },
  "[\"/work\",\"rev-list\",\"--first-parent\",\"--max-count=10000\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\"]": {
    "code": 0,
    "stdout": "160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\n7b7b572154448bada5b773757710b1a8a182b81b\n27e88ec2af9443a687a44fdd513183c8348d953a\n"
  },
  "[\"/work\",\"commit-tree\",\"7da88c6a405b19539393068d267166cbfc902fe9\",\"-p\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\",\"-p\",\"016bc82b92964349d699b1b71acb496ebddfb3d1\",\"-m\",\"worktree-radar simulation\"]": {
    "code": 0,
    "stdout": "3d60ff61f06af5aafe341589a03ba19bc5f755d8\n"
  },
  "[\"/work\",\"commit-tree\",\"e2ec58f65870e55301d24b76522ad821349c24bb\",\"-p\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\",\"-p\",\"d1021a8f713ec9796ff31fdd9169ca81456fd4ce\",\"-m\",\"worktree-radar simulation\"]": {
    "code": 0,
    "stdout": "9abb93b62cb453cb93b6bd02dfa3fe62131e8758\n"
  },
  "[\"/work\",\"commit-tree\",\"eda67ea3e09cc64c5895fe748c7d3b229b2fae84\",\"-p\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\",\"-p\",\"3a32c3b64fe5cc90aea7ec244ba00a19d4525dde\",\"-m\",\"worktree-radar simulation\"]": {
    "code": 0,
    "stdout": "e19dfdd2d5a12beda846ecd99a93a2335c7e1ce6\n"
  },
  "[\"/work\",\"commit-tree\",\"4bd6fdb18e77d61bf156e4ea38175ada9f5e755b\",\"-p\",\"160ea267d1c84e2b7bf5cafe46aa7ab97a28702b\",\"-p\",\"4c40c48d792275c7230befd68abb34f8a1ff9cae\",\"-m\",\"worktree-radar simulation\"]": {
    "code": 0,
    "stdout": "3b98d3048c7519809bceb681eb6f788c388382cf\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"3d60ff61f06af5aafe341589a03ba19bc5f755d8\",\"4c40c48d792275c7230befd68abb34f8a1ff9cae\"]": {
    "code": 1,
    "stdout": "63ca6cda97f8528e6c88ee5f8ddf59eee7c23675\nb.txt\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"9abb93b62cb453cb93b6bd02dfa3fe62131e8758\",\"3a32c3b64fe5cc90aea7ec244ba00a19d4525dde\"]": {
    "code": 0,
    "stdout": "e2ec58f65870e55301d24b76522ad821349c24bb\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"e19dfdd2d5a12beda846ecd99a93a2335c7e1ce6\",\"d1021a8f713ec9796ff31fdd9169ca81456fd4ce\"]": {
    "code": 0,
    "stdout": "e2ec58f65870e55301d24b76522ad821349c24bb\n"
  },
  "[\"/work\",\"merge-tree\",\"--write-tree\",\"--name-only\",\"--no-messages\",\"3b98d3048c7519809bceb681eb6f788c388382cf\",\"016bc82b92964349d699b1b71acb496ebddfb3d1\"]": {
    "code": 1,
    "stdout": "967d3e94232956b74b32c020b21ba601d275f5a2\nb.txt\n"
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
    "isLanded": false,
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
    "isLanded": false,
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
    "isLanded": false,
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
    "isLanded": false,
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
    "isLanded": false,
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
    "isLanded": false,
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
    "isLanded": false,
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
    "isLanded": false,
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
    "isLanded": false,
    "conflicts": [],
    "breaks": [],
    "summary": "on hold: waiting on review · merges cleanly into main"
  },
  {
    "name": "feat/landed",
    "lane": "CLEANUP",
    "rank": null,
    "waitsFor": null,
    "stackedOn": null,
    "isLanded": true,
    "conflicts": null,
    "breaks": [],
    "summary": "landed in main · worktree .claude/worktrees/landed"
  },
  {
    "name": "chore/merged",
    "lane": "CLEANUP",
    "rank": null,
    "waitsFor": null,
    "stackedOn": null,
    "isLanded": false,
    "conflicts": null,
    "breaks": [],
    "summary": "no commits beyond main"
  }
]

export const NEXT = "feat/parent"
