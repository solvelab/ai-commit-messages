# Project Context

## Purpose

Extensão do VS Code que gera mensagens de commit a partir do diff staged usando um LLM local ou
self-hosted. Substitui a `DesislavArashev.ollama-commit` (abandonada desde 03/2025) com o mesmo
fluxo — botão no Source Control → mensagem na caixa de commit — mas com núcleo agnóstico de
provider e correção dos defeitos conhecidos da incumbente.

## Tech Stack

- TypeScript 5.9 `strict`, bundle CJS único via esbuild (`external: ['vscode']`)
- Vitest para módulos puros; `@vscode/test-cli` (Mocha dentro da VS Code) para integração
- ESLint 9 flat config; sem Prettier/Biome
- npm (o workspace inteiro usa npm; não há pnpm/yarn)
- semantic-release em push na `main`, `tagFormat: v${version}`

## Project Conventions

### Code Style

Identificadores, comentários e mensagens de log em inglês. Documentação em português, exceto o
`README.md`, que é a página da Marketplace.

Costura obrigatória: **nada que importa `vscode` faz lógica; nada que faz lógica importa
`vscode`.** Adaptadores finos na borda, lógica pura no meio — é o que permite testar sem Electron.

### Architecture Patterns

- Um `CommitProvider` por família de API. Ollama é adapter próprio porque o shim `/v1` não expõe
  `options.num_ctx`.
- O modelo devolve **estrutura**; o código renderiza o **texto**. Emoji nunca vem do modelo.
- O diff é entrada não confiável: vai ao prompt embrulhado em bloco explícito de dado não confiável.
- Segredo nunca é setting. Chave de API só em `SecretStorage`.
- `aiCommitMessages.endpoint` é `scope: "machine"` para que um repositório clonado não possa
  redirecionar o diff staged.

### Testing Strategy

Todo módulo puro nasce com teste no Vitest. Integração cobre o que só existe dentro da VS Code
(ativação, comandos, API do git), sempre com provider fake — nenhuma suíte automatizada depende de
servidor de modelo.

### Git Workflow

Backlog primeiro: issue → branch `backlog/<n>-<slug>` → PR com `Closes #n`. Conventional Commits
obrigatório (o semantic-release lê as mensagens). Nunca `Co-Authored-By` nem atribuição a IA.

## Domain Context

Modelo de raciocínio (qwen3, gpt-oss, deepseek-r1) despeja chain-of-thought na saída. O Ollama
reporta `"thinking"` em `/api/show` → `capabilities`; a extensão usa isso para enviar
`think: false` na origem, em vez de limpar com regex depois.

Orçamento de diff é medido, não estimado: contexto do modelo vem de `/api/show`, e a razão
caracteres/token para diff foi medida em 3,25 de média e 2,66 no pior caso — o divisor usado é 2,6.

## Important Constraints

- `scm/inputBox` é API *proposed* e é derrubada em build stable: o botão fica em `scm/title`, e o
  cancelamento é responsabilidade da extensão.
- O extension host reescreve `globalThis.fetch` (proxy + certificados). O bypass embutido cobre só
  loopback, e o casamento de `http.noProxy` é por sufixo.
- Não existe opção de "ignorar erro TLS": o patch descarta `rejectUnauthorized` do dispatcher.

## External Dependencies

- **Ollama** (`/api/chat`, `/api/tags`, `/api/show`) — provider nativo.
- **Endpoints OpenAI-compatible** (`/v1/chat/completions`, `/v1/models`) — LM Studio, OpenRouter,
  Groq, vLLM, llama.cpp.
- **Extensão embutida `vscode.git`** — via `extensionDependencies`; os tipos são uma cópia de
  `extensions/git/src/api/git.d.ts`, porque não existe pacote npm.
