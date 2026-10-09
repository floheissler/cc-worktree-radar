import type { Timer } from 'claude-code'

import { SWEEP_FRAMES } from './rows'

/**
 * The sweep that turns in the status line: a one-cell Raster the terminal
 * repaints on its own (`$.ui.blit`), so it turns several times a second
 * without the band being drawn again. It turns only while the radar's
 * checks run: a still sweep means the radar stalled.
 */

/**
 * Between two steps of the sweep: two turns a second.
 */
export const SWEEP_FRAME_MS = 125

/**
 * The Raster's key in the band's drawing.
 */
export const SWEEP_KEY = 'sweep'

/**
 * The sweep's color: Claude's orange, the RGB of the theme's `claude` key
 * (a Raster takes colors as RGB, never as theme keys), on the terminal's
 * own background.
 */
export const SWEEP_RGB = 0xd97757
const DEFAULT_COLOR = 0x01000000

/**
 * The cells of a one-cell Raster showing a glyph, as `RasterProps.cells`
 * encodes them: little-endian u32 triplets of code point, foreground and
 * background, in base64.
 *
 * @param glyph one width-1 character
 * @returns the encoded cell
 */
export function sweepCellsOf(glyph: string): string {
  const words = Uint32Array.of(glyph.codePointAt(0) ?? 0x20, SWEEP_RGB, DEFAULT_COLOR)
  const bytes = new Uint8Array(words.buffer)
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

/**
 * What the sweep needs of the engine.
 */
export type SweepHost = {
  readonly after: (ms: number, fn: () => void) => Timer
  /**
   * Repaints the band's sweep cell; false where it is not mounted.
   */
  readonly blit: (requestId: string, key: string, cells: string) => Promise<boolean>
  /**
   * Whether the radar's checks are running on time.
   */
  readonly isLive: () => Promise<boolean>
}

export type Sweep = {
  /**
   * The glyph the band shows now, for a drawing to start from.
   */
  readonly glyph: () => string
  /**
   * Keeps the sweep turning in a band drawn under `requestId`.
   */
  readonly ensure: (host: SweepHost, requestId: string) => void
  readonly stop: () => void
}

/**
 * Makes the sweep of one session: its timer is the module's.
 *
 * @returns the sweep
 */
export function createSweep(): Sweep {
  let frame = 0
  let generation = 0
  let site: string | null = null
  let timer: Timer | null = null

  const stop = (): void => {
    generation += 1
    timer?.cancel()
    timer = null
    site = null
  }

  const step = (host: SweepHost, at: number, requestId: string): void => {
    timer = host.after(SWEEP_FRAME_MS, () => {
      void (async () => {
        if (at !== generation) {
          return
        }

        if (await host.isLive()) {
          frame = (frame + 1) % SWEEP_FRAMES.length
        }

        const isShown = await host.blit(requestId, SWEEP_KEY, sweepCellsOf(SWEEP_FRAMES[frame] as string)).catch(() => false)

        // Unmounted (the band folded, the help shown): the next drawing with
        // a sweep starts it again
        if (at === generation && isShown) {
          step(host, at, requestId)
        } else if (at === generation) {
          stop()
        }
      })()
    })
  }

  return {
    glyph: () => SWEEP_FRAMES[frame] as string,
    ensure: (host, requestId) => {
      if (site === requestId && timer !== null) {
        return
      }

      stop()
      site = requestId
      step(host, generation, requestId)
    },
    stop,
  }
}
