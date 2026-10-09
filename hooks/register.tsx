import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, PluginOptions, Register } from 'claude-code'

import type { RadarConfig } from '../types'

import { commandRequestOf } from './command'
import type { Host, RadarOptions } from './host'
import Limits from './limits'
import { BAND_TITLE, COMMAND_DESCRIPTION, COMMAND_HINT } from './names'
import { createRadar, type Radar } from './radar'
import { createSweep, type Sweep, type SweepHost } from './sweep'
import { bandLinesOf, controlsOf, frameOf, sweepOf } from './rows'
import { clipChars, messageOf, sanitize } from './text'
import { TOOL_DESCRIPTION, TOOL_INPUT_SCHEMA, toolJsonOf, toolRequestOf } from './tool'
import { bandView } from './view'

/**
 * The radar's session state. The band draws from it, so every write
 * redraws the band; a reload of the module keeps it.
 */
const RADAR = atom({ plugin: 'worktree-radar', key: 'radar' } as const, null)
const SNAPSHOT = atom({ plugin: 'worktree-radar', key: 'snapshot' } as const, null)
const PROBLEM = atom({ plugin: 'worktree-radar', key: 'problem' } as const, null)
const NOTES = atom({ plugin: 'worktree-radar', key: 'notes' } as const, {})
const STATUS = atom({ plugin: 'worktree-radar', key: 'status' } as const, null)
const HELP_SHOWN = atom({ plugin: 'worktree-radar', key: 'helpShown' } as const, false)
const COMPACT = atom({ plugin: 'worktree-radar', key: 'compact' } as const, false)
const DUE_MARKS = atom({ plugin: 'worktree-radar', key: 'dueMarks' } as const, {})

/**
 * Reads the person's settings, each checked: `userConfig` in plugin.json.
 *
 * @param options the values Claude Code hands `register`
 * @returns the settings, defaults filled in
 */
function optionsOf(options: PluginOptions): RadarOptions {
  const seconds = typeof options['pollSeconds'] === 'number' ? options['pollSeconds'] : 4

  return {
    notifyReady: options['notifyReady'] !== false,
    pollMs: Math.round(Math.min(Math.max(seconds, 1), 60) * 1000),
  }
}

/**
 * Binds the radar's engine calls to one hook's `$`.
 *
 * @param $ the engine, as a hook receives it
 * @param options the person's settings
 * @returns the calls, as a plain record
 */
function hostOf($: EngineInterface, options: RadarOptions): Host {
  return {
    cwd: () => $.session.cwd(),
    run: (argv, init) => $.process.run(argv, init),
    readText: path => $.fs.read(path).then(
      text => text,
      () => null,
    ),
    now: () => $.clock.now(),
    after: (ms, fn) => $.clock.after(ms, fn),
    invalidate: () => $.ui.invalidate('ui.render'),
    toast: text => $.ui.toast(text),
    notify: async text => {
      await $.ui.notify(text, { title: BAND_TITLE })
    },
    submit: async text => {
      await $.prompt.submit({ text })
    },
    store: {
      get: key => $.store.get(key),
      set: (key, value) => $.store.set(key, value),
    },
    state: {
      radar: {
        get: () => read($, RADAR),
        set: async fn => {
          await update($, RADAR, fn)
        },
      },
      snapshot: {
        get: () => read($, SNAPSHOT),
        set: async fn => {
          await update($, SNAPSHOT, fn)
        },
      },
      problem: {
        get: () => read($, PROBLEM),
        set: async fn => {
          await update($, PROBLEM, fn)
        },
      },
      notes: {
        get: () => read($, NOTES),
        set: async fn => {
          await update($, NOTES, fn)
        },
      },
      status: {
        get: () => read($, STATUS),
        set: async fn => {
          await update($, STATUS, fn)
        },
      },
      helpShown: {
        get: () => read($, HELP_SHOWN),
        set: async fn => {
          await update($, HELP_SHOWN, fn)
        },
      },
      compact: {
        get: () => read($, COMPACT),
        set: async fn => {
          await update($, COMPACT, fn)
        },
      },
      dueMarks: {
        get: () => read($, DUE_MARKS),
        set: async fn => {
          await update($, DUE_MARKS, fn)
        },
      },
    },
    options,
  }
}

