import type { Timer } from 'claude-code'

import type { Hold, RadarConfig } from '../types'

import { readSnapshot } from './analysis'
import { dueMarksOf, eventsOf, wakeTextOf, type RadarEvent } from './changes'
import { gitOf, type Git } from './git'
import type { Host } from './host'
import Limits from './limits'
import { HEADS_FORMAT, parseWorktrees, placeOf } from './repo'
import { folderKeyOf, parseSessions, SESSIONS_ARGV, type SessionRow } from './sessions'
import { clipChars, sanitize } from './text'

/**
 * The radar at work while it is open: the polls that notice a change, the
 * reads that follow it, and what a read tells the session.
 *
 * A poll is cheap (the branch tips, the worktree list, the sessions); a read
 * runs every simulated merge, so it runs only once a change has settled, one
 * at a time. The band redraws from the state each read writes.
 */

/**
 * The store key prefix of a repository's holds; the repository's shared
 * `.git` folder follows, so every worktree of it sees the same holds.
 */
export const HOLDS_KEY_PREFIX = 'holds:'

/**
 * How long a read may stand before the radar reads again with no change
 * seen: uncommitted changes and branch ages move without a ref moving.
 */
export const REFRESH_MS = 60_000

/**
 * Polls between two listings of the sessions; the polls between reuse the
 * last list.
 */
export const SESSIONS_EVERY = 2

export function holdsKeyOf(commonDir: string): string {
  return `${HOLDS_KEY_PREFIX}${folderKeyOf(commonDir)}`
}

/**
 * The holds a store value holds, each checked: what the store holds is
 * untrusted.
 *
 * @param value what the store answered
 * @returns the holds by branch
 */
export function holdsIn(value: unknown): Record<string, Hold> {
  const holds: Record<string, Hold> = {}

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return holds
  }

  for (const [branch, hold] of Object.entries(value as Record<string, unknown>)) {
    const fields = hold as Record<string, unknown> | null

    if (fields !== null && typeof fields === 'object' && typeof fields['reason'] === 'string' && typeof fields['at'] === 'number') {
      holds[branch] = { reason: fields['reason'], at: fields['at'] }
    }
  }

  return holds
}

/**
 * What a poll saw: one string that changes when anything the lanes depend
 * on moved, and the sessions it listed on the way.
 */
type Probe = {
  readonly fingerprint: string
  readonly sessions: SessionRow[] | null
}

export type Radar = {
  /**
   * Starts the polls for the open radar, and reads at once.
   */
  readonly start: (host: Host) => Promise<void>
  /**
   * Stops the polls; a read under way is dropped.
   */
  readonly stop: () => void
  /**
   * Reads now, after any read under way.
   */
  readonly readNow: (host: Host) => Promise<void>
  /**
   * Holds a branch with a reason, or lets go of it with null.
   *
   * @returns null, or why not
   */
  readonly setHold: (host: Host, root: string, branch: string, reason: string | null) => Promise<string | null>
  /**
   * Notes a branch's current tip, or clears the note with an empty text.
   *
   * @returns null, or why not
   */
  readonly setNote: (host: Host, root: string, branch: string, text: string) => Promise<string | null>
  /**
   * When the polls last checked the repository, in milliseconds since the
   * epoch; 0 while stopped.
   */
  readonly lastCheckAt: () => number
}

/**
 * Lists the machine's Claude sessions.
 *
 * @param host the engine's calls
 * @returns the sessions, or null where `claude agents --json` failed
 */
async function sessionsOf(host: Host): Promise<SessionRow[] | null> {
  try {
    const out = await host.run(SESSIONS_ARGV, { timeoutMs: Limits.SESSIONS_TIMEOUT_MS })

    return out.exitCode === 0 ? parseSessions(out.stdout) : null
  } catch {
    return null
  }
}

