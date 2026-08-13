import * as vscode from 'vscode'

import { getLog } from '../log.js'
import { CONFIG_SECTION } from '../meta.js'
import { describePlan, LEGACY_SECTION, planMigration, type LegacyValues } from '../migrate.js'

/** Set once the offer has been made, so the user is not asked again. */
const OFFERED_KEY = 'migration.ollamaCommit.offered'

function readLegacy(): LegacyValues {
  const legacy = vscode.workspace.getConfiguration(LEGACY_SECTION)
  return {
    apiUrl: legacy.get('apiUrl'),
    model: legacy.get('model'),
    maxDiffLength: legacy.get('maxDiffLength'),
    prompt: legacy.get('prompt'),
  }
}

function readCurrent() {
  const own = vscode.workspace.getConfiguration(CONFIG_SECTION)
  const inspect = <T>(key: string): T | undefined => {
    const info = own.inspect<T>(key)
    // Only a value the user actually set counts as customized; the default does not.
    return info?.globalValue ?? info?.workspaceValue ?? info?.workspaceFolderValue
  }
  return {
    endpoint: inspect<string>('endpoint'),
    model: inspect<string>('model'),
    maxDiffChars: inspect<number>('maxDiffChars'),
    promptTemplate: inspect<string>('promptTemplate'),
  }
}

/**
 * Imports the abandoned extension's settings, under confirmation.
 *
 * Writes to the Global target: `endpoint` is machine-scoped and cannot live in workspace settings.
 */
export async function migrateLegacySettings(explicit: boolean): Promise<void> {
  const log = getLog()
  const plan = planMigration(readLegacy(), readCurrent())

  if (plan.entries.length === 0) {
    if (explicit) {
      void vscode.window.showInformationMessage(
        'No customized settings found for the Ollama Commit extension.',
      )
    }
    return
  }

  const preview = describePlan(plan)
  log.info(`migration plan:\n${preview}`)

  const choice = await vscode.window.showInformationMessage(
    `Import ${plan.entries.length} setting(s) from the Ollama Commit extension?`,
    { modal: true, detail: preview },
    'Import',
  )
  if (choice !== 'Import') {
    log.info('migration declined')
    return
  }

  const own = vscode.workspace.getConfiguration(CONFIG_SECTION)
  for (const entry of plan.entries) {
    const key = entry.to.slice(`${CONFIG_SECTION}.`.length)
    await own.update(key, entry.value, vscode.ConfigurationTarget.Global)
    log.info(`migrated ${entry.from} → ${entry.to}`)
  }

  void vscode.window.showInformationMessage(
    `Imported ${plan.entries.length} setting(s) from the Ollama Commit extension.`,
  )
}

/** Offers the import once, on the first activation that finds something to import. */
export async function offerMigrationOnce(context: vscode.ExtensionContext): Promise<void> {
  if (context.globalState.get<boolean>(OFFERED_KEY)) {
    return
  }
  const plan = planMigration(readLegacy(), readCurrent())
  if (plan.entries.length === 0) {
    return
  }
  // Recorded before asking: declining is an answer, and re-asking every window would be rude.
  await context.globalState.update(OFFERED_KEY, true)
  await migrateLegacySettings(false)
}
