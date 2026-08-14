<div align="center">

<img src="logo.png" alt="AI Commit Messages" width="120" />

# AI Commit Messages

**Write your git commit messages with a local or self-hosted LLM — from inside VS Code.**

[![CI](https://github.com/solvelab/ai-commit-messages/actions/workflows/ci.yml/badge.svg)](https://github.com/solvelab/ai-commit-messages/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.100-007acc.svg)](https://code.visualstudio.com)
[![Ollama](https://img.shields.io/badge/Ollama-native-000000.svg)](https://ollama.com)

</div>

```
staged diff  ──▶  budget & redact  ──▶  your LLM  ──▶  validate format  ──▶  commit box
```

Stage your changes, press the button in the Source Control title bar, and the commit message appears
in the box — written by a model **you** run, on a server **you** choose. Nothing is sent to a vendor
you did not configure, and there is no account, no telemetry and no cloud fallback.

---

## Requirements

- **VS Code 1.100** or newer, with the built-in Git extension enabled.
- **A model server you can reach.** Either [Ollama](https://ollama.com) (native API) or any
  OpenAI-compatible endpoint — LM Studio, vLLM, llama.cpp, OpenAI, Groq, OpenRouter, Google Gemini.
- **A model.** `qwen2.5-coder:7b` is a good default for commit messages and runs on modest hardware.

## Quick start

1. Install the extension and reload the window.
2. Run **`AI Commit Messages: Settings`** from the Command Palette, or click the status bar entry
   that shows the model in use. Pick your backend; the form changes with it — a local server asks for
   an endpoint, a hosted one asks for an API key and hides the endpoint it does not need.
3. Stage something and press the button in the **Source Control** title bar (or `Ctrl+Alt+M` /
   `Cmd+Alt+M`).

That is the whole setup. With Ollama on the same machine the defaults already point at
`http://localhost:11434`.

## What you get

```
✨ feat(auth): validar o token antes de abrir a sessão

adicionar verificação de expiração no middleware
recusar token sem escopo de leitura
registrar tentativa inválida no log de auditoria
```

The shape is not a suggestion the model may ignore: it is **rendered by the extension** from a
structured reply. The emoji comes from the code, the blank line is placed by the code, and every
body line is checked against the word budget before the message reaches your commit box.

### The parts that only matter with local models

- **Reasoning traces never reach your commit.** `qwen3`, `gpt-oss` and `deepseek-r1` emit a chain of
  thought. Ollama reports `"thinking"` in `/api/show` → `capabilities`, so the trace is turned off at
  the source (`think: false`) instead of being stripped afterwards with a regex.
- **The diff budget is measured, not guessed.** The real context window comes from `/api/show`, and
  the characters-per-token ratio for diffs was measured against this project's own history (mean
  3.25, worst case 2.66 — the widely quoted "4 chars per token" is off by ~35% for diffs).
- **Secrets are masked before the diff leaves the machine.** A freshly created `.env`, a pasted
  private key, a token in an example file: private keys, provider tokens, JWTs and credential
  assignments are replaced by a visible marker.
- **Generated files do not eat the prompt.** A commit touching `package-lock.json` would otherwise
  spend the whole budget on machine noise. The lockfile still appears as a header, because "update
  the lockfile" is legitimate information.
- **Multi-root repositories resolve correctly.** No `repositories[0]`.
- **It can be cancelled.** A 7B model on CPU can take a minute; the button turns into a spinner and
  clicking it stops the request.
- **When it fails, it says why.** `Diagnose connection` reports the real cause — including the
  extension host's proxy patch, the failure nobody expects: `curl` works in the terminal and the
  extension does not.

### Measured, not asserted

The format above — gitmoji first, `type(scope): subject`, blank line, one short imperative action per
body line — is not what a model returns on its own. Eight real commits from this repository, the same
model (`qwen2.5-coder:7b`) and the same diffs, three prompting strategies, judged by the extension's
own validator:

| approach | valid | mean |
|---|---|---|
| plain prompt, no structure | **0/8** | 1157 ms |
| type + summary as JSON, no body | **0/8** | 388 ms |
| this extension: JSON Schema, deterministic rendering, validation, one corrective retry | **8/8** | 776 ms |

Read that fairly: the first two never promised this format, and the second is faster precisely
because it emits less. What the numbers show is that the format has to be *engineered* — asking
nicely does not produce it. Reproduce it against your own server with `scripts/baseline.mjs`.

## Backends

| backend | endpoint | API key |
|---|---|---|
| Ollama | yours, default `http://localhost:11434` | optional — only for a gateway in front of it |
| LM Studio, vLLM, llama.cpp | yours | optional |
| Other OpenAI-compatible server | yours | optional |
| OpenAI, Groq, OpenRouter, Google Gemini | fixed by the vendor | required |

Ollama is spoken natively (`/api/chat`), not through its `/v1` shim, because only the native API
accepts `num_ctx` — which is how the diff budget is honoured.

**The API key is never a setting.** It goes to the OS secret store, bound to the host it belongs to,
so switching backends cannot send one vendor's key to another. `settings.json` is plaintext on disk,
readable by every other extension, synced to your account and committable — a bad place for a
credential, especially in an extension about commits.

## Commands

| command | what it does |
|---|---|
| `AI Commit Messages: Generate Commit Message` | writes the message for the staged diff |
| `AI Commit Messages: Cancel commit message generation` | stops the request in flight |
| `AI Commit Messages: Settings` | opens the configuration panel |
| `AI Commit Messages: Configure…` | the same setup as a step-by-step wizard |
| `AI Commit Messages: Select model…` | lists the models your server offers |
| `AI Commit Messages: Set endpoint…` | edits the endpoint from anywhere |
| `AI Commit Messages: Set API key…` | stores a credential in the OS secret store |
| `AI Commit Messages: Clear API key` | removes it |
| `AI Commit Messages: Diagnose connection` | tests the server and explains failures |
| `AI Commit Messages: Insert the default prompt into settings` | copies the built-in prompt so you can edit it |
| `AI Commit Messages: Import settings from the Ollama Commit extension` | migrates from `DesislavArashev.ollama-commit` |

## Settings

**Connection**

| setting | type | default |
|---|---|---|
| `aiCommitMessages.provider` | string | `"ollama"` |
| `aiCommitMessages.endpoint` | string | `"http://localhost:11434"` |
| `aiCommitMessages.model` | string | `"qwen2.5-coder:7b"` |
| `aiCommitMessages.authHeader` | string | `"Authorization: Bearer {token}"` |
| `aiCommitMessages.headers` | object | `{}` |
| `aiCommitMessages.timeoutMs` | number | `60000` |

**Message**

| setting | type | default |
|---|---|---|
| `aiCommitMessages.language` | string | `"pt-BR"` |
| `aiCommitMessages.promptTemplate` | string | `""` — the built-in prompt for the language |
| `aiCommitMessages.maxBodyWords` | number | `10` |

**Advanced**

| setting | type | default |
|---|---|---|
| `aiCommitMessages.temperature` | number | `0` |
| `aiCommitMessages.maxDiffChars` | number | `4000` |
| `aiCommitMessages.redactSecrets` | boolean | `true` |
| `aiCommitMessages.excludeGlobs` | array | lockfiles, minified bundles, binaries |

The prompt is yours to replace: `Insert the default prompt into settings` writes the built-in one
into `promptTemplate`, and from there it is a plain string you can rewrite. `{types}`, `{language}`,
`{languageTag}` and `{maxBodyWords}` are substituted.

## Privacy

Your staged diff goes to the endpoint you configured, and nowhere else. No telemetry, no analytics,
no account, no cloud fallback when the local server is down — if your model cannot answer, the
extension fails and tells you why.

Two protections around that promise:

- Recognizable secrets are masked before the diff is sent (`redactSecrets`, on by default).
- If a repository carries its own endpoint in `.vscode/settings.json`, generation stops and asks
  before sending anything — a clone cannot silently redirect your staged diff to someone else's host.

## When something does not work

Run **`AI Commit Messages: Diagnose connection`**. It tests the endpoint, prints the real cause of a
failure (`err.cause`, not the useless `fetch failed`), and lists every setting with the value in
effect and where it comes from.

The failure nobody expects: the extension host rewrites `fetch` to follow the proxy configuration, so
a LAN endpoint can fail in the extension while `curl` works in the terminal. The fix is
`"http.noProxy": ["192.168.1.10"]` — matched by **suffix**, so CIDR and wildcards silently do
nothing. Full walkthrough in [docs/SETUP.md](docs/SETUP.md).

## Development

```bash
npm ci
npm run check-types      # tsc --noEmit — esbuild does not type check
npm run lint
npm run test:unit        # Vitest, no Electron
xvfb-run -a npm test     # integration tests in a real VS Code (Linux)
npm run vsix             # ai-commit-messages.vsix
```

Architecture and the decisions behind it: [docs/TECHNICAL.md](docs/TECHNICAL.md). Setup from scratch,
including WSL and proxies: [docs/SETUP.md](docs/SETUP.md). How to contribute:
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © [didevlab](https://github.com/didevlab). Third-party notices:
[THIRD-PARTY.md](THIRD-PARTY.md).

<div align="center"><sub><a href="#ai-commit-messages">back to top</a></sub></div>
