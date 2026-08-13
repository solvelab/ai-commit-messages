/**
 * Masking secrets before the diff leaves the machine.
 *
 * A staged diff routinely carries things that should never be sent anywhere: a freshly created
 * `.env`, a private key pasted by accident, a token in an example file, a connection string with a
 * password. With a local Ollama the damage is small; with a remote endpoint, a gateway or a paid
 * provider it is a real leak — and a silent one, because nothing on screen says it happened.
 *
 * Two rules govern every pattern below:
 *
 * - **Conservative before complete.** Deleting legitimate code is worse than missing a secret: it
 *   corrupts the generated message, which is the whole product. No entropy heuristics.
 * - **The structure of the diff is untouchable.** Line prefixes (`+`/`-`/space) and the `diff --git`
 *   and `@@` headers are what let the model read the patch at all.
 *
 * The replacement keeps a visible marker on purpose. The model must know a value *was* there,
 * otherwise it describes the change wrongly ("remove configuration" instead of "add API key").
 */

export type SecretKind =
  | 'private-key'
  | 'openai-key'
  | 'github-token'
  | 'slack-token'
  | 'aws-key'
  | 'jwt'
  | 'bearer'
  | 'env-assignment'

interface Pattern {
  readonly kind: SecretKind
  readonly re: RegExp
  /** Which capture group holds the secret. 0 means the whole match. */
  readonly group: number
}

/**
 * Names that mean "this value is a credential". Deliberately narrow: `password` alone in a line of
 * prose or a variable read is not enough — only an assignment with a value is masked.
 */
const SECRET_NAME = String.raw`(?:[A-Za-z0-9_]*(?:PASSWORD|PASSWD|SENHA|SECRET|TOKEN|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|CLIENT_?SECRET|AUTH)[A-Za-z0-9_]*)`

const PATTERNS: readonly Pattern[] = [
  // Whole PEM block, including the markers.
  {
    kind: 'private-key',
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    group: 0,
  },
  // A single PEM body line, for the common case where only part of the key is in the hunk.
  { kind: 'private-key', re: /^([+\- ])((?:[A-Za-z0-9+/]{60,}={0,2}))$/gm, group: 2 },
  { kind: 'openai-key', re: /\b(sk-(?:proj-)?[A-Za-z0-9_-]{20,})\b/g, group: 1 },
  { kind: 'github-token', re: /\b((?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,})\b/g, group: 1 },
  { kind: 'github-token', re: /\b(github_pat_[A-Za-z0-9_]{30,})\b/g, group: 1 },
  { kind: 'slack-token', re: /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g, group: 1 },
  { kind: 'aws-key', re: /\b((?:AKIA|ASIA)[A-Z0-9]{16})\b/g, group: 1 },
  { kind: 'jwt', re: /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g, group: 1 },
  { kind: 'bearer', re: /\b[Bb]earer\s+([A-Za-z0-9._~+/=-]{12,})/g, group: 1 },
  // `SECRET = "value"` / `SENHA=value`. The value must be non-trivial and not an obvious placeholder.
  {
    kind: 'env-assignment',
    re: new RegExp(String.raw`(?<=^[+\- ]?\s*(?:export\s+)?${SECRET_NAME}\s*[:=]\s*)(['"]?)([^'"\s#][^'"\n#]{5,})\1`, 'gmi'),
    group: 2,
  },
]

/** Values that are obviously not real credentials. Masking these would only add noise. */
const PLACEHOLDER =
  /^(?:x{3,}|\*{3,}|\.{3,}|<[^>]+>|\$\{[^}]+\}|\$[A-Z_]+|changeme|your[-_ ]?\w+|examplo?|example|dummy|placeholder|todo|null|none|true|false|\d+)$/i

export interface RedactionCount {
  readonly kind: SecretKind
  readonly count: number
}

export interface RedactionResult {
  readonly text: string
  /** What was masked, by kind. Never the values themselves. */
  readonly redactions: readonly RedactionCount[]
  readonly total: number
}

function marker(kind: SecretKind): string {
  return `«redacted:${kind}»`
}

/** True for a line that carries diff structure and must never be rewritten. */
function isStructural(line: string): boolean {
  return (
    line.startsWith('diff --git ') ||
    line.startsWith('index ') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ') ||
    line.startsWith('@@') ||
    line.startsWith('new file mode') ||
    line.startsWith('deleted file mode') ||
    line.startsWith('similarity index') ||
    line.startsWith('rename from') ||
    line.startsWith('rename to') ||
    line.startsWith('old mode') ||
    line.startsWith('new mode') ||
    line.startsWith('Binary files')
  )
}

/**
 * Masks secrets in a patch, leaving its structure intact.
 *
 * Structural lines are skipped entirely — a path or a hunk header that happens to look like a
 * token would otherwise break the patch for the model.
 */
export function redactPatch(patch: string): RedactionResult {
  const counts = new Map<SecretKind, number>()

  const bump = (kind: SecretKind) => {
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }

  // PEM blocks span lines, so they are handled before the line-by-line pass.
  let text = patch.replace(PATTERNS[0].re, match => {
    bump('private-key')
    // Keep the line prefixes so the hunk still parses.
    return match
      .split('\n')
      .map(line => {
        const prefix = /^[+\- ]/.test(line) ? line[0] : ''
        return `${prefix}${marker('private-key')}`
      })
      .join('\n')
  })

  text = text
    .split('\n')
    .map(line => {
      if (isStructural(line) || line.includes(marker('private-key'))) {
        return line
      }
      let out = line
      for (const pattern of PATTERNS.slice(1)) {
        out = out.replace(pattern.re, (match, ...groups) => {
          const value = String(groups[pattern.group - 1] ?? match)
          if (!value || PLACEHOLDER.test(value.trim())) {
            return match
          }
          // A later, broader pattern must not re-mask what a specific one already caught —
          // `OPENAI_API_KEY=«redacted:openai-key»` would otherwise become `«redacted:env-assignment»`
          // and lose the more useful kind.
          if (value.includes('«redacted:')) {
            return match
          }
          bump(pattern.kind)
          return match.replace(value, marker(pattern.kind))
        })
      }
      return out
    })
    .join('\n')

  const redactions = [...counts.entries()].map(([kind, count]) => ({ kind, count }))
  return {
    text,
    redactions,
    total: redactions.reduce((sum, r) => sum + r.count, 0),
  }
}

export interface RedactedFile {
  readonly path: string
  readonly patch: string
}

export interface RedactFilesResult {
  readonly files: RedactedFile[]
  /** Per file, so the log can name where secrets were found without printing them. */
  readonly byFile: { path: string; total: number; kinds: SecretKind[] }[]
  readonly total: number
}

export function redactFiles(files: readonly RedactedFile[]): RedactFilesResult {
  const out: RedactedFile[] = []
  const byFile: { path: string; total: number; kinds: SecretKind[] }[] = []
  let total = 0

  for (const file of files) {
    const result = redactPatch(file.patch)
    out.push({ path: file.path, patch: result.text })
    if (result.total > 0) {
      byFile.push({ path: file.path, total: result.total, kinds: result.redactions.map(r => r.kind) })
      total += result.total
    }
  }

  return { files: out, byFile, total }
}