/**
 * Takes the cheap fingerprint of a repository.
 *
 * @param host the engine's calls
 * @param git git, bound to the radar's folder
 * @param listed the sessions listed a moment ago, to skip listing them again
 * @returns the fingerprint, or null where git failed
 */
async function probeOf(host: Host, git: Git, listed?: SessionRow[] | null): Promise<Probe | null> {
  const [heads, trees, sessions] = await Promise.all([
    git(['for-each-ref', `--format=${HEADS_FORMAT}`, 'refs/heads']),
    git(['worktree', 'list', '--porcelain']),
    listed === undefined ? sessionsOf(host) : Promise.resolve(listed),
  ])

  if (heads === null || trees === null) {
    return null
  }

  const roots = parseWorktrees(trees.stdout).map(tree => folderKeyOf(tree.path))
  const here = (sessions ?? [])
    .filter(session => roots.some(root => folderKeyOf(session.cwd) === root || folderKeyOf(session.cwd).startsWith(`${root}/`)))
    .map(session => `${session.id}:${session.status}:${folderKeyOf(session.cwd)}`)
    .sort()

  return { fingerprint: [heads.stdout, trees.stdout, sessions === null ? '?' : here.join('\n')].join('\0'), sessions }
}

/**
 * Makes the radar of one session. Its timers and reads are the module's: a
 * reload of the module starts them over, from the state the host kept.
 *
 * @returns the radar
 */
