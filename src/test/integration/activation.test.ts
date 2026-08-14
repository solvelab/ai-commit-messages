import * as assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

import * as vscode from 'vscode'

import { EXTENSION_ID } from '../../meta.js'

const GENERATE_COMMAND = 'aiCommitMessages.generate'

suite('activation', () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID)
    assert.ok(extension, `extension ${EXTENSION_ID} not found in the test host`)
    await extension.activate()
  })

  test('the extension activates', () => {
    assert.equal(vscode.extensions.getExtension(EXTENSION_ID)?.isActive, true)
  })

  // A status bar item that only appears after you already ran a command shows the configuration
  // too late to help.
  test('wakes up on its own, so the status bar can exist before any command runs', () => {
    const events = vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON.activationEvents
    assert.deepEqual(events, ['onStartupFinished'])
  })

  test('the built-in git extension is available to depend on', () => {
    assert.ok(
      vscode.extensions.getExtension('vscode.git'),
      'vscode.git is missing — extensionDependencies would not resolve',
    )
  })

  test('the generate command is registered', async () => {
    const commands = await vscode.commands.getCommands(true)
    assert.ok(
      commands.includes(GENERATE_COMMAND),
      `${GENERATE_COMMAND} is not registered; contributed commands: ${commands
        .filter(c => c.startsWith('aiCommitMessages.'))
        .join(', ')}`,
    )
  })

  test('the command id in the manifest matches the one registered at runtime', () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID)
    const contributed = (
      extension?.packageJSON.contributes?.commands as { command: string }[] | undefined
    )?.map(c => c.command)
    assert.deepEqual(contributed, [
      GENERATE_COMMAND,
      'aiCommitMessages.cancelGeneration',
      'aiCommitMessages.openSettings',
      'aiCommitMessages.configure',
      'aiCommitMessages.migrateSettings',
      'aiCommitMessages.insertDefaultPrompt',
      'aiCommitMessages.setEndpoint',
      'aiCommitMessages.setToken',
      'aiCommitMessages.clearToken',
      'aiCommitMessages.diagnose',
      'aiCommitMessages.selectModel',
    ])
  })

  test('the SCM title menu entry targets git only', () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID)
    const menu = extension?.packageJSON.contributes?.menus?.['scm/title'] as
      | { command: string; when: string; group: string }[]
      | undefined
    assert.ok(menu && menu.length === 4, 'expected generate, cancel, configure and select-model')
    assert.equal(menu[0].command, GENERATE_COMMAND)

    // The two swap by context key: a command has one icon, so the spinning one is a second command.
    // Verified in menusExtensionPoint.ts:936 — the manifest icon goes through ThemeIcon.fromString,
    // and themables.ts turns the `~spin` modifier into the animation class.
    assert.equal(menu[0].when, 'scmProvider == git && !aiCommitMessages.generating')
    assert.equal(menu[1].command, 'aiCommitMessages.cancelGeneration')
    assert.equal(menu[1].when, 'scmProvider == git && aiCommitMessages.generating')

    const spinning = (
      vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON.contributes?.commands as
        | { command: string; icon?: string }[]
        | undefined
    )?.find(c => c.command === 'aiCommitMessages.cancelGeneration')
    assert.equal(spinning?.icon, '$(sync~spin)')
    // Same group and order in both, so swapping the command does not move the button:
    // menuService.ts:346-358 breaks an order tie by title, and the two titles differ.
    assert.equal(menu[0].group, 'navigation@1')
    assert.equal(menu[1].group, menu[0].group)
    // Every entry still targets git and nothing else.
    for (const entry of menu) {
      assert.ok(entry.when.startsWith('scmProvider == git'), entry.command)
    }
  })

  // A file-based icon is a path into the package: a typo or a file left out of the VSIX shows an
  // empty button, and only at runtime.
  test('the icon files the manifest points at exist', () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID)
    assert.ok(extension)
    const generate = (
      extension.packageJSON.contributes?.commands as
        | { command: string; icon?: string | { light: string; dark: string } }[]
        | undefined
    )?.find(c => c.command === GENERATE_COMMAND)
    const icon = generate?.icon
    assert.ok(icon && typeof icon === 'object', 'the generate command needs light and dark icons')
    for (const relative of [icon.light, icon.dark]) {
      const file = vscode.Uri.joinPath(extension.extensionUri, relative)
      assert.ok(existsSync(file.fsPath), `${relative} is missing from the package`)
    }
  })

  test('no proposed API is declared', () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID)
    assert.equal(
      extension?.packageJSON.enabledApiProposals,
      undefined,
      'scm/inputBox and friends are proposed API: declaring them makes the contribution dead in stable',
    )
  })
})
