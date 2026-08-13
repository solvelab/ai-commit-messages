import * as assert from 'node:assert/strict'

import * as vscode from 'vscode'

import { EXTENSION_ID } from '../../meta.js'

interface ConfigNode {
  title: string
  order: number
  properties: Record<string, { order?: number; scope?: string; markdownDescription?: string }>
}

function configuration(): ConfigNode[] {
  const extension = vscode.extensions.getExtension(EXTENSION_ID)
  const contributed = extension?.packageJSON.contributes?.configuration
  assert.ok(Array.isArray(contributed), 'configuration must be an array of grouped nodes')
  return contributed as ConfigNode[]
}

suite('settings layout', () => {
  test('groups the settings into Connection, Message and Advanced, in that order', () => {
    const titles = [...configuration()]
      .sort((a, b) => a.order - b.order)
      .map(node => node.title)
    assert.deepEqual(titles, [
      'AI Commit Messages: Connection',
      'AI Commit Messages: Message',
      'AI Commit Messages: Advanced',
    ])
  })

  test('orders the connection settings the way one configures them', () => {
    const connection = configuration().find(n => n.title.endsWith('Connection'))
    assert.ok(connection)
    const keys = Object.entries(connection.properties)
      .sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))
      .map(([key]) => key)
    assert.deepEqual(keys, [
      'aiCommitMessages.provider',
      'aiCommitMessages.endpoint',
      'aiCommitMessages.model',
      'aiCommitMessages.authHeader',
      'aiCommitMessages.headers',
      'aiCommitMessages.timeoutMs',
    ])
  })

  test('every setting has an explicit order — no silent "placed at the end"', () => {
    for (const node of configuration()) {
      for (const [key, schema] of Object.entries(node.properties)) {
        assert.equal(typeof schema.order, 'number', `${key} has no order`)
      }
    }
  })

  test('keeps every key that shipped before the regrouping', () => {
    const keys = configuration().flatMap(node => Object.keys(node.properties))
    // Renaming any of these would silently drop a user's existing configuration.
    for (const key of [
      'provider',
      'endpoint',
      'model',
      'language',
      'promptTemplate',
      'maxDiffChars',
      'maxBodyWords',
      'temperature',
      'timeoutMs',
      'authHeader',
      'headers',
      'redactSecrets',
      'excludeGlobs',
    ]) {
      assert.ok(keys.includes(`aiCommitMessages.${key}`), `aiCommitMessages.${key} disappeared`)
    }
    assert.equal(keys.length, 13)
  })

  // Both headers describe how the request reaches the server, so they belong next to the provider
  // and the endpoint. Advanced is for what tunes the output and the diff, nothing else.
  test('leaves Advanced with the generation knobs only', () => {
    const advanced = configuration().find(n => n.title.endsWith('Advanced'))
    assert.ok(advanced)
    const keys = Object.entries(advanced.properties)
      .sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))
      .map(([key]) => key)
    assert.deepEqual(keys, [
      'aiCommitMessages.temperature',
      'aiCommitMessages.maxDiffChars',
      'aiCommitMessages.redactSecrets',
      'aiCommitMessages.excludeGlobs',
    ])
  })

  // A description reading "Advanced." outside the Advanced block lies about where it lives.
  test('never calls a setting Advanced outside the Advanced block', () => {
    for (const node of configuration()) {
      if (node.title.endsWith('Advanced')) {
        continue
      }
      for (const [key, schema] of Object.entries(node.properties)) {
        assert.ok(!schema.markdownDescription?.startsWith('**Advanced.**'), key)
      }
    }
  })

  // Verified in settingsTree.ts: descriptions render with `isTrusted: true`, so a command link is
  // clickable. It is the only way the settings page can point at a secret it must not hold.
  test('points at the key command from the settings page', () => {
    const linked = configuration()
      .flatMap(node => Object.entries(node.properties))
      .filter(([, schema]) => schema.markdownDescription?.includes('command:aiCommitMessages.setToken'))
      .map(([key]) => key)
    assert.deepEqual(linked, [
      'aiCommitMessages.provider',
      'aiCommitMessages.endpoint',
      'aiCommitMessages.authHeader',
      'aiCommitMessages.headers',
    ])
  })

  test('never offers a setting that would hold the credential', () => {
    const keys = configuration()
      .flatMap(node => Object.keys(node.properties))
      .map(key => key.replace('aiCommitMessages.', '').toLowerCase())
    // Exact names, not a substring match: `redactSecrets` is about the diff, not about holding one.
    for (const forbidden of ['apikey', 'token', 'secret', 'password', 'credential', 'authtoken']) {
      assert.ok(!keys.includes(forbidden), `aiCommitMessages.${forbidden} must not exist`)
    }
  })

  test('only the endpoint stays machine-scoped', () => {
    const machine = configuration()
      .flatMap(node => Object.entries(node.properties))
      .filter(([, schema]) => schema.scope === 'machine' || schema.scope === 'machine-overridable')
      .map(([key]) => key)
    // Machine scope hides a setting from the User tab in a remote session, so it is spent only
    // where it buys something: stopping a cloned repository from redirecting the staged diff.
    assert.deepEqual(machine, ['aiCommitMessages.endpoint'])
  })
})
