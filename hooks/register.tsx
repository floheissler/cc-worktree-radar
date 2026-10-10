import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { RadarConfig } from '../types'

import { commandRequestOf } from './command'
import type { Host, RadarOptions } from './host'
import Limits from './limits'
import { BAND_TITLE, COMMAND_DESCRIPTION, COMMAND_HINT } from './names'
import { createRadar, type Radar } from './radar'
import { bandLinesOf, controlsOf, frameOf } from './rows'
import { forgetRadar, keepRadar, loadRadar, pruneSaved, saveRadar, savedRadarOf, type SavedRadar } from './saved'
import { clipChars, messageOf, sanitize } from './text'
import { TOOL_DESCRIPTION, TOOL_INPUT_SCHEMA, toolJsonOf, toolRequestOf } from './tool'
import { bandView } from './view'

/**
 * The radar's session state. The band draws from it, so every write
 * redraws the band; a reload of the module keeps it. A new process starts
 * without it, and `/clear`, `/resume` and `/branch` reset it: an open radar
 * is also saved in the store for the session's resume (saved.ts).
 */
const RADAR = atom({ plugin: 'worktree-radar', key: 'radar' } as const, null)
const SNAPSHOT = atom({ plugin: 'worktree-radar', key: 'snapshot' } as const, null)
const PROBLEM = atom({ plugin: 'worktree-radar', key: 'problem' } as const, null)
const COMMENTS = atom({ plugin: 'worktree-radar', key: 'comments' } as const, {})
const STATUS = atom({ plugin: 'worktree-radar', key: 'status' } as const, null)
const HELP_SHOWN = atom({ plugin: 'worktree-radar', key: 'helpShown' } as const, false)
const COMPACT = atom({ plugin: 'worktree-radar', key: 'compact' } as const, false)
const DUE_MARKS = atom({ plugin: 'worktree-radar', key: 'dueMarks' } as const, {})
const THEME_SETTING = atom({ plugin: 'worktree-radar', key: 'themeSetting' } as const, null)

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
    sessionId: () => $.session.id(),
    run: (argv, init) => $.process.run(argv, init),
    agents: () =>
      $.agent.list().then(
        agents => agents.map(agent => ({ id: agent.id, name: agent.name ?? null, description: agent.description, status: agent.status })),
        () => [],
      ),
    themeSetting: () =>
      $.config.list().then(
        rows => {
          const value = rows.find(row => row.key === 'theme')?.value

          return typeof value === 'string' ? value : null
        },
        () => null,
      ),
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
      delete: key => $.store.delete(key),
      keys: () => $.store.keys(),
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
      comments: {
        get: () => read($, COMMENTS),
        set: async fn => {
          await update($, COMMENTS, fn)
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
      themeSetting: {
        get: () => read($, THEME_SETTING),
        set: async fn => {
          await update($, THEME_SETTING, fn)
        },
      },
    },
    options,
  }
}

/**
 * The session the open radar is saved under: the one it opened or reopened
 * in. `$.session.id()` lags a `/resume` or `/branch`, answering the session
 * left until the next command, so a save in between must not ask it. Null
 * while closed, and after a reload of the module, when it has caught up.
 */
let savedAs: string | null = null

/**
 * Saves the open radar as it stands, after a change a person or a caller
 * made (folding, the status line, a comment), so a process that dies
 * before `session.end` still comes back with it. The due marks a read finds
 * ride along with these saves and the one at `session.end`, not on their
 * own: a read can land in the lag `savedAs` covers, and only refines the
 * rebase order.
 *
 * @param host the engine's calls
 */
async function keepChange(host: Host): Promise<void> {
  try {
    await keepRadar(host, savedAs ?? (await host.sessionId()))
  } catch {
    // It comes back as it was at its last save, or at session.end
  }
}

/**
 * Opens the radar on a folder, replacing one open before, and starts its
 * polls; the first read follows at once. It is saved for the session's
 * resume as it opens, and again on each change (`keepChange`): a process
 * that dies without ending the session still comes back with it.
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

  try {
    const sessionId = await host.sessionId()

    savedAs = sessionId
    await keepRadar(host, sessionId)
    void pruneSaved(host, sessionId).catch(() => undefined)
  } catch {
    // It opens all the same, and is saved when the session ends
  }

  await radar.start(host)
}

/**
 * Stops the radar and empties the state the band draws from.
 */
async function clearRadar(host: Host, radar: Radar): Promise<void> {
  radar.stop()
  savedAs = null
  await host.state.radar.set(() => null)
  await host.state.snapshot.set(() => null)
  await host.state.problem.set(() => null)
  await host.state.status.set(() => null)
  await host.state.helpShown.set(() => false)
}

/**
 * Closes the radar, and drops what the session saved for its resume.
 */
async function closeRadar(host: Host, radar: Radar): Promise<void> {
  await clearRadar(host, radar)

  try {
    await forgetRadar(host, await host.sessionId())
  } catch {
    // A resume would open it again: closed, it stays closed in this session
  }
}

/**
 * Opens a radar a session left, as it was left, and saves it for this
 * session; with none, the radar is closed. Called where the state starts
 * over: a new process, `/clear`, `/resume` and `/branch`.
 *
 * @param host the engine's calls
 * @param radar the radar's polls and reads
 * @param saved what the session left, or null
 * @param sessionId the session it opens in: the conversation on screen
 */
