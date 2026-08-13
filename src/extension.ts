import * as vscode from 'vscode'

import { OUTPUT_CHANNEL_NAME } from './meta.js'

let log: vscode.LogOutputChannel | undefined

/** The extension's log channel. Detail goes here; notifications stay one line. */
export function getLog(): vscode.LogOutputChannel {
  if (!log) {
    throw new Error('Log channel requested before activation')
  }
  return log
}

export function activate(context: vscode.ExtensionContext): void {
  log = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME, { log: true })
  context.subscriptions.push(log)
  log.info(`${OUTPUT_CHANNEL_NAME} activated`)
}

export function deactivate(): void {
  log = undefined
}
