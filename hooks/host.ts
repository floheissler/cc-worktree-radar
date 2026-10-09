import type { Timer } from 'claude-code'

import type { CallerNote, RadarConfig, Snapshot } from '../types'

import type { Run } from './git'

/**
 * One value of the radar's session state: read it, or write it from its
 * current value, which redraws the band.
 */
export type StateCell<T> = {
  readonly get: () => Promise<T>
  readonly set: (fn: (value: T) => T) => Promise<void>
}

/**
 * The radar's session state, value by value (`PluginState['worktree-radar']`).
 */
export type RadarState = {
  readonly radar: StateCell<RadarConfig | null>
  readonly snapshot: StateCell<Snapshot | null>
  readonly problem: StateCell<string | null>
  readonly notes: StateCell<Record<string, CallerNote>>
  readonly status: StateCell<string | null>
  readonly helpShown: StateCell<boolean>
  readonly dueMarks: StateCell<Record<string, string>>
}

/**
 * The person's settings for the radar (`userConfig` in plugin.json).
 */
export type RadarOptions = {
  /**
   * Raise a native notification when a branch becomes READY.
   */
  readonly notifyReady: boolean
  /**
   * Between two checks for a change, in milliseconds.
   */
  readonly pollMs: number
}

/**
 * What the radar asks of the engine, bound to one hook's `$` by `hostOf`
 * in register.tsx: every engine call the mod makes is spelled there, where
 * `claude plugin validate` reads it, and the rest of the code takes this
 * plain record instead of `$`.
 */
export type Host = {
  /**
   * The session's working folder: where the radar opens by default.
   */
  readonly cwd: () => Promise<string>
  /**
   * Runs a program by its argument vector, no shell: git, and
   * `claude agents --json` for the sessions.
   */
  readonly run: Run
  /**
   * A file's text, or null where it cannot be read.
   */
  readonly readText: (path: string) => Promise<string | null>
  /**
   * Milliseconds since the epoch.
   */
  readonly now: () => Promise<number>
  readonly after: (ms: number, fn: () => void) => Timer
  /**
   * Draws the band again from what the state holds.
   */
  readonly invalidate: () => void
  readonly toast: (text: string) => void
  /**
   * A native notification by the person's own channel.
   */
  readonly notify: (text: string) => Promise<void>
  /**
   * Queues a prompt that starts a turn once the session is idle.
   */
  readonly submit: (text: string) => Promise<void>
  /**
   * The plugin's store, kept between sessions and shared by every session on
   * the machine: the holds, per repository.
   */
  readonly store: {
    readonly get: (key: string) => Promise<unknown>
    readonly set: (key: string, value: unknown) => Promise<void>
  }
  readonly state: RadarState
  readonly options: RadarOptions
}
