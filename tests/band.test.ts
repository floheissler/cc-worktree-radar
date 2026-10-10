import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine, type MockClock } from 'claude-code/testing'

import { WAKE_NOTE } from '../hooks/changes'
import Limits from '../hooks/limits'

import { HOLDS, RUNS } from './fixtures/repo'
import { replayOf, type Recorded } from './replay'

const NOW = 1_800_000_000_000

const BAND = {
  plugin: 'worktree-radar',
  component: 'AbovePrompt',
  viewport: { columns: 140, rows: 40, isFullscreen: true },
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 30,
    bodyColumns: 135,
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const RADAR = {
  command: 'radar',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 140 },
} as const

const TOOL = 'mcp__worktree-radar__radar'

/**
 * The session the tests run in, as `$.session.id()` answers.
 */
const SESSION = 'session-a'

/**
 * A process's first `session.start` in a terminal.
 */
const START = { cwd: '/work', surface: 'terminal', isInteractive: true } as const

/**
 * A session in the fixture's repository: git answers from the recording,
 * what the radar raises (prompts, notifications) is recorded, and the store
 * is a map the test reads. A prompt the radar submits counts once the
 * session takes it: at once, or, while the test keeps the session at work
 * (`turn.start`), once that turn ends (`turn.end`).
 *
 * @param on the test's `on`
 * @param runs the recording git answers from, and what `claude agents` lists
 * @param stored what the store holds besides the fixture's hold
 */
function worldOf(
  on: On,
  runs: { current: Recorded; sessions?: string } = { current: RUNS },
  stored: Readonly<Record<string, unknown>> = {},
) {
  const clock = mock.clock(on, { now: NOW })
  const prompts: string[] = []
  let working: { readonly ended: Promise<void>; readonly end: () => void } | null = null
  const turn = {
    start: () => {
      let end = (): void => undefined
      const ended = new Promise<void>(resolve => {
        end = resolve
      })

      working = { ended, end }
    },
    end: () => {
      working?.end()
      working = null
    },
  }
  const notices: string[] = []
  const toasts: string[] = []
  // The fixture's hold, where the radar keeps holds: by the repository's
  // shared .git folder
  const store = new Map<string, unknown>(Object.entries({ 'holds:/work/.git': HOLDS, ...stored }))

  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))

    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    store.delete(e.key)

    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.id', () => ({ value: SESSION }))
  // Claude Code's own steps beneath the plugin as a session starts and ends
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('classic.SessionStart', () => ({}))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: e.name } }))
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  // Claude Code's own band beneath the plugin: empty here
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return Box({})
  })
  on('process.run', ($, e) => replay(e.argv, e.init))
  on('prompt.submit', async ($, e) => {
    await working?.ended
    prompts.push(e.text)

    return { text: e.text }
  })
  on('ui.notify', ($, e) => {
    notices.push(e.text)

    return { value: { isSent: true, channel: 'terminal_bell' } }
  })

  async function replay(argv: readonly string[], init: unknown) {
    return { value: await replayOf(runs.current, runs.sessions).run(argv, (init ?? {}) as never) }
  }

  return { clock, prompts, notices, toasts, store, turn }
}

async function settled(clock: MockClock): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) {
    await clock.settle()
  }
}

async function bandText($: Engine, surface: 'terminal' | 'desktop' = 'terminal'): Promise<string[]> {
  const ui = await $.ui.mount({ ...BAND, surface })
  const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text ?? '')

  await ui.unmount()

  return texts
}

