import type { ThemeKey } from 'claude-code'

import type { BranchInfo, Lane, Snapshot } from '../types'

import { shortList } from './analysis'
import { BAND_TITLE } from './names'
import { cellWidth, padEnd, sanitize, truncateEnd, truncateMiddle } from './text'

/**
 * The band's lines, laid out in cells before anything is drawn: pure, so
 * every width can be tested without the engine.
 */

/**
 * A run of text drawn in one style.
 */
export type Segment = {
  readonly text: string
  readonly color?: ThemeKey
  readonly dim?: boolean
  readonly bold?: boolean
}

export type Line = {
  readonly key: string
  readonly segments: readonly Segment[]
}

export type BandModel = {
  readonly snapshot: Snapshot | null
  readonly problem: string | null
  /**
   * A caller's line under the queue.
   */
  readonly status: string | null
  /**
   * The folder the radar was opened from.
   */
  readonly root: string
  /**
   * Now, in milliseconds since the epoch.
   */
  readonly now: number
  /**
   * The cells each line may take.
   */
  readonly columns: number
  /**
   * The rows the band shows whole; past them it scrolls.
   */
  readonly maxRows: number
  /**
   * Whether the help stands in for the queue.
   */
  readonly isHelpShown: boolean
  /**
   * Whether the queue is folded into the header's one line.
   */
  readonly isCompact: boolean
}

export const LANE_LABELS: Readonly<Record<Lane, string>> = {
  READY: 'ready',
  NEEDS_REBASE: 'needs rebase',
  STACKED: 'stacked',
  IN_PROGRESS: 'in progress',
  HOLD: 'on hold',
  CLEANUP: 'cleanup',
}

/**
 * The lane labels of a narrow band.
 */
export const SHORT_LANE_LABELS: Readonly<Record<Lane, string>> = {
  READY: 'ready',
  NEEDS_REBASE: 'rebase',
  STACKED: 'stack',
  IN_PROGRESS: 'wip',
  HOLD: 'hold',
  CLEANUP: 'done',
}

/**
 * What each lane means, for the help; `{base}` stands for the base branch.
 */
export const LANE_MEANINGS: Readonly<Record<Lane, string>> = {
  READY: 'merges cleanly into {base}, nothing uncommitted, no busy session in its worktree',
  NEEDS_REBASE: 'conflicts with {base}: it needs a rebase before it can land',
  STACKED: 'holds every commit of another open branch: that one lands first',
  IN_PROGRESS: 'uncommitted changes, a rebase under way, or a busy Claude session in its worktree',
  HOLD: 'parked by you with /radar hold: out of the landing order, whatever else it shows, until you let it go',
  CLEANUP: 'nothing left to land: landed in {base}, or no commits and no session',
}

/**
 * Theme keys, so the lanes follow the person's theme.
 */
export const LANE_COLORS: Readonly<Record<Lane, ThemeKey>> = {
  READY: 'success',
  NEEDS_REBASE: 'error',
  STACKED: 'warning',
  IN_PROGRESS: 'suggestion',
  HOLD: 'merged',
  CLEANUP: 'inactive',
}

/**
 * Lanes folded into one line each, in this order, while the band has too
 * few rows: the ones that need nobody's action first.
 */
const FOLD_ORDER: readonly Lane[] = ['CLEANUP', 'IN_PROGRESS', 'HOLD', 'STACKED']

/**
 * From this width on a row shows every column; below it the commits ahead
 * go and the lane labels shorten; below the next, the age and the notes go
 * too.
 */
export const WIDE_COLUMNS = 64
export const MEDIUM_COLUMNS = 40

/**
 * The fixed columns: the rank (` 1 `), the gap after the branch, commits
 * ahead (`   +3`) and the age of the last commit (`  25m`), the numbers
 * right-aligned, and the gap before the note.
 */
const RANK_CELLS = 3
const GAP_CELLS = 2
const AHEAD_CELLS = 5
const AGE_CELLS = 5

