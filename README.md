<div align="center">

<img src="logo.png" alt="AI Commit Messages" width="120" />

# AI Commit Messages

**Write your git commit messages with a local or self-hosted LLM — from inside VS Code.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6.svg)](https://www.typescriptlang.org)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.100-007acc.svg)](https://code.visualstudio.com)
[![Ollama](https://img.shields.io/badge/Ollama-native-000000.svg)](https://ollama.com)

</div>

```
staged diff  ──▶  budget & redact  ──▶  local LLM  ──▶  validate format  ──▶  commit box
```

> 📚 **Setup do zero:** [docs/SETUP.md](docs/SETUP.md) · **Arquitetura/interno:** [docs/TECHNICAL.md](docs/TECHNICAL.md)

---

## 🚧 Status

Em desenvolvimento, construído item a item pelo backlog público
([issues](https://github.com/solvelab/ai-commit-messages/issues)). Esta seção diz **o que já
funciona de verdade** — nada aqui é promessa.

| entrega | estado |
|---|---|
| Scaffold: build, testes, CI, empacotamento `.vsix` | ✅ #4 |
| Botão no Source Control, comando e keybinding | ✅ #5 |
| Resolução correta de repositório em multi-root | ✅ #6 |
| Coleta de diff por arquivo, untracked e fallback | ✅ #7 |
| Provider Ollama (`/api/chat`, structured output, `think:false`) | ✅ #8 |
| Formato determinístico (gitmoji + Conventional, PT-BR) | ✅ #9 |
| Timeout, cancelamento e erros acionáveis | ✅ #10 |
| Sanitização de `<think>`, fences e preâmbulos | ✅ #11 |
| Settings com escopos e Workspace Trust | ✅ #12 |
| Migração das settings do `ollama-commit` | ✅ #13 |
| Orçamento de diff com exclusões por glob | ⏳ M2 |
| Redação de segredos no diff | ⏳ M2 |
| Provider OpenAI-compatible + `SecretStorage` | ⏳ M2 |
| Seletor de modelo e comando de diagnóstico | ⏳ M2 |
| Publicação em Marketplace e Open VSX | ⏳ M2 |

Medido em `qwen2.5-coder:7b` contra um Ollama na LAN, sobre 5 commits reais deste workspace:
**5/5 mensagens no formato, ~1 s cada, nenhuma precisou de retentativa.**

## ✨ Why another one

Most extensions in this space stop at "send the diff, paste the answer". This one is built around
the failure modes that actually show up with **local** models on **real** repositories:

- **Reasoning models don't leak into your commit.** `qwen3`, `gpt-oss` and `deepseek-r1` emit a
  chain of thought. Ollama reports `"thinking"` in `/api/show` → `capabilities`, so the reasoning
  trace is turned off at the source (`think: false`) instead of being regex-stripped afterwards.
- **The diff budget is measured, not guessed.** The model's real context window comes from
  `/api/show`; the characters-per-token ratio for diffs was measured against this project's own
  history (mean 3.25, worst case 2.66 — the widely quoted "4 chars per token" is off by ~35% for
  diffs).
- **Multi-root repositories resolve correctly.** No `repositories[0]`.
- **It can be cancelled.** A 7B model on CPU can take a minute.
- **Your diff is not casually shipped anywhere.** The endpoint setting is machine-scoped, so a
  cloned repository cannot silently redirect your staged diff to someone else's host.

## 🔒 Privacy

No telemetry, no analytics, no phone-home. The staged diff goes to exactly one place: the endpoint
you configured. Point it at your own Ollama and nothing leaves your network.

## 🛠️ Development

```bash
npm ci
npm run check-types     # tsc --noEmit — esbuild does not type check
npm run lint
npm run test:unit       # vitest, pure modules, no Electron
npm test                # @vscode/test-cli, boots a real VS Code (use xvfb-run -a on Linux)
npm run vsix            # produces ai-commit-messages.vsix
```

Press <kbd>F5</kbd> to launch the Extension Development Host.

Every change starts as an issue and lands through a pull request that closes it — see
[CONTRIBUTING.md](CONTRIBUTING.md).

## 📄 License

[MIT](LICENSE) © [didevlab](https://github.com/didevlab)

<div align="center"><sub><a href="#ai-commit-messages">⬆ Back to top</a></sub></div>
