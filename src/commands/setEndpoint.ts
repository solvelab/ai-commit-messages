import * as vscode from 'vscode'

import { currentSettings } from '../config.js'
import { getLog } from '../log.js'
import { validateEndpointInput } from '../configurePlan.js'
import { reportWriteFailure, writeSetting } from './writeSetting.js'

/**
 * Edits the endpoint from anywhere, including the tab where it is not shown.
 *
 * `endpoint` is `machine`-scoped, and VS Code hides `machine` settings from the **User** tab in a
 * remote session — they live under **Remote**. The scope is not decoration: a `machine` setting
 * cannot be written in `.vscode/settings.json`, so a cloned repository cannot point the staged diff
 * at someone else's server. Keeping that guarantee while leaving the field unreachable from the tab
 * people are actually looking at is what this command fixes.
 */
export async function setEndpoint(): Promise<void> {
  const { settings } = currentSettings()

  const value = await vscode.window.showInputBox({
    title: `AI Commit Messages: endpoint for ${settings.backend.label}`,
    prompt:
      'Base URL of the model server — not a full endpoint. A path such as /api/generate is trimmed. ' +
      'It is stored per machine and never synced, so a laptop and a remote host can differ.',
    value: settings.endpoint,
    placeHolder: settings.backend.defaultEndpoint || 'http://192.168.15.6:11434',
    validateInput: input => validateEndpointInput(input, settings.backend.adapter),
    ignoreFocusOut: true,
  })
  if (value === undefined) {
    return
  }

  // Machine-scoped, so under a remote session this lands in the remote settings file — where a
  // per-machine endpoint belongs. The write is read back before anything is announced.
  const written = await writeSetting('endpoint', value.trim())
  if (!written.ok) {
    await reportWriteFailure('endpoint', value.trim(), written)
    return
  }

  // What the settings file holds is the raw URL; what the extension talks to is the normalized one.
  const stored = currentSettings().settings.endpoint
  getLog().info(`endpoint set to ${stored}`)
  void vscode.window.showInformationMessage(`Endpoint set to ${stored}.`)
}
