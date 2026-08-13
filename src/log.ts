import * as vscode from 'vscode'

import { OUTPUT_CHANNEL_NAME } from './meta.js'

let channel: vscode.LogOutputChannel | undefined

/** Creates the channel. Called once, from `activate`. */
export function createLog(): vscode.LogOutputChannel {
  channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME, { log: true })
  return channel
}

/**
 * The extension's log channel: detail goes here, while notifications stay one line.
 *
 * Levels honour `env.logLevel`, so verbosity is raised with `Developer: Set Log Level…` rather
 * than with a setting of our own.
 */
export function getLog(): vscode.LogOutputChannel {
  if (!channel) {
    throw new Error('Log channel requested before activation')
  }
  return channel
}

export function disposeLog(): void {
  channel = undefined
}
