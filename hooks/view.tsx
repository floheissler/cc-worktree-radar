import type { ElementTable, RenderElement } from 'claude-code'

import type { Control, Frame, Line, Segment } from './rows'

/**
 * The elements the band draws with, from the table `$.ui.resolve(e)` hands
 * the render hook: the band is raised on the terminal and the desktop.
 */
export type Ui = Pick<ElementTable<'terminal' | 'desktop'>, 'Box' | 'Text' | 'Button'>

/**
 * What the band's controls do, by their keys.
 */
export type BandActions = Readonly<Record<Control['key'], () => void>>

/**
 * The frame's look: rounded, in the color of the prompt's own border, so
 * the band reads as a panel of Claude Code's.
 */
export const FRAME_STYLE = { borderStyle: 'round', borderColor: 'promptBorder', paddingX: 1 } as const

/**
 * Cells a wide band keeps its text from its sides: the frame's border and
 * padding. The status line under the frame, and the compact line with no
 * frame, keep as many, so every line starts where the table's does.
 */
const INSET = FRAME_STYLE.paddingX + 1

/**
 * Draws the band's lines, one row each, with the controls (`h: help`,
 * `c: compact`, `x: exit`) after the first. On a wide band the lines sit in
 * a frame and the status line (`foot`) under it, so the two read apart
 * without a rule between them; compact, the band is its one line with no
 * frame, an empty row above it keeping it apart from what Claude Code draws
 * there (the spinner, a tip) as the frame's top edge does. A narrow band has
 * no frame: the lines follow one another.
 *
 * @param ui the surface's elements
 * @param lines the lines, laid out by `bandLinesOf` for the frame's room
 * @param columns the cells the band's tree is laid out in, frame included
 * @param frame the frame, from `frameOf`
 * @param isCompact whether the band is its compact line
 * @param controls the first line's controls, from `controlsOf`
 * @param actions what the controls do
 * @returns the band's tree
 */
export function bandView(
  ui: Ui,
  lines: readonly Line[],
  columns: number,
  frame: Frame,
  isCompact: boolean,
  controls: readonly Control[],
  actions: BandActions,
): RenderElement {
  const { Box, Text, Button } = ui
  const runs = (segments: readonly Segment[]) =>
    segments.map((segment, part) => (
      <Text
        key={`${part}`}
        {...(segment.color === undefined ? {} : { color: segment.color })}
        {...(segment.dim ? { dimColor: true } : {})}
        {...(segment.bold ? { bold: true } : {})}
        {...(segment.italic ? { italic: true } : {})}
      >
        {segment.text}
      </Text>
    ))
  const rowOf = (line: Line, isFirst: boolean) => (
    <Box key={line.key} flexDirection="row" width={frame.columns}>
      <Box flexGrow={1} flexShrink={1}>
        <Text wrap="truncate-end">{runs(line.segments)}</Text>
      </Box>
      {isFirst ? (
        <Box flexDirection="row" flexShrink={0} columnGap={1} marginLeft={1}>
          {controls.map(control => (
            <Button
              key={control.key}
              label={control.label}
              hotkey={control.hotkey}
              plain
              dimColor
              {...(control.key === 'exit' ? { role: 'dismiss' as const } : {})}
              onPress={actions[control.key]}
            />
          ))}
        </Box>
      ) : null}
    </Box>
  )

  if (!frame.isFramed) {
    return (
      <Box flexDirection="column" width={columns} marginTop={isCompact ? 1 : 0}>
        {lines.map((line, at) => rowOf(line, at === 0))}
      </Box>
    )
  }

  const panel = lines.filter(line => line.key !== 'foot')
  const foot = lines.find(line => line.key === 'foot')

  return (
    <Box flexDirection="column" width={columns}>
      {isCompact ? (
        <Box key="line" flexDirection="column" width={columns} paddingX={INSET} marginTop={1}>
          {panel.map((line, at) => rowOf(line, at === 0))}
        </Box>
      ) : (
        <Box key="frame" flexDirection="column" width={columns} {...FRAME_STYLE}>
          {panel.map((line, at) => rowOf(line, at === 0))}
        </Box>
      )}
      {foot === undefined ? null : (
        <Box key="status" flexDirection="column" width={columns} paddingX={INSET}>
          {rowOf(foot, false)}
        </Box>
      )}
    </Box>
  )
}
