import type { ElementTable, RenderElement } from 'claude-code'

import type { Frame, Line } from './rows'

/**
 * The elements the band draws with, from the table `$.ui.resolve(e)` hands
 * the render hook: the band is raised on the terminal and the desktop.
 */
export type Ui = Pick<ElementTable<'terminal' | 'desktop'>, 'Box' | 'Text' | 'Button'>

export const CLOSE_KEY = 'close'
export const HELP_KEY = 'help'

/**
 * What the band's controls do.
 */
export type BandActions = {
  readonly toggleHelp: () => void
  readonly close: () => void
}

/**
 * The frame's look: rounded, in the color of the prompt's own border, so
 * the band reads as a panel of Claude Code's.
 */
export const FRAME_STYLE = { borderStyle: 'round', borderColor: 'promptBorder', paddingX: 1 } as const

/**
 * Draws the band's lines, one row each, with the help toggle (hotkey `h`)
 * and the close mark after the header, framed when the band is wide enough.
 *
 * @param ui the surface's elements
 * @param lines the lines, laid out by `bandLinesOf` for the frame's room
 * @param columns the cells the band's tree is laid out in, frame included
 * @param frame the frame, from `frameOf`
 * @param isHelpShown whether the lines are the help
 * @param actions what the controls do
 * @returns the band's tree
 */
export function bandView(
  ui: Ui,
  lines: readonly Line[],
  columns: number,
  frame: Frame,
  isHelpShown: boolean,
  actions: BandActions,
): RenderElement {
  const { Box, Text, Button } = ui

  return (
    <Box flexDirection="column" width={columns} {...(frame.isFramed ? FRAME_STYLE : {})}>
      {lines.map((line, at) => (
        <Box key={line.key} flexDirection="row" width={frame.columns}>
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate-end">
              {line.segments.map((segment, part) => (
                <Text
                  key={`${part}`}
                  {...(segment.color === undefined ? {} : { color: segment.color })}
                  {...(segment.dim ? { dimColor: true } : {})}
                  {...(segment.bold ? { bold: true } : {})}
                >
                  {segment.text}
                </Text>
              ))}
            </Text>
          </Box>
          {at === 0 ? (
            <Box flexDirection="row" flexShrink={0} columnGap={1} marginLeft={1}>
              <Button
                key={HELP_KEY}
                label={isHelpShown ? 'back' : 'help'}
                hotkey="h"
                plain
                dimColor
                onPress={actions.toggleHelp}
              />
              <Button key={CLOSE_KEY} label="×" plain role="dismiss" onPress={actions.close} />
            </Box>
          ) : null}
        </Box>
      ))}
    </Box>
  )
}
