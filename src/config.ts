import * as vscode from 'vscode'

import { CONFIG_SECTION } from './meta.js'
import { readSettings, type ReadResult } from './settings.js'

/** Reads this extension's configuration section and validates it. */
export function currentSettings(scope?: vscode.Uri): ReadResult {
  const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION, scope ?? null)
  const raw: Record<string, unknown> = {}
  for (const key of [
    'provider',
    'endpoint',
    'model',
    'language',
    'promptTemplate',
    'maxDiffChars',
    'maxBodyWords',
    'temperature',
    'timeoutMs',
  ]) {
    raw[key] = configuration.get(key)
  }
  return readSettings(raw)
}
