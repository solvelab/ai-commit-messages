import * as assert from 'node:assert/strict'

import * as vscode from 'vscode'

import { writeSetting } from '../../commands/writeSetting.js'
import { CONFIG_SECTION, EXTENSION_ID } from '../../meta.js'

/**
 * The bug this file exists for: `Select model…` announced a model it had not managed to set,
 * because a broader scope was winning. Nothing in the unit suite could catch it — the whole defect
 * lives in how VS Code resolves scopes, so it has to run against a real VS Code.
 */
suite('writeSetting', () => {
  suiteSetup(async () => {
    // The scope resolution under test is the extension host's, so the extension has to be live.
    const extension = vscode.extensions.getExtension(EXTENSION_ID)
    assert.ok(extension, `extension ${EXTENSION_ID} not found in the test host`)
    await extension.activate()
  })

  teardown(async () => {
    const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION)
    await configuration.update('model', undefined, vscode.ConfigurationTarget.Global)
    await configuration.update('model', undefined, vscode.ConfigurationTarget.Workspace)
  })

  test('writes and reads the value back', async () => {
    const result = await writeSetting('model', 'gpt-4o-mini')
    assert.ok(result.ok, `write failed with shadow ${result.shadow}`)
    assert.equal(result.effective, 'gpt-4o-mini')
    assert.equal(vscode.workspace.getConfiguration(CONFIG_SECTION).get('model'), 'gpt-4o-mini')
  })

  test('writes over the scope where the value already lives', async () => {
    await vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .update('model', 'qwen2.5-coder:7b', vscode.ConfigurationTarget.Workspace)

    const result = await writeSetting('model', 'llama3.1:8b')

    assert.ok(result.ok, `write failed with shadow ${result.shadow}`)
    assert.equal(vscode.workspace.getConfiguration(CONFIG_SECTION).get('model'), 'llama3.1:8b')
    // Written where it was read from, not globally — a global write would have been invisible.
    assert.equal(
      vscode.workspace.getConfiguration(CONFIG_SECTION).inspect('model')?.workspaceValue,
      'llama3.1:8b',
    )
  })

  test('reports the value in effect, not the one it was handed', async () => {
    await vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .update('model', 'already-there', vscode.ConfigurationTarget.Workspace)

    // Writing the value it already has fires no change event; the read-back must still be right.
    const result = await writeSetting('model', 'already-there')

    assert.ok(result.ok)
    assert.equal(result.effective, 'already-there')
    assert.equal(result.shadow, 'none')
  })
})
