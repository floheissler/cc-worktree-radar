import { describe, expect, test } from 'claude-code/testing'

import { commandRequestOf } from '../hooks/command'
import { toolJsonOf, toolRequestOf } from '../hooks/tool'

describe('/radar arguments', () => {
  test('toggle, close, a base, hold and unhold', () => {
    expect(commandRequestOf('')).toEqual({ kind: 'toggle' })
    expect(commandRequestOf('  off ')).toEqual({ kind: 'close' })
    expect(commandRequestOf('develop')).toEqual({ kind: 'open', base: 'develop' })
    expect(commandRequestOf('hold feat/x waiting for the API')).toEqual({
      kind: 'hold',
      branch: 'feat/x',
      reason: 'waiting for the API',
    })
    expect(commandRequestOf('unhold feat/x')).toEqual({ kind: 'unhold', branch: 'feat/x' })
    expect(commandRequestOf('hold')).toEqual({ kind: 'usage' })
    expect(commandRequestOf('two words')).toEqual({ kind: 'usage' })
  })
})

describe('the radar tool', () => {
  test('reads each action, and refuses what it cannot read', () => {
    expect(toolRequestOf({ action: 'open', wake: ['ready', 'bogus', 'rebase-due', 'ready'] })).toEqual({
      action: 'open',
      base: null,
      wake: ['ready', 'rebase-due'],
    })
    expect(toolRequestOf({ action: 'open', base: ' main ' })).toMatchObject({ base: 'main', wake: [] })
    expect(toolRequestOf({ action: 'hold', branch: 'feat/x', reason: 'r' })).toEqual({
      action: 'hold',
      branch: 'feat/x',
      reason: 'r',
    })
    expect(toolRequestOf({ action: 'note', branch: 'feat/x' })).toEqual({ action: 'note', branch: 'feat/x', text: '' })
    expect(toolRequestOf({ action: 'unhold' })).toEqual({ error: 'unhold needs a branch' })
    expect(toolRequestOf({ action: 'merge' })).toHaveProperty('error')
  })

  test('answers the snapshot without file lists', () => {
    const json = JSON.parse(
      toolJsonOf({
        schema: 1,
        repo: '/work',
        base: { name: 'main', sha: 'a', upstream: null, mainWorktreeBranch: 'main', mainWorktreeDirty: 0 },
        areSessionsKnown: true,
        next: null,
        takenAt: 0,
        branches: [
          {
            name: 'feat/x',
            sha: 'b',
            lane: 'READY',
            rank: 1,
            ahead: 1,
            behind: 0,
            files: ['a', 'b'],
            insertions: 1,
            deletions: 0,
            lastCommitAt: 0,
            upstream: null,
            conflicts: [],
            stackedOn: null,
            dependents: [],
            sharesWith: [],
            breaks: [],
            rebaseCost: 0,
            waitsFor: null,
            isRebaseDue: false,
            hold: null,
            note: null,
            worktree: null,
            summary: 'merges cleanly into main',
          },
        ],
      }),
    )

    expect(json.branches[0].files).toBeUndefined()
    expect(json.branches[0].fileCount).toBe(2)
    expect(json.schema).toBe(1)
  })
})
