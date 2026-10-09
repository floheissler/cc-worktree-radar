/**
 * What `/radar` was asked, from its arguments.
 */

export type CommandRequest =
  | { readonly kind: 'toggle' }
  | { readonly kind: 'open'; readonly base: string }
  | { readonly kind: 'close' }
  | { readonly kind: 'help' }
  | { readonly kind: 'hold'; readonly branch: string; readonly reason: string }
  | { readonly kind: 'unhold'; readonly branch: string }
  | { readonly kind: 'usage' }

/**
 * Reads `/radar`'s arguments: none toggles the radar, `off` closes it,
 * `help` opens it on its help, a branch name opens it on that base,
 * `hold <branch> [reason]` and `unhold <branch>` park a branch and let it
 * go.
 *
 * @param args what followed the command
 * @returns the request
 */
export function commandRequestOf(args: string): CommandRequest {
  const words = args.trim().split(/\s+/).filter(word => word !== '')
  const [first, branch, ...rest] = words

  if (first === undefined) {
    return { kind: 'toggle' }
  }

  if ((first === 'off' || first === 'close') && words.length === 1) {
    return { kind: 'close' }
  }

  if (first === 'help' && words.length === 1) {
    return { kind: 'help' }
  }

  if (first === 'hold' && branch !== undefined) {
    return { kind: 'hold', branch, reason: rest.join(' ') }
  }

  if (first === 'unhold' && branch !== undefined && rest.length === 0) {
    return { kind: 'unhold', branch }
  }

  return words.length === 1 && first !== 'hold' && first !== 'unhold' ? { kind: 'open', base: first } : { kind: 'usage' }
}
