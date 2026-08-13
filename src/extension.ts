import * as vscode from 'vscode'

import { generateCommitMessage } from './commands/generate.js'
import { getGitApi } from './git/api.js'
import { createLog, disposeLog } from './log.js'
import { CONFIG_SECTION, OUTPUT_CHANNEL_NAME } from './meta.js'

export const GENERATE_COMMAND = `${CONFIG_SECTION}.generate`

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const log = createLog()
  context.subscriptions.push(log)

  context.subscriptions.push(
    vscode.commands.registerCommand(GENERATE_COMMAND, generateCommitMessage),
  )

  // Also offer the command in the commit button's dropdown. Stable API, unlike `scm/inputBox`.
  const git = await getGitApi()
  if (git) {
    context.subscriptions.push(
      git.registerPostCommitCommandsProvider({
        getCommands: () => [
          {
            command: GENERATE_COMMAND,
            title: 'Generate Commit Message',
          },
        ],
      }),
    )
  } else {
    log.warn('Git extension unavailable — post-commit command not registered')
  }

  log.info(`${OUTPUT_CHANNEL_NAME} activated`)
}

export function deactivate(): void {
  disposeLog()
}