async function reopenRadar(host: Host, radar: Radar, saved: SavedRadar | null, sessionId: string): Promise<void> {
  radar.stop()

  if (saved === null) {
    // The engine reset the state already; an open radar left here would be
    // another conversation's
    if ((await host.state.radar.get()) !== null) {
      await clearRadar(host, radar)
    }

    return
  }

  await host.state.compact.set(() => saved.compact)
  await host.state.status.set(() => saved.status)
  await host.state.comments.set(() => ({ ...saved.comments }))
  await host.state.dueMarks.set(() => ({ ...saved.dueMarks }))
  await host.state.helpShown.set(() => false)
  await host.state.snapshot.set(() => null)
  await host.state.problem.set(() => null)
  // Last, so the band's first drawing has the rest
  await host.state.radar.set(() => saved.radar)
  savedAs = sessionId
  await saveRadar(host, sessionId, { ...saved, savedAt: await host.now() }).catch(() => undefined)
  void radar.start(host).catch(() => undefined)
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
  /**
   * Whether `session.start` ran for this module: at a process's start
   * `classic.SessionStart` fires before it, and `session.start` opens what a
   * resumed session left.
   */
  let hasStarted = false
  /**
   * The radar the session that just ended had open, for the conversation
   * that follows it in this process (`/clear`, `/branch`).
   */
  let ended: SavedRadar | null = null

  on('session.start', async ($, e, next) => {
    hasStarted = true

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
    // open radar polls again. A new process starts with no state: a resumed
    // session (`claude --continue`, `--resume`) opens the radar it left open
    const host = hostOf($, options)

    if ((await host.state.radar.get()) !== null) {
      void radar.start(host).catch(() => undefined)
    } else if (e.isInteractive) {
      void host
        .sessionId()
        .then(async sessionId => reopenRadar(host, radar, await loadRadar(host, sessionId), sessionId))
        .catch(() => undefined)
    }

    return next(e)
  })

  /**
   * `/clear`, `/resume` and `/branch` (`fork`) reset the session state, and
   * the conversation goes on under another session id, `e.session_id`
   * (`$.session.id()` still answers the old one here). The resumed
   * conversation gets the radar it left, or none; `/branch` carries the
   * radar on whole, and `/clear` without its caller's wake list: the wakes
   * were asked for by the conversation it cleared.
   */
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    const carried = ended

    ended = null

    if (hasStarted) {
      const host = hostOf($, options)
      const saved =
        e.source === 'resume'
          ? await loadRadar(host, e.session_id)
          : e.source === 'clear' && carried !== null
            ? { ...carried, radar: { ...carried.radar, wake: [] } }
            : carried

      await reopenRadar(host, radar, saved, e.session_id)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  /**
   * The session ends: an exit, `/clear`, `/resume` or `/branch`. An open
   * radar is saved under its id as it stands, for a resume, and kept for the
   * conversation that follows in this process. A closed one writes nothing.
   */
  on('session.end', async ($, e, next) => {
    const host = hostOf($, options)

    ended = null

    try {
      ended = await savedRadarOf(host)

      if (ended !== null) {
        await saveRadar(host, e.sessionId, ended)
      }
    } catch {
      // It comes back as it was when it opened
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
          await closeRadar(host, radar)
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
        await closeRadar(host, radar)

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
        await closeRadar(host, radar)

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
      case 'comment': {
        const why = await radar.setComment(host, root, request.branch, request.text, request.keep)

        if (why !== null) {
          return { deny: why }
        }

        if (open === null) {
          return { result: `Comment set on ${request.branch}.` }
        }

        await keepChange(host)
        await radar.readNow(host)

        return answerOf(host)
      }
      case 'status': {
        const text = request.text.trim()

        await host.state.status.set(() => (text === '' ? null : clipChars(text, Limits.COMMENT_CHARS)))
        await keepChange(host)

        return { result: text === '' ? 'Status line cleared.' : 'Status line set.' }
      }
    }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'worktree-radar failed to answer; see claude --debug' }))

  // The theme changed in /config: the base's color follows at once (a read
  // picks up a change made another way)
  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    const value = result.value

    if (typeof value === 'string') {
      await hostOf($, options).state.themeSetting.set(() => value)
    }

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const host = hostOf($, options)
    const open = await host.state.radar.get()

    if (open === null || e.props.hasSurvey || (e.surface !== 'terminal' && e.surface !== 'desktop')) {
      return next(e)
    }

    const [snapshot, problem, status, isHelpShown, isCompact, themeSetting, now] = await Promise.all([
      host.state.snapshot.get(),
      host.state.problem.get(),
      host.state.status.get(),
      host.state.helpShown.get(),
      host.state.compact.get(),
      host.state.themeSetting.get(),
      host.now(),
    ])
    const columns = e.props.bodyColumns
    const frame = frameOf(columns, e.props.maxRows)
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
      themeSetting,
    })
    const controls = controlsOf(frame.columns, isHelpShown, isCompact)

    // Compact, the band is its status line; the help still shows whole
    return bandView($.ui.resolve(e), lines, columns, frame, isCompact && !isHelpShown, controls, {
      help: () => {
        void hostOf($, options).state.helpShown.set(shown => !shown)
      },
      compact: () => {
        const host = hostOf($, options)

        void host.state.compact
          .set(compact => !compact)
          .then(() => keepChange(host))
          .catch(() => undefined)
      },
      exit: () => {
        void closeRadar(hostOf($, options), radar)
      },
    })
  })
}
