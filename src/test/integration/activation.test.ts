import * as assert from 'node:assert/strict'

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
      'aiCommitMessages.configure',
      'aiCommitMessages.migrateSettings',
      'aiCommitMessages.insertDefaultPrompt',
      'aiCommitMessages.setToken',
      'aiCommitMessages.clearToken',
    ])
  })

  test('the SCM title menu entry targets git only', () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID)
    const menu = extension?.packageJSON.contributes?.menus?.['scm/title'] as
      | { command: string; when: string; group: string }[]
      | undefined
    assert.ok(menu && menu.length === 2, 'expected the generate and configure contributions')
    assert.equal(menu[0].command, GENERATE_COMMAND)
    assert.equal(menu[0].when, 'scmProvider == git')
    assert.equal(menu[0].group, 'navigation')
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
