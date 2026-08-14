import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * Keeps the README honest about what the extension contributes.
 *
 * The README is the Marketplace page: it is read before anyone installs, and a command or setting
 * that only exists in one of the two places is worse than an undocumented one — it is a promise the
 * product does not keep. Both directions are checked, because a leftover row is as wrong as a
 * missing one.
 */

interface Manifest {
  contributes: {
    commands: { command: string; title: string; category: string }[]
    configuration: { title: string; properties: Record<string, unknown> }[]
  }
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as Manifest
const readme = readFileSync('README.md', 'utf8')

const settingKeys = manifest.contributes.configuration.flatMap(node => Object.keys(node.properties))
const commandTitles = manifest.contributes.commands.map(c => `${c.category}: ${c.title}`)

describe('README against the manifest', () => {
  it('documents every setting it contributes', () => {
    for (const key of settingKeys) {
      expect(readme, `${key} is contributed but not in the README`).toContain(`\`${key}\``)
    }
  })

  it('documents every command it contributes', () => {
    for (const title of commandTitles) {
      expect(readme, `"${title}" is contributed but not in the README`).toContain(title)
    }
  })

  it('mentions no setting that does not exist', () => {
    const mentioned = [...readme.matchAll(/`(aiCommitMessages\.[A-Za-z]+)`/g)].map(m => m[1])
    for (const key of new Set(mentioned)) {
      expect(settingKeys, `the README documents ${key}, which is not contributed`).toContain(key)
    }
  })

  it('keeps every repository-relative link pointing at a file that exists', () => {
    const links = [...readme.matchAll(/\]\((?!https?:)([^)#]+)\)/g)].map(m => m[1])
    for (const link of new Set(links)) {
      expect(() => readFileSync(link, 'utf8'), `${link} is linked but missing`).not.toThrow()
    }
  })
})
