import { describe, expect, test } from 'claude-code/testing'

import Limits from '../hooks/limits'
import { droppedKeysOf, savedKeyOf, savedRadarIn } from '../hooks/saved'

describe('a saved radar', () => {
  test('is keyed by the session it was left in', () => {
    expect(savedKeyOf('7fa0052c-5838-43ab-974a-9c9e0fc62324')).toBe('resume:7fa0052c-5838-43ab-974a-9c9e0fc62324')
  })

  test('reads back what was saved', () => {
    const saved = {
      radar: { root: '/work', base: 'develop', wake: ['ready', 'rebase-due'] },
      compact: true,
      status: 'release v0.4.1 pending',
      notes: { 'feat/a': { sha: 'abc', text: 'handed back to b-7c' } },
      dueMarks: { 'feat/b': 'def' },
      savedAt: 1_800_000_000_000,
    }

    expect(savedRadarIn(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
  })

  test('checks every field: what the store holds is untrusted', () => {
    expect(
      savedRadarIn({
        radar: { root: '/work', base: '', wake: ['ready', 'bogus', 7] },
        compact: 'yes',
        status: 42,
        notes: { 'feat/a': { sha: 'abc' }, 'feat/b': 'text', 'feat/c': { sha: 'c', text: 'x'.repeat(500) } },
        dueMarks: { 'feat/a': 'abc', 'feat/b': 1 },
      }),
    ).toEqual({
      radar: { root: '/work', base: null, wake: ['ready'] },
      compact: false,
      status: null,
      notes: { 'feat/c': { sha: 'c', text: `${'x'.repeat(Limits.NOTE_CHARS - 1)}…` } },
      dueMarks: { 'feat/a': 'abc' },
      savedAt: 0,
    })
  })

  test('is nothing without a folder to watch', () => {
    for (const value of [undefined, null, 'radar', [], {}, { radar: null }, { radar: { root: '' } }, { radar: { root: 7 } }]) {
      expect(savedRadarIn(value)).toBeNull()
    }
  })
})

describe('the sessions saved longest ago', () => {
  test('are dropped past the limit, the newest kept', () => {
    const saved = [
      { key: 'resume:b', savedAt: 2 },
      { key: 'resume:d', savedAt: 4 },
      { key: 'resume:a', savedAt: 1 },
      { key: 'resume:c', savedAt: 3 },
    ]

    expect(droppedKeysOf(saved, 2)).toEqual(['resume:b', 'resume:a'])
    expect(droppedKeysOf(saved, 4)).toEqual([])
    expect(droppedKeysOf(saved, 0)).toHaveLength(4)
  })
})