/**
 * How many check intervals may pass with no check before the sweep stops
 * turning: a read in progress takes a while, a stalled radar takes longer.
 */
const LIVE_INTERVALS = 3

/**
 * Binds the sweep's engine calls to one hook's `$`.
 *
 * @param $ the engine, as the band's render hook receives it
 * @param radar the radar, for when it last checked
 * @param options the person's settings
 * @returns the calls
 */
function sweepHostOf($: EngineInterface, radar: Radar, options: RadarOptions): SweepHost {
  return {
    after: (ms, fn) => $.clock.after(ms, fn),
    blit: async (requestId, key, cells) => (await $.ui.blit({ requestId, key, cells })).deny === undefined,
    isLive: async () => (await $.clock.now()) - radar.lastCheckAt() <= options.pollMs * LIVE_INTERVALS,
  }
}

/**
 * Opens the radar on a folder, replacing one open before, and starts its
 * polls; the first read follows at once.
 *
 * @param host the engine's calls
 * @param radar the radar's polls and reads
 * @param config what to watch
 * @returns once the first read is done
 */
async function openRadar(host: Host, radar: Radar, config: RadarConfig): Promise<void> {
  radar.stop()
  await host.state.radar.set(() => config)
  await host.state.snapshot.set(() => null)
  await host.state.problem.set(() => null)
  await radar.start(host)
}

async function closeRadar(host: Host, radar: Radar, sweep?: Sweep): Promise<void> {
  radar.stop()
  sweep?.stop()
  await host.state.radar.set(() => null)
  await host.state.snapshot.set(() => null)
  await host.state.problem.set(() => null)
  await host.state.status.set(() => null)
  await host.state.helpShown.set(() => false)
}

/**
 * The tool's answer with the radar's latest read.
 */
async function answerOf(host: Host): Promise<{ result: string } | { deny: string }> {
  const [snapshot, problem] = await Promise.all([host.state.snapshot.get(), host.state.problem.get()])

  if (snapshot === null) {
    return { deny: `The radar cannot read the repository: ${problem ?? 'no read yet'}` }
  }

  return { result: toolJsonOf(snapshot) }
}

/**
 * Registers the radar: `/radar` and the `radar` tool open a live view of
 * the repository's branches and worktrees in the band above the prompt,
 * kept fresh by polls while it is open.
 */
