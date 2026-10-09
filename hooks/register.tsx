import type { Register } from 'claude-code'

/**
 * Registers the radar. Nothing yet: the analysis and the band follow.
 */
export const register: Register = on => {
  on('session.start', ($, e, next) => next(e))
}
