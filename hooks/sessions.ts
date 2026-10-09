import type { SessionInfo } from '../types'

/**
 * Which Claude Code session works where, from `claude agents --json`.
 */

/**
 * The states in which a session is still at work on its branch.
 */
export const ACTIVE_STATES: ReadonlySet<string> = new Set(['busy', 'waiting', 'working', 'blocked'])

export const SESSIONS_ARGV = ['claude', 'agents', '--json'] as const

export type SessionRow = SessionInfo & {
  readonly cwd: string
}

/**
 * Parses what `claude agents --json` wrote: one row per session on the
 * machine, with its folder and state.
 *
 * @param stdout what the CLI wrote
 * @returns the sessions with a folder, or null where the output is not a list
 */
export function parseSessions(stdout: string): SessionRow[] | null {
  let rows: unknown

  try {
    rows = JSON.parse(stdout === '' ? '[]' : stdout)
  } catch {
    return null
  }

  if (!Array.isArray(rows)) {
    return null
  }

  const sessions: SessionRow[] = []

  for (const row of rows) {
    if (row === null || typeof row !== 'object') {
      continue
    }

    const fields = row as Record<string, unknown>
    const cwd = fields['cwd']

    if (typeof cwd !== 'string' || cwd === '') {
      continue
    }

    const id = [fields['sessionId'], fields['id'], fields['name']].find(value => typeof value === 'string')
    const name = typeof fields['name'] === 'string' ? fields['name'] : (id as string | undefined)
    const status = [fields['status'], fields['state']].find(value => typeof value === 'string')

    sessions.push({ id: String(id ?? cwd), name: String(name ?? 'session'), status: String(status ?? 'unknown'), cwd })
  }

  return sessions
}

/**
 * A folder spelled for comparing: `/`-separated, no trailing separator,
 * and a Windows drive path folded to lower case.
 *
 * @param path a folder
 * @returns its comparable spelling
 */
export function folderKeyOf(path: string): string {
  const slashed = path.replaceAll('\\', '/').replace(/\/+$/, '')

  return /^[A-Za-z]:\//.test(slashed) ? slashed.toLowerCase() : slashed
}

/**
 * Attaches each session to the deepest worktree holding its folder: linked
 * worktrees often live inside the main one (`.claude/worktrees/<name>`).
 *
 * @param worktreePaths the worktrees' folders
 * @param sessions the sessions
 * @returns the sessions of each worktree, by the worktree's folder as given
 */
export function sessionsByWorktree(
  worktreePaths: readonly string[],
  sessions: readonly SessionRow[],
): Map<string, SessionInfo[]> {
  const byDepth = [...worktreePaths].sort((a, b) => folderKeyOf(b).length - folderKeyOf(a).length)
  const attached = new Map<string, SessionInfo[]>(worktreePaths.map(path => [path, []]))

  for (const session of sessions) {
    const cwd = folderKeyOf(session.cwd)
    const home = byDepth.find(path => {
      const root = folderKeyOf(path)

      return cwd === root || cwd.startsWith(`${root}/`)
    })

    if (home !== undefined) {
      attached.get(home)?.push({ id: session.id, name: session.name, status: session.status })
    }
  }

  return attached
}
