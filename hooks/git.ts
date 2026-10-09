import type { ProcessRunInit, ProcessRunResult } from 'claude-code'

import Limits from './limits'

/**
 * Every git run the radar makes goes through one `Git`, which `gitOf` binds
 * to the engine's process call.
 */

/**
 * Set over the session's environment for every git run: a read never takes
 * a lock a commit running beside it needs (so a status never writes the
 * index), and git speaks plain C, whatever the person's language.
 */
export const GIT_ENV: Readonly<Record<string, string>> = { GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' }

/**
 * Runs a program by its argument vector, no shell; resolves once it exits.
 */
export type Run = (argv: readonly string[], init: ProcessRunInit) => Promise<ProcessRunResult>

export type GitOptions = {
  /**
   * Where git runs; the folder `gitOf` was bound to when left out.
   */
  readonly cwd?: string
  /**
   * Set over `GIT_ENV`.
   */
  readonly env?: Readonly<Record<string, string>>
  /**
   * The exit codes that count as an answer; `[0]` when left out.
   */
  readonly ok?: readonly number[]
}

export type GitOutput = {
  readonly code: number
  readonly stdout: string
}

/**
 * Runs git with its arguments, the command first.
 *
 * @returns the exit code and what git wrote, or null where it exited with
 *   another code, could not start (no git), ran out of time or wrote more
 *   than the engine reads
 */
export type Git = (args: readonly string[], options?: GitOptions) => Promise<GitOutput | null>

/**
 * Binds git to the engine's process call and a folder.
 *
 * @param run the engine's process call
 * @param cwd the folder git runs in unless a call names another
 * @returns the git runner
 */
export function gitOf(run: Run, cwd: string): Git {
  return async (args, options = {}) => {
    try {
      const result = await run(['git', ...args], {
        cwd: options.cwd ?? cwd,
        env: { ...GIT_ENV, ...options.env },
        timeoutMs: Limits.GIT_TIMEOUT_MS,
      })

      if (result.isStdoutTruncated || !(options.ok ?? [0]).includes(result.exitCode)) {
        return null
      }

      return { code: result.exitCode, stdout: result.stdout }
    } catch {
      return null
    }
  }
}

/**
 * Maps items through an async function, at most `limit` at a time, keeping
 * their order.
 *
 * @param items the inputs
 * @param limit how many run at once
 * @param fn the work for one input
 * @returns the outputs, in the inputs' order
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array<R>(items.length)
  let next = 0

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const at = next

      next += 1
      out[at] = await fn(items[at] as T)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))

  return out
}
