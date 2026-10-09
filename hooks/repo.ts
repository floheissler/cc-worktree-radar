import type { Git } from './git'

/**
 * What git says about a repository's branches and worktrees, read and
 * parsed. Paths are git's own spelling: `/`-separated on every platform
 * (Git for Windows writes `C:/…`), which `$.fs` takes as it is.
 */

export type Head = {
  readonly sha: string
  /**
   * The tip's commit time, in seconds since the epoch.
   */
  readonly committedAt: number
  readonly upstream: string | null
}

export type Worktree = {
  readonly path: string
  /**
   * The branch checked out there; mid-rebase, the branch being rebased.
   */
  readonly branch: string | null
  readonly isRebasing: boolean
  /**
   * Its folder is gone.
   */
  readonly isPrunable: boolean
  /**
   * Why it is locked (`git worktree lock --reason`): '' for a lock with no
   * reason, null when it is not locked.
   */
  readonly lock: string | null
}

/**
 * Where a repository lives: the folder the radar was opened from belongs
 * to one of its worktrees.
 */
export type Place = {
  /**
   * The top of the worktree holding the folder.
   */
  readonly top: string
  /**
   * The repository's own `.git` folder, shared by every worktree.
   */
  readonly commonDir: string
}

export const HEADS_FORMAT = '%(refname)%00%(objectname)%00%(committerdate:unix)%00%(upstream:short)'

/**
 * Parses `git for-each-ref --format=<HEADS_FORMAT> refs/heads`.
 *
 * @param stdout what git wrote
 * @returns the branches by name
 */
export function parseHeads(stdout: string): Map<string, Head> {
  const heads = new Map<string, Head>()

  for (const line of stdout.split('\n')) {
    const [ref, sha, time, upstream] = line.split('\0')

    if (ref === undefined || sha === undefined || !ref.startsWith('refs/heads/')) {
      continue
    }

    heads.set(ref.slice('refs/heads/'.length), {
      sha,
      committedAt: Number.parseInt(time ?? '', 10) || 0,
      upstream: upstream === undefined || upstream === '' ? null : upstream,
    })
  }

  return heads
}

/**
 * One block of `git worktree list --porcelain`, its fields by name.
 */
export type WorktreeBlock = {
  readonly path: string
  readonly branch: string | null
  readonly isDetached: boolean
  readonly isPrunable: boolean
  readonly lock: string | null
}

/**
 * Parses `git worktree list --porcelain`. Git lists the main worktree first.
 *
 * @param stdout what git wrote
 * @returns the worktrees, in git's order
 */
