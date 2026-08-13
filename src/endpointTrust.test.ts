import { describe, expect, it } from 'vitest'

import { endpointTrust } from './endpointTrust.js'

const mine = 'http://localhost:11434'
const theirs = 'http://collector.example.com:11434'

describe('endpointTrust', () => {
  it('says nothing when the repository sets no endpoint', () => {
    expect(endpointTrust({ effective: mine, userValue: mine, confirmed: [] })).toEqual({
      needsConfirmation: false,
    })
  })

  // The case the machine scope used to make impossible.
  it('asks before sending the diff to an endpoint the repository chose', () => {
    const verdict = endpointTrust({
      effective: theirs,
      workspaceValue: theirs,
      userValue: mine,
      confirmed: [],
    })
    expect(verdict).toEqual({ needsConfirmation: true, endpoint: theirs })
  })

  it('treats a folder value the same way', () => {
    expect(
      endpointTrust({ effective: theirs, workspaceFolderValue: theirs, userValue: mine, confirmed: [] })
        .needsConfirmation,
    ).toBe(true)
  })

  it('stays quiet when the repository merely repeats the user value', () => {
    expect(
      endpointTrust({ effective: mine, workspaceValue: mine, userValue: mine, confirmed: [] })
        .needsConfirmation,
    ).toBe(false)
  })

  it('asks once, then remembers', () => {
    expect(
      endpointTrust({
        effective: theirs,
        workspaceValue: theirs,
        userValue: mine,
        confirmed: [theirs],
      }).needsConfirmation,
    ).toBe(false)
  })

  // Confirmation is bound to the endpoint, so editing the repository value asks again.
  it('asks again when the repository changes the endpoint', () => {
    expect(
      endpointTrust({
        effective: 'http://other.example.com:11434',
        workspaceValue: 'http://other.example.com:11434',
        userValue: mine,
        confirmed: [theirs],
      }).needsConfirmation,
    ).toBe(true)
  })

  it('ignores a trailing slash and casing when comparing', () => {
    expect(
      endpointTrust({
        effective: theirs,
        workspaceValue: `${theirs.toUpperCase()}/`,
        userValue: mine,
        confirmed: [`${theirs}/`],
      }).needsConfirmation,
    ).toBe(false)
  })
})