/**
 * The most of what the fixed columns leave that the branch column may
 * take, per width: wide, then medium; and the least it takes, so its name
 * (`BRANCH`) fits.
 */
const BRANCH_SHARE = { wide: 0.45, medium: 0.5 } as const
const BRANCH_MIN_CELLS = 6

/**
 * The queue's columns at one width: each one's cells, 0 for a column the
 * width leaves out. The branch column is as wide as the longest name, up
 * to its share; the others are fixed, so every row of a drawing lines up.
 */
export type TableColumns = {
  readonly branch: number
  readonly lane: number
  readonly labels: Readonly<Record<Lane, string>>
  readonly ahead: number
  readonly age: number
  readonly hasNote: boolean
}

/**
 * Sizes the queue's columns to the band and the branches it shows.
 *
 * @param columns the cells a row may take
 * @param names the branches' names, sanitized
 * @returns the columns
 */
export function tableColumnsOf(columns: number, names: readonly string[]): TableColumns {
  const shortLabel = Math.max(...Object.values(SHORT_LANE_LABELS).map(label => label.length))
  const longest = Math.max(BRANCH_MIN_CELLS, ...names.map(cellWidth))
  const fit = (left: number, share: number): number => Math.max(Math.min(longest, Math.floor(left * share)), 1)

  if (columns >= WIDE_COLUMNS) {
    const lane = Math.max(...Object.values(LANE_LABELS).map(label => label.length))
    const left = columns - RANK_CELLS - GAP_CELLS - lane - AHEAD_CELLS - AGE_CELLS - GAP_CELLS

    return {
      branch: fit(left, BRANCH_SHARE.wide),
      lane,
      labels: LANE_LABELS,
      ahead: AHEAD_CELLS,
      age: AGE_CELLS,
      hasNote: true,
    }
  }

  if (columns >= MEDIUM_COLUMNS) {
    const left = columns - RANK_CELLS - GAP_CELLS - shortLabel - AGE_CELLS - GAP_CELLS

    return {
      branch: fit(left, BRANCH_SHARE.medium),
      lane: shortLabel,
      labels: SHORT_LANE_LABELS,
      ahead: 0,
      age: AGE_CELLS,
      hasNote: true,
    }
  }

  return {
    branch: Math.max(Math.min(longest, columns - RANK_CELLS - GAP_CELLS - shortLabel), 1),
    lane: shortLabel,
    labels: SHORT_LANE_LABELS,
    ahead: 0,
    age: 0,
    hasNote: false,
  }
}

/**
 * The row naming the queue's columns, aligned with them.
 *
 * @param table the columns
 * @param columns the cells the row may take
 * @returns the row
 */
export function columnHeaderOf(table: TableColumns, columns: number): Line {
  const name = (text: string): Segment => ({ text, dim: true })
  const groups: Segment[][] = [
    [name('#'.padStart(RANK_CELLS - 1).padEnd(RANK_CELLS))],
    [name(padEnd(truncateEnd('BRANCH', table.branch), table.branch))],
    [name(' '.repeat(GAP_CELLS)), name(padEnd(truncateEnd('LANE', table.lane), table.lane))],
  ]

  if (table.ahead > 0) {
    groups.push([name('AHEAD'.padStart(table.ahead))])
  }

  if (table.age > 0) {
    groups.push([name('AGE'.padStart(table.age))])
  }

  if (table.hasNote) {
    groups.push([name(' '.repeat(GAP_CELLS)), name('NOTE')])
  }

  // A column name is shown whole or not at all, never cut
  return { key: 'columns', segments: fitWhole(groups, columns) }
}

/**
 * One of the header's controls, drawn as its hotkey, a colon and its label
 * (`h: help`).
 */
export type Control = {
  readonly key: 'help' | 'compact' | 'exit'
  readonly hotkey: string
  readonly label: string
}

/**
 * Below this width the controls' labels shorten to one character each, so
 * the header keeps room for the counts.
 */
