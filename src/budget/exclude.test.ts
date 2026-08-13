import { describe, expect, it } from 'vitest'

import { classify, createMatcher, DEFAULT_EXCLUDE_GLOBS, globToRegExp, prioritize } from './exclude.js'
import { packWithinBudget } from './pack.js'

describe('globToRegExp', () => {
  it.each([
    ['package-lock.json', 'package-lock.json', true],
    ['package-lock.json', 'app/package-lock.json', true],
    ['package-lock.json', 'app/package-lock.json.bak', false],
    ['*.min.js', 'assets/app.min.js', true],
    ['*.min.js', 'assets/app.js', false],
    ['dist/**', 'dist/index.js', true],
    ['dist/**', 'dist/a/b/c.js', true],
    ['dist/**', 'src/dist-helper.ts', false],
    ['*.map', 'out/extension.js.map', true],
    ['a?c.txt', 'abc.txt', true],
    ['a?c.txt', 'abbc.txt', false],
  ])('%s vs %s -> %s', (glob, path, expected) => {
    expect(globToRegExp(glob)!.test(path)).toBe(expected)
  })

  it('does not let * cross a path separator', () => {
    expect(globToRegExp('src/*.ts')!.test('src/a/b.ts')).toBe(false)
    expect(globToRegExp('src/*.ts')!.test('src/b.ts')).toBe(true)
  })

  it('treats regex metacharacters as literals', () => {
    expect(globToRegExp('a+b.txt')!.test('a+b.txt')).toBe(true)
    expect(globToRegExp('a+b.txt')!.test('aab.txt')).toBe(false)
  })

  it('rejects an empty glob', () => {
    expect(globToRegExp('   ')).toBeUndefined()
  })

  it('matches backslash paths from Windows', () => {
    const matcher = createMatcher(['dist/**'])
    expect(matcher.matches('C:\\repo\\dist\\app.js')).toBe(true)
  })
})

describe('createMatcher', () => {
  it('reports globs it could not compile instead of dropping them silently', () => {
    const matcher = createMatcher(['*.js', '   '])
    expect(matcher.invalid).toEqual([])
    expect(matcher.matches('a.js')).toBe(true)
  })

  it('matches nothing when given no globs', () => {
    expect(createMatcher([]).matches('package-lock.json')).toBe(false)
  })

  it('covers the lockfiles every tool in this space excludes', () => {
    const matcher = createMatcher(DEFAULT_EXCLUDE_GLOBS)
    for (const path of [
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      'Cargo.lock',
      'go.sum',
      'dist/bundle.js',
      'assets/app.min.css',
      'images/logo.png',
    ]) {
      expect(matcher.matches(path), path).toBe(true)
    }
    for (const path of ['src/index.ts', 'README.md', 'package.json']) {
      expect(matcher.matches(path), path).toBe(false)
    }
  })
})

describe('classify and prioritize', () => {
  const matcher = createMatcher(DEFAULT_EXCLUDE_GLOBS)

  it.each([
    ['src/a.ts', 'code'],
    ['tsconfig.json', 'config'],
    ['.eslintrc', 'config'],
    ['README.md', 'docs'],
    ['docs/SETUP.md', 'docs'],
    ['package-lock.json', 'generated'],
  ])('%s is %s', (path, kind) => {
    expect(classify(path, matcher.matches(path))).toBe(kind)
  })

  it('puts code first and generated last', () => {
    const files = [
      { path: 'package-lock.json' },
      { path: 'README.md' },
      { path: 'src/a.ts' },
      { path: 'tsconfig.json' },
    ]
    expect(prioritize(files, matcher).map(f => f.file.path)).toEqual([
      'src/a.ts',
      'tsconfig.json',
      'README.md',
      'package-lock.json',
    ])
  })

  it('keeps git order within a class', () => {
    const files = [{ path: 'src/b.ts' }, { path: 'src/a.ts' }]
    expect(prioritize(files, matcher).map(f => f.file.path)).toEqual(['src/b.ts', 'src/a.ts'])
  })
})

describe('packWithinBudget with exclusions', () => {
  const lockfile = {
    path: 'package-lock.json',
    patch: `diff --git a/package-lock.json b/package-lock.json\n${'+  "resolved": "x",\n'.repeat(500)}`,
  }
  const code = { path: 'src/net.ts', patch: 'diff --git a/src/net.ts b/src/net.ts\n+const a = 1' }

  it('spends the budget on the code, not on the lockfile', () => {
    const result = packWithinBudget([lockfile, code], 4000, {
      excludeGlobs: DEFAULT_EXCLUDE_GLOBS,
    })
    const kept = result.kept.find(f => f.path === 'src/net.ts')
    expect(kept?.patch).toContain('+const a = 1')
    expect(result.excluded).toEqual(['package-lock.json'])
  })

  it('still tells the model the lockfile changed', () => {
    const result = packWithinBudget([lockfile, code], 4000, {
      excludeGlobs: DEFAULT_EXCLUDE_GLOBS,
    })
    const lock = result.kept.find(f => f.path === 'package-lock.json')
    expect(lock?.patch).toContain('diff --git a/package-lock.json')
    expect(lock?.patch).toContain('body omitted')
    expect(lock?.patch).not.toContain('"resolved"')
  })

  it('without globs behaves exactly as before', () => {
    const result = packWithinBudget([code], 4000)
    expect(result.kept[0].patch).toBe(code.patch)
    expect(result.excluded).toEqual([])
  })

  it('reports an invalid glob instead of failing the run', () => {
    const result = packWithinBudget([code], 4000, { excludeGlobs: ['['] })
    expect(result.kept).toHaveLength(1)
  })

  it('keeps omitting by budget on top of the exclusions', () => {
    const big = { path: 'src/big.ts', patch: 'x'.repeat(5000) }
    const result = packWithinBudget([code, big], 1000, { excludeGlobs: DEFAULT_EXCLUDE_GLOBS })
    expect(result.kept.map(f => f.path)).toEqual(['src/net.ts'])
    expect(result.omitted).toEqual(['src/big.ts'])
  })
})
