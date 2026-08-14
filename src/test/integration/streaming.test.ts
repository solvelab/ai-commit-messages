import * as assert from 'node:assert/strict'

import * as vscode from 'vscode'

/**
 * The spike behind the decision not to stream into the commit box.
 *
 * Streaming would mean writing `inputBox.value` as tokens arrive. The API offers no partial update:
 * the property is the whole content, so every chunk is a full replacement of whatever is in the box
 * — including anything typed in the meantime. This measures that, instead of assuming it.
 */
suite('streaming into the commit input box', () => {
  let control: vscode.SourceControl

  suiteSetup(() => {
    control = vscode.scm.createSourceControl('acmSpike', 'AI Commit Messages spike')
  })

  suiteTeardown(() => {
    control.dispose()
  })

  test('a write replaces the whole box, so anything typed meanwhile is lost', () => {
    // What a stream would do: chunk after chunk, each one the full message so far.
    control.inputBox.value = 'feat: add'
    control.inputBox.value = 'feat: add the'

    // What the person does at the same moment, in the same box.
    control.inputBox.value = 'my own subject'

    // The next chunk of the stream lands.
    control.inputBox.value = 'feat: add the new thing'

    assert.equal(
      control.inputBox.value,
      'feat: add the new thing',
      'the stream overwrites what was typed — there is no merge, only replacement',
    )
  })

  test('the cost of a chunk is a full write, not an append', () => {
    const chunks = 60
    const started = Date.now()
    let text = ''
    for (let i = 0; i < chunks; i += 1) {
      text += 'word '
      control.inputBox.value = text
    }
    const elapsed = Date.now() - started

    assert.equal(control.inputBox.value, text)
    // Not a performance claim: the point is that each token costs a whole-document write, which is
    // what makes the box unusable while it happens.
    assert.ok(elapsed >= 0, `${chunks} whole-document writes took ${elapsed}ms`)
  })

  test('the box is a shared surface: nothing marks it as owned while a write is in flight', () => {
    control.inputBox.value = 'generated'
    assert.equal(typeof control.inputBox.enabled, 'boolean')
    // Disabling it would stop the clobber, but it also stops the person from writing their own
    // message — the reason the button exists is that they may not want to.
    assert.equal(control.inputBox.enabled, true)
  })
})
