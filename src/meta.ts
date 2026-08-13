/**
 * Identity constants shared by the extension code.
 *
 * They are duplicated from `package.json` on purpose: the manifest is data read by VS Code before
 * the bundle exists, so it cannot be the runtime source. `meta.test.ts` asserts the two never
 * drift apart.
 */

/** Marketplace/Open VSX publisher id. */
export const PUBLISHER = 'solvelab'

/** Extension name, as in `package.json#name`. */
export const EXTENSION_NAME = 'ai-commit-messages'

/** Fully qualified id used by `vscode.extensions.getExtension`. */
export const EXTENSION_ID = `${PUBLISHER}.${EXTENSION_NAME}`

/** Prefix of every setting and command contributed by this extension. */
export const CONFIG_SECTION = 'aiCommitMessages'

/** Title of the extension's log output channel. */
export const OUTPUT_CHANNEL_NAME = 'AI Commit Messages'
