import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * The button icon is a file, and a file has no theme.
 *
 * `contributes.commands[].icon` accepts a `{ light, dark }` pair of paths, and each file is rendered
 * as an image — so `currentColor`, which every icon set ships by default, resolves to nothing and
 * the button comes out empty. The colour has to be written into each file, and the two have to keep
 * enough contrast against the side bar to be seen at 16px.
 */

const DARK = readFileSync('media/generate-dark.svg', 'utf8')
const LIGHT = readFileSync('media/generate-light.svg', 'utf8')

describe('button icons', () => {
  // The colour of the sparkle in the extension logo, sampled from the artwork itself.
  it('uses the logo colour on the dark theme', () => {
    expect(DARK).toContain('stroke="#F68562"')
  })

  // Same hue, closed down: the logo colour scores 2.24:1 on the light side bar, below the 3:1 the
  // WCAG asks of a graphical object. This one scores 3.87:1 there and still 3.57:1 on the dark one.
  it('uses a legible variant of it on the light theme', () => {
    expect(LIGHT).toContain('stroke="#C55A36"')
  })

  it('never leaves currentColor in a file-based icon', () => {
    for (const svg of [DARK, LIGHT]) {
      expect(svg).not.toContain('currentColor')
    }
  })

  it('keeps the stroke shape that survives 16px', () => {
    for (const svg of [DARK, LIGHT]) {
      expect(svg).toContain('fill="none"')
      expect(svg).toContain('stroke-width="2"')
      expect(svg).toContain('viewBox="0 0 24 24"')
    }
  })

  it('draws the same icon in both files', () => {
    const paths = (svg: string): string[] => [...svg.matchAll(/<path d="([^"]+)"/g)].map(m => m[1])
    expect(paths(DARK)).toEqual(paths(LIGHT))
    expect(paths(DARK)).toHaveLength(6)
  })
})