describe('/radar', () => {
  test('opens the band on the repository, and closes it again', async ($, on) => {
    const { clock } = worldOf(on)

    expect(await bandText($)).toEqual([])

    await $.command.run(RADAR)
    await settled(clock)

    for (const surface of ['terminal', 'desktop'] as const) {
      const texts = await bandText($, surface)

      expect(texts.some(text => /^ # BRANCH +LANE/.test(text))).toBe(true)
      expect(texts.some(text => /^ 1 feat\/parent\s+ready/.test(text))).toBe(true)
      expect(texts.some(text => /^Worktree Radar · work \[main\] · 4 ready .* · land next → feat\/parent$/.test(text))).toBe(true)
    }

    await $.command.run(RADAR)
    await settled(clock)

    expect(await bandText($)).toEqual([])
  })

  test('frames the band like a panel, and drops the frame when narrow', async ($, on) => {
    const { clock } = worldOf(on)

    await $.command.run(RADAR)
    await settled(clock)

    for (const surface of ['terminal', 'desktop'] as const) {
      const wide = await $.ui.mount({ ...BAND, surface })
      const frame = await wide.find({ key: 'frame' })
      const status = await wide.find({ key: 'status' })

      // The table in the frame, the status line under it, lined up with the
      // table's text
      expect(frame).toMatchObject({ type: 'Box', props: { borderStyle: 'round', borderColor: 'promptBorder', paddingX: 1, width: 135 } })
      expect(frame?.text).toMatch(/feat\/parent/)
      expect(frame?.text).not.toMatch(/land next/)
      expect(status).toMatchObject({ type: 'Box', props: { paddingX: 2, width: 135 } })
      expect(status?.text).toMatch(/^Worktree Radar · .* · land next → feat\/parent$/)
      await wide.unmount()

      const narrow = await $.ui.mount({ ...BAND, surface, props: { ...BAND.props, bodyColumns: 20 } })
      const drawn = await narrow.drawn()

      expect((drawn as { props: Record<string, unknown> }).props.borderStyle).toBeUndefined()
      expect(await narrow.find({ type: 'Text', text: /land next/ })).toBeDefined()
      await narrow.unmount()
    }
  })

  test('h shows the help and goes back; /radar help opens on it', async ($, on) => {
    const { clock } = worldOf(on)

    await $.command.run(RADAR)
    await settled(clock)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })

      expect(await ui.find({ key: 'help' })).toMatchObject({ props: { hotkey: 'h', label: 'help' } })
      await ui.press({ key: 'help' })
      await settled(clock)
      await ui.unmount()

      const help = await bandText($, surface)

      expect(help).toContain('Lanes')
      expect(help.some(text => /^ {2}needs rebase +conflicts with main/.test(text))).toBe(true)
      expect(help.some(text => /feat\/parent/.test(text))).toBe(false)

      const back = await $.ui.mount({ ...BAND, surface })

      expect(await back.find({ key: 'help' })).toMatchObject({ props: { label: 'back' } })
      await back.press({ key: 'help' })
      await settled(clock)
      await back.unmount()

      expect((await bandText($, surface)).some(text => /^ 1 feat\/parent\s+ready/.test(text))).toBe(true)
    }

    await $.command.run(RADAR)
    await settled(clock)
    await $.command.run({ ...RADAR, args: 'help' })
    await settled(clock)

    expect(await bandText($)).toContain('Lanes')
  })

  test('c folds the band into one line and back', async ($, on) => {
    const { clock } = worldOf(on)

    await $.command.run(RADAR)
    await settled(clock)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    await ui.press({ key: 'compact' })
    await settled(clock)
    await ui.unmount()

    const compact = await bandText($)

    expect(compact.some(text => /^work \[main\] · 4 ready .* · land next → feat\/parent$/.test(text))).toBe(true)
    expect(compact.some(text => /^ 1 feat\/parent/.test(text))).toBe(false)

    // Compact, the panel goes: the status line alone, where it sits under it
    const folded = await $.ui.mount({ ...BAND, surface: 'terminal' })

    expect(await folded.find({ key: 'frame' })).toBeUndefined()
    // An empty row above it, as the frame's top edge keeps the band apart
    expect(await folded.find({ key: 'line' })).toMatchObject({ props: { paddingX: 2, marginTop: 1, width: 135 } })
    await folded.unmount()

    const back = await $.ui.mount({ ...BAND, surface: 'terminal' })

    expect(await back.find({ key: 'compact' })).toMatchObject({ props: { label: 'expand' } })
    await back.press({ key: 'compact' })
    await settled(clock)
    await back.unmount()

    expect((await bandText($)).some(text => /^ 1 feat\/parent\s+ready/.test(text))).toBe(true)
  })

  test('x exits the radar', async ($, on) => {
    const { clock } = worldOf(on)

    await $.command.run(RADAR)
    await settled(clock)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    expect((await ui.findAll({ type: 'Button' })).map(found => [found.props.hotkey, found.props.label])).toEqual([
      ['h', 'help'],
      ['c', 'compact'],
      ['x', 'exit'],
    ])
    await ui.press({ key: 'exit' })
    await settled(clock)
    await ui.unmount()

    expect(await bandText($)).toEqual([])
  })

  test('gives way to a survey', async ($, on) => {
    const { clock } = worldOf(on)

    await $.command.run(RADAR)
    await settled(clock)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, hasSurvey: true } })

    expect(await ui.findAll({ type: 'Text', text: /Worktree Radar/ })).toHaveLength(0)
    await ui.unmount()
  })

  test('says why it cannot read outside a repository', async ($, on) => {
    const { clock } = worldOf(on, { current: {} })

    await $.command.run(RADAR)
    await settled(clock)

    expect((await bandText($)).some(text => /^Worktree Radar · not in a git repository, or git is not installed$/.test(text))).toBe(true)
  })

  test('holds a branch from the command, across reads', async ($, on) => {
    const { clock, toasts } = worldOf(on)

    await $.command.run(RADAR)
    await settled(clock)
    await $.command.run({ ...RADAR, args: 'hold feat/parent needs a review' })
    await settled(clock)

    const texts = await bandText($)

    expect(texts.some(text => /^ - feat\/parent\s+on hold\s+\+1 +\d+[smhd]  needs a review/.test(text))).toBe(true)
    expect(texts.some(text => text.endsWith('land next → feat/ready-a'))).toBe(true)
    expect(toasts).toEqual(['Holding feat/parent'])

    await $.command.run({ ...RADAR, args: 'unhold feat/parent' })
    await settled(clock)

    expect((await bandText($)).some(text => text.endsWith('land next → feat/parent'))).toBe(true)
  })

  test("shows another session's hold at its next poll", async ($, on) => {
    const { clock, store } = worldOf(on)

    await $.command.run(RADAR)
    await settled(clock)

    // Another session of the repository holds feat/parent: no ref moves
    store.set('holds:/work/.git', { ...HOLDS, 'feat/parent': { reason: 'held in another session', at: NOW } })
    await nextRead(clock)

    expect((await bandText($)).some(text => /^ - feat\/parent\s+on hold\s+\+1 +\d+[smhd]  held in another session/.test(text))).toBe(true)
  })
})

