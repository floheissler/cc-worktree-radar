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
 * go and the lane labels shorten; below the next, the notes go too.
 */
export const WIDE_COLUMNS = 64
export const MEDIUM_COLUMNS = 40

/**
 * Cells left for the band's close mark at the header's end.
 */
export const CLOSE_CELLS = 2

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

      parts.push({
        text:
          branch.breaks.length > 0
            ? `forces a rebase of ${name(shortList(branch.breaks.map(broken => broken.branch), 1))}`
            : `merges cleanly`,
        dim: true,
      })
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
 * @param columns the cells the row may take
 * @param branchCells the branch column's width
 * @param nowSeconds now, in seconds since the epoch
 * @returns the row
 */
export function rowOf(branch: BranchInfo, base: string, columns: number, branchCells: number, nowSeconds: number): Line {
  const isWide = columns >= WIDE_COLUMNS
  const isMedium = columns >= MEDIUM_COLUMNS
  const labels = isWide ? LANE_LABELS : SHORT_LANE_LABELS
  const labelCells = Math.max(...Object.values(labels).map(label => label.length))
  const rank = branch.rank === null ? '-' : String(branch.rank)
  const segments: Segment[] = [
    { text: `${rank.padStart(2)} `, bold: branch.rank !== null, dim: branch.rank === null },
    { text: padEnd(truncateMiddle(sanitize(branch.name), branchCells), branchCells) },
    { text: '  ' },
    { text: padEnd(labels[branch.lane], labelCells), color: LANE_COLORS[branch.lane] },
  ]

  if (isWide) {
    segments.push({ text: (branch.ahead > 0 ? `+${branch.ahead}` : '').padStart(4), dim: true })
  }

  if (isMedium) {
    const note = noteOf(branch, base)
    const age = branch.ahead > 0 ? [{ text: ' · ', dim: true }, { text: ageOf(nowSeconds - branch.lastCommitAt), dim: true }] : []

    segments.push({ text: '  ' }, ...note, ...(note.length > 0 ? age : age.slice(1)))
  }

  return { key: `row:${branch.name}`, segments: fitSegments(segments, columns) }
}

/**
 * The width of the branch column: the longest name, within a share of the
 * row that leaves the lane and some note in view.
 *
 * @param branches the rows' branches
 * @param columns the cells a row may take
 * @returns the column's width in cells
 */
export function branchCellsOf(branches: readonly BranchInfo[], columns: number): number {
  const longest = Math.max(6, ...branches.map(branch => cellWidth(sanitize(branch.name))))
  const share = columns >= WIDE_COLUMNS ? 0.4 : columns >= MEDIUM_COLUMNS ? 0.45 : 0.5
  const fixed = 3 + 2 + (columns >= WIDE_COLUMNS ? 16 : 6)

  return Math.max(1, Math.min(longest, Math.floor(columns * share), columns - fixed))
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
 * The header: the radar, the repository, the base and what each lane holds.
 */
function headerOf(model: BandModel, snapshot: Snapshot | null, columns: number): Line {
  const repo = sanitize(nameOf(snapshot?.repo ?? model.root))
  const segments: Segment[] = [{ text: BAND_TITLE, bold: true }, { text: ` · ${repo}`, dim: true }]

  if (snapshot !== null) {
    segments.push({ text: ` → ${sanitize(snapshot.base.name)}`, dim: true })

    for (const lane of Object.keys(LANE_LABELS) as Lane[]) {
      const count = snapshot.branches.filter(branch => branch.lane === lane).length

      if (count > 0) {
        segments.push({ text: ' · ', dim: true }, { text: `${count} ${LANE_LABELS[lane]}`, color: LANE_COLORS[lane] })
      }
    }
  }

  return { key: 'header', segments: fitSegments(segments, columns - CLOSE_CELLS) }
}

/**
 * The foot: what lands next, the caller's line, and what to know.
 */
function footOf(model: BandModel, snapshot: Snapshot, columns: number): Line {
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

  return { key: 'foot', segments: fitSegments(segments, columns) }
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

  if (snapshot === null) {
    const header = headerOf(model, null, columns)
    const text = model.problem === null ? 'reading…' : sanitize(model.problem)

    return [
      {
        key: 'header',
        segments: fitSegments(
          [...header.segments, { text: ' · ', dim: true }, { text, ...(model.problem === null ? { dim: true } : { color: 'error' as const }) }],
          columns - CLOSE_CELLS,
        ),
      },
    ]
  }

  const header = headerOf(model, snapshot, columns)
  const foot = footOf(model, snapshot, columns)

  if (snapshot.branches.length === 0) {
    return [
      header,
      { key: 'empty', segments: fitSegments([{ text: `no branches besides ${sanitize(snapshot.base.name)}`, dim: true }], columns) },
      foot,
    ]
  }

  const nowSeconds = Math.floor(model.now / 1000)
  const folded = new Set<Lane>()
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

  const shown = snapshot.branches.filter(branch => !folded.has(branch.lane))
  const branchCells = branchCellsOf(shown, columns)
  const lines: Line[] = [header]

  for (const lane of Object.keys(LANE_LABELS) as Lane[]) {
    const inLane = snapshot.branches.filter(branch => branch.lane === lane)

    if (inLane.length === 0) {
      continue
    }

    if (folded.has(lane)) {
      lines.push(foldedLineOf(lane, inLane, columns))
    } else {
      lines.push(...inLane.map(branch => rowOf(branch, snapshot.base.name, columns, branchCells, nowSeconds)))
    }
  }

  lines.push(foot)

  return lines
}
