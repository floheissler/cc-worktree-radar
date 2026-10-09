import { describe, expect, test } from 'claude-code/testing'

import type { SessionInfo, Snapshot } from '../types'

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
    agents: [],
    holds: HOLDS,
    comments: {},
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

    // The column names on top; under a divider, the status line
    expect(textOf(lines[0])).toMatch(/^ # BRANCH +LANE +AHEAD  AGE  DETAIL$/)
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
    // Out of the landing order, the # cell is a dash and the note names the
    // ranked branch it waits on by its place
    expect(textOf(lines[5])).toMatch(/^ - feat\/conflict2\s+needs rebase\s+\+1 +\d+[smhd]  conflicts: a\.txt · rebase after #2 feat\/ready-a$/)
    expect(textOf(lines.find(line => line.key === 'row:feat/child'))).toMatch(/^ - feat\/child\s+stacked\s+\+2 +\d+[smhd]  lands after #1 feat\/parent$/)
    expect(textOf(lines.find(line => line.key === 'row:feat/big'))).toMatch(/forces a rebase of #4 fix\/small$/)
    expect(textOf(lines.find(line => line.key === 'row:feat/conflict'))).toMatch(/rebase after feat\/conflict2$/)
    expect(textOf(lines.find(line => line.key === 'row:chore/merged'))).toMatch(/^ - chore\/merged\s+cleanup +nothing beyond main$/)
    // No rule: the status line follows the last row, and the frame tells
    // them apart (view.tsx draws it under the frame)
    expect(lines.at(-2)?.key).toBe('row:chore/merged')
    expect(textOf(lines.at(-1))).toBe(
      'Worktree Radar · work [main] · 4 ready · 2 needs rebase · 1 stacked · 1 in progress · 1 on hold · 2 cleanup · land next → feat/parent',
    )
    // The base in the orange the owner's status line names a branch with
    expect(lines.at(-1)?.segments.find(segment => segment.text === '[main]')).toEqual({ text: '[main]', color: '#ff8700' })
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

  test('draws the facts in the text color, and dims only what is not data', async () => {
    const lines = bandLinesOf(modelOf(await fixtureSnapshot(), { columns: 140 }))
    const row = lines.find(line => line.key === 'row:feat/parent')
    const styled = (text: string) => row?.segments.find(segment => segment.text.trim() === text)

    // Ahead, age and the detail as the branch is; the separator dim
    for (const fact of ['feat/parent', '+1', 'feat/child stacked on it']) {
      expect(styled(fact), fact).toEqual({ text: expect.any(String) })
    }

    expect(textOf(lines[0]) !== '' && lines[0]?.segments.every(segment => segment.dim === true)).toBe(true)
    expect(lines.find(line => line.key === 'row:feat/conflict2')?.segments.find(segment => segment.text === ' · ')).toMatchObject({ dim: true })
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

  test('narrows: the commits ahead go first, then the details', async () => {
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

    // Fourteen rows into nine: cleanup, in progress and needs rebase fold,
    // one line each, so the band takes its 11 rows and no more
    const lines = bandLinesOf(modelOf(more, { maxRows: 11 }))

    expect(lines.map(line => line.key)).toEqual([
      'columns',
      'row:feat/parent',
      'row:feat/ready-a',
      'row:feat/big',
      'row:fix/small',
      'fold:NEEDS_REBASE',
      'row:feat/child',
      'fold:IN_PROGRESS',
      'row:feat/clean',
      'fold:CLEANUP',
      'foot',
    ])
    expect(textOf(lines[5])).toBe('   needs rebase (2): feat/conflict2, feat/conflict')
    expect(textOf(lines[7])).toBe('   in progress (3): feat/wip, feat/w2, feat/w3')
    expect(textOf(lines[9])).toBe('   cleanup (3): chore/a, chore/b, chore/c')

    // A lane of one branch never folds: it would take its row anyway. Past
    // the folds, the ready lane's tail folds behind its head
    expect(bandLinesOf(modelOf(snapshot, { maxRows: 10 })).map(line => line.key)).toEqual([
      'columns',
      'row:feat/parent',
      'row:feat/ready-a',
      'fold:READY',
      'fold:NEEDS_REBASE',
      'row:feat/child',
      'row:feat/wip',
      'row:feat/clean',
      'fold:CLEANUP',
      'foot',
    ])
    expect(textOf(bandLinesOf(modelOf(snapshot, { maxRows: 10 }))[3])).toBe('   ready (+2): feat/big, fix/small')
    // Shorter still, the lanes lowest in the order go; the foot stays
    expect(bandLinesOf(modelOf(snapshot, { maxRows: 5 })).map(line => line.key)).toEqual([
      'columns',
      'row:feat/parent',
      'fold:READY',
      'fold:NEEDS_REBASE',
      'foot',
    ])
  })

  test('keeps the next to land and the foot however many branches it holds', async () => {
    const snapshot = await fixtureSnapshot()
    const ready = snapshot.branches.filter(branch => branch.lane === 'READY')
    const many = {
      ...snapshot,
      branches: [
        ...ready,
        ...Array.from({ length: 26 }, (_, at) => ({ ...ready[1]!, name: `load/b${String(at + 1).padStart(2, '0')}`, rank: ready.length + at + 1 })),
        ...snapshot.branches.filter(branch => branch.lane !== 'READY'),
      ],
    }

    for (let maxRows = 1; maxRows <= 45; maxRows += 1) {
      const lines = bandLinesOf(modelOf(many, { maxRows }))

      // The column names, at least one row, the foot
      expect(lines.length, `at ${maxRows} rows`).toBeLessThanOrEqual(Math.max(maxRows, 3))
      expect(lines[1]?.key, `at ${maxRows} rows`).toBe('row:feat/parent')
      expect(lines.at(-1)?.key, `at ${maxRows} rows`).toBe('foot')
    }

    // A 50-row terminal gives the band about 20: the first 9 ready, then the rest
    const lines = bandLinesOf(modelOf(many, { maxRows: 18 }))

    expect(lines.filter(line => line.key.startsWith('row:')).map(line => line.key).slice(0, 3)).toEqual(['row:feat/parent', 'row:feat/ready-a', 'row:feat/big'])
    expect(textOf(lines.find(line => line.key === 'fold:READY'))).toMatch(/^ {3}ready \(\+\d+\): load\/b\d\d, /)
    expect(textOf(lines.at(-1))).toMatch(/land next → feat\/parent$/)
  })

  test('the caller line, a dirty main worktree and a failed read go in the foot', async () => {
    const snapshot = await fixtureSnapshot()
    const dirty = { ...snapshot, base: { ...snapshot.base, mainWorktreeDirty: 2 }, areSessionsKnown: false }
    const foot = bandLinesOf(modelOf(dirty, { columns: 260, status: 'release v0.4.1 pending', problem: 'index.lock' })).at(-1)

    // The status line on the left, the messages right-aligned at the end
    expect(textOf(foot)).toMatch(
      /^Worktree Radar · work \[main\] · .* · land next → feat\/parent +release v0\.4\.1 pending · main worktree: 2 uncommitted · sessions unknown · last read failed: index\.lock$/,
    )
    expect(lineWidthOf(foot as Line)).toBe(260)

    // Short of room, the messages go first; the status line keeps what lands next
    const narrow = bandLinesOf(modelOf(dirty, { columns: 60, status: 'release v0.4.1 pending' })).at(-1)

    expect(textOf(narrow)).toMatch(/^land next → feat\/parent +release v0\.4\.1 pending · main wor…$/)

    // A message outranks the long labels and the title, not the place
    const message = bandLinesOf(modelOf(snapshot, { columns: 131, status: 'release v0.4.1 pending' })).at(-1)

    expect(textOf(message)).toMatch(/^work \[main\] · 4 ready · 2 rebase · .* · land next → feat\/parent +release v0\.4\.1 pending$/)
  })

  test('before the first read, and when there is nothing to read', async () => {
    expect(bandLinesOf(modelOf(null)).map(textOf)).toEqual(['Worktree Radar · reading work…'])
    expect(bandLinesOf(modelOf(null, { problem: 'not in a git repository' })).map(textOf)).toEqual([
      'Worktree Radar · not in a git repository',
    ])

    const snapshot = await fixtureSnapshot()
    const empty = bandLinesOf(modelOf({ ...snapshot, branches: [], next: null }))

    expect(empty.map(textOf)).toEqual([
      'no branches besides main',
      'Worktree Radar · work [main] · nothing ready to land',
    ])
  })

  test('a running agent\'s row names its task, or its session', async () => {
    const snapshot = await fixtureSnapshot()
    const agent = { id: 'abc', name: 'agent-abc', status: 'running', kind: 'agent' as const, description: 'Fix the totals', parent: 'coordinator' }
    const rowWith = (sessions: readonly SessionInfo[]) =>
      textOf(
        bandLinesOf(
          modelOf(
            {
              ...snapshot,
              branches: snapshot.branches.map(branch =>
                branch.name === 'feat/wip' && branch.worktree !== null ? { ...branch, worktree: { ...branch.worktree, sessions } } : branch,
              ),
            },
            { columns: 160 },
          ),
        ).find(line => line.key === 'row:feat/wip'),
      )

    expect(rowWith([agent])).toMatch(/in progress .* {2}agent: Fix the totals · /)
    expect(rowWith([{ ...agent, description: null }])).toMatch(/ {2}agent of coordinator · /)
    expect(rowWith([{ id: 's', name: 'b-7c', status: 'busy', kind: 'session' }])).toMatch(/ {2}session b-7c busy · /)
  })

  test('a caller\'s comment gets a column of its own, after the radar\'s detail', async () => {
    const snapshot = await fixtureSnapshot()
    const commented = {
      ...snapshot,
      branches: snapshot.branches.map(branch => (branch.name === 'feat/conflict' ? { ...branch, comment: 'handed back to b-7c' } : branch)),
    }
    const lines = bandLinesOf(modelOf(commented, { columns: 160 }))
    const header = textOf(lines[0])
    const row = lines.find(line => line.key === 'row:feat/conflict')
    const at = textOf(row).indexOf('✻')

    // DETAIL as wide as its longest, then COMMENT, lined up with the comment
    expect(header).toMatch(/AGE  DETAIL +COMMENT$/)
    expect(at).toBe(header.indexOf('COMMENT'))
    expect(row?.segments.slice(-2)).toEqual([
      { text: '✻ ', color: 'claude' },
      { text: '“handed back to b-7c”', color: 'inactive', italic: true },
    ])
    expect(textOf(row)).toMatch(/rebase after feat\/conflict2 +✻ “handed back to b-7c”$/)
    // A row with no comment ends with its detail
    expect(textOf(lines.find(line => line.key === 'row:feat/parent'))).toMatch(/feat\/child stacked on it +$/)

    // A long comment is cut inside its quotes
    const long = bandLinesOf(
      modelOf({ ...commented, branches: commented.branches.map(branch => (branch.comment === null ? branch : { ...branch, comment: 'x'.repeat(300) })) }, { columns: 160 }),
    ).find(line => line.key === 'row:feat/conflict')

    expect(textOf(long)).toMatch(/✻ “x+…”$/)
    expect(lineWidthOf(long as Line)).toBe(160)

    // Below the wide layout, the comments go first; the detail stays
    const medium = bandLinesOf(modelOf(commented, { columns: 60 }))

    expect(textOf(medium[0])).toMatch(/DETAIL$/)
    expect(textOf(medium.find(line => line.key === 'row:feat/conflict'))).not.toContain('✻')

    // Without comments, no comment column
    expect(textOf(bandLinesOf(modelOf(snapshot, { columns: 160 }))[0])).toMatch(/DETAIL$/)

    for (let columns = 1; columns <= 160; columns += 1) {
      for (const line of bandLinesOf(modelOf(commented, { columns }))) {
        const room = line.key === 'columns' ? columns - controlsCellsOf(controlsOf(columns, false, false)) : columns

        expect(lineWidthOf(line), `${line.key} at ${columns}`).toBeLessThanOrEqual(Math.max(room, 0))
      }
    }
  })

  test('a comment column always shows its name, clear of the controls', async () => {
    const snapshot = await fixtureSnapshot()
    const long = 'feat/ünïcödé-🌳-a-very-long-branch-name-that-goes-on-to-test-the-column-share'
    const commented = (rename: boolean) => ({
      ...snapshot,
      branches: snapshot.branches.map(branch => ({
        ...branch,
        name: rename && branch.name === 'feat/parent' ? long : branch.name,
        comment: branch.name === 'feat/conflict' ? 'handed to small-worker' : branch.comment,
      })),
    })
    const cellsBefore = (text: string, mark: string) => cellWidth(text.slice(0, text.indexOf(mark)))

    // Seen live: a 151-cell band, a long branch name; COMMENT went under the
    // controls. The detail gives up cells instead
    const lines = bandLinesOf(modelOf(commented(true), { columns: 151 }))
    const row = textOf(lines.find(line => line.key === 'row:feat/conflict'))

    expect(textOf(lines[0])).toMatch(/DETAIL +COMMENT$/)
    expect(cellsBefore(row, '✻')).toBe(cellsBefore(textOf(lines[0]), 'COMMENT'))

    for (let columns = 1; columns <= 200; columns += 1) {
      for (const rename of [false, true]) {
        const laid = bandLinesOf(modelOf(commented(rename), { columns }))
        const shown = textOf(laid.find(line => line.key === 'row:feat/conflict'))

        if (shown.includes('✻')) {
          expect(cellsBefore(shown, '✻'), `at ${columns}`).toBe(cellsBefore(textOf(laid[0]), 'COMMENT'))
        } else {
          expect(textOf(laid[0]), `at ${columns}`).not.toContain('COMMENT')
        }
      }
    }
  })

  test('a cleanup row says it has a worktree, not where', async () => {
    const lines = bandLinesOf(modelOf(await fixtureSnapshot(), { columns: 160 }))

    expect(textOf(lines.find(line => line.key === 'row:feat/landed'))).toMatch(/cleanup +landed in main · has a worktree$/)
  })

  test('draws untrusted names as text', async () => {
    const snapshot = await fixtureSnapshot()
    const evil = {
      ...snapshot,
      branches: snapshot.branches.map(branch => (branch.name === 'feat/parent' ? { ...branch, name: 'feat/\u001b[31mred', comment: 'a\nb' } : branch)),
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

    expect(textOf(lines[0])).toBe('Help · what each part of the band means')
    expect(textOf(lines[1])).toBe('Lanes')

    // An empty row before each section after the first
    for (const title of ['On a row', 'Status line', 'Controls']) {
      const at = lines.findIndex(line => textOf(line) === title)

      expect(textOf(lines[at - 1]), title).toBe(' ')
    }
    expect(lines[2]?.segments.slice(0, 2)).toEqual([{ text: '  ' }, { text: 'ready', color: 'success' }])
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
      'Worktree Radar · work [main] · 4 ready · 2 needs rebase · 1 stacked · 1 in progress · 1 on hold · 2 cleanup · land next → feat/parent',
    ])

    // Short of room, the lane labels shorten before the title goes
    expect(textOf(bandLinesOf(modelOf(snapshot, { isCompact: true, columns: 150 }))[0])).toBe(
      'Worktree Radar · work [main] · 4 ready · 2 rebase · 1 stack · 1 wip · 1 hold · 2 done · land next → feat/parent',
    )
    expect(textOf(bandLinesOf(modelOf(snapshot, { isCompact: true, columns: 128 }))[0])).toBe(
      'work [main] · 4 ready · 2 rebase · 1 stack · 1 wip · 1 hold · 2 done · land next → feat/parent',
    )

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