export const SHORT_CONTROLS_BELOW = 90

/**
 * The header's controls: the help, the compact line and closing the radar,
 * each labelled for what a press does now.
 *
 * @param columns the cells the band's lines take
 * @param isHelpShown whether the help is shown
 * @param isCompact whether the queue is folded into one line
 * @returns the controls, in drawing order
 */
export function controlsOf(columns: number, isHelpShown: boolean, isCompact: boolean): Control[] {
  const isShort = columns < SHORT_CONTROLS_BELOW

  return [
    { key: 'help', hotkey: 'h', label: isShort ? '?' : isHelpShown ? 'back' : 'help' },
    { key: 'compact', hotkey: 'c', label: isShort ? (isCompact ? '+' : '-') : isCompact ? 'expand' : 'compact' },
    { key: 'exit', hotkey: 'x', label: isShort ? '×' : 'exit' },
  ]
}

/**
 * The cells the controls take at the header's end: a gap before them, each
 * `k: label`, a gap between two.
 *
 * @param controls the controls
 * @returns their width in cells
 */
export function controlsCellsOf(controls: readonly Control[]): number {
  return controls.reduce((sum, control) => sum + 1 + cellWidth(`${control.hotkey}: ${control.label}`), 0)
}

/**
 * The cells the header's text may take beside the controls.
 */
function headerRoomOf(model: BandModel, columns: number): number {
  return columns - controlsCellsOf(controlsOf(columns, model.isHelpShown, model.isCompact))
}

/**
 * What the frame around the band takes: a border and a cell of padding on
 * each side, a border row above and below.
 */
export const FRAME_CELLS = 4
export const FRAME_ROWS = 2

/**
 * Below this width the band drops its frame, so the rows keep the cells.
 */
export const FRAME_MIN_COLUMNS = 24

/**
 * The room the band's lines get inside its frame.
 */
export type Frame = {
  readonly isFramed: boolean
  /**
   * The cells each line may take.
   */
  readonly columns: number
  /**
   * The rows the lines show whole.
   */
  readonly maxRows: number
}

/**
 * Fits the frame to the band: framed from `FRAME_MIN_COLUMNS` on, the lines
 * laid out inside the border and its padding.
 *
 * @param columns the cells the band's tree is laid out in (`bodyColumns`)
 * @param maxRows the rows the band shows whole
 * @returns the frame and the room inside it
 */
export function frameOf(columns: number, maxRows: number): Frame {
  return columns >= FRAME_MIN_COLUMNS
    ? { isFramed: true, columns: columns - FRAME_CELLS, maxRows: Math.max(maxRows - FRAME_ROWS, 1) }
    : { isFramed: false, columns, maxRows }
}

/**
 * An age as people read it: `42s`, `5m`, `3h`, `2d`.
 *
 * @param seconds the age
 * @returns the age in its largest whole unit
 */
export function ageOf(seconds: number): string {
  for (const [unit, size] of [
    ['d', 86_400],
    ['h', 3_600],
    ['m', 60],
  ] as const) {
    if (seconds >= size) {
      return `${Math.floor(seconds / size)}${unit}`
    }
  }

  return `${Math.max(Math.floor(seconds), 0)}s`
}

/**
 * The cells a line takes.
 */
export function lineWidthOf(line: Line): number {
  return line.segments.reduce((sum, segment) => sum + cellWidth(segment.text), 0)
}

/**
 * Cuts a line's segments at a width, the last one kept ending in `…`.
 *
 * @param segments the line's runs, sanitized
 * @param cells the cells it may take
 * @returns the runs that fit
 */
export function fitSegments(segments: readonly Segment[], cells: number): Segment[] {
  const out: Segment[] = []
  let left = cells

  for (const segment of segments) {
    const width = cellWidth(segment.text)

    if (width <= left) {
      out.push(segment)
      left -= width

      continue
    }

    if (left > 0) {
      out.push({ ...segment, text: truncateEnd(segment.text, left) })
    }

    break
  }

  return out
}

