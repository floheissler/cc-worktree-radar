import { describe, expect, test } from 'claude-code/testing'

import type { BranchInfo, Snapshot } from '../types'

import { readSnapshot } from '../hooks/analysis'
import { dueMarksOf, eventsOf, wakeEventsOf, wakeTextOf } from '../hooks/changes'
import { gitOf } from '../hooks/git'
import { HOLDS } from './fixtures/repo'
import { replayOf } from './replay'

async function fixtureSnapshot(): Promise<Snapshot> {
  const result = await readSnapshot({
    git: gitOf(replayOf().run, '/work'),
    readText: async () => null,
    sessions: [],
    agents: [],
    holds: HOLDS,
    notes: {},
    dueMarks: {},
    base: null,
    now: 0,
  })

  if (result.snapshot === undefined) {
    throw new Error(result.problem)
  }

  return result.snapshot
}

function withBranch(snapshot: Snapshot, name: string, change: Partial<BranchInfo>): Snapshot {
  return {
    ...snapshot,
    branches: snapshot.branches.map(branch => (branch.name === name ? { ...branch, ...change } : branch)),
  }
}

describe('events between two reads', () => {
  test('the first read has none', async () => {
    expect(eventsOf(null, await fixtureSnapshot())).toEqual([])
  })

  test('a branch that turns READY, starts to conflict or is stacked', async () => {
    const after = await fixtureSnapshot()
    const before = withBranch(
      withBranch(withBranch(after, 'feat/ready-a', { lane: 'IN_PROGRESS', rank: null }), 'feat/conflict', { lane: 'READY' }),
      'feat/child',
      { lane: 'READY' },
    )
    const events = eventsOf(before, after)

    expect(events.map(event => [event.kind, event.branch?.name])).toEqual([
      ['ready', 'feat/ready-a'],
      ['conflict', 'feat/conflict'],
      ['stacked', 'feat/child'],
    ])
    expect(events[0]?.text).toBe('feat/ready-a is ready to land (#2)')
    expect(events[1]?.text).toBe('feat/conflict conflicts with main (a.txt)')
  })

  test('a rebase due, once per tip', async () => {
    const after = withBranch(await fixtureSnapshot(), 'feat/conflict2', { isRebaseDue: true, waitsFor: [] })
    const before = withBranch(after, 'feat/conflict2', { isRebaseDue: false })

    expect(eventsOf(before, after).map(event => event.kind)).toEqual(['rebase-due'])
    expect(eventsOf(after, after)).toEqual([])
  })

  test('the base moving, a branch done, a session gone idle', async () => {
    const after = withBranch(await fixtureSnapshot(), 'feat/wip', {
      worktree: { path: 'w', absPath: '/work/w', dirty: 0, isMissing: false, isRebasing: false, sessions: [{ id: 's', name: 'worker', status: 'idle', kind: 'session' }] },
    })
    const moved = { ...after, base: { ...after.base, sha: '0'.repeat(40) } }
    const before = withBranch(
      withBranch(moved, 'chore/merged', { lane: 'READY' }),
      'feat/wip',
      { worktree: { path: 'w', absPath: '/work/w', dirty: 0, isMissing: false, isRebasing: false, sessions: [{ id: 's', name: 'worker', status: 'busy', kind: 'session' }] } },
    )
    const events = eventsOf(before, after)

    expect(events.map(event => event.kind)).toEqual(['base-moved', 'session-idle', 'cleanup'])

    // An agent at work, then gone with its worktree's lock: it finished
    const agent = { id: 'abc', name: 'agent-abc', status: 'running', kind: 'agent' as const, description: 'Fix the totals', parent: 'main' }
    const working = withBranch(after, 'feat/wip', {
      worktree: { path: 'w', absPath: '/work/w', dirty: 0, isMissing: false, isRebasing: false, sessions: [agent] },
    })
    const done = withBranch(after, 'feat/wip', {
      worktree: { path: 'w', absPath: '/work/w', dirty: 0, isMissing: false, isRebasing: false, sessions: [] },
    })

    expect(eventsOf(working, done).map(event => [event.kind, event.text])).toEqual([['session-idle', 'agent agent-abc on feat/wip finished']])
    expect(events[0]?.text).toMatch(/^main moved 0000000→[0-9a-f]{7}$/)
    expect(events[1]?.text).toBe('session worker on feat/wip went idle')
  })

  test('a new branch with no commits is not done', async () => {
    const after = await fixtureSnapshot()
    const before = { ...after, branches: after.branches.filter(branch => branch.name !== 'chore/merged') }

    expect(eventsOf(before, after)).toEqual([])
  })

  test('another repository or base starts over', async () => {
    const after = await fixtureSnapshot()

    expect(eventsOf({ ...after, repo: '/other' }, withBranch(after, 'feat/conflict', { lane: 'READY' }))).toEqual([])
  })

  test('the wake line joins the events', async () => {
    const after = await fixtureSnapshot()
    const events = eventsOf(withBranch(after, 'feat/ready-a', { lane: 'HOLD' }), after)

    expect(wakeTextOf(events)).toBe('worktree-radar: feat/ready-a is ready to land (#2)')
  })
})

describe('due marks', () => {
  test('mark a branch due, keep it while it is being rebased, drop it after', async () => {
    const snapshot = await fixtureSnapshot()
    const due = withBranch(snapshot, 'feat/conflict', { isRebaseDue: true })
    const sha = due.branches.find(branch => branch.name === 'feat/conflict')?.sha

    expect(dueMarksOf({}, due)).toEqual({ 'feat/conflict': sha })

    const working = withBranch(snapshot, 'feat/conflict', { lane: 'IN_PROGRESS' })

    expect(dueMarksOf({ 'feat/conflict': 'x' }, working)).toEqual({ 'feat/conflict': 'x' })

    const landed = withBranch(snapshot, 'feat/conflict', { lane: 'READY' })

    expect(dueMarksOf({ 'feat/conflict': 'x', gone: 'y' }, landed)).toEqual({})
  })
})

describe('wake events asked for', () => {
  test('keeps known events once, in their order', () => {
    expect(wakeEventsOf(['session-idle', 'ready', 'ready', 'nope', 3])).toEqual(['ready', 'session-idle'])
    expect(wakeEventsOf('ready')).toEqual([])
  })
})
