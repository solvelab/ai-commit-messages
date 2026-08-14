import { describe, expect, it } from 'vitest'

import { describeOrigin, diagnoseShadow, hasCustomValue, scopeOfCustomValue, targetForWrite } from './configScope.js'

describe('scopeOfCustomValue', () => {
  it('prefers the narrowest scope, which is also the one that wins at read time', () => {
    expect(
      scopeOfCustomValue({ globalValue: 'g', workspaceValue: 'w', workspaceFolderValue: 'f' }),
    ).toBe('workspaceFolder')
    expect(scopeOfCustomValue({ globalValue: 'g', workspaceValue: 'w' })).toBe('workspace')
    expect(scopeOfCustomValue({ globalValue: 'g' })).toBe('global')
  })

  it('treats an empty string as not set', () => {
    // The empty default is exactly what "use the built-in prompt" means.
    expect(scopeOfCustomValue({ globalValue: '   ', workspaceValue: 'w' })).toBe('workspace')
    expect(scopeOfCustomValue({ globalValue: '' })).toBeUndefined()
  })

  it('reports nothing when nothing is set', () => {
    expect(scopeOfCustomValue({})).toBeUndefined()
    expect(scopeOfCustomValue(undefined)).toBeUndefined()
  })

  it('keeps a non-string value that is set', () => {
    expect(scopeOfCustomValue<number>({ workspaceValue: 0 })).toBe('workspace')
  })
})

describe('targetForWrite', () => {
  it('writes where the value already lives', () => {
    // The bug: detection looked at the workspace, the write always went global, and the workspace
    // value kept winning — a "Replace" that replaced nothing.
    expect(targetForWrite({ workspaceValue: 'meu prompt' })).toBe('workspace')
    expect(targetForWrite({ workspaceFolderValue: 'meu prompt' })).toBe('workspaceFolder')
  })

  it('falls back to global when there is nothing to replace', () => {
    expect(targetForWrite({})).toBe('global')
    expect(targetForWrite(undefined)).toBe('global')
  })
})

describe('hasCustomValue', () => {
  it('sees a workspace value even when the global one is empty', () => {
    // The `??` chain used before stopped at the empty global value and missed this.
    expect(hasCustomValue({ globalValue: '', workspaceValue: 'meu prompt' })).toBe(true)
  })

  it('is false for the untouched default', () => {
    expect(hasCustomValue({ globalValue: '' })).toBe(false)
  })
})

describe('diagnoseShadow', () => {
  it('names the folder value, which beats everything', () => {
    expect(
      diagnoseShadow({ workspaceFolderValue: 'old', workspaceValue: 'old', globalValue: 'new' }, 'new'),
    ).toBe('workspaceFolder')
  })

  it('names the workspace value', () => {
    expect(diagnoseShadow({ workspaceValue: 'old', globalValue: 'new' }, 'new')).toBe('workspace')
  })

  // The API cannot see the remote user file separately, so a surviving user value is the tell.
  it('names the user scope when the merged user value is still the old one', () => {
    expect(diagnoseShadow({ globalValue: 'old' }, 'new')).toBe('user')
  })

  it('finds nothing to blame once the value took effect', () => {
    expect(diagnoseShadow({ globalValue: 'new' }, 'new')).toBe('none')
    expect(diagnoseShadow({ workspaceValue: 'new', globalValue: 'new' }, 'new')).toBe('none')
    expect(diagnoseShadow(undefined, 'new')).toBe('none')
  })
})

describe('describeOrigin', () => {
  it('names the narrowest scope holding the value', () => {
    expect(describeOrigin({ workspaceFolderValue: 'x', globalValue: 'y' })).toBe('folder settings')
    expect(describeOrigin({ workspaceValue: 'x', globalValue: 'y' })).toContain('.vscode/settings.json')
    expect(describeOrigin({ globalValue: 'y' })).toBe('user settings')
  })

  it('says default when nobody set it', () => {
    expect(describeOrigin({})).toBe('default')
    expect(describeOrigin(undefined)).toBe('default')
  })
})
