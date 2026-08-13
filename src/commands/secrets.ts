import * as vscode from 'vscode'

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

function key(provider: ProviderId): string {
  // Per provider from the start: the OpenAI-compatible backend will need its own.
  return `aiCommitMessages.token.${provider}`
}

export async function readToken(provider: ProviderId): Promise<string | undefined> {
  const value = await secrets?.get(key(provider))
  return value?.trim() ? value : undefined
}

export async function setToken(provider: ProviderId): Promise<void> {
  const log = getLog()
  if (!secrets) {
    return
  }

  const token = await vscode.window.showInputBox({
    title: `AI Commit Messages: token for ${provider}`,
    prompt:
      'Optional. Needed only when a gateway sits in front of the model server, or for a hosted endpoint. Leave empty to remove it.',
    password: true,
    ignoreFocusOut: true,
  })
  if (token === undefined) {
    return
  }

  if (!token.trim()) {
    await secrets.delete(key(provider))
    log.info(`token for ${provider} removed`)
    void vscode.window.showInformationMessage(`Token for ${provider} removed.`)
    return
  }

  await secrets.store(key(provider), token.trim())
  // The value never reaches the log.
  log.info(`token for ${provider} stored (${redactToken(token.trim())})`)
  void vscode.window.showInformationMessage(`Token for ${provider} saved to the secret store.`)
}

export async function clearToken(provider: ProviderId): Promise<void> {
  if (!secrets) {
    return
  }
  await secrets.delete(key(provider))
  getLog().info(`token for ${provider} cleared`)
  void vscode.window.showInformationMessage(`Token for ${provider} cleared.`)
}
