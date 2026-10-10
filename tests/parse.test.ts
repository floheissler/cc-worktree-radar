import { describe, expect, test } from 'claude-code/testing'

import { baseOf, countStatus, displayPathOf, isDeletionOnly, ownWorkOf, parseHeads, parseWorktrees, type Head } from '../hooks/repo'
import { agentsByWorktree, claudeLockOf, folderKeyOf, parseSessions, sessionsByWorktree } from '../hooks/sessions'

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
      { path: '/work', branch: 'main', isDetached: false, isPrunable: false, lock: null },
      { path: '/work/.claude/worktrees/x', branch: null, isDetached: true, isPrunable: false, lock: null },
      { path: '/gone', branch: 'feat/gone', isDetached: false, isPrunable: true, lock: null },
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

  test('tells a worktree being deleted from one with changes', () => {
    // Tracked files gone; untracked ones a deleted .gitignore uncovers
    expect(isDeletionOnly(' D .github/ci.yml\n D .gitignore\n?? node_modules/\n')).toBe(true)
    expect(isDeletionOnly(' D README.md\n')).toBe(true)

    // Anything changed, staged or only added is work
    for (const status of ['', '?? new.txt\n', ' D a\n M b\n', 'D  a\n', ' D a\nA  b\n']) {
      expect(isDeletionOnly(status)).toBe(false)
    }
  })
})

describe('a branch\'s own work, by its reflog', () => {
  // As git 2.53 wrote them, newest first (`%H%x00%gs`, shas shortened)
  const reflog = (...entries: string[]) => entries.map(entry => entry.replace(' ', '\u0000')).join('\n') + '\n'

  test('the newest commit it made itself, carried on by a rebase', () => {
    expect(ownWorkOf(reflog('78e5500 commit: a2', 'ab83293 commit: a1', '34f3a76 branch: Created from HEAD'))).toBe('78e5500')
    expect(ownWorkOf(reflog('0f2f5e2 commit (amend): b1x', '8bb2697 commit: b1', '78e5500 branch: Created from HEAD'))).toBe('0f2f5e2')
    expect(
      ownWorkOf(reflog('851760d rebase (finish): refs/heads/rebased onto 6ad5234', '2ff0de6 commit: r1', '0f2f5e2 branch: Created from HEAD')),
    ).toBe('851760d')
    expect(ownWorkOf(reflog('7772fd3 cherry-pick: base3', '6ad5234 branch: Created from main~2'))).toBe('7772fd3')
    expect(ownWorkOf(reflog('3ee58c2 revert: Revert "base3"', 'a6beb6f branch: Created from HEAD'))).toBe('3ee58c2')
    expect(ownWorkOf(reflog('099c7b9 am: base3', '851760d branch: Created from main~1'))).toBe('099c7b9')
    // Work later thrown away is still its latest: whether it is in the base
    // tells landed from abandoned
    expect(ownWorkOf(reflog('851760d reset: moving to main', '1743f99 commit: z1', '851760d branch: Created from HEAD'))).toBe('1743f99')
  })

  test('none for a branch that only ever followed others', () => {
    expect(ownWorkOf(reflog('34f3a76 branch: Created from main'))).toBeNull()
    expect(ownWorkOf(reflog('851760d merge main: Fast-forward', '0f2f5e2 branch: Created from main~2'))).toBeNull()
    // A rebase or a merge commit with nothing of its own before it
    expect(ownWorkOf(reflog('aa11bb2 rebase (finish): refs/heads/x onto 6ad5234', '0f2f5e2 branch: Created from main'))).toBeNull()
    expect(ownWorkOf(reflog('cc33dd4 commit (merge): Merge branch \'main\'', '0f2f5e2 branch: Created from main'))).toBeNull()
    expect(ownWorkOf('')).toBeNull()
  })
})

