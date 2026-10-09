import { describe, expect, test } from 'claude-code/testing'

import type { Snapshot } from '../types'

import { readSnapshot } from '../hooks/analysis'
import { gitOf } from '../hooks/git'
import { ageOf, bandLinesOf, CLOSE_CELLS, lineWidthOf, type BandModel, type Line } from '../hooks/rows'
import { HOLDS } from './fixtures/repo'
import { replayOf } from './replay'

const NOW = 1_800_000_000_000

async function fixtureSnapshot(): Promise<Snapshot> {
  const result = await readSnapshot({
    git: gitOf(replayOf().run, '/work'),
    readText: async () => null,
    sessions: [],
    holds: HOLDS,
    notes: {},
    dueMarks: {},
    base: null,
    now: NOW,
  })

  if (result.snapshot === undefined) {
    throw new Error(result.problem)
  }

  return result.snapshot
}

function modelOf(snapshot: Snapshot | null, changes: Partial<BandModel> = {}): BandModel {
  return { snapshot, problem: null, status: null, root: '/work', now: NOW, columns: 100, maxRows: 40, ...changes }
}

const textOf = (line: Line | undefined): string => line?.segments.map(segment => segment.text).join('') ?? ''

describe('the band laid out', () => {
  test('a header, a row per branch in lane order, and the next to land', async () => {
    const lines = bandLinesOf(modelOf(await fixtureSnapshot(), { columns: 140 }))

    expect(textOf(lines[0])).toBe(
      'Worktree Radar · work → main · 4 ready · 2 needs rebase · 1 stacked · 1 in progress · 1 on hold · 1 cleanup',
    )
    expect(lines.map(line => line.key)).toEqual([
      'header',
      'row:feat/parent',
      'row:feat/ready-a',
      'row:feat/big',
      'row:fix/small',
      'row:feat/conflict2',
      'row:feat/conflict',
      'row:feat/child',
      'row:feat/wip',
      'row:feat/clean',
      'row:chore/merged',
      'foot',
    ])
    expect(textOf(lines[1])).toMatch(/^ 1 feat\/parent\s+ready\s+\+1  feat\/child stacked on it · merges cleanly · \d+[smhd]$/)
    expect(textOf(lines[5])).toMatch(/^ - feat\/conflict2\s+needs rebase\s+\+1  conflicts: a\.txt · rebase after feat\/ready-a/)
    expect(textOf(lines.at(-1))).toBe('next → feat/parent')
  })

  test('colors each lane with a theme key', async () => {
    const lines = bandLinesOf(modelOf(await fixtureSnapshot()))
    const laneOf = (line: Line | undefined) => line?.segments[3]

    expect(laneOf(lines[1])).toMatchObject({ text: expect.stringMatching(/^ready/), color: 'success' })
    expect(laneOf(lines[5])).toMatchObject({ color: 'error' })
    expect(laneOf(lines[7])).toMatchObject({ color: 'warning' })
    expect(laneOf(lines[8])).toMatchObject({ color: 'suggestion' })
    expect(laneOf(lines[9])).toMatchObject({ color: 'merged' })
    expect(laneOf(lines[10])).toMatchObject({ color: 'inactive' })
  })

  test('never draws a line wider than the band, at any width', async () => {
    const snapshot = await fixtureSnapshot()

    for (let columns = 1; columns <= 160; columns += 1) {
      for (const line of bandLinesOf(modelOf(snapshot, { columns, status: 'release v0.4.1 pending', problem: 'boom' }))) {
        const room = line.key === 'header' ? columns - CLOSE_CELLS : columns

        expect(lineWidthOf(line), `${line.key} at ${columns}`).toBeLessThanOrEqual(Math.max(room, 0))
      }
    }
  })

  test('narrows: the commits ahead go first, then the notes', async () => {
    const snapshot = await fixtureSnapshot()

    expect(textOf(bandLinesOf(modelOf(snapshot, { columns: 50 }))[1])).toMatch(/^ 1 feat\/parent\s+ready\s+feat\/child/)
    expect(textOf(bandLinesOf(modelOf(snapshot, { columns: 30 }))[5])).toMatch(/^ - feat\/conflict2\s+rebase\s*$/)
  })

  test('folds the lanes that need nobody when rows run short', async () => {
    const snapshot = await fixtureSnapshot()
    const wip = snapshot.branches.find(branch => branch.name === 'feat/wip')
    const done = snapshot.branches.find(branch => branch.name === 'chore/merged')
    const more = {
      ...snapshot,
      branches: [
        ...snapshot.branches.filter(branch => branch.lane !== 'CLEANUP'),
        ...['feat/w2', 'feat/w3'].flatMap(name => (wip === undefined ? [] : [{ ...wip, name }])),
        ...['chore/a', 'chore/b', 'chore/c'].flatMap(name => (done === undefined ? [] : [{ ...done, name }])),
      ].sort((a, b) => ['READY', 'NEEDS_REBASE', 'STACKED', 'IN_PROGRESS', 'HOLD', 'CLEANUP'].indexOf(a.lane) - ['READY', 'NEEDS_REBASE', 'STACKED', 'IN_PROGRESS', 'HOLD', 'CLEANUP'].indexOf(b.lane)),
    }

    // Twelve rows into nine: cleanup and in progress fold, one line each
    const lines = bandLinesOf(modelOf(more, { maxRows: 11 }))

    expect(lines.map(line => line.key)).toEqual([
      'header',
      'row:feat/parent',
      'row:feat/ready-a',
      'row:feat/big',
      'row:fix/small',
      'row:feat/conflict2',
      'row:feat/conflict',
      'row:feat/child',
      'fold:IN_PROGRESS',
      'row:feat/clean',
      'fold:CLEANUP',
      'foot',
    ])
    expect(textOf(lines[8])).toBe('   in progress (3): feat/wip, feat/w2, feat/w3')
    expect(textOf(lines[10])).toBe('   cleanup (3): chore/a, chore/b, chore/c')

    // A lane of one branch never folds: it would take its row anyway
    expect(bandLinesOf(modelOf(snapshot, { maxRows: 5 })).some(line => line.key.startsWith('fold:'))).toBe(false)
  })

  test('the caller line, a dirty main worktree and a failed read go in the foot', async () => {
    const snapshot = await fixtureSnapshot()
    const dirty = { ...snapshot, base: { ...snapshot.base, mainWorktreeDirty: 2 }, areSessionsKnown: false }
    const foot = bandLinesOf(modelOf(dirty, { columns: 200, status: 'release v0.4.1 pending', problem: 'index.lock' })).at(-1)

    expect(textOf(foot)).toBe(
      'next → feat/parent · release v0.4.1 pending · main worktree: 2 uncommitted · sessions unknown · last read failed: index.lock',
    )
  })

  test('before the first read, and when there is nothing to read', async () => {
    expect(bandLinesOf(modelOf(null)).map(textOf)).toEqual(['Worktree Radar · work · reading…'])
    expect(bandLinesOf(modelOf(null, { problem: 'not in a git repository' })).map(textOf)).toEqual([
      'Worktree Radar · work · not in a git repository',
    ])

    const snapshot = await fixtureSnapshot()
    const empty = bandLinesOf(modelOf({ ...snapshot, branches: [], next: null }))

    expect(empty.map(textOf)).toEqual(['Worktree Radar · work → main', 'no branches besides main', 'nothing ready to land'])
  })

  test('draws untrusted names as text', async () => {
    const snapshot = await fixtureSnapshot()
    const evil = {
      ...snapshot,
      branches: snapshot.branches.map(branch => (branch.name === 'feat/parent' ? { ...branch, name: 'feat/\u001b[31mred', note: 'a\nb' } : branch)),
    }
    const row = textOf(bandLinesOf(modelOf(evil, { columns: 160 }))[1])

    expect(row).toContain('feat/␛[31mred')
    expect(row).toContain('a␊b')
  })

  test('ages read in their largest unit', () => {
    expect([ageOf(5), ageOf(61), ageOf(3_600), ageOf(90_000), ageOf(-3)]).toEqual(['5s', '1m', '1h', '1d', '0s'])
  })
})
