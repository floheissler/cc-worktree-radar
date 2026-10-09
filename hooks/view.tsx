import type { ElementTable, RenderElement } from 'claude-code'

import type { Line } from './rows'

/**
 * The elements the band draws with, from the table `$.ui.resolve(e)` hands
 * the render hook: the band is raised on the terminal and the desktop.
 */
export type Ui = Pick<ElementTable<'terminal' | 'desktop'>, 'Box' | 'Text' | 'Button'>

export const CLOSE_KEY = 'close'

/**
 * Draws the band's lines, one row each, with a close mark after the header.
 *
 * @param ui the surface's elements
 * @param lines the lines, laid out by `bandLinesOf`
 * @param columns the cells the band's tree is laid out in
 * @param onClose closes the radar
 * @returns the band's tree
 */
export function bandView(ui: Ui, lines: readonly Line[], columns: number, onClose: () => void): RenderElement {
  const { Box, Text, Button } = ui

  return (
    <Box flexDirection="column" width={columns}>
      {lines.map((line, at) => (
        <Box key={line.key} flexDirection="row" width={columns}>
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
          {at === 0 ? <Button key={CLOSE_KEY} label="×" plain role="dismiss" onPress={onClose} /> : null}
        </Box>
      ))}
    </Box>
  )
}
