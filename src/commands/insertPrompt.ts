import * as vscode from 'vscode'

import { currentSettings } from '../config.js'
import { getLog } from '../log.js'
import { CONFIG_SECTION } from '../meta.js'
import { buildSystemPrompt } from '../prompt/template.js'
import { languageName } from '../prompt/languages.js'

/**
 * Materializes the built-in prompt into the setting.
 *
 * An empty `promptTemplate` means "use the built-in one", which is the right default and a bad way
 * to learn what is actually sent to the model. This writes the resolved text — placeholders already
 * substituted — so it can be read and edited.
 */
export async function insertDefaultPrompt(): Promise<void> {
  const log = getLog()
  const { settings } = currentSettings()

  const prompt = buildSystemPrompt({
    language: { tag: settings.language, name: languageName(settings.language) },
    maxBodyWords: settings.maxBodyWords,
  })

  const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION)
  const existing = configuration.inspect<string>('promptTemplate')
  const hasCustom = Boolean(
    existing?.globalValue?.trim() ??
      existing?.workspaceValue?.trim() ??
      existing?.workspaceFolderValue?.trim(),
  )

  if (hasCustom) {
    const choice = await vscode.window.showWarningMessage(
      'You already have a custom prompt. Replace it with the built-in one?',
      { modal: true, detail: 'Your current prompt will be overwritten.' },
      'Replace',
    )
    if (choice !== 'Replace') {
      return
    }
  }

  await configuration.update('promptTemplate', prompt, vscode.ConfigurationTarget.Global)
  log.info(`inserted the built-in ${settings.language} prompt into promptTemplate`)

  await vscode.commands.executeCommand(
    'workbench.action.openSettings',
    `${CONFIG_SECTION}.promptTemplate`,
  )
}
