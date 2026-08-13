/**
 * Keeping machine-generated files from eating the prompt budget.
 *
 * A commit that touches `package-lock.json` would otherwise spend the whole budget on noise and
 * push the actual code out of the prompt — so the model describes the lockfile instead of the
 * change.
 *
 * Excluded files are **not** dropped: their header stays, with an omission marker. "update the
 * lockfile" is legitimate information for a commit message; the twelve thousand changed lines are
 * not.
 */

/** What every serious tool in this space excludes, and for the same reason. */
export const DEFAULT_EXCLUDE_GLOBS: readonly string[] = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'Cargo.lock',
  'poetry.lock',
  'Pipfile.lock',
  'Gemfile.lock',
  'composer.lock',
  'go.sum',
  '*.min.js',
  '*.min.css',
  '*.map',
  'dist/**',
  'build/**',
  'vendor/**',
  'node_modules/**',
  '*.snap',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.webp',
  '*.ico',
  '*.pdf',
]

/**
 * Compiles one glob into a regular expression.
 *
 * Supports `*` (no separator), `**` (any depth) and `?`. Everything else is literal — a glob
 * dialect nobody has to learn.
 */
export function globToRegExp(glob: string): RegExp | undefined {
  const trimmed = glob.trim()
  if (!trimmed) {
    return undefined
  }

  let out = ''
  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i]
    if (char === '*') {
      if (trimmed[i + 1] === '*') {
        // `**/` and `/**` both mean "any number of segments".
        out += '.*'
        i += 1
        if (trimmed[i + 1] === '/') {
          i += 1
        }
      } else {
        out += '[^/]*'
      }
    } else if (char === '?') {
      out += '[^/]'
    } else {
      out += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }

  try {
    // Anchored on a path that may be absolute: a bare name matches the basename too.
    return new RegExp(`(?:^|/)${out}$`, 'i')
  } catch {
    return undefined
  }
}

export interface Matcher {
  matches(path: string): boolean
  /** Globs that could not be compiled, reported rather than silently ignored. */
  readonly invalid: readonly string[]
}

export function createMatcher(globs: readonly string[]): Matcher {
  const compiled: RegExp[] = []
  const invalid: string[] = []

  for (const glob of globs) {
    const re = globToRegExp(glob)
    if (re) {
      compiled.push(re)
    } else if (glob.trim()) {
      invalid.push(glob)
    }
  }

  return {
    matches(path: string) {
      const normalized = path.replace(/\\/g, '/')
      return compiled.some(re => re.test(normalized))
    },
    invalid,
  }
}

/** Rough classification used to decide what gets the budget first. */
export type FileClass = 'code' | 'config' | 'docs' | 'generated'

const CONFIG = /\.(json|ya?ml|toml|ini|conf|cfg|env|properties)$|^\.[^/]*rc$|dockerfile$/i
const DOCS = /\.(md|mdx|txt|rst|adoc)$/i

export function classify(path: string, isGenerated: boolean): FileClass {
  if (isGenerated) {
    return 'generated'
  }
  const name = path.replace(/\\/g, '/').split('/').pop() ?? path
  if (DOCS.test(name)) {
    return 'docs'
  }
  if (CONFIG.test(name)) {
    return 'config'
  }
  return 'code'
}

const ORDER: Record<FileClass, number> = { code: 0, config: 1, docs: 2, generated: 3 }

export interface Classified<T> {
  readonly file: T
  readonly kind: FileClass
}

/**
 * Sorts so the budget is spent on code first. Stable within each class, so the order git reported
 * is preserved where it does not matter.
 */
export function prioritize<T extends { path: string }>(
  files: readonly T[],
  matcher: Matcher,
): Classified<T>[] {
  return files
    .map((file, index) => ({ file, index, kind: classify(file.path, matcher.matches(file.path)) }))
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.index - b.index)
    .map(({ file, kind }) => ({ file, kind }))
}

/** First line of a patch, which names the file for the model even when the body is dropped. */
export function headerOnly(patch: string, path: string): string {
  const firstLine = patch.split('\n').find(line => line.startsWith('diff --git '))
  return `${firstLine ?? `diff --git a/${path} b/${path}`}\n[generated file — body omitted]`
}