/**
 * What a row says beside its lane, shortest first to go.
 *
 * @param branch the branch
 * @param base the base branch's name
 * @returns the note's runs, sanitized
 */
export function noteOf(branch: BranchInfo, base: string): Segment[] {
  const parts: Segment[] = []
  const tree = branch.worktree
  const name = (text: string): string => sanitize(text)

  if (branch.note !== null) {
    parts.push({ text: name(branch.note), color: 'remember' })
  }

  switch (branch.lane) {
    case 'READY':
      if (branch.dependents.length > 0) {
        parts.push({ text: `${name(shortList(branch.dependents, 1))} stacked on it`, dim: true })
      }

      // Ready already says it merges cleanly: the note only adds what else
      if (branch.breaks.length > 0) {
        parts.push({ text: `forces a rebase of ${name(shortList(branch.breaks.map(broken => broken.branch), 1))}`, dim: true })
      }

      break
    case 'NEEDS_REBASE':
      parts.push({ text: `conflicts: ${name(shortList(branch.conflicts ?? [], 1))}`, dim: true })
      parts.push(
        (branch.waitsFor?.length ?? 0) > 0
          ? { text: `rebase after ${name(shortList(branch.waitsFor ?? [], 1))}`, dim: true }
          : { text: 'rebase due', color: 'error' },
      )
      break
    case 'STACKED':
      parts.push({ text: `on ${name(branch.stackedOn ?? '')}`, dim: true })
      break
    case 'IN_PROGRESS': {
      const busy = tree?.sessions.find(session => session.status !== 'idle')

      if (tree?.isRebasing) {
        parts.push({ text: 'rebasing', dim: true })
      } else if (busy !== undefined) {
        parts.push({ text: `${name(busy.name)} ${name(busy.status)}`, dim: true })
      }

      if ((tree?.dirty ?? 0) > 0) {
        parts.push({ text: `${tree?.dirty} uncommitted`, dim: true })
      }

      if (branch.ahead === 0) {
        parts.push({ text: branch.isLanded ? `landed in ${name(base)}` : 'no commits yet', dim: true })
      }

      break
    }
    case 'HOLD':
      parts.push({ text: branch.hold?.reason ? name(branch.hold.reason) : 'held', dim: true })
      break
    case 'CLEANUP':
      if (branch.isLanded || tree === null) {
        parts.push({ text: branch.isLanded ? `landed in ${name(base)}` : `nothing beyond ${name(base)}`, dim: true })
      }

      if (tree !== null) {
        parts.push({ text: `worktree ${name(tree.path)}`, dim: true })
      }

      break
  }

  return parts.flatMap((part, at) => (at === 0 ? [part] : [{ text: ' · ', dim: true }, part]))
}

/**
 * One branch's row.
 *
 * @param branch the branch
 * @param base the base branch's name
 * @param table the queue's columns
 * @param columns the cells the row may take
 * @param nowSeconds now, in seconds since the epoch
 * @returns the row
 */
export function rowOf(branch: BranchInfo, base: string, table: TableColumns, columns: number, nowSeconds: number): Line {
  const rank = branch.rank === null ? '-' : String(branch.rank)
  const segments: Segment[] = [
    { text: rank.padStart(RANK_CELLS - 1).padEnd(RANK_CELLS), bold: branch.rank !== null, dim: branch.rank === null },
    { text: padEnd(truncateMiddle(sanitize(branch.name), table.branch), table.branch) },
    { text: ' '.repeat(GAP_CELLS) },
    { text: padEnd(table.labels[branch.lane], table.lane), color: LANE_COLORS[branch.lane] },
  ]

  if (table.ahead > 0) {
    segments.push({ text: (branch.ahead > 0 ? `+${branch.ahead}` : '').padStart(table.ahead), dim: true })
  }

  // The age of a branch with work of its own, beside what it has ahead
  if (table.age > 0) {
    segments.push({ text: (branch.ahead > 0 ? ageOf(nowSeconds - branch.lastCommitAt) : '').padStart(table.age), dim: true })
  }

  if (table.hasNote) {
    segments.push({ text: ' '.repeat(GAP_CELLS) }, ...noteOf(branch, base))
  }

  return { key: `row:${branch.name}`, segments: fitSegments(segments, columns) }
}

