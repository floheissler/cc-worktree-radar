import type { ElementTable, RenderElement } from 'claude-code'

import type { Control, Frame, Line, Segment } from './rows'
import { SWEEP_KEY, sweepCellsOf } from './sweep'

/**
 * The elements the band draws with, from the table `$.ui.resolve(e)` hands
 * the render hook: the band is raised on the terminal and the desktop.
 */
export type Ui = Pick<ElementTable<'terminal' | 'desktop'>, 'Box' | 'Text' | 'Button'>

/**
 * The terminal's one-cell grid the sweep turns in; the desktop has none and
 * draws the glyph as text.
 */
export type RasterElement = ElementTable<'terminal'>['Raster']

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
 * Draws the band's lines, one row each, with the controls (`h: help`,
 * `c: compact`, `x: exit`) after the first, framed when the band is wide
 * enough. Framed, the divider reaches over the padding to the frame's sides:
 * Claude Code draws its border over anything laid on it, so the line meets
 * the border and does not cross it.
 *
 * @param ui the surface's elements
 * @param lines the lines, laid out by `bandLinesOf` for the frame's room
 * @param columns the cells the band's tree is laid out in, frame included
 * @param frame the frame, from `frameOf`
 * @param controls the first line's controls, from `controlsOf`
 * @param actions what the controls do
 * @param raster the terminal's Raster, for the sweep; null to draw it as text
 * @returns the band's tree
 */
export function bandView(
  ui: Ui,
  lines: readonly Line[],
  columns: number,
  frame: Frame,
  controls: readonly Control[],
  actions: BandActions,
  raster: RasterElement | null,
): RenderElement {
  const { Box, Text, Button } = ui
  const runs = (segments: readonly Segment[]) =>
    segments.map((segment, part) => (
      <Text
        key={`${part}`}
        {...(segment.color === undefined ? {} : { color: segment.color })}
        {...(segment.dim ? { dimColor: true } : {})}
        {...(segment.bold ? { bold: true } : {})}
      >
        {segment.text}
      </Text>
    ))

  // A line with the sweep draws it as its own cell, which turns by blits
  const lineView = (line: Line) => {
    const at = raster === null ? -1 : line.segments.findIndex(segment => segment.isSweep)
    const glyph = line.segments[at]

    if (raster === null || glyph === undefined) {
      return <Text wrap="truncate-end">{runs(line.segments)}</Text>
    }

    const Raster = raster

    return [
      ...(at > 0 ? [<Text key="before">{runs(line.segments.slice(0, at))}</Text>] : []),
      <Raster key={SWEEP_KEY} columns={1} rows={1} cells={sweepCellsOf(glyph.text)} />,
      <Text key="after" wrap="truncate-end">
        {runs(line.segments.slice(at + 1))}
      </Text>,
    ]
  }

  return (
    <Box flexDirection="column" width={columns} {...(frame.isFramed ? FRAME_STYLE : {})}>
      {lines.map((line, at) => (
        <Box key={line.key} flexDirection="row" width={frame.columns}>
          {frame.isFramed && line.key === 'divider' ? (
            <Box key="reach-left" position="absolute" left={-1}>
              <Text color={FRAME_STYLE.borderColor}>─</Text>
            </Box>
          ) : null}
          {frame.isFramed && line.key === 'divider' ? (
            <Box key="reach-right" position="absolute" right={-1}>
              <Text color={FRAME_STYLE.borderColor}>─</Text>
            </Box>
          ) : null}
          <Box flexGrow={1} flexShrink={1} flexDirection="row">{lineView(line)}</Box>
          {at === 0 ? (
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
      ))}
    </Box>
  )
}
