import type { BranchInfo, Snapshot, WakeEvent } from '../types'

import { shortList } from './analysis'
import { ACTIVE_STATES } from './sessions'

/**
 * What changed between two reads, as events a caller can be woken by.
 */

export const WAKE_EVENTS: readonly WakeEvent[] = [
  'ready',
  'conflict',
  'rebase-due',
  'stacked',
  'cleanup',
  'base-moved',
  'session-idle',
]

export type RadarEvent = {
  readonly kind: WakeEvent
  /**
   * What it is about: a branch, the base, or a session; with the tip it
   * happened at, so one change is reported once.
   */
  readonly key: string
  readonly text: string
  readonly branch: BranchInfo | null
}

/**
 * The events between two reads of the same repository. The first read has
 * none: what stands when the radar opens is in the snapshot, not news.
 *
 * @param before the previous read, or null
 * @param after the new read
 * @returns the events, the base's first, then by the new read's order
 */
export function eventsOf(before: Snapshot | null, after: Snapshot): RadarEvent[] {
  if (before === null || before.repo !== after.repo || before.base.name !== after.base.name) {
    return []
  }

  const base = after.base.name
  const events: RadarEvent[] = []
  const old = new Map(before.branches.map(branch => [branch.name, branch]))

  if (before.base.sha !== after.base.sha) {
    events.push({
      kind: 'base-moved',
      key: `base-moved:${base}:${after.base.sha}`,
      text: `${base} moved ${before.base.sha.slice(0, 7)}→${after.base.sha.slice(0, 7)}`,
      branch: null,
    })
  }

  for (const branch of after.branches) {
    const was = old.get(branch.name)
    const tip = `${branch.name}:${branch.sha}`

    if (branch.lane === 'READY' && was?.lane !== 'READY') {
      events.push({ kind: 'ready', key: `ready:${tip}`, text: `${branch.name} is ready to land (#${branch.rank})`, branch })
    }

    if (branch.lane === 'NEEDS_REBASE' && was?.lane !== 'NEEDS_REBASE') {
      events.push({
        kind: 'conflict',
        key: `conflict:${tip}`,
        text: `${branch.name} conflicts with ${base} (${shortList(branch.conflicts ?? [], 2)})`,
        branch,
      })
    }

    if (branch.isRebaseDue && !(was?.isRebaseDue === true && was.sha === branch.sha)) {
      events.push({
        kind: 'rebase-due',
        key: `rebase-due:${tip}`,
        text: `${branch.name} is due a rebase onto ${base} (conflicts in ${shortList(branch.conflicts ?? [], 2)}; nothing ahead of it)`,
        branch,
      })
    }

    if (branch.lane === 'STACKED' && was?.lane !== 'STACKED') {
      events.push({
        kind: 'stacked',
        key: `stacked:${tip}`,
        text: `${branch.name} is stacked on ${branch.stackedOn ?? 'another branch'}`,
        branch,
      })
    }

    // A branch made a moment ago has no commits yet either: only one that
    // had work and now has none is done
    if (branch.lane === 'CLEANUP' && was !== undefined && was.lane !== 'CLEANUP') {
      events.push({
        kind: 'cleanup',
        key: `cleanup:${tip}`,
        text: branch.isLanded ? `${branch.name} landed in ${base}` : `${branch.name} has nothing left to land`,
        branch,
      })
    }

    const busy = new Map((was?.worktree?.sessions ?? []).map(session => [session.id, session]))
    const here = new Set((branch.worktree?.sessions ?? []).map(session => session.id))

    // An agent that was at work and is gone has finished: its worktree's
    // lock went with it
    for (const prior of busy.values()) {
      if (prior.kind === 'agent' && ACTIVE_STATES.has(prior.status) && !here.has(prior.id)) {
        events.push({
          kind: 'session-idle',
          key: `session-idle:${prior.id}:${branch.sha}`,
          text: `agent ${prior.name} on ${branch.name} finished`,
          branch,
        })
      }
    }

    for (const session of branch.worktree?.sessions ?? []) {
      const prior = busy.get(session.id)

      if (prior !== undefined && ACTIVE_STATES.has(prior.status) && !ACTIVE_STATES.has(session.status)) {
        events.push({
          kind: 'session-idle',
          key: `session-idle:${session.id}:${branch.sha}`,
          text: `session ${session.name} on ${branch.name} went ${session.status}`,
          branch,
        })
      }
    }
  }

  return events
}

/**
 * The one line that wakes the session.
 *
 * @param events the events it is woken for, at least one
 * @returns the prompt's text
 */
export function wakeTextOf(events: readonly RadarEvent[]): string {
  return `worktree-radar: ${events.map(event => event.text).join(' · ')}`
}

/**
 * Keeps the marks of branches found due a rebase while they are being
 * rebased: a mark stays while its branch is in progress or still needs the
 * rebase, and a branch due now gets one at its tip.
 *
 * @param marks the marks so far
 * @param snapshot the new read
 * @returns the marks to keep
 */
export function dueMarksOf(marks: Readonly<Record<string, string>>, snapshot: Snapshot): Record<string, string> {
  const kept: Record<string, string> = {}

  for (const branch of snapshot.branches) {
    if (branch.isRebaseDue) {
      kept[branch.name] = branch.sha
    } else if (marks[branch.name] !== undefined && (branch.lane === 'IN_PROGRESS' || branch.lane === 'NEEDS_REBASE')) {
      kept[branch.name] = marks[branch.name] as string
    }
  }

  return kept
}

/**
 * Parses the wake events a caller asked for, dropping unknown ones.
 *
 * @param value what the caller sent
 * @returns the events, each once, in `WAKE_EVENTS` order
 */
export function wakeEventsOf(value: unknown): WakeEvent[] {
  const asked = new Set(Array.isArray(value) ? value.filter(item => typeof item === 'string') : [])

  return WAKE_EVENTS.filter(event => asked.has(event))
}
