import { describe, expect, test } from 'claude-code/testing'

import { baseOf, countStatus, displayPathOf, parseHeads, parseWorktrees, type Head } from '../hooks/repo'
import { folderKeyOf, parseSessions, sessionsByWorktree } from '../hooks/sessions'

const head = (sha: string): Head => ({ sha, committedAt: 1, upstream: null })

describe('git output', () => {
  test('reads branches with their tip, time and upstream', () => {
    const line = (...fields: string[]) => fields.join('\u0000')
    const heads = parseHeads(`${line('refs/heads/main', 'aaa', '100', 'origin/main')}\n${line('refs/heads/feat/x', 'bbb', '200', '')}\n`)

    expect([...heads]).toEqual([
      ['main', { sha: 'aaa', committedAt: 100, upstream: 'origin/main' }],
      ['feat/x', { sha: 'bbb', committedAt: 200, upstream: null }],
    ])
  })

  test('reads worktrees, detached and prunable ones too', () => {
    const blocks = parseWorktrees(
      [
        'worktree /work\nHEAD aaa\nbranch refs/heads/main',
        'worktree /work/.claude/worktrees/x\nHEAD bbb\ndetached',
        'worktree /gone\nHEAD ccc\nbranch refs/heads/feat/gone\nprunable gitdir file points to non-existent location',
        '',
      ].join('\n\n'),
    )

    expect(blocks).toEqual([
      { path: '/work', branch: 'main', isDetached: false, isPrunable: false },
      { path: '/work/.claude/worktrees/x', branch: null, isDetached: true, isPrunable: false },
      { path: '/gone', branch: 'feat/gone', isDetached: false, isPrunable: true },
    ])
  })

  test('picks the base: asked for, else the remote default, else main, else master', () => {
    const heads = new Map([
      ['master', head('a')],
      ['develop', head('b')],
      ['trunk', head('c')],
    ])

    expect(baseOf(heads, null, 'develop')).toBe('develop')
    expect(baseOf(heads, null, 'nope')).toBeNull()
    expect(baseOf(heads, 'origin/trunk', null)).toBe('trunk')
    expect(baseOf(heads, 'origin/gone', null)).toBe('master')
    expect(baseOf(new Map([['x', head('a')]]), null, null)).toBeNull()
  })

  test('counts status lines and shows worktree paths from the main one', () => {
    expect(countStatus(' M a\n?? b\n')).toBe(2)
    expect(countStatus('')).toBe(0)
    expect(displayPathOf('/work', '/work/.claude/worktrees/x')).toBe('.claude/worktrees/x')
    expect(displayPathOf('/work', '/work')).toBe('.')
    expect(displayPathOf('/work', '/elsewhere/x')).toBe('/elsewhere/x')
    expect(displayPathOf('/work', '/work-other')).toBe('/work-other')
  })
})

describe('sessions', () => {
  const listed = JSON.stringify([
    { pid: 1, cwd: '/work/.claude/worktrees/x/src', sessionId: 's1', name: 'x-worker', status: 'busy', state: 'working' },
    { pid: 2, cwd: '/work', sessionId: 's2', name: 'coordinator', status: 'idle' },
    { pid: 3, cwd: '/elsewhere', sessionId: 's3', name: 'other', status: 'idle' },
    { pid: 4, kind: 'background' },
  ])

  test('reads claude agents --json, and nothing from what is not a list', () => {
    expect(parseSessions(listed)?.map(session => [session.id, session.name, session.status])).toEqual([
      ['s1', 'x-worker', 'busy'],
      ['s2', 'coordinator', 'idle'],
      ['s3', 'other', 'idle'],
    ])
    expect(parseSessions('not json')).toBeNull()
    expect(parseSessions('{}')).toBeNull()
    expect(parseSessions('')).toEqual([])
  })

  test('attaches each session to the deepest worktree holding its folder', () => {
    const attached = sessionsByWorktree(['/work', '/work/.claude/worktrees/x'], parseSessions(listed) ?? [])

    expect(attached.get('/work/.claude/worktrees/x')?.map(session => session.name)).toEqual(['x-worker'])
    expect(attached.get('/work')?.map(session => session.name)).toEqual(['coordinator'])
  })

  test('compares Windows folders by drive and separators, not by spelling', () => {
    expect(folderKeyOf('C:\\Users\\Flo\\repo\\')).toBe('c:/users/flo/repo')
    expect(folderKeyOf('/Work/Repo/')).toBe('/Work/Repo')

    const attached = sessionsByWorktree(
      ['C:/Users/Flo/repo'],
      [{ id: 'a', name: 'w', status: 'busy', cwd: 'c:\\users\\flo\\repo\\src' }],
    )

    expect(attached.get('C:/Users/Flo/repo')).toHaveLength(1)
  })
})