export function createRadar(): Radar {
  let generation = 0
  let timer: Timer | null = null
  let shownFingerprint: string | null = null
  let pendingFingerprint: string | null = null
  let lastReadAt = 0
  let lastCheckAt = 0
  let ticks = 0
  let lastSessions: SessionRow[] | null | undefined
  let running: Promise<void> | null = null
  let queued: Promise<void> | null = null
  const commonDirs = new Map<string, string>()
  const reported = new Set<string>()

  const schedule = (host: Host, at: number, ms: number): void => {
    timer?.cancel()
    timer = host.after(ms, () => {
      void tick(host, at).catch(() => schedule(host, at, host.options.pollMs))
    })
  }

  const holdsFor = async (host: Host, git: Git, root: string): Promise<Record<string, Hold>> => {
    let commonDir = commonDirs.get(root)

    if (commonDir === undefined) {
      commonDir = (await placeOf(git))?.commonDir

      if (commonDir === undefined) {
        return {}
      }

      commonDirs.set(root, commonDir)
    }

    return holdsIn(await host.store.get(holdsKeyOf(commonDir)).catch(() => undefined))
  }

  const announce = async (host: Host, radar: RadarConfig, events: readonly RadarEvent[]): Promise<void> => {
    const fresh = events.filter(event => !reported.has(event.key))

    for (const event of fresh) {
      reported.add(event.key)
    }

    const wake = fresh.filter(event => radar.wake.includes(event.kind))

    if (wake.length > 0) {
      await host.submit(wakeTextOf(wake)).catch(() => undefined)
    }

    const ready = fresh.filter(event => event.kind === 'ready')

    if (host.options.notifyReady && ready.length > 0) {
      const text = ready.map(event => `${event.branch?.name ?? ''} is ready to land (#${event.branch?.rank ?? '?'})`).join(' · ')

      await host.notify(sanitize(text)).catch(() => undefined)
    }
  }

  const read = async (host: Host): Promise<void> => {
    const at = generation
    const radar = await host.state.radar.get()

    if (radar === null) {
      return
    }

    const git = gitOf(host.run, radar.root)
    const probe = await probeOf(host, git)

    lastSessions = probe?.sessions
    const [holds, notes, dueMarks, now] = await Promise.all([
      holdsFor(host, git, radar.root),
      host.state.notes.get(),
      host.state.dueMarks.get(),
      host.now(),
    ])
    const result = await readSnapshot({
      git,
      readText: host.readText,
      sessions: probe?.sessions ?? null,
      holds,
      notes,
      dueMarks,
      base: radar.base,
      now,
    })

    if (at !== generation) {
      return
    }

    lastReadAt = now
    lastCheckAt = now

    if (result.problem !== undefined) {
      await host.state.problem.set(() => result.problem)

      return
    }

    commonDirs.set(radar.root, result.commonDir)
    shownFingerprint = probe?.fingerprint ?? null

    const before = await host.state.snapshot.get()

    await host.state.snapshot.set(() => result.snapshot)
    await host.state.problem.set(() => null)
    await host.state.dueMarks.set(marks => dueMarksOf(marks, result.snapshot))
    await announce(host, radar, eventsOf(before, result.snapshot))
  }

  const readNow = (host: Host): Promise<void> => {
    if (queued !== null) {
      return queued
    }

    const runRead = (): Promise<void> => {
      running = read(host).finally(() => {
        running = null
      })

      return running
    }

    if (running === null) {
      return runRead()
    }

    queued = running
      .catch(() => undefined)
      .then(() => {
        queued = null

        return runRead()
      })

    return queued
  }

  const tick = async (host: Host, at: number): Promise<void> => {
    if (at !== generation) {
      return
    }

    const radar = await host.state.radar.get()

    if (radar === null) {
      return
    }

    // Listing the sessions starts the claude CLI: every other poll is enough
    ticks += 1

    const probe = await probeOf(host, gitOf(host.run, radar.root), ticks % SESSIONS_EVERY === 0 ? undefined : lastSessions)
    const now = await host.now()

    lastCheckAt = now

    lastSessions = probe?.sessions

    if (at !== generation) {
      return
    }

    if (probe !== null && probe.fingerprint !== shownFingerprint) {
      // A change reads once it stands still: a commit, a rebase or a
      // checkout moves several refs in a row
      if (probe.fingerprint !== pendingFingerprint) {
        pendingFingerprint = probe.fingerprint
        schedule(host, at, Limits.SETTLE_MS)

        return
      }

      pendingFingerprint = null
      await readNow(host)
    } else if (now - lastReadAt >= REFRESH_MS) {
      await readNow(host)
    } else {
      // Ages move on between reads
      host.invalidate()
    }

    schedule(host, at, host.options.pollMs)
  }

  return {
    start: async host => {
      generation += 1
      shownFingerprint = null
      pendingFingerprint = null

      const at = generation

      await readNow(host)

      if (at === generation) {
        schedule(host, at, host.options.pollMs)
      }
    },
    stop: () => {
      generation += 1
      lastCheckAt = 0
      timer?.cancel()
      timer = null
      shownFingerprint = null
      pendingFingerprint = null
    },
    readNow,
    lastCheckAt: () => lastCheckAt,
    setHold: async (host, root, branch, reason) => {
      const git = gitOf(host.run, root)
      const place = await placeOf(git)

      if (place === null) {
        return 'not in a git repository'
      }

      if (reason !== null && (await git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])) === null) {
        return `no branch named ${branch}`
      }

      const key = holdsKeyOf(place.commonDir)
      const holds = holdsIn(await host.store.get(key).catch(() => undefined))

      if (reason === null) {
        delete holds[branch]
      } else {
        holds[branch] = { reason: clipChars(reason.trim(), Limits.REASON_CHARS), at: await host.now() }
      }

      await host.store.set(key, holds)

      return null
    },
    setNote: async (host, root, branch, text) => {
      const tip = await gitOf(host.run, root)(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])

      if (tip === null) {
        return `no branch named ${branch}`
      }

      const sha = tip.stdout.trim()
      const kept = clipChars(text.trim(), Limits.NOTE_CHARS)

      await host.state.notes.set(notes => {
        const next = { ...notes }

        if (kept === '') {
          delete next[branch]
        } else {
          next[branch] = { sha, text: kept }
        }

        return next
      })

      return null
    },
  }
}
