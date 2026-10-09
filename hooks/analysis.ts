import type { BranchInfo, CallerComment, Hold, Lane, SessionInfo, Snapshot, WorktreeInfo } from '../types'

import { mapLimit, type Git } from './git'
import Limits from './limits'
import {
  baseOf,
  countStatus,
  displayPathOf,
  ownWorkOf,
  placeOf,
  readHeads,
  readOriginHead,
  readWorktrees,
  type Head,
  type Worktree,
} from './repo'
import { ACTIVE_STATES, agentsByWorktree, sessionsByWorktree, type AgentRow, type SessionRow } from './sessions'

/**
 * The radar's read of a repository: every local branch sorted into a lane,
 * READY ranked, from simulated merges that touch no worktree, index or ref.
 */

export const LANES: readonly Lane[] = ['READY', 'NEEDS_REBASE', 'STACKED', 'IN_PROGRESS', 'HOLD', 'CLEANUP']

/**
 * Simulated merge commits get a fixed identity and time, so a read of
 * unchanged branches makes the same objects again instead of new ones.
 */
export const SIM_ENV: Readonly<Record<string, string>> = {
  GIT_AUTHOR_NAME: 'worktree-radar',
  GIT_AUTHOR_EMAIL: 'worktree-radar@localhost',
  GIT_COMMITTER_NAME: 'worktree-radar',
  GIT_COMMITTER_EMAIL: 'worktree-radar@localhost',
  GIT_AUTHOR_DATE: '@0 +0000',
  GIT_COMMITTER_DATE: '@0 +0000',
}

export type ReadInput = {
  /**
   * Git, bound to the folder the radar was opened from.
   */
  readonly git: Git
  readonly readText: (path: string) => Promise<string | null>
  /**
   * The machine's Claude sessions; null where they could not be listed.
   */
  readonly sessions: readonly SessionRow[] | null
  /**
   * The subagents of the session the radar runs in (`$.agent.list()`).
   */
  readonly agents: readonly AgentRow[]
  readonly holds: Readonly<Record<string, Hold>>
  readonly comments: Readonly<Record<string, CallerComment>>
  /**
   * Branches found due a rebase before (`PluginState`'s `dueMarks`).
   */
  readonly dueMarks: Readonly<Record<string, string>>
  /**
   * The base asked for; null to detect it.
   */
  readonly base: string | null
  /**
   * Now, in milliseconds since the epoch.
   */
  readonly now: number
}

export type ReadResult =
  | { readonly snapshot: Snapshot; readonly commonDir: string; readonly problem?: undefined }
  | { readonly problem: string; readonly snapshot?: undefined }

/**
 * A read that cannot go on: git failed on something every lane needs.
 */
class ReadError extends Error {}

function need<T>(value: T | null, what: string): T {
  if (value === null) {
    throw new ReadError(`git could not read ${what}`)
  }

  return value
}

/**
 * The working facts of one branch, before lanes are given out.
 */
type Facts = {
  name: string
  sha: string
  head: Head
  commits: Set<string>
  behind: number
  files: string[]
  insertions: number
  deletions: number
  conflicts: string[] | null
  tree: string | null
  isLanded: boolean
  worktree: WorktreeInfo | null
  stackedOn: string | null
  stackParents: string[]
  dependents: string[]
  sharesWith: { branch: string; commits: number }[]
  breaks: { branch: string; files: string[] }[]
  lane: Lane
  rank: number | null
  rebaseCost: number
  waitsFor: string[] | null
}

/**
 * Merges two commits in memory.
 *
 * @param git git
 * @param ours the commit merged into
 * @param theirs the commit merged
 * @returns the resulting tree and the conflicted paths
 */
async function mergeCheck(git: Git, ours: string, theirs: string): Promise<{ tree: string; conflicts: string[] }> {
  const out = need(
    await git(['merge-tree', '--write-tree', '--name-only', '--no-messages', ours, theirs], { ok: [0, 1] }),
    `a merge of ${ours.slice(0, 7)} and ${theirs.slice(0, 7)}`,
  )
  const [tree = '', ...paths] = out.stdout.trim().split('\n')

  return { tree, conflicts: out.code === 1 ? [...new Set(paths.filter(path => path !== ''))].sort() : [] }
}

