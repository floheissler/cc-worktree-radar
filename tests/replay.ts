import type { ProcessRunInit, ProcessRunResult } from 'claude-code'

import { testPathOf } from './host'
import { RUNS } from './fixtures/repo'

export type Recorded = Readonly<Record<string, { readonly code: number; readonly stdout: string }>>

/**
 * A process result as the engine answers one.
 */
export function ran(stdout: string, exitCode = 0): ProcessRunResult {
  return { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
}

/**
 * The key a recorded git run is stored under: where it ran, then its
 * arguments.
 */
export function runKeyOf(cwd: string, args: readonly string[]): string {
  return JSON.stringify([testPathOf(cwd), ...args])
}

/**
 * Answers git from a recording, as the fixture's repository would; a run
 * not recorded fails as git does on a missing object. `claude agents`
 * answers the sessions given.
 *
 * @param runs the recording
 * @param sessions what `claude agents --json` writes; null to fail it
 * @returns the process call
 */
export function replayOf(runs: Recorded = RUNS, sessions: string | null = '[]') {
  const calls: string[] = []

  const run = async (argv: readonly string[], init: ProcessRunInit): Promise<ProcessRunResult> => {
    if (argv[0] === 'claude') {
      calls.push('claude agents')

      return sessions === null ? ran('', 1) : ran(sessions)
    }

    const key = runKeyOf(init.cwd ?? '/work', argv.slice(1))
    const recorded = runs[key]

    calls.push(key)

    if (recorded !== undefined) {
      return ran(recorded.stdout, recorded.code)
    }

    // A branch's tip, looked up as the recorded branch list has it
    const [command, verify, quiet, ref] = argv.slice(1)

    if (command === 'rev-parse' && verify === '--verify' && quiet === '--quiet' && ref?.startsWith('refs/heads/')) {
      const heads = Object.entries(runs).find(([listed]) => listed.includes('"for-each-ref"'))?.[1].stdout ?? ''
      const line = heads.split('\n').find(entry => entry.startsWith(`${ref}\u0000`))

      return line === undefined ? ran('', 1) : ran(`${line.split('\u0000')[1]}\n`)
    }

    return ran('', 128)
  }

  return { run, calls }
}
