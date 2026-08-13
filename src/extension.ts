import * as vscode from 'vscode'

import { generateCommitMessage } from './commands/generate.js'
import { configure } from './commands/configure.js'
import { insertDefaultPrompt } from './commands/insertPrompt.js'
import { migrateLegacySettings, offerMigrationOnce } from './commands/migrate.js'
import { getGitApi } from './git/api.js'
import { createLog, disposeLog } from './log.js'
import { CONFIG_SECTION, OUTPUT_CHANNEL_NAME } from './meta.js'

export const GENERATE_COMMAND = `${CONFIG_SECTION}.generate`
export const MIGRATE_COMMAND = `${CONFIG_SECTION}.migrateSettings`
export const CONFIGURE_COMMAND = `${CONFIG_SECTION}.configure`
export const INSERT_PROMPT_COMMAND = `${CONFIG_SECTION}.insertDefaultPrompt`

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const log = createLog()
  context.subscriptions.push(log)

  context.subscriptions.push(
    vscode.commands.registerCommand(GENERATE_COMMAND, generateCommitMessage),
    vscode.commands.registerCommand(MIGRATE_COMMAND, () => migrateLegacySettings(true)),
    vscode.commands.registerCommand(CONFIGURE_COMMAND, configure),
    vscode.commands.registerCommand(INSERT_PROMPT_COMMAND, insertDefaultPrompt),
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

  // Offered once, and only when there is something to import.
  void offerMigrationOnce(context)
}

export function deactivate(): void {
  disposeLog()
}
