import * as vscode from 'vscode'

import { generateCommitMessage } from './commands/generate.js'
import { configure } from './commands/configure.js'
import { diagnose } from './commands/diagnose.js'
import { cachedModelIds, initModelCache, selectModel } from './commands/selectModel.js'
import { currentSettings } from './config.js'
import { insertDefaultPrompt } from './commands/insertPrompt.js'
import { migrateLegacySettings, offerMigrationOnce } from './commands/migrate.js'
import { clearToken, initSecrets, readToken, setToken } from './commands/secrets.js'
import { setEndpoint } from './commands/setEndpoint.js'
import { getGitApi } from './git/api.js'
import { createLog, disposeLog } from './log.js'
import { createStatusBar } from './statusBar.js'
import { hostOf } from './endpoint.js'
import { CONFIG_SECTION, OUTPUT_CHANNEL_NAME } from './meta.js'
import { knownModels } from './models/catalog.js'
import { modelBelongs } from './models/belongs.js'

export const GENERATE_COMMAND = `${CONFIG_SECTION}.generate`
export const MIGRATE_COMMAND = `${CONFIG_SECTION}.migrateSettings`
export const CONFIGURE_COMMAND = `${CONFIG_SECTION}.configure`
export const INSERT_PROMPT_COMMAND = `${CONFIG_SECTION}.insertDefaultPrompt`

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const log = createLog()
  context.subscriptions.push(log)
  initSecrets(context)
  initModelCache(context)

  context.subscriptions.push(
    vscode.commands.registerCommand(GENERATE_COMMAND, generateCommitMessage),
    vscode.commands.registerCommand(MIGRATE_COMMAND, () => migrateLegacySettings(true)),
    vscode.commands.registerCommand(CONFIGURE_COMMAND, configure),
    vscode.commands.registerCommand(`${CONFIG_SECTION}.diagnose`, diagnose),
    vscode.commands.registerCommand(`${CONFIG_SECTION}.selectModel`, selectModel),
    vscode.commands.registerCommand(`${CONFIG_SECTION}.setEndpoint`, setEndpoint),
    vscode.commands.registerCommand(INSERT_PROMPT_COMMAND, insertDefaultPrompt),
    vscode.commands.registerCommand(`${CONFIG_SECTION}.setToken`, async () => {
      const { settings } = currentSettings()
      await setToken(settings.provider, settings.endpoint)
    }),
    vscode.commands.registerCommand(`${CONFIG_SECTION}.clearToken`, async () => {
      const { settings } = currentSettings()
      await clearToken(settings.provider, settings.endpoint)
    }),
  )

  createStatusBar(context, CONFIGURE_COMMAND)

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      // Only the backend change matters: it is the moment a model stops existing.
      if (event.affectsConfiguration(`${CONFIG_SECTION}.provider`)) {
        void warnAboutLeftoverModel()
        void warnAboutMissingKey()
      }
    }),
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

/**
 * Says something when the configured model does not belong to the backend just chosen.
 *
 * A warning, never a correction: picking a model on someone's behalf is guessing what they will
 * use. Silent when nothing is known about the backend — see `modelBelongs`.
 */
async function warnAboutLeftoverModel(): Promise<void> {
  const { settings } = currentSettings()
  const belongs = modelBelongs({
    model: settings.model,
    cached: cachedModelIds(settings.backend.id, hostOf(settings.endpoint)),
    builtin: knownModels(settings.backend.id),
  })
  if (belongs !== 'no') {
    return
  }

  const choice = await vscode.window.showWarningMessage(
    `"${settings.model}" is not a model of ${settings.backend.label}.`,
    'Select model…',
  )
  if (choice === 'Select model…') {
    await selectModel()
  }
}

/**
 * Says something when the backend just chosen needs an API key and none is stored for that host.
 *
 * Without this the only signal is the generation failing later, with whatever the server chose to
 * answer. Local Ollama never sees it: `requiresToken` is false there.
 */
async function warnAboutMissingKey(): Promise<void> {
  const { settings } = currentSettings()
  if (!settings.backend.requiresToken) {
    return
  }
  if (await readToken(settings.provider, settings.endpoint)) {
    return
  }

  const choice = await vscode.window.showWarningMessage(
    `${settings.backend.label} needs an API key, and none is stored for ${hostOf(settings.endpoint)}.`,
    'Set API key…',
  )
  if (choice === 'Set API key…') {
    await setToken(settings.provider, settings.endpoint)
  }
}