async function factsOf(
  git: Git,
  baseSha: string,
  main: string,
  name: string,
  head: Head,
  worktree: Worktree | undefined,
  sessions: readonly SessionInfo[],
): Promise<Facts> {
  const sides = need(await git(['rev-list', '--left-right', `${baseSha}...${head.sha}`]), name).stdout.split('\n')
  const commits = new Set(sides.filter(line => line.startsWith('>')).map(line => line.slice(1)))
  const files: string[] = []
  let insertions = 0
  let deletions = 0
  let conflicts: string[] | null = null
  let tree: string | null = null

  if (commits.size > 0) {
    const numstat = need(await git(['diff', '--numstat', '--no-renames', `${baseSha}...${head.sha}`]), name)

    for (const line of numstat.stdout.split('\n')) {
      const [added, removed, ...path] = line.split('\t')

      if (path.length === 0) {
        continue
      }

      files.push(path.join('\t'))
      insertions += /^\d+$/.test(added ?? '') ? Number(added) : 0
      deletions += /^\d+$/.test(removed ?? '') ? Number(removed) : 0
    }

    const merged = await mergeCheck(git, baseSha, head.sha)

    tree = merged.tree
    conflicts = merged.conflicts
  }

  let info: WorktreeInfo | null = null

  if (worktree !== undefined) {
    const status = worktree.isPrunable
      ? null
      : await git(['status', '--porcelain', '--untracked-files=normal'], { cwd: worktree.path })

    info = {
      path: displayPathOf(main, worktree.path),
      absPath: worktree.path,
      dirty: status === null ? null : countStatus(status.stdout),
      isMissing: worktree.isPrunable,
      isRebasing: worktree.isRebasing,
      sessions,
    }
  }

  return {
    name,
    sha: head.sha,
    head,
    commits,
    behind: sides.filter(line => line.startsWith('<')).length,
    files,
    insertions,
    deletions,
    conflicts,
    tree,
    isLanded: false,
    worktree: info,
    stackedOn: null,
    stackParents: [],
    dependents: [],
    sharesWith: [],
    breaks: [],
    lane: 'CLEANUP',
    rank: null,
    rebaseCost: 0,
    waitsFor: null,
  }
}

function overlaps(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a)

  return b.some(path => set.has(path))
}

/**
 * Whether every element of `a` is in `b`, and `b` holds more.
 */
