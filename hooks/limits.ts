/**
 * The radar's fixed numbers, in one place.
 */
const Limits = {
  /**
   * How long one git run may take. Git under `/mnt/c` and on network shares
   * is slow; a run past this counts as failed.
   */
  GIT_TIMEOUT_MS: 20_000,
  /**
   * How long `claude agents --json` may take.
   */
  SESSIONS_TIMEOUT_MS: 10_000,
  /**
   * Git runs in flight at once during a read.
   */
  GIT_PARALLEL: 8,
  /**
   * Between two checks for a change while the radar is open.
   */
  POLL_MS: 4_000,
  /**
   * How long a change must stand still before the radar reads the
   * repository again: a commit, a rebase or a checkout moves several refs
   * in a row.
   */
  SETTLE_MS: 2_000,
  /**
   * Longest a caller's note or status line is kept, in characters.
   */
  NOTE_CHARS: 200,
  /**
   * Longest a hold's reason is kept, in characters.
   */
  REASON_CHARS: 200,
  /**
   * How far back the base's first-parent line is read to tell a landed
   * branch from a fresh one; a tip older than that reads as fresh.
   */
  FIRST_PARENT_COMMITS: 10_000,
  /**
   * Names a summary lists before `+n more`.
   */
  LIST_NAMES: 3,
} as const

export default Limits