export const register: Register = (on, pluginOptions) => {
  const options = optionsOf(pluginOptions)
  const radar = createRadar()
  const sweep = createSweep()

  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'radar',
        description: COMMAND_DESCRIPTION,
        argumentHint: COMMAND_HINT,
        immediate: true,
      })
    } catch (error) {
      $.ui.log(`worktree-radar: could not register /radar: ${messageOf(error)}`)
    }

    try {
      await $.tool.register({
        name: 'radar',
        description: TOOL_DESCRIPTION,
        inputSchema: TOOL_INPUT_SCHEMA,
        isDeferred: false,
      })
    } catch (error) {
      $.ui.log(`worktree-radar: could not register its tool: ${messageOf(error)}`)
    }

    // A reload of the module cancels its timers but keeps the state: an
    // open radar polls again
    const host = hostOf($, options)

    if ((await host.state.radar.get()) !== null) {
      void radar.start(host).catch(() => undefined)
    }

    return next(e)
  })

  on('command.run', { command: 'radar' }, async ($, e) => {
    const host = hostOf($, options)
    const request = commandRequestOf(e.args)
    const open = await host.state.radar.get()
    const root = open?.root ?? (await host.cwd())

    switch (request.kind) {
      case 'toggle':
        if (open !== null) {
          await closeRadar(host, radar, sweep)
        } else {
          void openRadar(host, radar, { root, base: null, wake: [] }).catch(() => undefined)
        }

        return {}
      case 'open':
        void openRadar(host, radar, { root: await host.cwd(), base: request.base, wake: open?.wake ?? [] }).catch(
          () => undefined,
        )

        return {}
      case 'close':
        await closeRadar(host, radar, sweep)

        return {}
      case 'help':
        await host.state.helpShown.set(() => true)

        if (open === null) {
          void openRadar(host, radar, { root, base: null, wake: [] }).catch(() => undefined)
        }

        return {}
      case 'hold':
      case 'unhold': {
        const why = await radar.setHold(host, root, request.branch, request.kind === 'hold' ? request.reason : null)
        const branch = sanitize(request.branch)

        host.toast(why ?? (request.kind === 'hold' ? `Holding ${branch}` : `${branch} is no longer held`))

        if (why === null && open !== null) {
          await radar.readNow(host)
        }

        return {}
      }
      case 'usage':
        return { text: `Usage: /radar ${COMMAND_HINT}` }
    }
  })

  on('tool.call', { tool: /^mcp__worktree-radar__radar$/ }, async ($, e) => {
    const host = hostOf($, options)
    const request = toolRequestOf(e as unknown as Readonly<Record<string, unknown>>)

    if ('error' in request) {
      return { deny: request.error }
    }

    const open = await host.state.radar.get()
    const root = open?.root ?? (await host.cwd())

    switch (request.action) {
      case 'open':
        await openRadar(host, radar, { root: await host.cwd(), base: request.base, wake: request.wake })

        return answerOf(host)
      case 'close':
        await closeRadar(host, radar, sweep)

        return { result: 'The radar is closed.' }
      case 'snapshot':
        if (open === null) {
          return { deny: 'The radar is not open: call it with action "open" first.' }
        }

        await radar.readNow(host)

        return answerOf(host)
      case 'hold':
      case 'unhold': {
        const why = await radar.setHold(host, root, request.branch, request.action === 'hold' ? request.reason : null)

        if (why !== null) {
          return { deny: why }
        }

        if (open === null) {
          return { result: request.action === 'hold' ? `Holding ${request.branch}.` : `${request.branch} is no longer held.` }
        }

        await radar.readNow(host)

        return answerOf(host)
      }
      case 'note': {
        const why = await radar.setNote(host, root, request.branch, request.text)

        if (why !== null) {
          return { deny: why }
        }

        if (open === null) {
          return { result: `Noted on ${request.branch}.` }
        }

        await radar.readNow(host)

        return answerOf(host)
      }
      case 'status': {
        const text = request.text.trim()

        await host.state.status.set(() => (text === '' ? null : clipChars(text, Limits.NOTE_CHARS)))

        return { result: text === '' ? 'Status line cleared.' : 'Status line set.' }
      }
    }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'worktree-radar failed to answer; see claude --debug' }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const host = hostOf($, options)
    const open = await host.state.radar.get()

    if (open === null || e.props.hasSurvey || (e.surface !== 'terminal' && e.surface !== 'desktop')) {
      return next(e)
    }

    const [snapshot, problem, status, isHelpShown, isCompact, now] = await Promise.all([
      host.state.snapshot.get(),
      host.state.problem.get(),
      host.state.status.get(),
      host.state.helpShown.get(),
      host.state.compact.get(),
      host.now(),
    ])
    const columns = e.props.bodyColumns
    const frame = frameOf(columns, e.props.maxRows)
    const table = $.ui.resolve(e)
    // The terminal turns the sweep in a cell of its own, between drawings;
    // elsewhere it moves a step per check, with each drawing
    const raster =
      e.surface === 'terminal' && typeof e.requestId === 'string' ? (table as ElementTable<'terminal'>).Raster : null
    const glyph = raster === null ? sweepOf(now, options.pollMs) : sweep.glyph()
    const lines = bandLinesOf({
      snapshot,
      problem,
      status,
      root: open.root,
      now,
      columns: frame.columns,
      maxRows: frame.maxRows,
      isHelpShown,
      isCompact,
      sweep: glyph,
    })
    const controls = controlsOf(frame.columns, isHelpShown, isCompact)

    if (raster !== null && typeof e.requestId === 'string' && lines.some(line => line.segments.some(segment => segment.isSweep))) {
      sweep.ensure(sweepHostOf($, radar, options), e.requestId)
    }

    return bandView(table, lines, columns, frame, controls, {
      help: () => {
        void hostOf($, options).state.helpShown.set(shown => !shown)
      },
      compact: () => {
        void hostOf($, options).state.compact.set(compact => !compact)
      },
      exit: () => {
        void closeRadar(hostOf($, options), radar, sweep)
      },
    }, raster)
  })
}
