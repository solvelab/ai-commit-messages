import * as vscode from 'vscode'

import { currentSettings } from '../config.js'
import { getLog } from '../log.js'
import { CONFIG_SECTION } from '../meta.js'
import { buildSystemPrompt } from '../prompt/template.js'
import { languageName } from '../prompt/languages.js'
import { hasCustomValue } from '../configScope.js'
import { reportWriteFailure, writeSetting } from './writeSetting.js'

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
  // The `??` chain used here before treated an empty global value as "nothing set" and skipped the
  // workspace one entirely.
  const hasCustom = hasCustomValue(existing)

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

  // Writing globally while a workspace value exists is a write nobody observes: the workspace one
  // keeps winning, and the command reports a success the user cannot see.
  const written = await writeSetting('promptTemplate', prompt)
  if (!written.ok) {
    await reportWriteFailure('promptTemplate', prompt, written)
    return
  }
  log.info(`inserted the built-in ${settings.language} prompt into promptTemplate`)

  await vscode.commands.executeCommand(
    'workbench.action.openSettings',
    `${CONFIG_SECTION}.promptTemplate`,
  )
}
