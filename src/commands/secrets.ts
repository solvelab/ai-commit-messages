import * as vscode from 'vscode'

import { hostOf } from '../endpoint.js'
import { getLog } from '../log.js'
import { redactToken } from '../providers/auth.js'
import type { ProviderId } from '../settings.js'

/**
 * The credential lives in `SecretStorage` and nowhere else.
 *
 * `settings.json` is plaintext on disk, readable by every other extension through
 * `getConfiguration()`, synced to the user's account, and committable when it lands in
 * `.vscode/settings.json`. `SecretStorage` is per-extension, encrypted and explicitly not synced.
 */

let secrets: vscode.SecretStorage | undefined

export function initSecrets(context: vscode.ExtensionContext): void {
  secrets = context.secrets
}

/**
 * The credential is scoped to the **endpoint**, not just the provider.
 *
 * With a provider-only key, saving an OpenAI key and later switching the preset to Groq sent the
 * OpenAI credential to Groq's servers — the extension leaking one vendor's key to another.
 */
function key(provider: ProviderId, endpoint: string): string {
  return `aiCommitMessages.token.${provider}.${hostOf(endpoint)}`
}

export async function readToken(provider: ProviderId, endpoint: string): Promise<string | undefined> {
  const value = await secrets?.get(key(provider, endpoint))
  return value?.trim() ? value : undefined
}

export async function setToken(provider: ProviderId, endpoint: string): Promise<void> {
  const log = getLog()
  if (!secrets) {
    return
  }

  const token = await vscode.window.showInputBox({
    title: `AI Commit Messages: API key for ${hostOf(endpoint)}`,
    prompt:
        'Optional. Needed only when a gateway sits in front of the model server, or for a hosted endpoint. ' +
      `Saved for ${hostOf(endpoint)} only — it is never sent to a different host. Leave empty to remove it.`,
    password: true,
    ignoreFocusOut: true,
  })
  if (token === undefined) {
    return
  }

  if (!token.trim()) {
    await secrets.delete(key(provider, endpoint))
    log.info(`API key for ${hostOf(endpoint)} removed`)
    void vscode.window.showInformationMessage(`API key for ${hostOf(endpoint)} removed.`)
    return
  }

  await secrets.store(key(provider, endpoint), token.trim())
  // The value never reaches the log.
  log.info(`API key for ${hostOf(endpoint)} stored (${redactToken(token.trim())})`)
  void vscode.window.showInformationMessage(
    `API key for ${hostOf(endpoint)} saved to the secret store.`,
  )
}

/**
 * Stores a value handed over by the panel, where the input box belongs to the panel and not to us.
 *
 * Same rules as the command: the value goes only to `SecretStorage`, is bound to the host, and never
 * reaches the log.
 */
export async function setTokenValue(
  provider: ProviderId,
  endpoint: string,
  value: string,
): Promise<void> {
  if (!secrets) {
    return
  }
  const token = value.trim()
  if (!token) {
    return clearToken(provider, endpoint)
  }
  await secrets.store(key(provider, endpoint), token)
  getLog().info(`API key for ${hostOf(endpoint)} stored (${redactToken(token)})`)
  void vscode.window.showInformationMessage(`API key for ${hostOf(endpoint)} saved to the secret store.`)
}

export async function clearToken(provider: ProviderId, endpoint: string): Promise<void> {
  if (!secrets) {
    return
  }
  await secrets.delete(key(provider, endpoint))
  getLog().info(`API key for ${hostOf(endpoint)} cleared`)
  void vscode.window.showInformationMessage(`API key for ${hostOf(endpoint)} cleared.`)
}