/**
 * The line that stands for a folded lane: its label and its branches.
 */
function foldedLineOf(lane: Lane, branches: readonly BranchInfo[], columns: number): Line {
  return {
    key: `fold:${lane}`,
    segments: fitSegments(
      [
        { text: '   ' },
        { text: `${LANE_LABELS[lane]} (${branches.length}): `, color: LANE_COLORS[lane] },
        { text: sanitize(branches.map(branch => branch.name).join(', ')), dim: true },
      ],
      columns,
    ),
  }
}

/**
 * The header: the radar, the repository, the base and what each lane holds;
 * under the help, the radar and the word help.
 */
function headerOf(model: BandModel, snapshot: Snapshot | null, columns: number): Line {
  const repo = sanitize(nameOf(snapshot?.repo ?? model.root))
  const segments: Segment[] = [{ text: BAND_TITLE, bold: true }, { text: ` · ${repo}`, dim: true }]

  if (model.isHelpShown) {
    return { key: 'header', segments: fitSegments([...segments, { text: ' · help', dim: true }], headerRoomOf(model, columns)) }
  }

  if (snapshot === null) {
    return { key: 'header', segments: fitSegments(segments, headerRoomOf(model, columns)) }
  }

  const counts = countsOf(snapshot)
  const then: Segment[] = counts.length === 0 ? [] : [{ text: ' · ', dim: true }, ...counts]

  // Compact, the header is the whole band: what lands next comes first, the
  // part a narrow band cuts last
  if (model.isCompact) {
    const compact: Segment[] = [
      { text: BAND_TITLE, bold: true },
      { text: ' · ', dim: true },
      ...(snapshot.next === null
        ? [{ text: 'nothing ready', dim: true }]
        : [{ text: 'next → ', dim: true }, { text: sanitize(snapshot.next), color: 'success' as const, bold: true }]),
      ...(model.problem === null ? [] : [{ text: ' · ', dim: true }, { text: 'last read failed', color: 'error' as const }]),
      ...then,
    ]

    return { key: 'header', segments: fitSegments(compact, headerRoomOf(model, columns)) }
  }

  segments.push({ text: ` → ${sanitize(snapshot.base.name)}`, dim: true }, ...then)

  return { key: 'header', segments: fitSegments(segments, headerRoomOf(model, columns)) }
}

/**
 * Keeps whole groups of runs while they fit, in order, and stops at the
 * first that does not: for lines where a cut piece would read wrong (the
 * column names, the counts).
 *
 * @param groups the groups, each drawn whole or not at all
 * @param cells the cells they may take
 * @returns the runs of the groups that fit
 */
export function fitWhole(groups: readonly (readonly Segment[])[], cells: number): Segment[] {
  const out: Segment[] = []
  let left = cells

  for (const group of groups) {
    const width = lineWidthOf({ key: '', segments: group })

    if (width > left) {
      break
    }

    out.push(...group)
    left -= width
  }

  return out
}

/**
 * What each lane holds, in lane order, one group per lane after the first
 * led by its separator: `3 ready`, ` · 1 stacked`.
 */
function countGroupsOf(snapshot: Snapshot): Segment[][] {
  const groups: Segment[][] = []

  for (const lane of Object.keys(LANE_LABELS) as Lane[]) {
    const count = snapshot.branches.filter(branch => branch.lane === lane).length

    if (count > 0) {
      groups.push([...(groups.length === 0 ? [] : [{ text: ' · ', dim: true }]), { text: `${count} ${LANE_LABELS[lane]}`, color: LANE_COLORS[lane] }])
    }
  }

  return groups
}

