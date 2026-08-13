# AI Commit Messages — guia do repositório

Extensão do VS Code que escreve a mensagem de commit a partir do diff staged, usando LLM local ou
self-hosted. Contexto completo: `docs/TECHNICAL.md`.

## Comandos

| comando | o que faz |
|---|---|
| `npm ci` | instala dependências |
| `npm run check-types` | `tsc --noEmit` — o esbuild **não** faz type check |
| `npm run lint` | ESLint 9 flat config |
| `npm run test:unit` | Vitest: `src/**/*.test.ts` menos `src/test/**` |
| `npm test` | `@vscode/test-cli`: sobe uma VS Code real (Linux: `xvfb-run -a npm test`) |
| `npm run package` | bundle de produção em `dist/extension.js` |
| `npm run vsix` | gera `ai-commit-messages.vsix` |

## Regras que não são preferência

Todas verificadas na fonte — quebrar qualquer uma custa retrabalho, não estilo.

1. **`external: ['vscode']` no esbuild.** O módulo é criado em runtime pelo host; empacotá-lo
   quebra o carregamento.
2. **Não declarar `extensionKind`.** O default já resolve para `["workspace"]`, que é o lado onde
   estão o repositório e o `git`.
3. **Nunca `repositories[0]`.** O argumento do comando é um `SourceControl` (ou `undefined` com
   mais de um repo visível), e é preciso ler `rootUri` **e** `_rootUri`.
4. **Nada de `scm/inputBox`.** É API *proposed*, derrubada em build stable. Botão em `scm/title`.
5. **O comando devolve Promise que só resolve quando o trabalho acaba** — é o contrato do action
   runner do core.
6. **`stream: false` no Ollama.** Os endpoints são streaming por padrão; `res.json()` numa chamada
   default falha, porque o corpo é NDJSON.
7. **`AbortSignal` em toda chamada de rede.** `fetch` não tem timeout, e a causa real do erro está
   em `err.cause`, não em `err.message`.
8. **Nenhuma setting de `apiKey`.** Só `SecretStorage`.
9. **Emoji vem do código, nunca do modelo.**
10. **Mexeu em `contributes.configuration` ou em `contributes.commands`? Atualize
    `src/test/integration/manifest.test.ts` e `activation.test.ts` no mesmo commit.** Eles travam
    a ordem dos blocos, a contagem de chaves, o escopo `machine` e a lista de comandos — de
    propósito. A suíte de integração não roda em toda máquina (o Electron trava sob WSLg), então
    esse esquecimento só aparece no CI.

## Idioma

Documentação em português; identificadores, comentários e logs em inglês. `README.md` em inglês
(é a página da Marketplace).

## Rito

Backlog primeiro: issue → branch `backlog/<n>-<slug>` → PR com `Closes #n`. Conventional Commits
obrigatório. **Nunca** `Co-Authored-By` nem atribuição de autoria a IA em commit ou PR.

<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->
