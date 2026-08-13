import * as vscode from 'vscode'

import { currentSettings } from '../config.js'
import { getLog } from '../log.js'
import { CONFIG_SECTION } from '../meta.js'
import { validateEndpointInput } from '../configurePlan.js'

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

  // Global, always: under a remote session VS Code resolves this to the remote settings file, which
  // is where a per-machine endpoint belongs.
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update('endpoint', value.trim(), vscode.ConfigurationTarget.Global)

  const stored = currentSettings().settings.endpoint
  getLog().info(`endpoint set to ${stored}`)
  void vscode.window.showInformationMessage(`Endpoint set to ${stored}.`)
}