/**
 * What each lane holds, in lane order: `3 ready`, `1 stacked`.
 */
function countsOf(snapshot: Snapshot): Segment[] {
  return (Object.keys(LANE_LABELS) as Lane[]).flatMap((lane, at, lanes) => {
    const count = snapshot.branches.filter(branch => branch.lane === lane).length
    const isFirst = lanes.slice(0, at).every(earlier => !snapshot.branches.some(branch => branch.lane === earlier))

    return count === 0
      ? []
      : [...(isFirst ? [] : [{ text: ' · ', dim: true }]), { text: `${count} ${LANE_LABELS[lane]}`, color: LANE_COLORS[lane] }]
  })
}

/**
 * The summary at the foot's right end, longest first: the radar, the
 * repository and its base, and the counts; a narrow band drops the title,
 * then the repository, and keeps the counts.
 */
function summariesOf(model: BandModel, snapshot: Snapshot): Segment[][] {
  const counts = countsOf(snapshot)
  const place: Segment = {
    text: `${sanitize(nameOf(snapshot.repo || model.root))} → ${sanitize(snapshot.base.name)}`,
    dim: true,
  }
  const then: Segment[] = counts.length === 0 ? [] : [{ text: ' · ', dim: true }, ...counts]

  return [[{ text: BAND_TITLE, bold: true }, { text: ' · ', dim: true }, place, ...then], [place, ...then], counts]
}

/**
 * Cells between the foot's left part and the summary, at the least.
 */
const FOOT_GAP_CELLS = 3

/**
 * The foot: what lands next, the caller's line and what to know on the
 * left; the summary right-aligned, when there is room for some of it.
 */
function footOf(model: BandModel, snapshot: Snapshot, columns: number, hasSummary = true): Line {
  const left = footLeftOf(model, snapshot)
  const leftCells = lineWidthOf({ key: '', segments: left })

  // With no queue, the title stands on top and says it all
  if (!hasSummary) {
    return { key: 'foot', segments: fitSegments(left, columns) }
  }

  for (const summary of summariesOf(model, snapshot)) {
    const cells = lineWidthOf({ key: '', segments: summary })

    if (leftCells + FOOT_GAP_CELLS + cells <= columns) {
      return { key: 'foot', segments: [...left, { text: ' '.repeat(columns - leftCells - cells) }, ...summary] }
    }
  }

  // Short of room for every count, the ones that fit whole, right-aligned
  const counts = fitWhole(countGroupsOf(snapshot), columns - leftCells - FOOT_GAP_CELLS)
  const countCells = lineWidthOf({ key: '', segments: counts })

  return {
    key: 'foot',
    segments:
      countCells > 0
        ? [...left, { text: ' '.repeat(columns - leftCells - countCells) }, ...counts]
        : fitSegments(left, columns),
  }
}

/**
 * The foot's left part: what lands next, then what to know.
 */
function footLeftOf(model: BandModel, snapshot: Snapshot): Segment[] {
  const segments: Segment[] =
    snapshot.next === null
      ? [{ text: 'nothing ready to land', dim: true }]
      : [{ text: 'next → ', dim: true }, { text: sanitize(snapshot.next), color: 'success', bold: true }]
  const dirty = snapshot.base.mainWorktreeDirty ?? 0

  if (model.status !== null && model.status !== '') {
    segments.push({ text: ' · ', dim: true }, { text: sanitize(model.status), color: 'remember' })
  }

  if (dirty > 0) {
    segments.push({ text: ' · ', dim: true }, { text: `main worktree: ${dirty} uncommitted`, color: 'warning' })
  }

  if (!snapshot.areSessionsKnown) {
    segments.push({ text: ' · sessions unknown', dim: true })
  }

  if (model.problem !== null) {
    segments.push({ text: ' · ', dim: true }, { text: `last read failed: ${sanitize(model.problem)}`, color: 'error' })
  }

  return segments
}

