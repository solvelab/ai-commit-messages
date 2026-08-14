import { execSync } from 'node:child_process'
import { generateMessage } from '../out/prompt/pipeline.js'
import { validateCommitMessage } from '../out/prompt/validate.js'
import { createProvider } from '../out/providers/registry.js'
import { defaultMaxOutputTokens } from '../out/settings.js'

/**
 * Measures what the prompting strategy is worth, against a real model and real diffs.
 *
 * Run it after `npm run compile-tests`, which is what emits `out/`:
 *
 *   ACM_ENDPOINT=http://localhost:11434 ACM_MODEL=qwen2.5-coder:7b node scripts/baseline.mjs
 *
 * The two comparison rows are judged by this extension's validator, which they never promised to
 * satisfy — the point is not that they are worse extensions, it is that this format does not come
 * out of a model unless it is engineered.
 */
const ENDPOINT = process.env.ACM_ENDPOINT ?? 'http://localhost:11434'
const MODEL = process.env.ACM_MODEL ?? 'qwen2.5-coder:7b'
const REPO = process.env.ACM_REPO ?? process.cwd()
const provider = createProvider('ollama', { endpoint: ENDPOINT, fetch: globalThis.fetch })

// Real commits from this repository, so the diffs are the kind the extension actually sees.
const shas = execSync(`git -C ${REPO} log --format=%H -n 40 --no-merges`, { encoding: 'utf8' })
  .trim().split('\n')
const sample = []
for (const sha of shas) {
  const files = execSync(`git -C ${REPO} show --name-only --format= ${sha}`, { encoding: 'utf8' })
    .trim().split('\n').filter(f => f && !f.startsWith('package-lock'))
  if (files.length === 0 || files.length > 6) continue
  const patch = execSync(`git -C ${REPO} show --format= --unified=3 ${sha} -- ${files.map(f => `'${f}'`).join(' ')}`, { encoding: 'utf8', maxBuffer: 20e6 })
  if (patch.length < 400 || patch.length > 6000) continue
  const subject = execSync(`git -C ${REPO} log -1 --format=%s ${sha}`, { encoding: 'utf8' }).trim()
  sample.push({ sha: sha.slice(0, 8), subject, files: files.map(path => ({ path, patch: sliceFor(patch, path) })) })
  if (sample.length === 8) break
}
function sliceFor(patch, path) {
  const start = patch.indexOf(`diff --git a/${path}`)
  if (start < 0) return patch.slice(0, 3000)
  const next = patch.indexOf('\ndiff --git ', start + 1)
  return patch.slice(start, next < 0 ? undefined : next).slice(0, 3000)
}
console.log(`${sample.length} commits reais amostrados\n`)

// The comparison isolates the prompt, which is the part a fork would have had to rewrite anyway.
const NAIVE = 'Write a git commit message for the following diff.'
const COMMITOLLAMA = `You are a commit message generator. Answer with JSON: {"type": "<conventional type>", "message": "<short imperative summary>"}. Do not explain.`

async function run(label, systemTemplate, structured) {
  const rows = []
  for (const item of sample) {
    const started = Date.now()
    try {
      const outcome = structured
        ? await generateMessage(provider, item.files, { model: MODEL, language: { tag: 'pt-BR', name: 'português do Brasil' }, temperature: 0, maxBodyWords: 10, maxTokens: defaultMaxOutputTokens('ollama') })
        : await raw(systemTemplate, item)
      const message = structured ? outcome.message : outcome
      const verdict = validateCommitMessage(message, { maxBodyWords: 10 })
      rows.push({ sha: item.sha, ok: verdict.ok, ms: Date.now() - started,
        problems: verdict.problems.map(p => p.code), first: message.split('\n')[0] })
    } catch (error) {
      rows.push({ sha: item.sha, ok: false, ms: Date.now() - started, problems: ['error'], first: String(error).slice(0, 60) })
    }
  }
  const ok = rows.filter(r => r.ok).length
  const ms = Math.round(rows.reduce((a, r) => a + r.ms, 0) / rows.length)
  console.log(`${label}\n  válidas ${ok}/${rows.length} | média ${ms} ms`)
  for (const r of rows) console.log(`   ${r.ok ? '✓' : '✗'} ${r.sha} ${r.first.slice(0, 62)}${r.ok ? '' : '   [' + r.problems.join(',') + ']'}`)
  console.log()
  return { label, ok, total: rows.length, ms }
}

async function raw(system, item) {
  const user = item.files.map(f => f.patch).join('\n')
  const reply = await provider.generate({ model: MODEL, system, user, maxTokens: 300, temperature: 0 })
  return (reply.text ?? '').trim()
}

const results = []
results.push(await run('A. baseline ingênuo (sem engenharia de prompt)', NAIVE, false))
results.push(await run('B. estilo commitollama (JSON tipo+mensagem, sem corpo)', COMMITOLLAMA, false))
results.push(await run('C. esta extensão (schema + render determinístico + validação)', null, true))
console.log('resumo:', results.map(r => `${r.label.split('.')[0]}=${r.ok}/${r.total} (${r.ms}ms)`).join('  '))
