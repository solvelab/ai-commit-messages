import * as vscode from 'vscode'

import { CONFIG_SECTION } from './meta.js'
import { SETTING_KEYS, readSettings, type ReadResult } from './settings.js'

/** Reads this extension's configuration section and validates it. */
export function currentSettings(scope?: vscode.Uri): ReadResult {
  const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION, scope ?? null)
  const raw: Record<string, unknown> = {}
  for (const key of SETTING_KEYS) {
    raw[key] = configuration.get(key)
  }
  return readSettings(raw)
}
