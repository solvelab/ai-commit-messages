/**
 * Turning the command's argument into "the repository the user meant".
 *
 * This module is deliberately free of `vscode` imports: the cascade is the part worth testing, and
 * the host below is the only thing that needs the editor. `api.ts` supplies the real host.
 *
 * Why a cascade at all — the argument is not a repository, and is not even always present:
 *
 * - From `scm/title` the core passes a `vscode.SourceControl`, but only when a single repository is
 *   visible; with more than one it passes `undefined`
 *   (`scmViewPane.ts#getActionsContext`).
 * - Across the extension-host RPC that object exposes both the public getter `rootUri` and the
 *   underlying own-property `_rootUri`, so both have to be read.
 * - From the command palette or a keybinding there is no argument at all.
 *
 * The extension this replaces used `repositories[0]`, which silently writes the message into the
 * wrong repository in any multi-root workspace.
 */

/** Minimal shape of a `vscode.Uri`, structurally matched to avoid importing `vscode`. */
export interface UriLike {
  readonly scheme: string
  readonly path: string
  toString(): string
}

/** Minimal shape of a git `Repository`. */
export interface RepositoryLike {
  readonly rootUri: UriLike
  readonly ui: { readonly selected: boolean }
}

/** Everything the cascade needs from the editor and from the git API. */
export interface ResolverHost<R extends RepositoryLike> {
  readonly repositories: readonly R[]
  getRepository(uri: UriLike): R | null
  openRepository(uri: UriLike): Promise<R | null>
  /** URI of the document in the active editor, if any. */
  activeDocumentUri(): UriLike | undefined
  /** Asks the user which repository to use. Resolves to `undefined` when dismissed. */
  pick(candidates: readonly R[]): Promise<R | undefined>
}

/** How the repository was chosen — logged so a wrong pick is diagnosable. */
export type ResolutionSource =
  | 'source-control-arg'
  | 'uri-arg'
  | 'selected-in-scm-view'
  | 'active-editor'
  | 'only-repository'
  | 'user-pick'
  | 'none'

export interface Resolution<R extends RepositoryLike> {
  readonly repository: R | undefined
  readonly source: ResolutionSource
}

function isUriLike(value: unknown): value is UriLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as UriLike).scheme === 'string' &&
    typeof (value as UriLike).path === 'string'
  )
}

/**
 * Reads the root URI out of an `scm/title` argument.
 *
 * Both spellings are checked on purpose: `rootUri` is the public getter and `_rootUri` is the own
 * property that survives the RPC marshalling.
 */
function rootUriOf(value: unknown): UriLike | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const candidate = value as { rootUri?: unknown; _rootUri?: unknown }
  if (isUriLike(candidate.rootUri)) {
    return candidate.rootUri
  }
  if (isUriLike(candidate._rootUri)) {
    return candidate._rootUri
  }
  return undefined
}

function sameRoot(a: UriLike, b: UriLike): boolean {
  return a.toString() === b.toString()
}

export async function resolveRepository<R extends RepositoryLike>(
  arg: unknown,
  host: ResolverHost<R>,
): Promise<Resolution<R>> {
  // 1. A SourceControl handed over by the scm/title menu.
  const root = rootUriOf(arg)
  if (root) {
    const match = host.repositories.find(repo => sameRoot(repo.rootUri, root))
    if (match) {
      return { repository: match, source: 'source-control-arg' }
    }
  }

  // 2. A plain Uri (some surfaces pass one).
  if (isUriLike(arg)) {
    const known = host.getRepository(arg)
    if (known) {
      return { repository: known, source: 'uri-arg' }
    }
    const opened = await host.openRepository(arg)
    if (opened) {
      return { repository: opened, source: 'uri-arg' }
    }
  }

  // 3. Whatever the user has selected in the Source Control view.
  const selected = host.repositories.find(repo => repo.ui.selected)
  if (selected) {
    return { repository: selected, source: 'selected-in-scm-view' }
  }

  // 4. The repository owning the file being edited.
  const activeUri = host.activeDocumentUri()
  if (activeUri) {
    const fromEditor = host.getRepository(activeUri)
    if (fromEditor) {
      return { repository: fromEditor, source: 'active-editor' }
    }
  }

  // 5. Unambiguous single repository.
  if (host.repositories.length === 1) {
    return { repository: host.repositories[0], source: 'only-repository' }
  }

  // 6. Ambiguous: ask instead of guessing.
  if (host.repositories.length > 1) {
    const picked = await host.pick(host.repositories)
    return { repository: picked, source: picked ? 'user-pick' : 'none' }
  }

  return { repository: undefined, source: 'none' }
}
