/**
 * Where a branch stands on its way into the base branch.
 *
 * - `READY`: no uncommitted changes, no busy session, merges cleanly; ranked.
 * - `NEEDS_REBASE`: conflicts with the base.
 * - `STACKED`: holds every unmerged commit of another open branch, plus its
 *   own; the other lands first.
 * - `IN_PROGRESS`: uncommitted changes, a rebase under way, or a busy
 *   Claude session or a running subagent in its worktree.
 * - `HOLD`: parked by a person or a caller.
 * - `CLEANUP`: no commits beyond the base and no session: merged or
 *   abandoned.
 */
export type Lane = 'READY' | 'NEEDS_REBASE' | 'STACKED' | 'IN_PROGRESS' | 'HOLD' | 'CLEANUP'

/**
 * Who works in a worktree: a Claude Code session, as `claude agents` lists
 * it, or a subagent holding the worktree Claude Code locked for it.
 */
export type SessionInfo = {
  /**
   * The session's id; an agent's id, which SendMessage addresses it by.
   */
  readonly id: string
  /**
   * The session's name; an agent's, or `agent-<id>`.
   */
  readonly name: string
  /**
   * `idle`, `busy`, or another state the CLI reports; an agent's `running`,
   * or the state Claude Code gives an agent of the radar's own session
   * (`pending`, `waiting`, `idle`).
   */
  readonly status: string
  readonly kind: 'session' | 'agent'
  /**
   * An agent's task in a few words, known for the agents of the session the
   * radar runs in; null for another session's. Absent on a session.
   */
  readonly description?: string | null
  /**
   * The session an agent runs in, by name; null where it is not listed.
   * Absent on a session.
   */
  readonly parent?: string | null
}

export type WorktreeInfo = {
  /**
   * Relative to the main worktree when inside it, else absolute.
   */
  readonly path: string
  readonly absPath: string
  /**
   * Files with uncommitted changes; null where git could not tell.
   */
  readonly dirty: number | null
  /**
   * The worktree's folder is gone (git calls it prunable).
   */
  readonly isMissing: boolean
  readonly isRebasing: boolean
  readonly sessions: readonly SessionInfo[]
}

export type Hold = {
  readonly reason: string
  /**
   * When it was set, in milliseconds since the epoch.
   */
  readonly at: number
}

/**
 * One branch as the radar reads it.
 */
export type BranchInfo = {
  readonly name: string
  readonly sha: string
  readonly lane: Lane
  /**
   * The READY lane's merge order, from 1; null in every other lane.
   */
  readonly rank: number | null
  /**
   * Commits the base lacks, and commits the branch lacks.
   */
  readonly ahead: number
  readonly behind: number
  /**
   * Files the branch changes since it left the base.
   */
  readonly files: readonly string[]
  readonly insertions: number
  readonly deletions: number
  /**
   * Its tip's commit time, in seconds since the epoch.
   */
  readonly lastCommitAt: number
  readonly upstream: string | null
  /**
   * The paths that conflict with the base; null with nothing to merge.
   */
  readonly conflicts: readonly string[] | null
  readonly stackedOn: string | null
  readonly dependents: readonly string[]
  /**
   * Branches it shares unmerged commits with, neither containing the other.
   */
  readonly sharesWith: readonly { readonly branch: string; readonly commits: number }[]
  /**
   * Branches that would conflict once this one landed, and where.
   */
  readonly breaks: readonly { readonly branch: string; readonly files: readonly string[] }[]
  /**
   * Lines changed in the branches `breaks` names: the rebase work landing it
   * forces on the others.
   */
  readonly rebaseCost: number
  /**
   * NEEDS_REBASE only: the branches that land before it and conflict with
   * it, so a rebase now would have to be done again.
   */
  readonly waitsFor: readonly string[] | null
  /**
   * NEEDS_REBASE with nothing in `waitsFor`: rebasing it now holds.
   */
  readonly isRebaseDue: boolean
  /**
   * Nothing left to land, and its work reached the base: through a merge
   * (its tip off the base's first-parent line), or, by the branch's own
   * reflog, a fast-forward (its latest own commit in the base). A branch
   * that never had work of its own reads false, as does one without a
   * reflog that landed by a fast-forward, and one squash-merged.
   */
  readonly isLanded: boolean
  readonly hold: Hold | null
  /**
   * A caller's comment (the radar tool's `comment`): on this tip, or kept.
   */
  readonly comment: string | null
  readonly worktree: WorktreeInfo | null
  /**
   * The facts in one line, for people and models.
   */
  readonly summary: string
}

/**
 * The radar's read of one repository.
 */
export type Snapshot = {
  readonly schema: 1
  /**
   * The main worktree's folder.
   */
  readonly repo: string
  readonly base: {
    readonly name: string
    readonly sha: string
    readonly upstream: string | null
    readonly mainWorktreeBranch: string | null
    /**
     * Tracked files with uncommitted changes in the main worktree.
     */
    readonly mainWorktreeDirty: number | null
    /**
     * Who works in the main worktree, but the session the radar runs in:
     * work there shows on no branch's row while the base is checked out,
     * and a branch made there moves the main worktree off the base.
     */
    readonly mainWorktreeSessions: readonly SessionInfo[]
  }
  /**
   * Whether the running Claude sessions could be listed.
   */
  readonly areSessionsKnown: boolean
  /**
   * The READY branch to land first.
   */
  readonly next: string | null
  /**
   * By lane (in `Lane`'s order), then rank, then the newest first.
   */
  readonly branches: readonly BranchInfo[]
  /**
   * When it was read, in milliseconds since the epoch.
   */
  readonly takenAt: number
}

/**
 * What wakes the session that opened the radar: a branch became READY,
 * started to conflict, became due a rebase, stacked or done; the base moved;
 * a session went idle.
 */
export type WakeEvent = 'ready' | 'conflict' | 'rebase-due' | 'stacked' | 'cleanup' | 'base-moved' | 'session-idle'

/**
 * An open radar: the repository it watches, from any of its worktrees.
 */
export type RadarConfig = {
  /**
   * The folder the radar was opened from.
   */
  readonly root: string
  /**
   * The base branch asked for; null to detect it.
   */
  readonly base: string | null
  readonly wake: readonly WakeEvent[]
}

/**
 * A caller's comment, shown while the branch's tip is the one it was set on;
 * a kept one on every tip, until it is cleared, the branch is gone or it
 * lands.
 */
export type CallerComment = {
  /**
   * The tip it was set on.
   */
  readonly sha: string
  readonly text: string
  readonly isKept: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'worktree-radar': {
      /**
       * The open radar; null while closed.
       */
      radar: RadarConfig | null
      /**
       * The latest read; null before the first.
       */
      snapshot: Snapshot | null
      /**
       * Why there is no read: no repository, no base branch, no git.
       */
      problem: string | null
      /**
       * Caller comments by branch name.
       */
      comments: Record<string, CallerComment>
      /**
       * A caller's line under the queue; null for none.
       */
      status: string | null
      /**
       * Whether the help (what the lanes, details and comments mean) stands in for the
       * queue.
       */
      helpShown: boolean
      /**
       * Whether the queue is folded into the header's one line.
       */
      compact: boolean
      /**
       * Branches found due a rebase, by name, at the tip they were due on:
       * while one is in progress afterwards, it is being rebased, and the
       * branches it conflicts with wait for it.
       */
      dueMarks: Record<string, string>
    }
  }
}
