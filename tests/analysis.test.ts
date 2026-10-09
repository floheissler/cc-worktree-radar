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
    holds: HOLDS,
    notes: {},
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
    const sessions = [{ id: 's1', name: 'wip-session', status: 'idle', cwd: '/work/.claude/worktrees/wip' }]
    const idle = await snapshotOf(inputOf(replayOf().run, { sessions }))

    expect(idle.branches.find(branch => branch.name === 'feat/wip')?.worktree?.sessions).toEqual([
      { id: 's1', name: 'wip-session', status: 'idle' },
    ])
    expect(idle.areSessionsKnown).toBe(true)

    const unknown = await snapshotOf(inputOf(replayOf().run, { sessions: null }))

    expect(unknown.areSessionsKnown).toBe(false)
  })

  test('shows a caller note only on the tip it was set on', async () => {
    const first = await snapshotOf(inputOf(replayOf().run))
    const ready = first.branches.find(branch => branch.name === 'feat/ready-a')
    const notes = {
      'feat/ready-a': { sha: ready?.sha ?? '', text: 'handed back to b-7c' },
      'feat/big': { sha: 'an-old-tip', text: 'stale' },
    }
    const second = await snapshotOf(inputOf(replayOf().run, { notes }))

    expect(second.branches.find(branch => branch.name === 'feat/ready-a')?.note).toBe('handed back to b-7c')
    expect(second.branches.find(branch => branch.name === 'feat/big')?.note).toBeNull()
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