function isStrictSubset(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size < b.size && [...a].every(sha => b.has(sha))
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Lists names: the first few, then how many more.
 *
 * @param items the names
 * @param limit how many to name
 * @returns `a, b, c +2 more`
 */
export function shortList(items: readonly string[], limit: number = Limits.LIST_NAMES): string {
  const shown = items.slice(0, limit).join(', ')

  return items.length > limit ? `${shown} +${items.length - limit} more` : shown
}

/**
 * Reads a repository.
 *
 * @param input git, the sessions, holds, comments and marks, the base asked for
 * @returns the snapshot, or what kept it from being read
 */
export async function readSnapshot(input: ReadInput): Promise<ReadResult> {
  try {
    return await read(input)
  } catch (error) {
    if (error instanceof ReadError) {
      return { problem: error.message }
    }

    throw error
  }
}

async function read(input: ReadInput): Promise<ReadResult> {
  const { git } = input
  const place = await placeOf(git)

  if (place === null) {
    return { problem: 'not in a git repository, or git is not installed' }
  }

  const [heads, worktrees, originHead] = await Promise.all([
    readHeads(git),
    readWorktrees(git, input.readText),
    readOriginHead(git),
  ])
  const base = baseOf(need(heads, 'the branches'), originHead, input.base)

  if (base === null) {
    return {
      problem:
        input.base === null
          ? 'no main or master branch: name the base, /radar <branch>'
          : `no branch named ${input.base}`,
    }
  }

  const allHeads = need(heads, 'the branches')
  const trees = need(worktrees, 'the worktrees')
  const baseHead = allHeads.get(base) as Head
  const baseSha = baseHead.sha
  const main = trees[0]?.path ?? place.top
  const attached = sessionsByWorktree(
    trees.map(tree => tree.path),
    input.sessions ?? [],
  )

  for (const [path, agents] of agentsByWorktree(trees, input.sessions, input.agents)) {
    attached.set(path, [...(attached.get(path) ?? []), ...agents])
  }
  const byBranch = new Map<string, Worktree>()

  for (const tree of trees) {
    if (tree.branch !== null && !byBranch.has(tree.branch)) {
      byBranch.set(tree.branch, tree)
    }
  }

  const names = [...allHeads.keys()].filter(name => name !== base).sort(compareText)
  const list = await mapLimit(names, Limits.GIT_PARALLEL, name => {
    const tree = byBranch.get(name)

    return factsOf(git, baseSha, main, name, allHeads.get(name) as Head, tree, tree ? (attached.get(tree.path) ?? []) : [])
  })
  const facts = new Map(list.map(info => [info.name, info]))
  const of = (name: string): Facts => facts.get(name) as Facts
  const open = names.filter(name => of(name).commits.size > 0)
  const done = names.filter(name => of(name).commits.size === 0)

  // A branch with nothing left to land either landed or never had work of
  // its own. One that landed through a merge has its tip reached from the
  // base only through a merge's second parent, off the base's first-parent
  // line. The script read every such branch as fresh.
  if (done.length > 0) {
    const line = await git(['rev-list', '--first-parent', `--max-count=${Limits.FIRST_PARENT_COMMITS}`, baseSha])

    if (line !== null) {
      const onLine = new Set(line.stdout.split('\n').filter(sha => sha !== ''))
      const isWhole = onLine.size < Limits.FIRST_PARENT_COMMITS

      for (const name of done) {
        of(name).isLanded = isWhole && !onLine.has(of(name).sha)
      }
    }
  }

  // A fast-forward leaves no merge behind: the branch's tip is on the
  // first-parent line, as a fresh branch's is. Its own reflog tells them
  // apart: a branch whose latest own work is in the base has landed,
  // fast-forwarded, rebased first or merged. Without a reflog (none kept,
  // or expired) it reads as before.
  await mapLimit(
    done.filter(name => !of(name).isLanded),
    Limits.GIT_PARALLEL,
    async name => {
      const reflog = await git(['reflog', 'show', '--format=%H%x00%gs', `refs/heads/${name}`, '--'])
      const work = reflog === null ? null : ownWorkOf(reflog.stdout)

      if (work !== null && (await git(['merge-base', '--is-ancestor', work, baseSha])) !== null) {
        of(name).isLanded = true
      }
    },
  )

  // Stacking: B sits on A when A's unmerged commits are a strict subset of
  // B's. Partial overlap (each holds commits the other lacks) has no
  // provable direction.
  for (const name of open) {
    const own = of(name).commits
    const parents = open.filter(other => other !== name && isStrictSubset(of(other).commits, own))
    const info = of(name)

    info.stackParents = parents
    info.stackedOn =
      parents.length === 0
        ? null
        : parents.reduce((best, other) => (of(other).commits.size > of(best).commits.size ? other : best))
    info.sharesWith = open
      .filter(other => other !== name && !parents.includes(other) && !isStrictSubset(own, of(other).commits))
      .map(other => ({ branch: other, commits: [...of(other).commits].filter(sha => own.has(sha)).length }))
      .filter(shared => shared.commits > 0)
  }

  for (const name of open) {
    of(name).dependents = open.filter(other => of(other).stackParents.includes(name)).sort(compareText)
  }

  // Knock-on conflicts: land each cleanly merging branch in a simulated
  // merge commit, then try every other one on top. Only pairs touching a
  // common path can conflict, so the others are skipped.
  const clean = open.filter(name => of(name).conflicts?.length === 0)
  const pairs = clean.flatMap(a =>
    clean.filter(b => a !== b && overlaps(of(a).files, of(b).files)).map(b => [a, b] as const),
  )
  const firsts = [...new Set(pairs.map(([a]) => a))].sort(compareText)
  const simulated = new Map(
    await mapLimit(firsts, Limits.GIT_PARALLEL, async a => {
      const info = of(a)
      const out = need(
        await git(['commit-tree', info.tree ?? '', '-p', baseSha, '-p', info.sha, '-m', 'worktree-radar simulation'], {
          env: SIM_ENV,
        }),
        `a simulated merge of ${a}`,
      )

      return [a, out.stdout.trim()] as const
    }),
  )
  const knocked = await mapLimit(pairs, Limits.GIT_PARALLEL, async ([a, b]) =>
    (await mergeCheck(git, simulated.get(a) as string, of(b).sha)).conflicts,
  )

  pairs.forEach(([a, b], at) => {
    const files = knocked[at] ?? []

    if (files.length > 0) {
      of(a).breaks.push({ branch: b, files })
    }
  })

  for (const name of names) {
    const info = of(name)
    const tree = info.worktree
    const sessions = tree?.sessions ?? []
    const isActive = sessions.some(session => ACTIVE_STATES.has(session.status))
    const isDirty = (tree?.dirty ?? 0) > 0 || tree?.isRebasing === true

    if (info.commits.size === 0) {
      // An idle session on a landed branch is left over; on a fresh one it
      // may be about to start
      info.lane = isDirty || isActive || (sessions.length > 0 && !info.isLanded) ? 'IN_PROGRESS' : 'CLEANUP'
    } else if (input.holds[name] !== undefined) {
      info.lane = 'HOLD'
    } else if (isDirty || isActive) {
      info.lane = 'IN_PROGRESS'
    } else if (info.stackedOn !== null) {
      info.lane = 'STACKED'
    } else if ((info.conflicts?.length ?? 0) > 0) {
      info.lane = 'NEEDS_REBASE'
    } else {
      info.lane = 'READY'
    }

    info.rebaseCost = info.breaks.reduce((sum, broken) => sum + of(broken.branch).insertions + of(broken.branch).deletions, 0)
  }

  // Rebase order: a rebase holds only once nothing that lands before the
  // branch still conflicts with it, or that landing undoes it. With n
  // branches that all conflict, rebasing next-in-line costs n-1 rebases,
  // rebasing every waiting branch after each landing n(n-1)/2. Ahead of a
  // NEEDS_REBASE branch: every READY branch, every branch being rebased (a
  // rebase under way, or in progress since it was found due), and the
  // NEEDS_REBASE branches ranked before it, biggest first as READY ranks.
  // It waits for those its own changes conflict with; a branch that
  // overlaps none of them rebases in parallel.
  const ready = names.filter(name => of(name).lane === 'READY')
  const rebasing = names.filter(name => {
    const info = of(name)

    return (
      info.lane === 'IN_PROGRESS' &&
      info.commits.size > 0 &&
      (info.worktree?.isRebasing === true || input.dueMarks[name] !== undefined)
    )
  })
  const waiting = names
    .filter(name => of(name).lane === 'NEEDS_REBASE')
    .sort(
      (a, b) =>
        of(b).dependents.length - of(a).dependents.length ||
        of(b).insertions + of(b).deletions - (of(a).insertions + of(a).deletions) ||
        of(a).head.committedAt - of(b).head.committedAt ||
        compareText(a, b),
    )
  const aheadPairs = waiting.flatMap((b, at) =>
    [...ready, ...rebasing, ...waiting.slice(0, at)]
      .filter(a => overlaps(of(a).files, of(b).files))
      .map(a => [a, b] as const),
  )
  const clashes = await mapLimit(aheadPairs, Limits.GIT_PARALLEL, async ([a, b]) =>
    (await mergeCheck(git, of(a).sha, of(b).sha)).conflicts,
  )

  for (const name of waiting) {
    of(name).waitsFor = aheadPairs.filter(([, b], at) => b === name && (clashes[at]?.length ?? 0) > 0).map(([a]) => a)
  }

  // READY's order: stack parents first, then the landing that forces the
  // least rebase work on the rest (so in a conflicting pair the bigger
  // branch lands and the smaller one rebases), then first finished, first
  // landed.
  const ranked = [...ready].sort(
    (a, b) =>
      of(b).dependents.length - of(a).dependents.length ||
      of(a).rebaseCost - of(b).rebaseCost ||
      of(a).head.committedAt - of(b).head.committedAt ||
      compareText(a, b),
  )

  ranked.forEach((name, at) => {
    of(name).rank = at + 1
  })

  const mainStatus = trees[0]
    ? await git(['status', '--porcelain', '--untracked-files=no'], { cwd: trees[0].path })
    : null

  const branches = names
    .map(name => branchOf(of(name), facts, base, input))
    .sort(
      (a, b) =>
        LANES.indexOf(a.lane) - LANES.indexOf(b.lane) ||
        (a.rank ?? 0) - (b.rank ?? 0) ||
        b.lastCommitAt - a.lastCommitAt ||
        compareText(a.name, b.name),
    )

  return {
    commonDir: place.commonDir,
    snapshot: {
      schema: 1,
      repo: main,
      base: {
        name: base,
        sha: baseSha,
        upstream: baseHead.upstream,
        mainWorktreeBranch: trees[0]?.branch ?? null,
        mainWorktreeDirty: mainStatus === null ? null : countStatus(mainStatus.stdout),
      },
      areSessionsKnown: input.sessions !== null,
      next: ranked[0] ?? null,
      branches,
      takenAt: input.now,
    },
  }
}

function branchOf(info: Facts, facts: ReadonlyMap<string, Facts>, base: string, input: ReadInput): BranchInfo {
  const comment = input.comments[info.name]
  const branch: Omit<BranchInfo, 'summary'> = {
    name: info.name,
    sha: info.sha,
    lane: info.lane,
    rank: info.rank,
    ahead: info.commits.size,
    behind: info.behind,
    files: info.files,
    insertions: info.insertions,
    deletions: info.deletions,
    lastCommitAt: info.head.committedAt,
    upstream: info.head.upstream,
    conflicts: info.conflicts,
    stackedOn: info.stackedOn,
    dependents: info.dependents,
    sharesWith: info.sharesWith,
    breaks: info.breaks,
    rebaseCost: info.rebaseCost,
    waitsFor: info.waitsFor,
    isRebaseDue: info.lane === 'NEEDS_REBASE' && (info.waitsFor?.length ?? 0) === 0,
    isLanded: info.isLanded,
    hold: input.holds[info.name] ?? null,
    comment: comment !== undefined && comment.sha === info.sha ? comment.text : null,
    worktree: info.worktree,
  }

  return { ...branch, summary: summaryOf(branch, facts, base) }
}

/**
 * The facts of a branch in one line, for people and models.
 *
 * @param info the branch
 * @param facts every branch, for a stack parent's count
 * @param base the base branch's name
 * @returns the line
 */
export function summaryOf(info: Omit<BranchInfo, 'summary'>, facts: ReadonlyMap<string, { commits: ReadonlySet<string> }>, base: string): string {
  const parts: string[] = []
  const { lane } = info
  const tree = info.worktree

  if (lane === 'CLEANUP') {
    parts.push(info.isLanded ? `landed in ${base}` : `no commits beyond ${base}`)
  }

  if (lane === 'HOLD') {
    parts.push(`on hold${info.hold?.reason ? `: ${info.hold.reason}` : ''}`)
  }

  if (info.ahead === 0 && lane === 'IN_PROGRESS') {
    parts.push(info.isLanded ? `landed in ${base}, new work under way` : 'no commits yet')
  }

  if ((info.conflicts?.length ?? 0) > 0) {
    parts.push(`conflicts with ${base}: ${shortList(info.conflicts ?? [])}`)
  } else if (info.ahead > 0 && (lane === 'READY' || lane === 'HOLD' || lane === 'IN_PROGRESS')) {
    parts.push(`merges cleanly into ${base}`)
  }

  if (lane === 'NEEDS_REBASE') {
    parts.push(
      (info.waitsFor?.length ?? 0) > 0
        ? `rebase waits for ${shortList(info.waitsFor ?? [], 2)} to land first`
        : `rebase due`,
    )
  }

  if (info.stackedOn !== null) {
    const own = info.ahead - (facts.get(info.stackedOn)?.commits.size ?? 0)

    parts.push(`stacked on ${info.stackedOn} (+${own} own): ${info.stackedOn} lands first`)
  }

  if (info.dependents.length > 0) {
    parts.push(`${shortList(info.dependents)} stacked on it`)
  }

  for (const other of info.sharesWith) {
    const many = other.commits !== 1

    parts.push(
      `shares ${other.commits} unmerged commit${many ? 's' : ''} with ${other.branch} (landing either lands ${many ? 'them' : 'it'})`,
    )
  }

  if (info.breaks.length > 0) {
    parts.push(
      `landing it forces a rebase of ${shortList(
        info.breaks.map(broken => `${broken.branch} (${shortList(broken.files, 2)})`),
        2,
      )}`,
    )
  }

  if (tree?.isRebasing) {
    parts.push('rebase in progress')
  }

  if (tree?.isMissing) {
    parts.push('worktree folder missing (prunable)')
  } else if ((tree?.dirty ?? 0) > 0) {
    const dirty = tree?.dirty ?? 0

    parts.push(`${dirty} uncommitted file${dirty === 1 ? '' : 's'}`)
  }

  for (const session of tree?.sessions ?? []) {
    parts.push(
      session.kind === 'agent'
        ? `agent ${session.name} ${session.status}${session.parent ? ` in session ${session.parent}` : ''}${session.description ? `: ${session.description}` : ''}`
        : `session ${session.name} ${session.status}`,
    )
  }

  if (tree !== null && lane === 'CLEANUP') {
    parts.push(`worktree ${tree.path}`)
  }

  if (info.upstream !== null) {
    parts.push(`pushed to ${info.upstream}`)
  }

  return parts.join(' · ')
}
