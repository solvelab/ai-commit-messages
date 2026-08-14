import * as vscode from 'vscode'

import { readToken } from './commands/secrets.js'
import { currentSettings } from './config.js'
import { hostOf } from './endpoint.js'
import { CONFIG_SECTION } from './meta.js'
import { busyLabel, statusLabel } from './statusLabel.js'

/**
 * The one place that can show the configuration actually in effect.
 *
 * A settings description is static text, so the page cannot display a value; the endpoint is
 * machine-scoped and hidden from the User tab; and the model can be shadowed by another scope. The
 * status bar answers "which endpoint and which model am I using" without opening anything.
 */
/** Set once the status bar exists; both are undefined until then. */
let statusItem: vscode.StatusBarItem | undefined
let refreshStatus: (() => Promise<void>) | undefined

/**
 * Shows the status bar working, and returns the call that puts it back.
 *
 * Restoring is the caller's job, in a `finally`: a spinner left behind after an error or a
 * cancellation would claim work that is not happening.
 */
export function markBusy(model: string): () => void {
  const item = statusItem
  if (!item) {
    return () => undefined
  }

  item.text = busyLabel(model)
  item.tooltip = 'AI Commit Messages is generating a commit message.'
  item.backgroundColor = undefined

  return () => {
    void refreshStatus?.()
  }
}

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

  statusItem = item
  refreshStatus = refresh
  context.subscriptions.push({
    dispose: () => {
      statusItem = undefined
      refreshStatus = undefined
    },
  })

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
