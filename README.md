# worktree-radar

A Claude Code mod for running several Claude sessions in parallel, each on its
own branch or worktree. `/radar` shows a live view of them in the band above
the prompt: which branches merge cleanly into the base branch, which conflict,
which are stacked on another, which a Claude session is still working on,
and the order to land them in.

It only looks. It never merges, rebases, tags, pushes or moves a ref.

Status: in development, not released yet.

## License

MIT, see [LICENSE](LICENSE).