describe('the radar tool', () => {
  test('opens the radar and answers the facts as JSON', async ($, on) => {
    const { clock } = worldOf(on)
    const answer = $.tool.call({ tool: TOOL, action: 'open', wake: ['ready'] } as never)

    await settled(clock)

    const result = await answer
    const snapshot = JSON.parse(String(result.result))

    expect(snapshot.schema).toBe(1)
    expect(snapshot.next).toBe('feat/parent')
    expect(snapshot.branches[0]).toMatchObject({ name: 'feat/parent', lane: 'READY', rank: 1, fileCount: 1 })
    expect((await bandText($)).some(text => text.startsWith('Worktree Radar'))).toBe(true)
  })

  test('comments on a branch and sets the line under the queue', async ($, on) => {
    const { clock } = worldOf(on)
    const opened = $.tool.call({ tool: TOOL, action: 'open' } as never)

    await settled(clock)
    await opened

    const commented = $.tool.call({ tool: TOOL, action: 'comment', branch: 'feat/conflict', text: 'handed back to b-7c' } as never)

    await settled(clock)
    await commented

    const status = await $.tool.call({ tool: TOOL, action: 'status', text: 'release v0.4.1 pending' } as never)

    await settled(clock)

    expect(status.result).toBe('Status line set.')

    const texts = await bandText($)

    expect(texts.some(text => /feat\/conflict\s+needs rebase.*handed back to b-7c/.test(text))).toBe(true)
    expect(texts.some(text => /land next → feat\/parent +release v0\.4\.1 pending$/.test(text))).toBe(true)
  })

  test('keeps a comment the caller asks to keep, until the branch lands', async ($, on) => {
    const { clock, store } = worldOf(on)
    const opened = $.tool.call({ tool: TOOL, action: 'open' } as never)

    await settled(clock)
    await opened

    for (const branch of ['feat/conflict', 'feat/landed']) {
      const commented = $.tool.call({ tool: TOOL, action: 'comment', branch, text: 'merge once READY', keep: true } as never)

      await settled(clock)
      await commented
    }

    const answer = $.tool.call({ tool: TOOL, action: 'snapshot' } as never)

    await settled(clock)

    const branches = (JSON.parse(String((await answer).result)) as { branches: { name: string; comment: string | null }[] }).branches
    const commentOf = (name: string) => branches.find(branch => branch.name === name)?.comment

    expect([commentOf('feat/conflict'), commentOf('feat/landed')]).toEqual(['merge once READY', null])
    expect((store.get(`resume:${SESSION}`) as { comments: Record<string, unknown> }).comments['feat/conflict']).toMatchObject({
      text: 'merge once READY',
      isKept: true,
    })
  })

  test('refuses what it cannot do', async ($, on) => {
    const { clock } = worldOf(on)
    const snapshot = await $.tool.call({ tool: TOOL, action: 'snapshot' } as never)

    expect(snapshot.deny).toMatch(/not open/)

    const hold = $.tool.call({ tool: TOOL, action: 'hold', branch: 'no/such-branch' } as never)

    await settled(clock)

    expect((await hold).deny).toBe('no branch named no/such-branch')
  })
})

