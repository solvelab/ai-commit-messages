import * as vscode from 'vscode'

import { readToken } from './commands/secrets.js'
import { currentSettings } from './config.js'
import { hostOf } from './endpoint.js'
import { CONFIG_SECTION } from './meta.js'
import { statusLabel } from './statusLabel.js'

/**
 * The one place that can show the configuration actually in effect.
 *
 * A settings description is static text, so the page cannot display a value; the endpoint is
 * machine-scoped and hidden from the User tab; and the model can be shadowed by another scope. The
 * status bar answers "which endpoint and which model am I using" without opening anything.
 */
export function createStatusBar(context: vscode.ExtensionContext, configureCommand: string): void {
  const item = vscode.window.createStatusBarItem(
    'aiCommitMessages.status',
    vscode.StatusBarAlignment.Left,
    -10,
  )
  item.name = 'AI Commit Messages'
  item.command = configureCommand
  context.subscriptions.push(item)

  const refresh = async (): Promise<void> => {
    const { settings } = currentSettings()
    const label = statusLabel({
      model: settings.model,
      host: hostOf(settings.endpoint),
      backendLabel: settings.backend.label,
      hasKey: Boolean(await readToken(settings.provider, settings.endpoint)),
      requiresKey: settings.backend.requiresToken,
      endpoint: settings.endpoint,
    })
    item.text = label.text
    item.tooltip = label.tooltip
    // Reserved for what needs attention: a missing model, endpoint or required key.
    item.backgroundColor = label.warning
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : undefined
    item.show()
  }

  context.subscriptions.push(
    // Only our own settings rebuild it — not every keystroke in every file.
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(CONFIG_SECTION)) {
        void refresh()
      }
    }),
    // A key lives in SecretStorage, which fires its own event.
    context.secrets.onDidChange(() => void refresh()),
  )

  void refresh()
}
