import type { Color, ThemeKey } from 'claude-code'

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
  /**
   * A theme key, which follows the person's theme; a raw color only where a
   * constant says why.
   */
  readonly color?: Color
  readonly dim?: boolean
  readonly bold?: boolean
  readonly italic?: boolean
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
  /**
   * The person's theme setting, for the base's color; null where unknown.
   */
  readonly themeSetting: string | null
}

/**
 * The band's title, leading the status line (the foot, or the compact
 * line).
 */
export function titleOf(): Segment[] {
  return [{ text: BAND_TITLE, bold: true }]
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
  IN_PROGRESS: 'uncommitted changes, a rebase under way, or a busy Claude session or a running subagent in its worktree',
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
 * few rows: the ones that need nobody's action first, the ones waiting on
 * a rebase last. The ready lane never folds whole: its head stays, in
 * landing order, and only its tail folds (`bandLinesOf`).
 */
const FOLD_ORDER: readonly Lane[] = ['CLEANUP', 'IN_PROGRESS', 'HOLD', 'STACKED', 'NEEDS_REBASE']

/**
 * From this width on a row shows every column; below it the commits ahead
 * and the comments go and the lane labels shorten; below the next, the age
 * and the details go too.
 */
export const WIDE_COLUMNS = 64
export const MEDIUM_COLUMNS = 40

/**
 * The fixed columns: the rank (` 1 `), the gap after the branch, commits
 * ahead (`   +3`) and the age of the last commit (`  25m`), the numbers
 * right-aligned, and the gap before the detail and before a comment.
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
 * With comments shown, the most of what the row leaves after the branch
 * that the detail column may take, and the least a comment column is worth:
 * below it, the comments go.
 */
const DETAIL_SHARE = 0.6
const DETAIL_MIN_CELLS = 6
const COMMENT_MIN_CELLS = 16

/**
 * The comment column's name, which the header must show where the column
 * starts: before the controls at the header's end.
 */
const COMMENT_NAME = 'COMMENT'

/**
 * The base branch's color in the status line, by the person's theme
 * setting. A dark theme gets xterm's orange 208, the one the owner's own
 * status line names the branch with, so the two agree (6.9:1 on #1e1e1e).
 * On white 208 reads 2.4:1 (seen live in the light theme, the band's one
 * color under 4.4:1), so a light theme gets 130, a darker orange (4.7:1).
 * Where the background is unknown (`auto`, which follows the terminal, a
 * custom theme, the setting not read), 166 between them: 3.8:1 on white,
 * 4.4:1 on #1e1e1e. Raw colors: no theme key is an orange that reads on
 * white (Claude's own `claude` is 3.2:1 there), and a mod cannot learn
 * which theme `auto` chose.
 *
 * @param themeSetting the theme setting, `/config`'s `theme` row
 * @returns the color
 */
export function baseColorOf(themeSetting: string | null): string {
  if (themeSetting?.startsWith('dark') === true) {
    return '#ff8700'
  }

  return themeSetting?.startsWith('light') === true ? '#af5f00' : '#d75f00'
}

/**
 * What marks a comment as Claude's words: the mark Claude Code draws its
 * own lines with (`✻ Crunched for 7s`), in Claude's color.
 */
const COMMENT_MARK: Segment = { text: '✻ ', color: 'claude' }

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
  readonly hasDetail: boolean
  /**
   * The detail column's cells when a comment column follows it; 0 when the
   * detail takes the rest of the row.
   */
  readonly detail: number
  /**
   * The comment column's cells; 0 when no comment is shown.
   */
  readonly comment: number
}

/**
 * Sizes the queue's columns to the band and the branches it shows. A
 * comment column comes only on a wide band, while a row shown has a
 * comment; the detail column is then as wide as its longest, up to its
 * share, and the comment takes the rest. The comment column reaches the
 * row's end, under the header's controls: it is at least wide enough for
 * its name to start before them, the detail giving up cells for that, and
 * goes when the detail would be left too few.
 *
 * @param columns the cells a row may take
 * @param names the branches' names, sanitized
 * @param details the cells each shown branch's detail takes
 * @param isCommented whether a branch shown has a comment
 * @param reserved the cells the controls take at the header's end
 * @returns the columns
 */