describe('wake-ups and notifications', () => {
  test('a branch turning READY wakes the session once and notifies', async ($, on) => {
    const runs = { current: blockReady(RUNS) }
    const { clock, prompts, notices } = worldOf(on, runs)
    const opened = $.tool.call({ tool: TOOL, action: 'open', wake: ['ready'] } as never)

    await settled(clock)
    await opened

    // feat/ready-a is held back by a busy-looking recording at first
    expect((await bandText($)).some(text => /feat\/ready-a\s+in progress/.test(text))).toBe(true)
    expect(prompts).toEqual([])

    runs.current = RUNS
    await clock.advance(4_000)
    await settled(clock)
    await clock.advance(2_000)
    await settled(clock)

    expect(prompts).toEqual([`worktree-radar: feat/ready-a is ready to land (#2). ${WAKE_NOTE}`])
    expect(notices).toEqual(['feat/ready-a is ready to land (#2)'])

    // Nothing new, nothing more
    await clock.advance(70_000)
    await settled(clock)

    expect(prompts).toHaveLength(1)
  })

  test("an agent of the session's own that finishes wakes it, though its worktree's lock stays", async ($, on) => {
    const agents = { current: [ownAgent('running')] }

    on('agent.list', () => ({ value: agents.current }))

    const { clock, prompts } = worldOf(on, { current: agentLocked(RUNS) })
    const opened = $.tool.call({ tool: TOOL, action: 'open', wake: ['session-idle'] } as never)

    await settled(clock)
    await opened

    expect((await bandText($)).some(text => /feat\/landed\s+in progress.*agent: Fix the totals/.test(text))).toBe(true)

    // It finishes; nothing in git moves, the lock not yet gone
    agents.current = [ownAgent('completed')]
    await nextRead(clock)

    expect(prompts).toEqual([`worktree-radar: agent agent-abc on feat/landed finished. ${WAKE_NOTE}`])
  })

  test('a session the CLI lists where it started is still at work in its locked worktree', async ($, on) => {
    // Seen live: a false cleanup wake for a worktree its worker had just
    // moved into, `claude agents` listing the worker in the main worktree
    const worker = (cwd: string) =>
      JSON.stringify([{ pid: 4_200, sessionId: 'session-w', name: 'landed-worker', cwd, kind: 'background', status: 'busy' }])
    const runs = {
      current: landedLocked(RUNS, 'claude session landed (pid 4200 start 9)'),
      sessions: worker('/work/.claude/worktrees/landed'),
    }
    const { clock, prompts } = worldOf(on, runs)
    const opened = $.tool.call({ tool: TOOL, action: 'open', wake: ['cleanup'] } as never)

    await settled(clock)
    await opened

    runs.sessions = worker('/work')
    await nextRead(clock)
    await nextRead(clock)

    expect((await bandText($)).some(text => /feat\/landed\s+in progress/.test(text))).toBe(true)
    expect(prompts).toEqual([])
  })

  test('a wake the session has not taken yet holds up neither the radar nor its own tool', async ($, on) => {
    const runs = { current: blockReady(RUNS), sessions: sessionsOf(['landed-worker', 'landed', 'busy']) }
    const { clock, prompts, turn } = worldOf(on, runs)
    const opened = $.tool.call({ tool: TOOL, action: 'open', wake: ['ready', 'session-idle'] } as never)

    await settled(clock)
    await opened
    // The session is at work: what the radar submits waits for the turn
    turn.start()

    runs.current = RUNS
    await nextRead(clock)

    expect(prompts).toEqual([])

    // The radar reads on meanwhile: feat/ready-a is held back again, and a
    // session goes idle
    runs.current = blockReady(RUNS)
    runs.sessions = sessionsOf(['landed-worker', 'landed', 'idle'], ['wip-worker', 'wip', 'busy'])
    await nextRead(clock)

    expect((await bandText($)).some(text => /feat\/ready-a\s+in progress/.test(text))).toBe(true)

    // The session's own tool reads, and answers, though the read finds an
    // event to wake it for
    runs.sessions = sessionsOf(['landed-worker', 'landed', 'idle'], ['wip-worker', 'wip', 'idle'])

    const snapshot = $.tool.call({ tool: TOOL, action: 'snapshot' } as never)

    await settled(clock)

    expect(JSON.parse(String((await snapshot).result)).schema).toBe(1)
    expect(prompts).toEqual([])

    // The turn ends: the first wake, then what came since in one (feat/wip,
    // its worktree given to feat/ready-a, has none left to keep it busy)
    turn.end()
    await settled(clock)

    expect(prompts).toEqual([
      `worktree-radar: feat/ready-a is ready to land (#2). ${WAKE_NOTE}`,
      'worktree-radar: feat/wip is ready to land (#2) · session landed-worker on feat/landed went idle · ' +
        `session wip-worker on feat/ready-a went idle. ${WAKE_NOTE}`,
    ])
  })
})

