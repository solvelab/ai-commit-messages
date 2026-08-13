import { describe, expect, it } from 'vitest'

import { redactFiles, redactPatch } from './redact.js'

const HEADER = [
  'diff --git a/.env b/.env',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/.env',
  '@@ -0,0 +1,3 @@',
].join('\n')

describe('redactPatch — the values that must never leave', () => {
  it.each([
    ['chave OpenAI', '+OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz012345', 'sk-proj-abcdef'],
    ['token GitHub clássico', '+token: ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'ghp_abcdef'],
    ['token GitHub fine-grained', '+GH=github_pat_abcdefghijklmnopqrstuvwxyz0123456789', 'github_pat_'],
    ['token Slack', '+SLACK=xoxb-1234567890-abcdefghijkl', 'xoxb-'],
    ['chave AWS', '+AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE', 'AKIAIOSFODNN7EXAMPLE'],
    [
      'JWT',
      '+auth = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"',
      'eyJhbGciOiJIUzI1NiJ9',
    ],
    ['Bearer', '+Authorization: Bearer abcdef1234567890xyz', 'abcdef1234567890xyz'],
    ['senha em env', '+SENHA=umaSenhaBemLonga123', 'umaSenhaBemLonga123'],
    ['password em env', '+DB_PASSWORD="p4ssw0rd-secreta"', 'p4ssw0rd-secreta'],
    ['client secret', '+CLIENT_SECRET = abcdef123456789', 'abcdef123456789'],
  ])('mascara %s', (_name, line, secretFragment) => {
    const result = redactPatch(`${HEADER}\n${line}`)
    expect(result.text).not.toContain(secretFragment)
    expect(result.text).toContain('«redacted:')
    expect(result.total).toBeGreaterThan(0)
  })

  it('mascara um bloco PEM inteiro', () => {
    const pem = [
      '+-----BEGIN RSA PRIVATE KEY-----',
      '+MIIEowIBAAKCAQEAx7Zk8vQm3nR2sT9uV0wX1yZ2aB3cD4eF5gH6iJ7kL8mN9oP0',
      '+qR1sT2uV3wX4yZ5aB6cD7eF8gH9iJ0kL1mN2oP3qR4sT5uV6wX7yZ8aB9cD0eF1g',
      '+-----END RSA PRIVATE KEY-----',
    ].join('\n')
    const result = redactPatch(`${HEADER}\n${pem}`)
    expect(result.text).not.toContain('MIIEowIBAAKCAQEA')
    expect(result.text).not.toContain('BEGIN RSA PRIVATE KEY')
    expect(result.redactions.map(r => r.kind)).toContain('private-key')
  })

  it('conta cada ocorrência', () => {
    const result = redactPatch(
      `${HEADER}\n+A=sk-abcdefghijklmnopqrstuvwxyz01\n+B=ghp_abcdefghijklmnopqrstuvwxyz0123456789`,
    )
    expect(result.total).toBe(2)
  })
})

describe('redactPatch — o que NÃO pode ser tocado', () => {
  it('não mexe nos cabeçalhos do diff', () => {
    const result = redactPatch(`${HEADER}\n+X=1`)
    for (const line of HEADER.split('\n')) {
      expect(result.text).toContain(line)
    }
  })

  it('preserva os prefixos de linha', () => {
    const patch = `${HEADER}\n-OLD=sk-abcdefghijklmnopqrstuvwxyz01\n+NEW=sk-zyxwvutsrqponmlkjihgfedcba09\n contexto`
    const lines = redactPatch(patch).text.split('\n').slice(5)
    expect(lines[0].startsWith('-')).toBe(true)
    expect(lines[1].startsWith('+')).toBe(true)
    expect(lines[2].startsWith(' ')).toBe(true)
  })

  it('deixa em paz uma linha de código que só menciona a palavra', () => {
    const patch = `${HEADER}\n+const password = readFromVault()\n+if (!user.password) return\n+// TODO: rotate the api key`
    const result = redactPatch(patch)
    expect(result.total).toBe(0)
    expect(result.text).toContain('readFromVault()')
  })

  it.each([
    '+API_KEY=<your-key-here>',
    '+SECRET=${VAULT_SECRET}',
    '+PASSWORD=changeme',
    '+TOKEN=xxxxxxxx',
    '+API_KEY=$OPENAI_KEY',
  ])('não mascara o placeholder em %j', line => {
    expect(redactPatch(`${HEADER}\n${line}`).total).toBe(0)
  })

  it('não mascara um valor curto demais para ser credencial', () => {
    expect(redactPatch(`${HEADER}\n+TOKEN=abc`).total).toBe(0)
  })

  it('não inventa redação num diff comum de código', () => {
    const patch = [
      'diff --git a/src/net.ts b/src/net.ts',
      '--- a/src/net.ts',
      '+++ b/src/net.ts',
      '@@ -1,4 +1,6 @@',
      '+export function linkAbort(token, timeoutMs) {',
      '+  const controller = new AbortController()',
      '+  return controller.signal',
      '+}',
    ].join('\n')
    expect(redactPatch(patch).total).toBe(0)
  })

  it('mantém o marcador visível, para o modelo saber que havia um valor', () => {
    const result = redactPatch(`${HEADER}\n+OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz01`)
    // Apagar sem marcar faria o modelo descrever "remover configuração".
    expect(result.text).toMatch(/OPENAI_API_KEY=«redacted:openai-key»/)
  })
})

describe('redactFiles', () => {
  it('reporta por arquivo, sem os valores', () => {
    const result = redactFiles([
      { path: '.env', patch: `${HEADER}\n+SECRET=umValorBemSecreto123` },
      { path: 'src/a.ts', patch: 'diff --git a/src/a.ts b/src/a.ts\n+const a = 1' },
    ])
    expect(result.total).toBe(1)
    expect(result.byFile).toHaveLength(1)
    expect(result.byFile[0].path).toBe('.env')
    expect(JSON.stringify(result.byFile)).not.toContain('umValorBemSecreto123')
  })

  it('devolve todos os arquivos, mascarados ou não', () => {
    const result = redactFiles([
      { path: 'a', patch: '+X=1' },
      { path: 'b', patch: '+Y=2' },
    ])
    expect(result.files.map(f => f.path)).toEqual(['a', 'b'])
  })

  it('não altera nada quando não há segredo', () => {
    const patch = 'diff --git a/a b/a\n+const x = 1'
    expect(redactFiles([{ path: 'a', patch }]).files[0].patch).toBe(patch)
  })
})
