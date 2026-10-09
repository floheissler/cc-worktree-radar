/**
 * Where a branch stands on its way into the base branch.
 *
 * - `READY`: no uncommitted changes, no busy session, merges cleanly; ranked.
 * - `NEEDS_REBASE`: conflicts with the base.
 * - `STACKED`: holds every unmerged commit of another open branch, plus its
 *   own; the other lands first.
 * - `IN_PROGRESS`: uncommitted changes, a rebase under way, or a busy
 *   Claude session in its worktree.
 * - `HOLD`: parked by a person or a caller.
 * - `CLEANUP`: no commits beyond the base and no session: merged or
 *   abandoned.
 */
export type Lane = 'READY' | 'NEEDS_REBASE' | 'STACKED' | 'IN_PROGRESS' | 'HOLD' | 'CLEANUP'

/**
 * A Claude Code session working in a worktree, as `claude agents` lists it.
 */
export type SessionInfo = {
  readonly id: string
  readonly name: string
  /**
   * `idle`, `busy`, or another state the CLI reports.
   */
  readonly status: string
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
  readonly hold: Hold | null
  /**
   * A caller's note on this tip (the radar tool's `note`).
   */
  readonly note: string | null
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
 * A caller's note, shown while the branch's tip is the one it was set on.
 */
export type CallerNote = {
  readonly sha: string
  readonly text: string
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
       * Caller notes by branch name.
       */
      notes: Record<string, CallerNote>
      /**
       * A caller's line under the queue; null for none.
       */
      status: string | null
      /**
       * Branches found due a rebase, by name, at the tip they were due on:
       * while one is in progress afterwards, it is being rebased, and the
       * branches it conflicts with wait for it.
       */
      dueMarks: Record<string, string>
    }
  }
}
