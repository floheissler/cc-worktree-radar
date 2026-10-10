import type { CallerComment, RadarConfig } from '../types'

import { wakeEventsOf } from './changes'
import type { Host } from './host'
import Limits from './limits'
import { clipChars } from './text'

/**
 * The radar a session left open, kept in the store for its resume. The
 * session state does not outlive the process, and `/clear`, `/resume` and
 * `/branch` reset it; the store outlives both.
 *
 * One key per session, by its id: `claude --continue`, `claude --resume
 * <id>` and `/resume` return to a session under its own id, so its key finds
 * what it left. A new session has a new id and finds nothing.
 */

/**
 * The store key prefix of a session's radar; the session's id follows.
 */
export const SAVED_KEY_PREFIX = 'resume:'

/**
 * What a session's radar comes back as: the open radar with its caller's
 * wake list, the view, and what a caller set. The read is not kept: a
 * resumed radar reads again. Neither is the help, which is a passing look.
 */
export type SavedRadar = {
  readonly radar: RadarConfig
  readonly compact: boolean
  readonly status: string | null
  readonly comments: Readonly<Record<string, CallerComment>>
  readonly dueMarks: Readonly<Record<string, string>>
  /**
   * When it was saved, in milliseconds since the epoch.
   */
  readonly savedAt: number
}

export function savedKeyOf(sessionId: string): string {
  return `${SAVED_KEY_PREFIX}${sessionId}`
}

function fieldsOf(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function commentsIn(value: unknown): Record<string, CallerComment> {
  const comments: Record<string, CallerComment> = {}

  for (const [branch, comment] of Object.entries(fieldsOf(value) ?? {})) {
    const fields = fieldsOf(comment)

    if (fields !== null && typeof fields['sha'] === 'string' && typeof fields['text'] === 'string' && fields['text'] !== '') {
      comments[branch] = { sha: fields['sha'], text: clipChars(fields['text'], Limits.COMMENT_CHARS), isKept: fields['isKept'] === true }
    }
  }

  return comments
}

function dueMarksIn(value: unknown): Record<string, string> {
  const marks: Record<string, string> = {}

  for (const [branch, sha] of Object.entries(fieldsOf(value) ?? {})) {
    if (typeof sha === 'string') {
      marks[branch] = sha
    }
  }

  return marks
}

/**
 * The radar a store value holds, each field checked: what the store holds
 * is untrusted, and a field it lacks takes its default.
 *
 * @param value what the store answered
 * @returns the radar, or null where the value names no folder to watch
 */
export function savedRadarIn(value: unknown): SavedRadar | null {
  const fields = fieldsOf(value)
  const radar = fieldsOf(fields?.['radar'])
  const root = radar?.['root']
  const base = radar?.['base']
  const status = fields?.['status']
  const savedAt = fields?.['savedAt']

  if (fields === null || radar === null || typeof root !== 'string' || root === '') {
    return null
  }

  return {
    radar: {
      root,
      base: typeof base === 'string' && base !== '' ? base : null,
      wake: wakeEventsOf(radar['wake']),
    },
    compact: fields['compact'] === true,
    status: typeof status === 'string' && status !== '' ? clipChars(status, Limits.COMMENT_CHARS) : null,
    comments: commentsIn(fields['comments']),
    dueMarks: dueMarksIn(fields['dueMarks']),
    savedAt: typeof savedAt === 'number' && Number.isFinite(savedAt) ? savedAt : 0,
  }
}

/**
 * The keys to drop so that at most `keep` remain: the ones saved longest
 * ago.
 *
 * @param saved each key and when it was saved
 * @param keep how many to keep
 * @returns the keys to drop
 */
export function droppedKeysOf(saved: readonly { readonly key: string; readonly savedAt: number }[], keep: number): string[] {
  return [...saved]
    .sort((a, b) => b.savedAt - a.savedAt || a.key.localeCompare(b.key))
    .slice(Math.max(keep, 0))
    .map(entry => entry.key)
}

/**
 * The open radar as the session state holds it now.
 *
 * @param host the engine's calls
 * @returns the radar to save, or null while it is closed
 */
export async function savedRadarOf(host: Host): Promise<SavedRadar | null> {
  const [radar, compact, status, comments, dueMarks, savedAt] = await Promise.all([
    host.state.radar.get(),
    host.state.compact.get(),
    host.state.status.get(),
    host.state.comments.get(),
    host.state.dueMarks.get(),
    host.now(),
  ])

  return radar === null ? null : { radar, compact, status, comments, dueMarks, savedAt }
}

/**
 * Saves a session's radar under its id.
 *
 * @param host the engine's calls
 * @param sessionId the session's id
 * @param saved the radar
 */
export async function saveRadar(host: Host, sessionId: string, saved: SavedRadar): Promise<void> {
  await host.store.set(savedKeyOf(sessionId), saved)
}

/**
 * Saves the radar as the session state holds it now, if it is open.
 *
 * @param host the engine's calls
 * @param sessionId the session's id
 */
export async function keepRadar(host: Host, sessionId: string): Promise<void> {
  const saved = await savedRadarOf(host)

  if (saved !== null) {
    await saveRadar(host, sessionId, saved)
  }
}

/**
 * Drops what a session saved: its radar was closed.
 */
export async function forgetRadar(host: Host, sessionId: string): Promise<void> {
  await host.store.delete(savedKeyOf(sessionId))
}

/**
 * The radar a session left open, if any.
 *
 * @param host the engine's calls
 * @param sessionId the session's id
 * @returns the radar, or null
 */
export async function loadRadar(host: Host, sessionId: string): Promise<SavedRadar | null> {
  return savedRadarIn(await host.store.get(savedKeyOf(sessionId)))
}

/**
 * Drops the sessions saved longest ago past `SAVED_SESSIONS`, keeping the
 * one just saved: every session that ends with the radar open leaves a key,
 * and most are never resumed.
 *
 * Each session's own key keeps sessions from writing over each other. A
 * drop can still race a session saving the dropped key at that moment: that
 * session comes back closed, nothing else.
 *
 * @param host the engine's calls
 * @param sessionId the session just saved
 */
export async function pruneSaved(host: Host, sessionId: string): Promise<void> {
  const kept = savedKeyOf(sessionId)
  const others = (await host.store.keys()).filter(key => key.startsWith(SAVED_KEY_PREFIX) && key !== kept)

  if (others.length < Limits.SAVED_SESSIONS) {
    return
  }

  const saved = await Promise.all(
    others.map(async key => ({ key, savedAt: savedRadarIn(await host.store.get(key))?.savedAt ?? 0 })),
  )

  for (const dropped of droppedKeysOf(saved, Limits.SAVED_SESSIONS - 1)) {
    await host.store.delete(dropped)
  }
}
