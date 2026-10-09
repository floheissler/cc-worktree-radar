import { describe, expect, test } from 'claude-code/testing'

import type { Snapshot } from '../types'

import { readSnapshot, type ReadInput } from '../hooks/analysis'
import { gitOf } from '../hooks/git'
import { EXPECTED, HOLDS, NEXT, RUNS } from './fixtures/repo'
import { replayOf } from './replay'

function inputOf(run: ReturnType<typeof replayOf>['run'], changes: Partial<ReadInput> = {}): ReadInput {
  return {
    git: gitOf(run, '/work'),
    readText: async () => null,
    sessions: [],
    agents: [],
    holds: HOLDS,
    comments: {},
    dueMarks: {},
    base: null,
    now: 1_800_000_000_000,
    ...changes,
  }
}

async function snapshotOf(input: ReadInput): Promise<Snapshot> {
  const result = await readSnapshot(input)

  if (result.snapshot === undefined) {
    throw new Error(result.problem)
  }

  return result.snapshot
}

describe('reading a repository', () => {
  test('sorts every branch into the lane the Python pipeline gives it', async () => {
    const snapshot = await snapshotOf(inputOf(replayOf().run))

    expect(
      snapshot.branches.map(branch => ({
        name: branch.name,
        lane: branch.lane,
        rank: branch.rank,
        waitsFor: branch.waitsFor,
        stackedOn: branch.stackedOn,
        isLanded: branch.isLanded,
        conflicts: branch.conflicts,
        breaks: branch.breaks.map(broken => broken.branch),
        summary: branch.summary,
      })),
    ).toEqual(EXPECTED)
    expect(snapshot.next).toBe(NEXT)
    expect(snapshot.base.name).toBe('main')
    expect(snapshot.repo).toBe('/work')
  })

  test('finds the worktree of a branch, and its uncommitted files', async () => {
    const snapshot = await snapshotOf(inputOf(replayOf().run))
    const wip = snapshot.branches.find(branch => branch.name === 'feat/wip')

    expect(wip?.worktree).toMatchObject({ path: '.claude/worktrees/wip', dirty: 1, isRebasing: false })
    expect(wip?.lane).toBe('IN_PROGRESS')
  })

  test('puts a branch with a busy session in progress, and an idle one by its merge', async () => {
    const sessions = [{ id: 's1', name: 'wip-session', status: 'idle', kind: 'session' as const, cwd: '/work/.claude/worktrees/wip', pid: 1 }]
    const idle = await snapshotOf(inputOf(replayOf().run, { sessions }))

    expect(idle.branches.find(branch => branch.name === 'feat/wip')?.worktree?.sessions).toEqual([
      { id: 's1', name: 'wip-session', status: 'idle', kind: 'session' },
    ])
    expect(idle.areSessionsKnown).toBe(true)

    const unknown = await snapshotOf(inputOf(replayOf().run, { sessions: null }))

    expect(unknown.areSessionsKnown).toBe(false)
  })

  test('tells a branch that landed through a merge from one that never had work', async () => {
    const snapshot = await snapshotOf(inputOf(replayOf().run))
    const landed = snapshot.branches.find(branch => branch.name === 'feat/landed')
    const fresh = snapshot.branches.find(branch => branch.name === 'chore/merged')

    expect([landed?.lane, landed?.isLanded, landed?.summary]).toEqual([
      'CLEANUP',
      true,
      'landed in main · worktree .claude/worktrees/landed',
    ])
    expect([fresh?.lane, fresh?.isLanded]).toEqual(['CLEANUP', false])
  })

  test('a session left idle on a landed branch keeps it in cleanup; a busy one does not', async () => {
    const at = (status: string) => [{ id: 's', name: 'worker', status, kind: 'session' as const, cwd: '/work/.claude/worktrees/landed', pid: 1 }]
    const idle = await snapshotOf(inputOf(replayOf().run, { sessions: at('idle') }))
    const busy = await snapshotOf(inputOf(replayOf().run, { sessions: at('busy') }))

    expect(idle.branches.find(branch => branch.name === 'feat/landed')?.lane).toBe('CLEANUP')
    expect(busy.branches.find(branch => branch.name === 'feat/landed')).toMatchObject({
      lane: 'IN_PROGRESS',
      summary: 'landed in main, new work under way · session worker busy',
    })
  })

  test('a branch fast-forwarded into the base reads as landed, by its reflog', async () => {
    // chore/merged: nothing beyond main, its tip on main's first-parent line
    const first = await snapshotOf(inputOf(replayOf().run))
    const tip = first.branches.find(branch => branch.name === 'chore/merged')?.sha ?? ''
    const reflogKey = JSON.stringify(['/work', 'reflog', 'show', '--format=%H%x00%gs', 'refs/heads/chore/merged', '--'])
    const ancestorKey = JSON.stringify(['/work', 'merge-base', '--is-ancestor', 'abc1234', first.base.sha])
    const withReflog = (isInBase: boolean) => ({
      ...RUNS,
      [reflogKey]: { code: 0, stdout: `abc1234\u0000commit: tidy up\n${tip}\u0000branch: Created from main\n` },
      [ancestorKey]: { code: isInBase ? 0 : 1, stdout: '' },
    })
    const mergedOf = async (runs: typeof RUNS) =>
      (await snapshotOf(inputOf(replayOf(runs).run))).branches.find(branch => branch.name === 'chore/merged')

    // Its own commit is in main: it landed, though no merge shows it
    expect(await mergedOf(withReflog(true))).toMatchObject({ lane: 'CLEANUP', isLanded: true, summary: 'landed in main' })
    // Its own commit was thrown away: it never landed
    expect(await mergedOf(withReflog(false))).toMatchObject({ isLanded: false, summary: 'no commits beyond main' })
    // No reflog kept: as before, fresh
    expect(first.branches.find(branch => branch.name === 'chore/merged')?.isLanded).toBe(false)
    // A branch that landed through a merge needs no reflog
    expect(first.branches.find(branch => branch.name === 'feat/landed')?.isLanded).toBe(true)
  })

  test('a worktree a running subagent holds is in progress, by its lock', async () => {
    // Claude Code's lock on the landed branch's worktree, for an agent of the
    // session with pid 42
    const key = JSON.stringify(['/work', 'worktree', 'list', '--porcelain'])
    const listed = RUNS[key] as { code: number; stdout: string }
    const locked = {
      ...RUNS,
      [key]: {
        ...listed,
        stdout: listed.stdout.replace(
          'branch refs/heads/feat/landed\n',
          'branch refs/heads/feat/landed\nlocked claude agent agent-abc (pid 42 start 7)\n',
        ),
      },
    }
    const coordinator = [{ id: 's', name: 'coordinator', status: 'busy', kind: 'session' as const, cwd: '/work', pid: 42 }]
    const landedOf = async (changes: Partial<ReadInput>) =>
      (await snapshotOf(inputOf(replayOf(locked).run, changes))).branches.find(branch => branch.name === 'feat/landed')

    // The radar's own session's agent: its task and state from $.agent.list()
    const own = await landedOf({
      sessions: coordinator,
      agents: [{ id: 'abc', name: null, description: 'Fix the totals', status: 'running' }],
    })

    expect(own?.lane).toBe('IN_PROGRESS')
    expect(own?.worktree?.sessions).toEqual([
      { id: 'abc', name: 'agent-abc', status: 'running', kind: 'agent', description: 'Fix the totals', parent: 'coordinator' },
    ])
    expect(own?.summary).toBe('landed in main, new work under way · agent agent-abc running in session coordinator: Fix the totals')

    // Another session's agent: by its lock, while that session's process runs
    const other = await landedOf({ sessions: coordinator })

    expect(other?.lane).toBe('IN_PROGRESS')
    expect(other?.worktree?.sessions).toEqual([
      { id: 'abc', name: 'agent-abc', status: 'running', kind: 'agent', description: null, parent: 'coordinator' },
    ])

    // A lock that outlived its agent, or its session, or that nothing can
    // confirm, holds nobody
    for (const changes of [
      { sessions: coordinator, agents: [{ id: 'abc', name: null, description: 'Fix the totals', status: 'completed' }] },
      { sessions: [] },
      { sessions: null },
    ]) {
      expect(await landedOf(changes)).toMatchObject({ lane: 'CLEANUP', worktree: { sessions: [] } })
    }
  })

  test('shows a caller comment only on the tip it was set on', async () => {
    const first = await snapshotOf(inputOf(replayOf().run))
    const ready = first.branches.find(branch => branch.name === 'feat/ready-a')
    const comments = {
      'feat/ready-a': { sha: ready?.sha ?? '', text: 'handed back to b-7c' },
      'feat/big': { sha: 'an-old-tip', text: 'stale' },
    }
    const second = await snapshotOf(inputOf(replayOf().run, { comments }))

    expect(second.branches.find(branch => branch.name === 'feat/ready-a')?.comment).toBe('handed back to b-7c')
    expect(second.branches.find(branch => branch.name === 'feat/big')?.comment).toBeNull()
  })

  test('marks a branch due a rebase once nothing ahead of it conflicts', async () => {
    const snapshot = await snapshotOf(inputOf(replayOf().run))
    const due = snapshot.branches.filter(branch => branch.isRebaseDue).map(branch => branch.name)

    expect(due).toEqual([])
    expect(snapshot.branches.find(branch => branch.name === 'feat/conflict2')?.waitsFor).toEqual(['feat/ready-a'])
  })

  test('says why it cannot read', async () => {
    const outside = await readSnapshot(inputOf(replayOf({}).run))

    expect(outside.problem).toBe('not in a git repository, or git is not installed')

    const missing = await readSnapshot(inputOf(replayOf().run, { base: 'develop' }))

    expect(missing.problem).toBe('no branch named develop')

    // A run git fails partway through (a ref moved mid-read) stops the read
    const broken = Object.fromEntries(Object.entries(RUNS).filter(([key]) => !key.includes('"merge-tree"')))

    expect((await readSnapshot(inputOf(replayOf(broken).run))).problem).toMatch(/^git could not read a merge of/)
  })

  test('runs git without optional locks, in the C locale, with a timeout', async () => {
    const inits: unknown[] = []
    const { run } = replayOf()
    const git = gitOf(async (argv, init) => {
      inits.push(init)

      return run(argv, init)
    }, '/work')

    await readSnapshot(inputOf(run, { git }))

    expect(inits[0]).toMatchObject({ cwd: '/work', env: { GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' } })
    expect(inits.every(init => typeof (init as { timeoutMs?: unknown }).timeoutMs === 'number')).toBe(true)
  })
})
