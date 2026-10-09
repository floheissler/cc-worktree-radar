import type { Snapshot, WakeEvent } from '../types'

import { WAKE_EVENTS, wakeEventsOf } from './changes'

/**
 * The tool the model calls to drive the radar: its description and schema,
 * the reading of a call's input, and the JSON it answers with.
 */

export const TOOL_ACTIONS = ['open', 'close', 'snapshot', 'hold', 'unhold', 'comment', 'status'] as const

export type ToolAction = (typeof TOOL_ACTIONS)[number]

export const TOOL_DESCRIPTION = [
  'Worktree Radar: a live, read-only view of every local branch and worktree of the repository, drawn above the prompt, sorted into lanes on their way into the base branch.',
  'Lanes: READY (clean worktree, no busy session, merges cleanly; ranked, land #1 first), NEEDS_REBASE (conflicts with the base; isRebaseDue when nothing ahead of it in waitsFor still conflicts with it), STACKED (holds another open branch; land that first), IN_PROGRESS (uncommitted changes, a rebase under way, or a busy Claude session or a running subagent there; worktree.sessions lists both, kind session or agent), HOLD, CLEANUP (nothing beyond the base and no session).',
  'It never merges, rebases, tags, pushes or moves a ref.',
  'Actions: open (starts the radar for the session folder and returns the snapshot; `wake` lists events that wake this session with a one-line report, which asks for nothing: ' +
    WAKE_EVENTS.join(', ') +
    '), snapshot (reads now and returns the facts as JSON), close, hold/unhold (park a branch, with a reason), comment (a short comment shown on the branch row until its tip moves; empty text clears), status (one line under the queue; empty clears).',
].join(' ')

export const TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: [...TOOL_ACTIONS] },
    base: {
      type: 'string',
      description: 'open: the base branch. Detected when left out: origin/HEAD, else main, else master.',
    },
    wake: {
      type: 'array',
      items: { type: 'string', enum: [...WAKE_EVENTS] },
      description: 'open: the events that wake this session. None when left out.',
    },
    branch: { type: 'string', description: 'hold, unhold, comment: the branch.' },
    reason: { type: 'string', description: 'hold: why it is held.' },
    text: { type: 'string', description: "comment: the comment on the branch's current tip; status: the line under the queue. Empty clears." },
  },
  required: ['action'],
  additionalProperties: false,
} as const

/**
 * A call's input, read.
 */
export type ToolRequest =
  | { readonly action: 'open'; readonly base: string | null; readonly wake: WakeEvent[] }
  | { readonly action: 'close' | 'snapshot' }
  | { readonly action: 'hold'; readonly branch: string; readonly reason: string }
  | { readonly action: 'unhold'; readonly branch: string }
  | { readonly action: 'comment'; readonly branch: string; readonly text: string }
  | { readonly action: 'status'; readonly text: string }

function textField(input: Readonly<Record<string, unknown>>, name: string): string | null {
  const value = input[name]

  return typeof value === 'string' ? value : null
}

/**
 * Reads a call's input.
 *
 * @param input the call's arguments
 * @returns the request, or why it cannot be read
 */
export function toolRequestOf(input: Readonly<Record<string, unknown>>): ToolRequest | { readonly error: string } {
  const action = input['action']
  const branch = textField(input, 'branch')?.trim() ?? ''

  switch (action) {
    case 'open': {
      const base = textField(input, 'base')?.trim() ?? ''

      return { action, base: base === '' ? null : base, wake: wakeEventsOf(input['wake']) }
    }
    case 'close':
    case 'snapshot':
      return { action }
    case 'hold':
    case 'unhold':
    case 'comment':
      if (branch === '') {
        return { error: `${action} needs a branch` }
      }

      return action === 'hold'
        ? { action, branch, reason: textField(input, 'reason') ?? '' }
        : action === 'unhold'
          ? { action, branch }
          : { action, branch, text: textField(input, 'text') ?? '' }
    case 'status':
      return { action, text: textField(input, 'text') ?? '' }
    default:
      return { error: `action must be one of ${TOOL_ACTIONS.join(', ')}` }
  }
}

/**
 * The snapshot as the tool answers it: every fact but the branches' file
 * lists, which can run to thousands of paths; `fileCount` stands in.
 *
 * @param snapshot the radar's read
 * @returns the JSON text
 */
export function toolJsonOf(snapshot: Snapshot): string {
  return JSON.stringify({
    ...snapshot,
    branches: snapshot.branches.map(({ files, ...branch }) => ({ ...branch, fileCount: files.length })),
  })
}