describe('across sessions', () => {
  test('a session that ends with the radar open saves it as it stands', async ($, on) => {
    const { clock, store } = worldOf(on)
    const opened = $.tool.call({ tool: TOOL, action: 'open', wake: ['ready'] } as never)

    await settled(clock)
    await opened

    // Saved as it opens, so a process that dies still comes back with it
    expect(store.get('resume:session-a')).toMatchObject({ radar: { root: '/work', base: null, wake: ['ready'] }, compact: false })

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    await ui.press({ key: 'compact' })
    await settled(clock)
    await ui.unmount()

    const commented = $.tool.call({ tool: TOOL, action: 'comment', branch: 'feat/conflict', text: 'handed back to b-7c' } as never)

    await settled(clock)
    await commented
    await $.tool.call({ tool: TOOL, action: 'status', text: 'release v0.4.1 pending' } as never)
    await $.session.end(endOf('prompt_input_exit'))

    expect(store.get('resume:session-a')).toMatchObject({
      radar: { root: '/work', base: null, wake: ['ready'] },
      compact: true,
      status: 'release v0.4.1 pending',
      comments: { 'feat/conflict': { sha: tipOf('feat/conflict'), text: 'handed back to b-7c' } },
    })
  })

  test('saves each change as it is made: a process that dies comes back with it', async ($, on) => {
    const { clock, store } = worldOf(on)
    const opened = $.tool.call({ tool: TOOL, action: 'open', wake: ['ready'] } as never)

    await settled(clock)
    await opened

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    await ui.press({ key: 'compact' })
    await settled(clock)
    await ui.unmount()

    const commented = $.tool.call({ tool: TOOL, action: 'comment', branch: 'feat/conflict', text: 'handed back to b-7c' } as never)

    await settled(clock)
    await commented
    await $.tool.call({ tool: TOOL, action: 'status', text: 'release v0.4.1 pending' } as never)
    await settled(clock)

    // No session.end: the process could die here
    expect(store.get('resume:session-a')).toMatchObject({
      radar: { root: '/work', base: null, wake: ['ready'] },
      compact: true,
      status: 'release v0.4.1 pending',
      comments: { 'feat/conflict': { sha: tipOf('feat/conflict'), text: 'handed back to b-7c' } },
    })
  })

  test('a change just after /resume is saved for the resumed session', async ($, on) => {
    const { clock, store } = worldOf(on, undefined, { 'resume:session-b': leftOpen() })

    await $.session.start(START)
    await $.command.run(RADAR)
    await settled(clock)
    await $.session.end(endOf('resume'))
    // $.session.id() answers session-a still, as it does until the next command
    await $.classic.SessionStart({ source: 'resume', session_id: 'session-b' })
    await settled(clock)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    await ui.press({ key: 'compact' })
    await settled(clock)
    await ui.unmount()

    expect(store.get('resume:session-b')).toMatchObject({ compact: false, status: 'release v0.4.1 pending' })
    expect(store.get('resume:session-a')).toMatchObject({ compact: false, status: null })
  })

  test('a resumed session, in a new process, opens the radar as it was left', async ($, on) => {
    const { clock, store } = worldOf(on, undefined, { 'resume:session-a': leftOpen() })

    // A new process: the session state is empty, the store is kept
    expect(await bandText($)).toEqual([])

    await $.session.start(START)
    await settled(clock)

    const compact = await bandText($)

    expect(compact.some(text => /^work \[main\] · 4 ready .* · land next → feat\/parent$/.test(text))).toBe(true)
    expect(compact.some(text => /^ 1 feat\/parent/.test(text))).toBe(false)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    await ui.press({ key: 'compact' })
    await settled(clock)
    await ui.unmount()

    const expanded = await bandText($)

    expect(expanded.some(text => /feat\/conflict\s+needs rebase.*handed back to b-7c/.test(text))).toBe(true)
    expect(expanded.some(text => /land next → feat\/parent +release v0\.4\.1 pending$/.test(text))).toBe(true)
    // The caller's wakes came back with it, and it answers the caller
    expect(store.get('resume:session-a')).toMatchObject({ radar: { wake: ['ready'] } })
    expect(JSON.parse(String((await $.tool.call({ tool: TOOL, action: 'snapshot' } as never)).result)).next).toBe('feat/parent')
  })

  test('a new session leaves it closed: another session left it open', async ($, on) => {
    const { clock } = worldOf(on, undefined, { 'resume:session-b': leftOpen() })

    await $.session.start(START)
    await settled(clock)

    expect(await bandText($)).toEqual([])
  })

  test('a run with no person at the prompt leaves it closed', async ($, on) => {
    const { clock } = worldOf(on, undefined, { 'resume:session-a': leftOpen() })

    await $.session.start({ cwd: '/work', surface: null, isInteractive: false })
    await settled(clock)

    expect(await bandText($)).toEqual([])
  })

  test('closing it forgets it, and a closed radar saves nothing', async ($, on) => {
    const { clock, store } = worldOf(on)

    await $.command.run(RADAR)
    await settled(clock)

    expect(store.has('resume:session-a')).toBe(true)

    await $.command.run(RADAR)
    await settled(clock)
    await $.session.end(endOf('prompt_input_exit'))

    expect(store.has('resume:session-a')).toBe(false)
  })

  test('/clear keeps it open, without the wakes the cleared conversation asked for', async ($, on) => {
    const { clock, store } = worldOf(on)

    await $.session.start(START)

    const opened = $.tool.call({ tool: TOOL, action: 'open', wake: ['ready'] } as never)

    await settled(clock)
    await opened
    await $.session.end(endOf('clear'))
    await $.classic.SessionStart({ source: 'clear', session_id: 'session-c' })
    await settled(clock)

    expect((await bandText($)).some(text => text.endsWith('land next → feat/parent'))).toBe(true)
    // The cleared conversation keeps its own, for a resume of it
    expect(store.get('resume:session-a')).toMatchObject({ radar: { wake: ['ready'] } })
    expect(store.get('resume:session-c')).toMatchObject({ radar: { root: '/work', wake: [] } })
  })

  test('/resume brings back what the resumed conversation left, or closes it', async ($, on) => {
    const { clock, store } = worldOf(on, undefined, { 'resume:session-b': leftOpen() })

    await $.session.start(START)
    await $.command.run(RADAR)
    await settled(clock)
    await $.session.end(endOf('resume'))
    await $.classic.SessionStart({ source: 'resume', session_id: 'session-b' })
    await settled(clock)

    // Folded, as session-b left it; session-a's stays saved for its resume
    expect((await bandText($)).some(text => /^work \[main\] · 4 ready .* · land next → feat\/parent$/.test(text))).toBe(true)
    expect(store.get('resume:session-a')).toMatchObject({ radar: { root: '/work', wake: [] }, compact: false })

    await $.session.end(endOf('resume', 'session-b'))
    await $.classic.SessionStart({ source: 'resume', session_id: 'session-x' })
    await settled(clock)

    expect(await bandText($)).toEqual([])
  })

  test('/branch carries it on whole', async ($, on) => {
    const { clock, store } = worldOf(on)

    await $.session.start(START)

    const opened = $.tool.call({ tool: TOOL, action: 'open', wake: ['ready'] } as never)

    await settled(clock)
    await opened
    await $.session.end(endOf('resume'))
    await $.classic.SessionStart({ source: 'fork', session_id: 'session-d' })
    await settled(clock)

    expect((await bandText($)).some(text => text.endsWith('land next → feat/parent'))).toBe(true)
    expect(store.get('resume:session-d')).toMatchObject({ radar: { root: '/work', wake: ['ready'] } })
  })

  test('keeps the sessions saved last, up to the limit', async ($, on) => {
    const older = Object.fromEntries(
      Array.from({ length: Limits.SAVED_SESSIONS }, (_, index) => [`resume:old-${index}`, leftOpen(NOW - 1_000_000 + index)]),
    )
    const { clock, store } = worldOf(on, undefined, older)

    await $.command.run(RADAR)
    await settled(clock)

    expect([...store.keys()].filter(key => key.startsWith('resume:'))).toHaveLength(Limits.SAVED_SESSIONS)
    expect(store.has('resume:old-0')).toBe(false)
    expect(store.has('resume:old-1')).toBe(true)
    expect(store.has('resume:session-a')).toBe(true)
  })
})

