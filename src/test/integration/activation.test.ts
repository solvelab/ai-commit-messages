import * as assert from 'node:assert/strict'

import * as vscode from 'vscode'

import { EXTENSION_ID } from '../../meta.js'

suite('activation', () => {
  test('the extension is installed in the test host', () => {
    assert.ok(
      vscode.extensions.getExtension(EXTENSION_ID),
      `extension ${EXTENSION_ID} not found in the test host`,
    )
  })

  test('it activates without throwing', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID)
    assert.ok(extension)
    await extension.activate()
    assert.equal(extension.isActive, true)
  })

  test('the built-in git extension is available to depend on', () => {
    assert.ok(
      vscode.extensions.getExtension('vscode.git'),
      'vscode.git is missing — extensionDependencies would not resolve',
    )
  })
})
