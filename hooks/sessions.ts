import type { SessionInfo } from '../types'

/**
 * Which Claude Code session works where, from `claude agents --json`, and
 * which subagent, from the lock Claude Code puts on an agent's worktree.
 */

/**
 * The states in which a session or an agent is still at work on its branch.
 */
export const ACTIVE_STATES: ReadonlySet<string> = new Set(['busy', 'waiting', 'working', 'blocked', 'running', 'pending'])

/**
 * The states of an agent that is over: its lock is stale, or about to go.
 */
const ENDED_STATES: ReadonlySet<string> = new Set(['completed', 'failed', 'killed'])

export const SESSIONS_ARGV = ['claude', 'agents', '--json'] as const

export type SessionRow = SessionInfo & {
  readonly cwd: string
  /**
   * The session's process; null where the CLI gave none.
   */
  readonly pid: number | null
}

/**
 * One agent of the session the radar runs in, as `$.agent.list()` gives it.
 */
export type AgentRow = {
  readonly id: string
  readonly name: string | null
  /**
   * The Agent call's description of the task, in a few words.
   */
  readonly description: string
  readonly status: string
}

/**
 * A worktree lock Claude Code took: `claude agent agent-<id> (pid <n> start
 * <n>)` on a subagent's worktree, `claude session <name> (pid …)` on one a
 * session works in (`claude -w`, a background job, EnterWorktree). The pid
 * is the session's process, the agent's parent's for an agent. The `start`
 * part is the process's start time, which Claude Code leaves out where it
 * cannot read it: `(pid <n>)`.
 */
export type ClaudeLock = {
  readonly kind: 'agent' | 'session'
  readonly name: string
  readonly pid: number
}

const CLAUDE_LOCK = /^claude (agent|session) (\S+) \(pid (\d+)(?: start .+)?\)$/

/**
 * Reads a worktree's lock reason as Claude Code's, if it is one.
 *
 * @param lock the reason, from `git worktree list --porcelain`
 * @returns who took it, or null for another lock or none
 */
export function claudeLockOf(lock: string | null): ClaudeLock | null {
  const match = lock === null ? null : CLAUDE_LOCK.exec(lock)

  return match === null ? null : { kind: match[1] as ClaudeLock['kind'], name: match[2] ?? '', pid: Number(match[3]) }
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
    const pid = fields['pid']

    sessions.push({
      id: String(id ?? cwd),
      name: String(name ?? 'session'),
      status: String(status ?? 'unknown'),
      kind: 'session',
      cwd,
      pid: typeof pid === 'number' && Number.isInteger(pid) ? pid : null,
    })
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
 * Attaches each session to the worktree it works in: the one Claude Code
 * locked for its process, else the deepest one holding its folder (linked
 * worktrees often live inside the main one, `.claude/worktrees/<name>`).
 * The lock comes first because `claude agents` can list a session in the
 * folder it started from after it moved into a worktree (seen live: a
 * background job listed in the main worktree, its own worktree's lock
 * naming its pid). Claude Code drops the lock when a session leaves a
 * worktree it keeps, and releases stale ones.
 *
 * @param worktrees the worktrees, with their locks
 * @param sessions the sessions
 * @returns the sessions of each worktree, by the worktree's folder as given
 */
export function sessionsByWorktree(
  worktrees: readonly { readonly path: string; readonly lock: string | null }[],
  sessions: readonly SessionRow[],
): Map<string, SessionInfo[]> {
  const byDepth = [...worktrees].sort((a, b) => folderKeyOf(b.path).length - folderKeyOf(a.path).length)
  const attached = new Map<string, SessionInfo[]>(worktrees.map(tree => [tree.path, []]))

  for (const session of sessions) {
    const cwd = folderKeyOf(session.cwd)
    const holds = (path: string): boolean => {
      const root = folderKeyOf(path)

      return cwd === root || cwd.startsWith(`${root}/`)
    }
    const locked = byDepth.filter(tree => {
      const lock = claudeLockOf(tree.lock)

      return lock?.kind === 'session' && session.pid !== null && lock.pid === session.pid
    })
    const home = locked.find(tree => holds(tree.path)) ?? locked[0] ?? byDepth.find(tree => holds(tree.path))

    if (home !== undefined) {
      attached.get(home.path)?.push({ id: session.id, name: session.name, status: session.status, kind: 'session' })
    }
  }

  return attached
}

/**
 * The subagents at work in worktrees: one for each worktree Claude Code
 * locked for an agent, while the agent runs. An agent of the radar's own
 * session is known by `$.agent.list()`, its task and state with it; another
 * session's by its lock alone, at work while that session's process is
 * listed. An agent is not seen when its lock outlives it, nor, the sessions
 * unknown, when another session runs it.
 *
 * @param worktrees the worktrees, with their locks
 * @param sessions the machine's sessions; null where they could not be listed
 * @param own the agents of the session the radar runs in
 * @returns the agents of each locked worktree, by its folder as given
 */
export function agentsByWorktree(
  worktrees: readonly { readonly path: string; readonly lock: string | null }[],
  sessions: readonly SessionRow[] | null,
  own: readonly AgentRow[],
): Map<string, SessionInfo[]> {
  const attached = new Map<string, SessionInfo[]>()

  for (const worktree of worktrees) {
    const lock = claudeLockOf(worktree.lock)

    if (lock === null || lock.kind !== 'agent') {
      continue
    }

    const id = lock.name.replace(/^agent-/, '')
    const mine = own.find(agent => agent.id === id)
    const parent = sessions?.find(session => session.pid === lock.pid) ?? null

    if (mine !== undefined ? ENDED_STATES.has(mine.status) : parent === null) {
      continue
    }

    attached.set(worktree.path, [
      {
        id,
        name: mine?.name ?? lock.name,
        status: mine?.status ?? 'running',
        kind: 'agent',
        description: mine?.description ?? null,
        parent: parent?.name ?? null,
      },
    ])
  }

  return attached
}
