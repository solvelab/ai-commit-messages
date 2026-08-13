import { describe, expect, it, vi } from 'vitest'

import { resolveRepository, type RepositoryLike, type ResolverHost, type UriLike } from './resolve.js'

function uri(path: string): UriLike {
  return { scheme: 'file', path, toString: () => `file://${path}` }
}

interface FakeRepo extends RepositoryLike {
  name: string
}

function repo(name: string, path: string, selected = false): FakeRepo {
  return { name, rootUri: uri(path), ui: { selected } }
}

function host(overrides: Partial<ResolverHost<FakeRepo>> = {}): ResolverHost<FakeRepo> {
  return {
    repositories: [],
    getRepository: () => null,
    openRepository: async () => null,
    activeDocumentUri: () => undefined,
    pick: async () => undefined,
    ...overrides,
  }
}

const alpha = repo('alpha', '/w/alpha')
const beta = repo('beta', '/w/beta')

describe('resolveRepository', () => {
  it('matches a SourceControl argument by its public rootUri', async () => {
    const result = await resolveRepository(
      { rootUri: uri('/w/beta') },
      host({ repositories: [alpha, beta] }),
    )
    expect(result.repository?.name).toBe('beta')
    expect(result.source).toBe('source-control-arg')
  })

  it('matches a SourceControl argument by the marshalled _rootUri', async () => {
    // What actually survives the RPC when the public getter is not enumerable.
    const result = await resolveRepository(
      { _rootUri: uri('/w/beta') },
      host({ repositories: [alpha, beta] }),
    )
    expect(result.repository?.name).toBe('beta')
    expect(result.source).toBe('source-control-arg')
  })

  it('resolves a Uri argument through the git API', async () => {
    const result = await resolveRepository(
      uri('/w/alpha/src/index.ts'),
      host({ repositories: [alpha, beta], getRepository: () => alpha }),
    )
    expect(result.repository?.name).toBe('alpha')
    expect(result.source).toBe('uri-arg')
  })

  it('opens a repository that the API does not know yet', async () => {
    const openRepository = vi.fn(async () => beta)
    const result = await resolveRepository(uri('/w/beta'), host({ openRepository }))
    expect(openRepository).toHaveBeenCalledOnce()
    expect(result.repository?.name).toBe('beta')
  })

  it('falls back to the repository selected in the SCM view', async () => {
    const selectedBeta = repo('beta', '/w/beta', true)
    const result = await resolveRepository(
      undefined,
      host({ repositories: [alpha, selectedBeta] }),
    )
    expect(result.repository?.name).toBe('beta')
    expect(result.source).toBe('selected-in-scm-view')
  })

  it('falls back to the repository owning the active editor', async () => {
    const result = await resolveRepository(
      undefined,
      host({
        repositories: [alpha, beta],
        activeDocumentUri: () => uri('/w/beta/README.md'),
        getRepository: () => beta,
      }),
    )
    expect(result.repository?.name).toBe('beta')
    expect(result.source).toBe('active-editor')
  })

  it('uses the only repository when there is exactly one', async () => {
    const result = await resolveRepository(undefined, host({ repositories: [alpha] }))
    expect(result.repository?.name).toBe('alpha')
    expect(result.source).toBe('only-repository')
  })

  it('asks the user instead of guessing when several repositories are visible', async () => {
    const pick = vi.fn<ResolverHost<FakeRepo>['pick']>(async () => beta)
    const result = await resolveRepository(undefined, host({ repositories: [alpha, beta], pick }))
    expect(pick).toHaveBeenCalledOnce()
    expect(pick.mock.calls[0][0]).toHaveLength(2)
    expect(result.repository?.name).toBe('beta')
    expect(result.source).toBe('user-pick')
  })

  it('never falls back to the first repository — the incumbent extension bug', async () => {
    const pick = vi.fn(async () => undefined)
    const result = await resolveRepository(undefined, host({ repositories: [alpha, beta], pick }))
    expect(result.repository).toBeUndefined()
    expect(result.source).toBe('none')
  })

  it('reports nothing when no repository is open at all', async () => {
    const result = await resolveRepository(undefined, host())
    expect(result.repository).toBeUndefined()
    expect(result.source).toBe('none')
  })

  it('ignores a SourceControl whose root matches no open repository', async () => {
    const result = await resolveRepository(
      { rootUri: uri('/w/gone') },
      host({ repositories: [alpha] }),
    )
    // Falls through the cascade instead of matching the wrong repository.
    expect(result.repository?.name).toBe('alpha')
    expect(result.source).toBe('only-repository')
  })

  it('ignores arguments that are neither a Uri nor a SourceControl', async () => {
    const result = await resolveRepository('nonsense', host({ repositories: [alpha] }))
    expect(result.source).toBe('only-repository')
  })
})