function nameOf(path: string): string {
  const parts = path.split(/[\\/]/).filter(part => part !== '')

  return parts[parts.length - 1] ?? path
}

/**
 * Lays the band out: the header, a row per branch (lanes that need nobody
 * folded into a line each when rows run short), and the foot.
 *
 * @param model what the band shows and the room it has
 * @returns the lines, each at most `columns` wide
 */
export function bandLinesOf(model: BandModel): Line[] {
  const columns = Math.max(model.columns, 1)
  const { snapshot } = model

  if (model.isHelpShown) {
    return [headerOf(model, snapshot, columns), ...helpLinesOf(snapshot?.base.name ?? 'the base', columns)]
  }

  if (snapshot === null) {
    const header = headerOf(model, null, columns)
    const text = model.problem === null ? 'reading…' : sanitize(model.problem)

    return [
      {
        key: 'header',
        segments: fitSegments(
          [...header.segments, { text: ' · ', dim: true }, { text, ...(model.problem === null ? { dim: true } : { color: 'error' as const }) }],
          headerRoomOf(model, columns),
        ),
      },
    ]
  }

  const header = headerOf(model, snapshot, columns)

  if (model.isCompact) {
    return [header]
  }
  if (snapshot.branches.length === 0) {
    return [
      header,
      { key: 'empty', segments: fitSegments([{ text: `no branches besides ${sanitize(snapshot.base.name)}`, dim: true }], columns) },
      footOf(model, snapshot, columns, false),
    ]
  }

  const foot = footOf(model, snapshot, columns)

  const nowSeconds = Math.floor(model.now / 1000)
  const folded = new Set<Lane>()
  // The column names and the foot take a row each
  const room = Math.max(model.maxRows - 2, 1)
  const rowsWith = (): number =>
    snapshot.branches.filter(branch => !folded.has(branch.lane)).length +
    [...folded].filter(lane => snapshot.branches.some(branch => branch.lane === lane)).length

  for (const lane of FOLD_ORDER) {
    if (rowsWith() <= room) {
      break
    }

    // A lane of one branch takes a row either way
    if (snapshot.branches.filter(branch => branch.lane === lane).length > 1) {
      folded.add(lane)
    }
  }

  const table = tableColumnsOf(
    columns,
    snapshot.branches.filter(branch => !folded.has(branch.lane)).map(branch => sanitize(branch.name)),
  )
  const lines: Line[] = [columnHeaderOf(table, headerRoomOf(model, columns))]

  for (const lane of Object.keys(LANE_LABELS) as Lane[]) {
    const inLane = snapshot.branches.filter(branch => branch.lane === lane)

    if (inLane.length === 0) {
      continue
    }

    if (folded.has(lane)) {
      lines.push(foldedLineOf(lane, inLane, columns))
    } else {
      lines.push(...inLane.map(branch => rowOf(branch, snapshot.base.name, table, columns, nowSeconds)))
    }
  }

  lines.push(foot)

  return lines
}

/**
 * Breaks text into lines of at most `cells` cells at its spaces; a word
 * longer than a line is cut.
 *
 * @param text one paragraph, sanitized
 * @param cells the cells a line may take
 * @returns the lines
 */
export function wrapWords(text: string, cells: number): string[] {
  const lines: string[] = []
  let line = ''

  for (const word of text.split(' ').filter(part => part !== '')) {
    const next = line === '' ? word : `${line} ${word}`

    if (cellWidth(next) <= cells) {
      line = next

      continue
    }

    if (line !== '') {
      lines.push(line)
    }

    line = cellWidth(word) <= cells ? word : truncateEnd(word, cells)
  }

  return line === '' ? lines : [...lines, line]
}

/**
 * One entry of the help: a term in its own style, what it means beside it.
 */
type HelpEntry = {
  readonly term: Segment
  readonly meaning: string
}

/**
 * Cells the help's term column takes, its gap included.
 */
const TERM_CELLS = 24

/**
 * Below this width a meaning goes under its term, not beside it.
 */