describe('worktree locks', () => {
  test('reads a lock and its reason', () => {
    const [agent, bare] = parseWorktrees(
      'worktree /a\nHEAD aaa\nbranch refs/heads/x\nlocked claude agent agent-abc (pid 42 start 7)\n\nworktree /b\nHEAD bbb\nbranch refs/heads/y\nlocked\n\n',
    )

    expect([agent?.lock, bare?.lock]).toEqual(['claude agent agent-abc (pid 42 start 7)', ''])
  })

  test('knows Claude Code\'s own locks from any other', () => {
    expect(claudeLockOf('claude agent agent-abc (pid 42 start 7)')).toEqual({ kind: 'agent', name: 'agent-abc', pid: 42 })
    expect(claudeLockOf('claude session mock-a (pid 9 start 1)')).toEqual({ kind: 'session', name: 'mock-a', pid: 9 })
    // Without the start time, where Claude Code cannot read it
    expect(claudeLockOf('claude session mock-a (pid 9)')).toEqual({ kind: 'session', name: 'mock-a', pid: 9 })

    for (const other of ['', 'on a USB stick', 'claude agent agent-abc', null]) {
      expect(claudeLockOf(other)).toBeNull()
    }
  })

  test('attaches an agent to the worktree locked for it while it runs', () => {
    const trees = [
      { path: '/w/agent', lock: 'claude agent agent-abc (pid 42 start 7)' },
      { path: '/w/session', lock: 'claude session mock (pid 42 start 7)' },
      { path: '/w/plain', lock: null },
    ]
    const sessions = [{ id: 's', name: 'coordinator', status: 'busy', kind: 'session' as const, cwd: '/w', pid: 42 }]
    const running = { id: 'abc', name: 'worker', description: 'Fix the totals', status: 'running' }

    expect([...agentsByWorktree(trees, sessions, [running])]).toEqual([
      ['/w/agent', [{ id: 'abc', name: 'worker', status: 'running', kind: 'agent', description: 'Fix the totals', parent: 'coordinator' }]],
    ])
    expect(agentsByWorktree(trees, sessions, [{ ...running, status: 'killed' }]).size).toBe(0)
    // Another session's agent needs its session's process listed
    expect(agentsByWorktree(trees, [], []).size).toBe(0)
    expect(agentsByWorktree(trees, null, []).size).toBe(0)
    // Its own agent is known without the listing
    expect(agentsByWorktree(trees, null, [running]).get('/w/agent')?.[0]).toMatchObject({ status: 'running', parent: null })
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
    expect(parseSessions(listed)?.map(session => [session.id, session.name, session.status, session.pid])).toEqual([
      ['s1', 'x-worker', 'busy', 1],
      ['s2', 'coordinator', 'idle', 2],
      ['s3', 'other', 'idle', 3],
    ])
    expect(parseSessions('not json')).toBeNull()
    expect(parseSessions('{}')).toBeNull()
    expect(parseSessions('')).toEqual([])
  })

  test('attaches each session to the deepest worktree holding its folder', () => {
    const attached = sessionsByWorktree(
      [
        { path: '/work', lock: null },
        { path: '/work/.claude/worktrees/x', lock: null },
      ],
      parseSessions(listed) ?? [],
    )

    expect(attached.get('/work/.claude/worktrees/x')?.map(session => session.name)).toEqual(['x-worker'])
    expect(attached.get('/work')?.map(session => session.name)).toEqual(['coordinator'])
  })

  test('attaches a session to the worktree locked for its process, wherever the CLI places it', () => {
    // Seen live: a background job that moved into a worktree, listed in the
    // folder it started from
    const trees = [
      { path: '/work', lock: null },
      { path: '/work/.claude/worktrees/x', lock: null },
      { path: '/work/.claude/worktrees/y', lock: 'claude session y (pid 2 start 5)' },
      { path: '/work/.claude/worktrees/z', lock: 'claude session z (pid 99)' },
    ]
    const attached = sessionsByWorktree(trees, parseSessions(listed) ?? [])

    expect(attached.get('/work/.claude/worktrees/y')?.map(session => session.name)).toEqual(['coordinator'])
    expect(attached.get('/work')).toEqual([])
    // A lock names no session whose process is not listed
    expect(attached.get('/work/.claude/worktrees/z')).toEqual([])
    // An agent's lock is not the session's own
    const agent = sessionsByWorktree(
      [{ path: '/work', lock: null }, { path: '/w/a', lock: 'claude agent agent-1 (pid 2 start 5)' }],
      parseSessions(listed) ?? [],
    )

    expect(agent.get('/work')?.map(session => session.name)).toEqual(['x-worker', 'coordinator'])
  })

  test('compares Windows folders by drive and separators, not by spelling', () => {
    expect(folderKeyOf('C:\\Users\\Flo\\repo\\')).toBe('c:/users/flo/repo')
    expect(folderKeyOf('/Work/Repo/')).toBe('/Work/Repo')

    const attached = sessionsByWorktree(
      [{ path: 'C:/Users/Flo/repo', lock: null }],
      [{ id: 'a', name: 'w', status: 'busy', kind: 'session', cwd: 'c:\\users\\flo\\repo\\src', pid: 1 }],
    )

    expect(attached.get('C:/Users/Flo/repo')).toHaveLength(1)
  })
})
