import { describe, expect, test } from 'claude-code/testing'

import type { Snapshot } from '../types'

import { readSnapshot } from '../hooks/analysis'
import { gitOf } from '../hooks/git'
import {
  ageOf,
  bandLinesOf,
  controlsCellsOf,
  controlsOf,
  FRAME_MIN_COLUMNS,
  frameOf,
  lineWidthOf,
  wrapWords,
  type BandModel,
  type Line,
} from '../hooks/rows'
import { cellWidth } from '../hooks/text'
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
  return { snapshot, problem: null, status: null, root: '/work', now: NOW, columns: 100, maxRows: 40, isHelpShown: false, isCompact: false, ...changes }
}

const textOf = (line: Line | undefined): string => line?.segments.map(segment => segment.text).join('') ?? ''

describe('the band laid out', () => {
  test('a header, a row per branch in lane order, and the next to land', async () => {
    const lines = bandLinesOf(modelOf(await fixtureSnapshot(), { columns: 140 }))

    // The column names on top, the summary right-aligned in the foot
    expect(textOf(lines[0])).toMatch(/^ # BRANCH +LANE +AHEAD  AGE  NOTE$/)
    expect(lines.map(line => line.key)).toEqual([
      'columns',
      'row:feat/parent',
      'row:feat/ready-a',
      'row:feat/big',
      'row:fix/small',
      'row:feat/conflict2',
      'row:feat/conflict',
      'row:feat/child',
      'row:feat/wip',
      'row:feat/clean',
      'row:feat/landed',
      'row:chore/merged',
      'foot',
    ])
    expect(textOf(lines[1])).toMatch(/^ 1 feat\/parent\s+ready\s+\+1 +\d+[smhd]  feat\/child stacked on it$/)
    expect(textOf(lines[5])).toMatch(/^ - feat\/conflict2\s+needs rebase\s+\+1 +\d+[smhd]  conflicts: a\.txt · rebase after feat\/ready-a/)
    expect(textOf(lines.find(line => line.key === 'row:chore/merged'))).toMatch(/^ - chore\/merged\s+cleanup +nothing beyond main$/)
    expect(textOf(lines.at(-1))).toMatch(
      /^next → feat\/parent +Worktree Radar · work → main · 4 ready · 2 needs rebase · 1 stacked · 1 in progress · 1 on hold · 2 cleanup$/,
    )
    expect(lineWidthOf(lines.at(-1) as Line)).toBe(140)
  })

  test('every row lines up under the column names; the branch column fits the longest name', async () => {
    const snapshot = await fixtureSnapshot()
    const long = {
      ...snapshot,
      branches: snapshot.branches.map(branch =>
        branch.name === 'feat/big' ? { ...branch, name: 'feat/a-much-longer-branch-name' } : branch,
      ),
    }
    // Where a row's lane cell starts: after the rank, the branch and the gap
    const laneAt = (line: Line) => lineWidthOf({ key: '', segments: line.segments.slice(0, 3) })

    for (const columns of [50, 80, 140]) {
      for (const shown of [snapshot, long]) {
        const lines = bandLinesOf(modelOf(shown, { columns }))
        const header = textOf(lines[0]).indexOf('LANE')

        for (const row of lines.filter(line => line.key.startsWith('row:'))) {
          expect(laneAt(row), `${row.key} at ${columns}`).toBe(header)
        }
      }
    }

    // Wide, the branch column is as wide as the longest name, then a gap
    const lines = bandLinesOf(modelOf(snapshot, { columns: 140 }))

    expect(textOf(lines[0]).indexOf('LANE')).toBe(3 + 'feat/conflict2'.length + 2)
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
        const room = line.key === 'columns' ? columns - controlsCellsOf(controlsOf(columns, false, false)) : columns

        expect(lineWidthOf(line), `${line.key} at ${columns}`).toBeLessThanOrEqual(Math.max(room, 0))
      }
    }
  })

  test('narrows: the commits ahead go first, then the notes', async () => {
    const snapshot = await fixtureSnapshot()

    expect(textOf(bandLinesOf(modelOf(snapshot, { columns: 50 }))[1])).toMatch(/^ 1 feat\/parent\s+ready +\d+[smhd]  feat\/child/)
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
      'columns',
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
    expect(bandLinesOf(modelOf(snapshot, { maxRows: 5 })).filter(line => line.key.startsWith('fold:')).map(line => line.key)).toEqual([
      'fold:CLEANUP',
    ])
  })

  test('the caller line, a dirty main worktree and a failed read go in the foot', async () => {
    const snapshot = await fixtureSnapshot()
    const dirty = { ...snapshot, base: { ...snapshot.base, mainWorktreeDirty: 2 }, areSessionsKnown: false }
    const foot = bandLinesOf(modelOf(dirty, { columns: 210, status: 'release v0.4.1 pending', problem: 'index.lock' })).at(-1)

    // Short of room for the whole summary, the foot keeps its counts
    expect(textOf(foot)).toMatch(
      /^next → feat\/parent · release v0\.4\.1 pending · main worktree: 2 uncommitted · sessions unknown · last read failed: index\.lock +4 ready · 2 needs rebase · 1 stacked · 1 in progress · 1 on hold · 2 cleanup$/,
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

  test('the frame takes four cells and two rows, and goes on a narrow band', () => {
    expect(frameOf(135, 30)).toEqual({ isFramed: true, columns: 131, maxRows: 28 })
    expect(frameOf(FRAME_MIN_COLUMNS, 2)).toEqual({ isFramed: true, columns: FRAME_MIN_COLUMNS - 4, maxRows: 1 })
    expect(frameOf(FRAME_MIN_COLUMNS - 1, 30)).toEqual({ isFramed: false, columns: FRAME_MIN_COLUMNS - 1, maxRows: 30 })
  })

  test('the help explains every lane in its color, and fits every width', async () => {
    const snapshot = await fixtureSnapshot()
    const lines = bandLinesOf(modelOf(snapshot, { isHelpShown: true, columns: 100 }))

    expect(textOf(lines[0])).toBe('Worktree Radar · work · help')
    expect(textOf(lines[1])).toBe('Lanes')

    // An empty row before each section after the first
    for (const title of ['On a row', 'Controls']) {
      const at = lines.findIndex(line => textOf(line) === title)

      expect(textOf(lines[at - 1]), title).toBe(' ')
    }
    expect(lines[2]?.segments[0]).toMatchObject({ text: expect.stringMatching(/^ {2}ready +$/), color: 'success' })
    expect(textOf(lines[2])).toMatch(/^ {2}ready +merges cleanly into main, nothing uncommitted/)
    expect(lines.some(line => line.segments.some(segment => segment.text.trim() === 'needs rebase' && segment.color === 'error'))).toBe(true)
    expect(lines.map(textOf).some(text => text.includes('[-]'))).toBe(false)

    for (let columns = 1; columns <= 160; columns += 1) {
      for (const line of bandLinesOf(modelOf(snapshot, { columns, isHelpShown: true }))) {
        const room = line.key === 'header' ? columns - controlsCellsOf(controlsOf(columns, true, false)) : columns

        expect(lineWidthOf(line), `${line.key} at ${columns}`).toBeLessThanOrEqual(Math.max(room, 0))
      }
    }

    // Narrow, a meaning goes under its term
    const narrow = bandLinesOf(modelOf(snapshot, { columns: 30, isHelpShown: true }))

    expect(narrow.slice(2, 4).map(textOf)).toEqual(['  ready', '    merges cleanly into main,'])
  })

  test('compact, the band is one line: the counts and what lands next', async () => {
    const snapshot = await fixtureSnapshot()
    const lines = bandLinesOf(modelOf(snapshot, { isCompact: true, columns: 200 }))

    expect(lines.map(textOf)).toEqual([
      'Worktree Radar · next → feat/parent · 4 ready · 2 needs rebase · 1 stacked · 1 in progress · 1 on hold · 2 cleanup',
    ])

    for (let columns = 1; columns <= 160; columns += 1) {
      const [line, ...rest] = bandLinesOf(modelOf(snapshot, { columns, isCompact: true, problem: 'boom' }))

      expect(rest).toEqual([])
      expect(lineWidthOf(line as Line)).toBeLessThanOrEqual(Math.max(columns - controlsCellsOf(controlsOf(columns, false, true)), 0))
    }

    // The help still shows whole while compact
    expect(bandLinesOf(modelOf(snapshot, { isCompact: true, isHelpShown: true })).length).toBeGreaterThan(10)
  })

  test('the controls say what a press does, and shorten on a narrow band', () => {
    const labels = (columns: number, help: boolean, compact: boolean) =>
      controlsOf(columns, help, compact).map(control => `${control.hotkey}: ${control.label}`)

    expect(labels(120, false, false)).toEqual(['h: help', 'c: compact', 'x: exit'])
    expect(labels(120, true, true)).toEqual(['h: back', 'c: expand', 'x: exit'])
    expect(labels(60, false, false)).toEqual(['h: ?', 'c: -', 'x: ×'])
    expect(controlsCellsOf(controlsOf(120, false, false))).toBe(27)
  })

  test('wraps words to a width, cutting only a word longer than a line', () => {
    expect(wrapWords('one two three four', 9)).toEqual(['one two', 'three', 'four'])
    expect(wrapWords('abcdefghijkl x', 5).every(line => cellWidth(line) <= 5)).toBe(true)
    expect(wrapWords('', 5)).toEqual([])
  })

  test('ages read in their largest unit', () => {
    expect([ageOf(5), ageOf(61), ageOf(3_600), ageOf(90_000), ageOf(-3)]).toEqual(['5s', '1m', '1h', '1d', '0s'])
  })
})
