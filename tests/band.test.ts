import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine, type MockClock } from 'claude-code/testing'

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
 * A session in the fixture's repository: git answers from the recording,
 * and what the radar raises (prompts, notifications) is recorded.
 */
function worldOf(on: On, runs: { current: Recorded } = { current: RUNS }) {
  const clock = mock.clock(on, { now: NOW })
  const prompts: string[] = []
  const notices: string[] = []
  const toasts: string[] = []

  // The fixture's hold, where the radar keeps holds: by the repository's
  // shared .git folder
  mock.store(on, { 'holds:/work/.git': HOLDS })
  on('session.cwd', () => ({ value: '/work' }))
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
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)

    return { text: e.text }
  })
  on('ui.notify', ($, e) => {
    notices.push(e.text)

    return { value: { isSent: true, channel: 'terminal_bell' } }
  })

  async function replay(argv: readonly string[], init: unknown) {
    return { value: await replayOf(runs.current).run(argv, (init ?? {}) as never) }
  }

  return { clock, prompts, notices, toasts }
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
      expect(texts.some(text => /^[◜◝◞◟] Worktree Radar · work \[main\] · 4 ready .* · land next → feat\/parent$/.test(text))).toBe(true)
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

      expect(await wide.drawn()).toMatchObject({
        type: 'Box',
        props: { borderStyle: 'round', borderColor: 'promptBorder', paddingX: 1, width: 135 },
      })
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

    expect(compact.some(text => /^[◜◝◞◟] work \[main\] · 4 ready .* · land next → feat\/parent$/.test(text))).toBe(true)
    expect(compact.some(text => /^ 1 feat\/parent/.test(text))).toBe(false)

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

    expect((await bandText($)).some(text => /^[◜◝◞◟] Worktree Radar · not in a git repository, or git is not installed$/.test(text))).toBe(true)
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

  test('notes a branch and sets the line under the queue', async ($, on) => {
    const { clock } = worldOf(on)
    const opened = $.tool.call({ tool: TOOL, action: 'open' } as never)

    await settled(clock)
    await opened

    const noted = $.tool.call({ tool: TOOL, action: 'note', branch: 'feat/conflict', text: 'handed back to b-7c' } as never)

    await settled(clock)
    await noted

    const status = await $.tool.call({ tool: TOOL, action: 'status', text: 'release v0.4.1 pending' } as never)

    await settled(clock)

    expect(status.result).toBe('Status line set.')

    const texts = await bandText($)

    expect(texts.some(text => /feat\/conflict\s+needs rebase.*handed back to b-7c/.test(text))).toBe(true)
    expect(texts.some(text => /land next → feat\/parent +release v0\.4\.1 pending$/.test(text))).toBe(true)
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

    expect(prompts).toEqual(['worktree-radar: feat/ready-a is ready to land (#2)'])
    expect(notices).toEqual(['feat/ready-a is ready to land (#2)'])

    // Nothing new, nothing more
    await clock.advance(70_000)
    await settled(clock)

    expect(prompts).toHaveLength(1)
  })
})

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