export function tableColumnsOf(
  columns: number,
  names: readonly string[],
  details: readonly number[] = [],
  isCommented = false,
  reserved = 0,
): TableColumns {
  const shortLabel = Math.max(...Object.values(SHORT_LANE_LABELS).map(label => label.length))
  const longest = Math.max(BRANCH_MIN_CELLS, ...names.map(cellWidth))
  const fit = (left: number, share: number): number => Math.max(Math.min(longest, Math.floor(left * share)), 1)

  if (columns >= WIDE_COLUMNS) {
    const lane = Math.max(...Object.values(LANE_LABELS).map(label => label.length))
    const left = columns - RANK_CELLS - GAP_CELLS - lane - AHEAD_CELLS - AGE_CELLS - GAP_CELLS

    const branch = fit(left, BRANCH_SHARE.wide)
    const rest = left - branch
    const least = Math.max(COMMENT_MIN_CELLS, reserved + COMMENT_NAME.length)
    const detail = Math.min(Math.max(DETAIL_MIN_CELLS, ...details), Math.floor(rest * DETAIL_SHARE), rest - GAP_CELLS - least)
    const comment = rest - detail - GAP_CELLS
    const isShown = isCommented && detail >= DETAIL_MIN_CELLS && comment >= least

    return {
      branch,
      lane,
      labels: LANE_LABELS,
      ahead: AHEAD_CELLS,
      age: AGE_CELLS,
      hasDetail: true,
      detail: isShown ? detail : 0,
      comment: isShown ? comment : 0,
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
      hasDetail: true,
      detail: 0,
      comment: 0,
    }
  }

  return {
    branch: Math.max(Math.min(longest, columns - RANK_CELLS - GAP_CELLS - shortLabel), 1),
    lane: shortLabel,
    labels: SHORT_LANE_LABELS,
    ahead: 0,
    age: 0,
    hasDetail: false,
    detail: 0,
    comment: 0,
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

  if (table.hasDetail) {
    groups.push([name(' '.repeat(GAP_CELLS)), name(table.comment > 0 ? padEnd('DETAIL', table.detail) : 'DETAIL')])
  }

  if (table.comment > 0) {
    groups.push([name(' '.repeat(GAP_CELLS)), name(COMMENT_NAME)])
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
 * What the radar reads about a row's branch beside its lane: why it is
 * there and what comes next, from the facts alone. A caller's words are the
 * comment's, never here.
 *
 * @param branch the branch
 * @param base the base branch's name
 * @returns the detail's runs, sanitized
 */
export function detailOf(branch: BranchInfo, base: string, ranks: ReadonlyMap<string, number> = new Map()): Segment[] {
  const parts: Segment[] = []
  const tree = branch.worktree
  const name = (text: string): string => sanitize(text)
  // Another branch in a detail is named with its place in the landing order
  // when it has one (`#1 feat/x`)
  const ref = (other: string): string => {
    const rank = ranks.get(other)

    return rank === undefined ? name(other) : `#${rank} ${name(other)}`
  }

  switch (branch.lane) {
    case 'READY':
      if (branch.dependents.length > 0) {
        parts.push({ text: `${name(shortList(branch.dependents, 1))} stacked on it` })
      }

      // Ready already says it merges cleanly: the detail only adds what else
      if (branch.breaks.length > 0) {
        parts.push({ text: `forces a rebase of ${shortList(branch.breaks.map(broken => ref(broken.branch)), 1)}` })
      }

      break
    case 'NEEDS_REBASE':
      parts.push({ text: `conflicts: ${name(shortList(branch.conflicts ?? [], 1))}` })
      parts.push(
        (branch.waitsFor?.length ?? 0) > 0
          ? { text: `rebase after ${shortList((branch.waitsFor ?? []).map(ref), 1)}` }
          : { text: 'rebase due', color: 'error' },
      )
      break
    case 'STACKED':
      parts.push({ text: `lands after ${ref(branch.stackedOn ?? '')}` })
      break
    case 'IN_PROGRESS': {
      const busy = tree?.sessions.find(session => session.status !== 'idle')

      if (tree?.isRebasing) {
        parts.push({ text: 'rebasing' })
      } else if (busy?.kind === 'agent') {
        // An agent's own name is an id: its task says more, or its session
        parts.push({
          text: busy.description ? `agent: ${name(busy.description)}` : busy.parent ? `agent of ${name(busy.parent)}` : `agent ${name(busy.name)}`,
        })
      } else if (busy !== undefined) {
        parts.push({ text: `session ${name(busy.name)} ${name(busy.status)}` })
      }

      if (tree?.isBeingRemoved) {
        parts.push({ text: 'worktree being removed' })
      } else if ((tree?.dirty ?? 0) > 0) {
        parts.push({ text: `${tree?.dirty} uncommitted` })
      }

      if (branch.ahead === 0) {
        parts.push({ text: branch.isLanded ? `landed in ${name(base)}` : 'no commits yet' })
      }

      break
    }
    case 'HOLD':
      parts.push({ text: branch.hold?.reason ? name(branch.hold.reason) : 'held' })
      break
    case 'CLEANUP':
      if (branch.isLanded || tree === null) {
        parts.push({ text: branch.isLanded ? `landed in ${name(base)}` : `nothing beyond ${name(base)}` })
      }

      // Where it is, the snapshot says; here, that there is one to remove
      if (tree !== null) {
        parts.push({ text: tree.isBeingRemoved ? 'worktree being removed' : 'has a worktree' })
      }

      break
  }

  return parts.flatMap((part, at) => (at === 0 ? [part] : [{ text: ' · ', dim: true }, part]))
}

/**
 * A caller's comment on a row: Claude's words, as only the model calls the
 * radar's tool, marked as Claude Code marks its own lines and quoted, the
 * quote cut inside its marks to fit.
 *
 * @param branch the branch
 * @param cells the cells the comment may take
 * @returns the comment's runs, sanitized; none without a comment or room
 */
export function commentOf(branch: BranchInfo, cells: number): Segment[] {
  const marks = cellWidth(COMMENT_MARK.text) + 2
  const text = branch.comment === null ? '' : sanitize(branch.comment)

  if (text === '' || cells <= marks) {
    return []
  }

  return [COMMENT_MARK, { text: `“${truncateEnd(text, cells - marks)}”`, color: 'inactive', italic: true }]
}

/**
 * One branch's row.
 *
 * @param branch the branch
 * @param base the base branch's name
 * @param table the queue's columns
 * @param columns the cells the row may take
 * @param nowSeconds now, in seconds since the epoch
 * @param ranks the landing order's places, by branch
 * @returns the row
 */
export function rowOf(
  branch: BranchInfo,
  base: string,
  table: TableColumns,
  columns: number,
  nowSeconds: number,
  ranks: ReadonlyMap<string, number> = new Map(),
): Line {
  // A branch out of the landing order has no place in it: a dim dash
  const rank = branch.rank === null ? '-' : String(branch.rank)
  const segments: Segment[] = [
    { text: rank.padStart(RANK_CELLS - 1).padEnd(RANK_CELLS), bold: branch.rank !== null, dim: branch.rank === null },
    { text: padEnd(truncateMiddle(sanitize(branch.name), table.branch), table.branch) },
    { text: ' '.repeat(GAP_CELLS) },
    { text: padEnd(table.labels[branch.lane], table.lane), color: LANE_COLORS[branch.lane] },
  ]

  if (table.ahead > 0) {
    segments.push({ text: (branch.ahead > 0 ? `+${branch.ahead}` : '').padStart(table.ahead) })
  }

  // The age of a branch with work of its own, beside what it has ahead
  if (table.age > 0) {
    segments.push({ text: (branch.ahead > 0 ? ageOf(nowSeconds - branch.lastCommitAt) : '').padStart(table.age) })
  }

  if (table.hasDetail) {
    const detail = detailOf(branch, base, ranks)

    segments.push({ text: ' '.repeat(GAP_CELLS) })

    if (table.comment > 0) {
      const fitted = fitSegments(detail, table.detail)

      segments.push(...fitted, { text: ' '.repeat(table.detail - lineWidthOf({ key: '', segments: fitted }) + GAP_CELLS) })
      segments.push(...commentOf(branch, table.comment))
    } else {
      segments.push(...detail)
    }
  }

  return { key: `row:${branch.name}`, segments: fitSegments(segments, columns) }
}

/**
 * The line that stands for a folded lane, or for the rest of one whose head
 * has rows of its own: its label, how many it holds (`+` for the rest),
 * and their names.
 *
 * @param lane the lane
 * @param branches the branches the line stands for
 * @param columns the cells it may take
 * @param isRest whether rows above show the lane's first branches
 */
function foldedLineOf(lane: Lane, branches: readonly BranchInfo[], columns: number, isRest = false): Line {
  return {
    key: `fold:${lane}`,
    segments: fitSegments(
      [
        { text: '   ' },
        { text: `${LANE_LABELS[lane]} (${isRest ? '+' : ''}${branches.length}): `, color: LANE_COLORS[lane] },
        { text: sanitize(branches.map(branch => branch.name).join(', ')), dim: true },
      ],
      columns,
    ),
  }
}

/**
 * Where the radar looks: the repository and the base everything lands on.
 */
function placeOf(model: BandModel, snapshot: Snapshot): Segment[] {
  return [
    { text: sanitize(nameOf(snapshot.repo || model.root)) },
    { text: ' ' },
    { text: `[${sanitize(snapshot.base.name)}]`, color: baseColorOf(model.themeSetting) },
  ]
}

/**
 * What lands next: the branch ranked #1, or that nothing is ready.
 */
function nextOf(snapshot: Snapshot): Segment[] {
  return snapshot.next === null
    ? [{ text: 'nothing ready to land', dim: true }]
    : [{ text: 'land next → ', dim: true }, { text: sanitize(snapshot.next), color: 'success', bold: true }]
}

/**
 * Joins groups of runs with a dim ` · `, leaving out empty ones.
 */
function joined(groups: readonly (readonly Segment[])[]): Segment[] {
  return groups
    .filter(group => group.length > 0)
    .flatMap((group, at) => (at === 0 ? [...group] : [{ text: ' · ', dim: true }, ...group]))
}

/**
 * The first of several layouts that fits whole, else the last cut to fit:
 * a line that gives up its least needed parts first.
 */
function firstFitting(layouts: readonly (readonly Segment[])[], cells: number): Segment[] {
  const fitting = layouts.find(layout => lineWidthOf({ key: '', segments: layout }) <= cells)

  return fitting === undefined ? fitSegments(layouts[layouts.length - 1] ?? [], cells) : [...fitting]
}

/**
 * The top line when there is no queue to show: the help's heading, the
 * read under way, or why there is none; compact, the whole band in a line.
 */
function headerOf(model: BandModel, snapshot: Snapshot | null, columns: number): Line {
  const room = headerRoomOf(model, columns)

  if (model.isHelpShown) {
    return { key: 'header', segments: fitSegments([{ text: 'Help', bold: true }, { text: ' · what each part of the band means', dim: true }], room) }
  }

  if (snapshot === null) {
    const repo = sanitize(nameOf(model.root))

    return {
      key: 'header',
      segments: fitSegments(
        joined([
          titleOf(),
          model.problem === null ? [{ text: `reading ${repo}…`, dim: true }] : [{ text: sanitize(model.problem), color: 'error' }],
        ]),
        room,
      ),
    }
  }

  // Compact, the band is this line, read as the foot's status line is
  const failed: Segment[] = model.problem === null ? [] : [{ text: 'last read failed', color: 'error' }]

  return { key: 'header', segments: firstFitting(statusLayoutsOf(model, snapshot, failed), room) }
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
 * What each lane holds, in lane order: `3 ready`, `1 stacked`; with the
 * short labels, `2 rebase`, `1 wip`.
 */
function countsOf(snapshot: Snapshot, labels: Readonly<Record<Lane, string>> = LANE_LABELS): Segment[] {
  return (Object.keys(labels) as Lane[]).flatMap((lane, at, lanes) => {
    const count = snapshot.branches.filter(branch => branch.lane === lane).length
    const isFirst = lanes.slice(0, at).every(earlier => !snapshot.branches.some(branch => branch.lane === earlier))

    return count === 0
      ? []
      : [...(isFirst ? [] : [{ text: ' · ', dim: true }]), { text: `${count} ${labels[lane]}`, color: LANE_COLORS[lane] }]
  })
}

/**
 * The status line's layouts, fullest first: the title, the place, the
 * counts and what lands next; then the counts in short labels, then without
 * the title, without the place, without the counts.
 */
function statusLayoutsOf(model: BandModel, snapshot: Snapshot, after: readonly Segment[]): Segment[][] {
  const place = placeOf(model, snapshot)
  const counts = countsOf(snapshot)
  const short = countsOf(snapshot, SHORT_LANE_LABELS)
  const next = nextOf(snapshot)

  return [
    joined([titleOf(), place, counts, next, after]),
    joined([titleOf(), place, short, next, after]),
    joined([place, short, next, after]),
    joined([short, next, after]),
    joined([next, after]),
  ]
}

/**
 * Cells between the foot's left part and its messages, at the least, and
 * the fewest cells a message is shown in.
 */
const FOOT_GAP_CELLS = 3
const FOOT_MESSAGE_MIN_CELLS = 10

/**
 * How many of the status line's fullest layouts a message may push the
 * line down through: the long labels and the title, not the place.
 */
const MESSAGE_OUTRANKS = 3

/**
 * The foot, a status line read left to right: the radar, where it looks,
 * what each lane holds, what lands next. Its right end is for messages: a
 * caller's line, then what to know (who works in the main worktree and
 * what is uncommitted there, sessions unknown, a failed read). A narrow band gives up the messages,
 * then the long lane labels, the title, the place and the
 * counts, before what lands next.
 */
function footOf(model: BandModel, snapshot: Snapshot, columns: number): Line {
  const layouts = statusLayoutsOf(model, snapshot, [])
  const messages = joined(messagesOf(model, snapshot).map(message => [message]))
  const messageCells = lineWidthOf({ key: '', segments: messages })
  const widthOf = (segments: readonly Segment[]) => lineWidthOf({ key: '', segments })
  // A message is worth the long labels and the title, never the place, the
  // counts or what lands next: past those it is cut
  const roomy = layouts
    .slice(0, MESSAGE_OUTRANKS)
    .find(layout => messageCells > 0 && widthOf(layout) + FOOT_GAP_CELLS + messageCells <= columns)
  const left = roomy ?? firstFitting(layouts, columns)
  const leftCells = widthOf(left)
  const room = columns - leftCells - FOOT_GAP_CELLS
  const shown = room >= FOOT_MESSAGE_MIN_CELLS ? fitSegments(messages, room) : []
  const shownCells = widthOf(shown)

  return {
    key: 'foot',
    segments: shownCells === 0 ? left : [...left, { text: ' '.repeat(columns - leftCells - shownCells) }, ...shown],
  }
}

/**
 * The messages at the foot's right end: a caller's line first, then what
 * to know.
 */
function messagesOf(model: BandModel, snapshot: Snapshot): Segment[] {
  const dirty = snapshot.base.mainWorktreeDirty ?? 0
  const sessions = snapshot.base.mainWorktreeSessions
  const messages: Segment[] = []

  if (model.status !== null && model.status !== '') {
    messages.push({ text: sanitize(model.status), color: 'remember' })
  }

  // Who works in the main worktree, then what is uncommitted there: work
  // that shows on no branch's row
  const main = [
    ...(sessions.length === 1 ? [`session ${sanitize(sessions[0]?.name ?? '')}`] : []),
    ...(sessions.length > 1 ? [`${sessions.length} sessions`] : []),
    ...(dirty > 0 ? [`${dirty} uncommitted`] : []),
  ]

  if (main.length > 0) {
    messages.push({ text: `main worktree: ${main.join(', ')}`, color: 'warning' })
  }

  if (!snapshot.areSessionsKnown) {
    messages.push({ text: 'sessions unknown', dim: true })
  }

  if (model.problem !== null) {
    messages.push({ text: `last read failed: ${sanitize(model.problem)}`, color: 'error' })
  }

  return messages
}

function nameOf(path: string): string {
  const parts = path.split(/[\\/]/).filter(part => part !== '')

  return parts[parts.length - 1] ?? path
}

/**
 * Lays the band out: the header, a row per branch, and the foot, in at most
 * `maxRows` lines. When rows run short, lanes fold into a line each
 * (`FOLD_ORDER`), then the ready lane's tail folds behind its head, then
 * what still does not fit is cut from the bottom: the foot always stays,
 * its counts naming every lane. Past `maxRows`, Claude Code cuts the band's
 * bottom itself, and the foot with it.
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
    return [headerOf(model, null, columns)]
  }

  const header = headerOf(model, snapshot, columns)

  if (model.isCompact) {
    return [header]
  }
  if (snapshot.branches.length === 0) {
    return [
      {
        key: 'empty',
        segments: fitSegments([{ text: `no branches besides ${sanitize(snapshot.base.name)}`, dim: true }], headerRoomOf(model, columns)),
      },
      footOf(model, snapshot, columns),
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

  // The ready lane keeps its head, in landing order; a tail of two or more
  // folds into one line after it
  const ready = snapshot.branches.filter(branch => branch.lane === 'READY')
  const over = rowsWith() - room
  const trimmed = over > 0 ? Math.max(ready.length - over - 1, 1) : ready.length
  const head = ready.length - trimmed >= 2 ? trimmed : ready.length
  const rest = ready.slice(head)

  const ranks = new Map(snapshot.branches.flatMap(branch => (branch.rank === null ? [] : [[branch.name, branch.rank] as const])))
  const shown = snapshot.branches.filter(branch => !folded.has(branch.lane) && !rest.includes(branch))
  const table = tableColumnsOf(
    columns,
    shown.map(branch => sanitize(branch.name)),
    shown.map(branch => lineWidthOf({ key: '', segments: detailOf(branch, snapshot.base.name, ranks) })),
    shown.some(branch => branch.comment !== null && branch.comment !== ''),
    columns - headerRoomOf(model, columns),
  )
  const body: Line[] = []

  for (const lane of Object.keys(LANE_LABELS) as Lane[]) {
    const inLane = snapshot.branches.filter(branch => branch.lane === lane)

    if (inLane.length === 0) {
      continue
    }

    if (folded.has(lane)) {
      body.push(foldedLineOf(lane, inLane, columns))
    } else {
      body.push(
        ...inLane.filter(branch => !rest.includes(branch)).map(branch => rowOf(branch, snapshot.base.name, table, columns, nowSeconds, ranks)),
      )

      if (lane === 'READY' && rest.length > 0) {
        body.push(foldedLineOf(lane, rest, columns, true))
      }
    }
  }

  // Still too many: the lanes lowest in the order go, the foot stays
  return [columnHeaderOf(table, headerRoomOf(model, columns)), ...body.slice(0, room), foot]
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
  /**
   * A mark drawn before the term, in its own style (a comment's ✻).
   */
  readonly mark?: Segment
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
        {
          term: { text: '1 2 3', bold: true },
          meaning:
            'the order to land the ready branches in: stack parents first, then whichever forces the least rebase work on the others, then whichever finished first. A branch with - in place of a number cannot land yet: its lane and detail say why',
        },
        { term: { text: '+3' }, meaning: `commits the branch has that ${onto} lacks` },
        { term: { text: '5m' }, meaning: 'since its last commit' },
        { term: { text: 'rebase due', color: 'error' }, meaning: 'rebase it now: nothing that lands before it still conflicts with it' },
        { term: { text: 'rebase after #2 X' }, meaning: 'X lands first and conflicts with it too; a rebase now would have to be done again' },
        { term: { text: 'lands after #1 X' }, meaning: 'stacked on X: it lands once X has landed' },
        { term: { text: 'forces a rebase of X' }, meaning: 'landing this branch makes X conflict' },
        { term: { text: 'X stacked on it' }, meaning: 'X holds this branch: this one lands first' },
        { term: { text: `landed in ${onto}` }, meaning: `its work reached ${onto}: through a merge, or a fast-forward its reflog shows` },
        {
          mark: COMMENT_MARK,
          term: { text: '“handed back”', color: 'inactive', italic: true },
          meaning: 'a comment: words Claude left on the branch through the radar\'s tool, shown until the branch moves, or, kept, until it lands. The details beside it are the radar\'s own',
        },
      ],
    },
    {
      title: 'Status line',
      entries: [
        { term: { text: `repo [${onto}]` }, meaning: `the repository, and the base branch everything lands on` },
        { term: { text: '3 ready · 1 stacked' }, meaning: 'how many branches each lane holds' },
        { term: { text: 'land next → X' }, meaning: 'the branch ranked #1' },
        { term: { text: 'at the right' }, meaning: 'messages: a skill\'s line, uncommitted files in the main worktree, a failed read' },
      ],
    },
    {
      title: 'Controls',
      entries: [
        { term: { text: 'h' }, meaning: 'this help, and back; the band takes keys after ctrl+x tab or a click' },
        { term: { text: 'c' }, meaning: 'folds the radar into its status line: the counts, then what lands next' },
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
      const marked: Segment[] = [{ text: '  ' }, ...(entry.mark === undefined ? [] : [entry.mark]), entry.term]
      const term = fitSegments(marked, Math.max(columns, 1))

      if (isSideBySide) {
        const cells = lineWidthOf({ key: '', segments: term })

        wrapWords(entry.meaning, columns - TERM_CELLS).forEach((text, at) => {
          lines.push({
            key: `${key}:${at}`,
            segments: fitSegments(
              [...(at === 0 ? [...term, { text: ' '.repeat(Math.max(TERM_CELLS - cells, 0)) }] : [{ text: ' '.repeat(TERM_CELLS) }]), { text, dim: true }],
              columns,
            ),
          })
        })

        continue
      }

      lines.push({ key, segments: term })
      wrapWords(entry.meaning, Math.max(columns - 4, 1)).forEach((text, at) => {
        lines.push({ key: `${key}:${at}`, segments: fitSegments([{ text: '    ' }, { text, dim: true }], columns) })
      })
    }
  })

  return lines
}