/**
 * What `session.end` brings when a session ends.
 *
 * @param reason why it ends
 * @param sessionId the session ending
 */
function endOf(reason: 'clear' | 'resume' | 'prompt_input_exit', sessionId = SESSION) {
  return { reason, sessionId, resume: { id: sessionId } } as const
}

/**
 * A branch's tip, as the recording's branch list has it.
 */
function tipOf(branch: string): string {
  const heads = Object.entries(RUNS).find(([key]) => key.includes('"for-each-ref"'))?.[1].stdout ?? ''
  const line = heads.split('\n').find(entry => entry.startsWith(`refs/heads/${branch}\u0000`))

  return line?.split('\u0000')[1] ?? ''
}

/**
 * A radar a session left open, as the store keeps it: folded, a caller's
 * wakes, line and comment.
 */
function leftOpen(savedAt = NOW) {
  return {
    radar: { root: '/work', base: null, wake: ['ready'] },
    compact: true,
    status: 'release v0.4.1 pending',
    comments: { 'feat/conflict': { sha: tipOf('feat/conflict'), text: 'handed back to b-7c' } },
    dueMarks: {},
    savedAt,
  }
}

/**
 * Polls until a change is read: a listing of the sessions, the settle, the
 * read.
 */
async function nextRead(clock: MockClock): Promise<void> {
  for (const ms of [4_000, 4_000, 2_000]) {
    await clock.advance(ms)
    await settled(clock)
  }
}

