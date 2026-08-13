import * as vscode from 'vscode'

import { diagnoseShadow, targetForWrite, type ConfigScope, type Shadow } from '../configScope.js'
import { getLog } from '../log.js'
import { CONFIG_SECTION } from '../meta.js'

/**
 * Writing a setting and proving it took effect.
 *
 * `Select model…` once announced "Model set to gpt-4o-mini." while the field kept showing
 * `qwen2.5-coder:7b`. It had written and claimed success without ever reading back. Two different
 * things can beat a write, and both are documented behaviour, not bad luck:
 *
 * - A workspace or folder value wins over the user value, so writing globally writes where nobody
 *   reads.
 * - In a remote window `ConfigurationTarget.USER` resolves to the **remote** user file when the
 *   setting is machine-scoped or already has a remote value, and the merged user configuration lets
 *   remote win (`configurationService.ts:1127-1143`, `configurationModels.ts:962-968`). A key that
 *   exists in both user files therefore shows one value on the User tab and uses another — which is
 *   what changing `model` from `machine-overridable` to `window` left behind.
 *
 * The extension API cannot see those two user files separately: `globalValue` is already the merge.
 * What it can do is remove the key from every target at once — `update(key, undefined)` deletes it
 * from all defined targets — and write it again in one place.
 */

const TARGETS: Record<ConfigScope, vscode.ConfigurationTarget> = {
  global: vscode.ConfigurationTarget.Global,
  workspace: vscode.ConfigurationTarget.Workspace,
  workspaceFolder: vscode.ConfigurationTarget.WorkspaceFolder,
}

export interface WriteResult<T> {
  /** Whether the value that is now in effect is the one that was asked for. */
  readonly ok: boolean
  /** The value actually in effect after the write. */
  readonly effective: T | undefined
  readonly shadow: Shadow
  /** True when the duplicate had to be removed before the write took. */
  readonly collapsed: boolean
}

export async function writeSetting<T>(key: string, value: T): Promise<WriteResult<T>> {
  const log = getLog()
  const inspected = vscode.workspace.getConfiguration(CONFIG_SECTION).inspect<T>(key)

  await update(key, value, TARGETS[targetForWrite(inspected)])
  if (await took(key, value)) {
    return { ok: true, effective: value, shadow: 'none', collapsed: false }
  }

  // Only now, and only because a write that should have won did not: remove the key from every
  // target that defines it, then put it back once. This is what unmakes a key duplicated across the
  // local and remote user files.
  log.info(`${key} did not take effect; removing it from every target and writing once`)
  await update(key, undefined, vscode.ConfigurationTarget.Global)
  await update(key, value, vscode.ConfigurationTarget.Global)
  if (await took(key, value)) {
    return { ok: true, effective: value, shadow: 'none', collapsed: true }
  }

  // Still not winning: something the API can see is holding it — a workspace or folder value.
  const after = vscode.workspace.getConfiguration(CONFIG_SECTION).inspect<T>(key)
  const shadow = diagnoseShadow(after, value)
  const effective = vscode.workspace.getConfiguration(CONFIG_SECTION).get<T>(key)
  log.warn(`${key} is still ${String(effective)}; ${shadow} scope wins`)
  return { ok: false, effective, shadow, collapsed: true }
}

/** Reports a failed write where the value lives, with a way to go fix it. */
export async function reportWriteFailure<T>(
  key: string,
  wanted: T,
  result: WriteResult<T>,
): Promise<void> {
  const where: Record<Shadow, { text: string; command?: string; button?: string }> = {
    workspaceFolder: {
      text: `A folder setting keeps ${key} as "${String(result.effective)}".`,
      command: 'workbench.action.openFolderSettingsFile',
      button: 'Open folder settings',
    },
    workspace: {
      text: `This workspace sets ${key} to "${String(result.effective)}", and workspace wins.`,
      command: 'workbench.action.openWorkspaceSettingsFile',
      button: 'Open workspace settings',
    },
    user: {
      text: `${key} is still "${String(result.effective)}" after writing "${String(wanted)}".`,
      command: 'workbench.action.openSettingsJson',
      button: 'Open settings.json',
    },
    none: { text: `${key} could not be set to "${String(wanted)}".` },
  }

  const { text, command, button } = where[result.shadow]
  const choice = button
    ? await vscode.window.showWarningMessage(text, button)
    : await vscode.window.showWarningMessage(text)
  if (choice && command) {
    await vscode.commands.executeCommand(command)
  }
}

function update(key: string, value: unknown, target: vscode.ConfigurationTarget): Thenable<void> {
  return vscode.workspace.getConfiguration(CONFIG_SECTION).update(key, value, target)
}

/**
 * Waits for the change to reach the extension host, then compares.
 *
 * `update` resolving does not mean this side has applied it, so the read has to wait for the event.
 * The timeout is a floor, not a guess about speed: a value that is already correct fires no event.
 */
async function took<T>(key: string, wanted: T): Promise<boolean> {
  await settled(key)
  return vscode.workspace.getConfiguration(CONFIG_SECTION).get<T>(key) === wanted
}

function settled(key: string): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      subscription.dispose()
      resolve()
    }, 300)
    const subscription = vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(`${CONFIG_SECTION}.${key}`)) {
        clearTimeout(timer)
        subscription.dispose()
        resolve()
      }
    })
  })
}