export function parseWorktrees(stdout: string): WorktreeBlock[] {
  const blocks: WorktreeBlock[] = []

  for (const block of stdout.split(/\n\n+/)) {
    const fields = new Map<string, string>()

    for (const line of block.split('\n')) {
      const space = line.indexOf(' ')

      fields.set(space === -1 ? line : line.slice(0, space), space === -1 ? '' : line.slice(space + 1))
    }

    const path = fields.get('worktree')

    if (path === undefined) {
      continue
    }

    const branch = fields.get('branch')

    blocks.push({
      path,
      branch: branch === undefined || branch === '' ? null : branch.replace(/^refs\/heads\//, ''),
      isDetached: fields.has('detached'),
      isPrunable: fields.has('prunable'),
      lock: fields.get('locked') ?? null,
    })
  }

  return blocks
}

/**
 * Finds the repository a folder belongs to.
 *
 * @param git git, bound to the folder
 * @returns where it lives, or null outside any repository or without git
 */
export async function placeOf(git: Git): Promise<Place | null> {
  const out = await git(['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir'])
  const [top, commonDir] = out === null ? [] : out.stdout.trim().split('\n')

  return top === undefined || commonDir === undefined || top === '' ? null : { top, commonDir }
}

/**
 * The branch the others land on: the one asked for, else the remote's
 * default (`origin/HEAD`), else `main`, else `master`.
 *
 * @param heads the local branches
 * @param originHead what `origin/HEAD` points at (`origin/main`), if set
 * @param wanted the base asked for, if any
 * @returns the base, or null where none of them is a local branch
 */
export function baseOf(heads: ReadonlyMap<string, Head>, originHead: string | null, wanted: string | null): string | null {
  if (wanted !== null) {
    return heads.has(wanted) ? wanted : null
  }

  const remote = originHead === null ? [] : [originHead.slice(originHead.indexOf('/') + 1)]

  return [...remote, 'main', 'master'].find(name => name !== '' && heads.has(name)) ?? null
}

/**
 * Reads the local branches.
 *
 * @param git git, bound to the repository
 * @returns the branches by name, or null where git failed
 */
export async function readHeads(git: Git): Promise<Map<string, Head> | null> {
  const out = await git(['for-each-ref', `--format=${HEADS_FORMAT}`, 'refs/heads'])

  return out === null ? null : parseHeads(out.stdout)
}

/**
 * Reads what `origin/HEAD` points at.
 *
 * @param git git, bound to the repository
 * @returns `origin/<branch>`, or null where it is not set
 */
export async function readOriginHead(git: Git): Promise<string | null> {
  const out = await git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { ok: [0, 1, 128] })
  const name = out?.code === 0 ? out.stdout.trim() : ''

  return name === '' ? null : name
}

/**
 * Reads the worktrees, and for each detached one whether a rebase holds it:
 * mid-rebase, git detaches HEAD, and the branch being rebased would
 * otherwise lose its worktree (and the session in it).
 *
 * @param git git, bound to the repository
 * @param readText reads a file's text, null where it cannot
 * @returns the worktrees, the main one first, or null where git failed
 */
export async function readWorktrees(
  git: Git,
  readText: (path: string) => Promise<string | null>,
): Promise<Worktree[] | null> {
  const out = await git(['worktree', 'list', '--porcelain'])

  if (out === null) {
    return null
  }

  return Promise.all(
    parseWorktrees(out.stdout).map(async block => {
      const rebased = block.isDetached && !block.isPrunable ? await rebasedBranchOf(git, block.path, readText) : null

      return {
        path: block.path,
        branch: block.branch ?? rebased,
        isRebasing: rebased !== null,
        isPrunable: block.isPrunable,
        lock: block.lock,
      }
    }),
  )
}

/**
 * The branch a rebase in a worktree is rebasing.
 *
 * @param git git
 * @param path the worktree
 * @param readText reads a file's text
 * @returns the branch, or null with no rebase under way
 */
async function rebasedBranchOf(
  git: Git,
  path: string,
  readText: (path: string) => Promise<string | null>,
): Promise<string | null> {
  const out = await git(
    ['rev-parse', '--path-format=absolute', '--git-path', 'rebase-merge/head-name', '--git-path', 'rebase-apply/head-name'],
    { cwd: path },
  )

  for (const file of out === null ? [] : out.stdout.trim().split('\n')) {
    const text = await readText(file)
    const name = text?.trim().replace(/^refs\/heads\//, '') ?? ''

    if (name !== '') {
      return name
    }
  }

  return null
}

/**
 * Counts the lines of `git status --porcelain`.
 *
 * @param stdout what git wrote
 * @returns the files it lists
 */
export function countStatus(stdout: string): number {
  return stdout.split('\n').filter(line => line.trim() !== '').length
}

/**
 * Shows a worktree's path relative to the main worktree when it lies inside
 * it (`.claude/worktrees/feat-x`), else whole.
 *
 * @param main the main worktree's folder
 * @param path a worktree's folder
 * @returns the path to show
 */
export function displayPathOf(main: string, path: string): string {
  const prefix = main.endsWith('/') ? main : `${main}/`

  if (path === main) {
    return '.'
  }

  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}