/**
 * What `claude agents --json` lists: sessions in the fixture's worktrees.
 *
 * @param rows each session's name, the worktree it works in, its status
 */
function sessionsOf(...rows: readonly (readonly [name: string, worktree: string, status: string])[]): string {
  return JSON.stringify(
    rows.map(([name, worktree, status], at) => ({
      pid: 4_200 + at,
      sessionId: `session-${name}`,
      name,
      cwd: `/work/.claude/worktrees/${worktree}`,
      kind: 'interactive',
      status,
    })),
  )
}

/**
 * An agent of the session's own, as `$.agent.list()` has it.
 */
function ownAgent(status: 'running' | 'completed') {
  return { id: 'abc', name: 'agent-abc', description: 'Fix the totals', type: 'general-purpose', status }
}

/**
 * The recording with feat/landed's worktree locked by that agent, as Claude
 * Code locks the worktree of an agent it isolates in one.
 */
function agentLocked(runs: Recorded): Recorded {
  return landedLocked(runs, 'claude agent agent-abc (pid 42 start 7)')
}

/**
 * The recording with feat/landed's worktree locked.
 *
 * @param runs the recording
 * @param reason the lock's reason
 */
function landedLocked(runs: Recorded, reason: string): Recorded {
  const key = JSON.stringify(['/work', 'worktree', 'list', '--porcelain'])
  const list = runs[key]

  if (list === undefined) {
    throw new Error('the recording has no worktree list')
  }

  return {
    ...runs,
    [key]: {
      ...list,
      stdout: list.stdout.replace('branch refs/heads/feat/landed\n', `branch refs/heads/feat/landed\nlocked ${reason}\n`),
    },
  }
}

/**
 * The recording with feat/ready-a's worktree-less branch shown as dirty:
 * its tip moved under a worktree with uncommitted changes. Done by giving it
 * the wip worktree's place in the worktree list.
 */
function blockReady(runs: Recorded): Recorded {
  const key = JSON.stringify(['/work', 'worktree', 'list', '--porcelain'])
  const list = runs[key]

  if (list === undefined) {
    throw new Error('the recording has no worktree list')
  }

  return {
    ...runs,
    [key]: { ...list, stdout: list.stdout.replace('branch refs/heads/feat/wip', 'branch refs/heads/feat/ready-a') },
  }
}
