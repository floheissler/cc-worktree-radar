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
 * Draws the band's lines, one row each, with the controls (`h: help`,
 * `c: compact`, `x: exit`) after the first, framed when the band is wide
 * enough.
 *
 * @param ui the surface's elements
 * @param lines the lines, laid out by `bandLinesOf` for the frame's room
 * @param columns the cells the band's tree is laid out in, frame included
 * @param frame the frame, from `frameOf`
 * @param controls the first line's controls, from `controlsOf`
 * @param actions what the controls do
 * @returns the band's tree
 */
export function bandView(
  ui: Ui,
  lines: readonly Line[],
  columns: number,
  frame: Frame,
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

  return (
    <Box flexDirection="column" width={columns} {...(frame.isFramed ? FRAME_STYLE : {})}>
      {lines.map((line, at) => (
        <Box key={line.key} flexDirection="row" width={frame.columns}>
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate-end">{runs(line.segments)}</Text>
          </Box>
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