const SIDE_BY_SIDE_COLUMNS = TERM_CELLS + 20

/**
 * What the lanes, the notes and the controls mean, laid out to the band.
 *
 * @param base the base branch's name
 * @param columns the cells each line may take
 * @returns the help's lines, under the header
 */
export function helpLinesOf(base: string, columns: number): Line[] {
  const onto = sanitize(base)
  const sections: readonly { readonly title: string; readonly entries: readonly HelpEntry[] }[] = [
    {
      title: 'Lanes',
      entries: (Object.keys(LANE_LABELS) as Lane[]).map(lane => ({
        term: { text: LANE_LABELS[lane], color: LANE_COLORS[lane] },
        meaning: LANE_MEANINGS[lane].replaceAll('{base}', onto),
      })),
    },
    {
      title: 'On a row',
      entries: [
        { term: { text: '1 2 3' , bold: true }, meaning: `the order to land the ready branches in: stack parents first, then whichever forces the least rebase work on the others, then whichever finished first` },
        { term: { text: '+3' }, meaning: `commits the branch has that ${onto} lacks` },
        { term: { text: '5m' }, meaning: 'since its last commit' },
        { term: { text: 'rebase due', color: 'error' }, meaning: 'rebase it now: nothing that lands before it still conflicts with it' },
        { term: { text: 'rebase after X' }, meaning: 'X lands first and conflicts with it too; a rebase now would have to be done again' },
        { term: { text: 'forces a rebase of X' }, meaning: 'landing this branch makes X conflict' },
        { term: { text: 'X stacked on it' }, meaning: 'X holds this branch: this one lands first' },
        { term: { text: `landed in ${onto}` }, meaning: `its work reached ${onto} through a merge` },
      ],
    },
    {
      title: 'Controls',
      entries: [
        { term: { text: 'h' }, meaning: 'this help, and back; the band takes keys after ctrl+x tab or a click' },
        { term: { text: 'c' }, meaning: 'folds the radar into one line: what lands next, then the counts' },
        { term: { text: 'x' }, meaning: 'exits the radar, as /radar does' },
        {
          term: { text: '/radar hold <branch>' },
          meaning:
            'parks a branch. Words after it are the reason, shown on its row: /radar hold feat/x waits on review. It leaves the ready lane and next skips it. Only the radar notes it: the branch and git stay as they are. Every session of this repository on this machine sees the hold until /radar unhold <branch>',
        },
      ],
    },
  ]
  const isSideBySide = columns >= SIDE_BY_SIDE_COLUMNS
  const lines: Line[] = []

  sections.forEach((section, at) => {
    // An empty row between two sections; a space, so the row keeps its height
    if (at > 0) {
      lines.push({ key: `help:gap:${section.title}`, segments: [{ text: ' ' }] })
    }

    lines.push({ key: `help:${section.title}`, segments: fitSegments([{ text: section.title, bold: true }], columns) })

    for (const entry of section.entries) {
      const key = `help:${section.title}:${entry.term.text}`
      const term = { ...entry.term, text: truncateEnd(entry.term.text, Math.max(columns - 2, 1)) }

      if (isSideBySide) {
        wrapWords(entry.meaning, columns - TERM_CELLS).forEach((text, at) => {
          lines.push({
            key: `${key}:${at}`,
            segments: fitSegments(
              [at === 0 ? { ...term, text: padEnd(`  ${term.text}`, TERM_CELLS) } : { text: ' '.repeat(TERM_CELLS) }, { text, dim: true }],
              columns,
            ),
          })
        })

        continue
      }

      lines.push({ key, segments: fitSegments([{ text: '  ' }, term], columns) })
      wrapWords(entry.meaning, Math.max(columns - 4, 1)).forEach((text, at) => {
        lines.push({ key: `${key}:${at}`, segments: fitSegments([{ text: '    ' }, { text, dim: true }], columns) })
      })
    }
  })

  return lines
}
