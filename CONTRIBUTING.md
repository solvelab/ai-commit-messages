# Contribuindo

## O rito: backlog primeiro

Toda mudança de código começa como item de backlog. Não há exceção para "correção pequena" —
correção pequena é exatamente o que escapa da rastreabilidade.

1. Ideia ou bug → issue em [Issues](https://github.com/solvelab/ai-commit-messages/issues), com
   contexto, escopo, fora de escopo e critérios de aceite verificáveis.
2. Issue → branch `backlog/<número>-<slug>` → implementação com testes → pull request com
   `Closes #n`.

Diagnosticar, ler e explicar é livre. O rito começa quando o código vai mudar.

## Commits

[Conventional Commits](https://www.conventionalcommits.org), com o tipo dentro da lista de
`commitlint.config.js` (`feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`,
`style`, `revert`). O `semantic-release` lê essas mensagens para calcular a próxima versão, então
o tipo importa de verdade: `feat` sobe minor, `fix` sobe patch.

**Nunca** inclua linha `Co-Authored-By` nem qualquer atribuição de autoria a IA — em commit,
título de PR ou corpo de PR.

## Antes de abrir o PR

```bash
npm run check-types
npm run lint
npm run test:unit
xvfb-run -a npm test    # sem xvfb-run fora do Linux
```

O CI roda exatamente esses comandos. Falhou aqui, falha lá.

## Testes

- **Lógica pura** (prompt, orçamento de diff, sanitização, mapeamentos) → Vitest, arquivo
  `*.test.ts` ao lado do módulo. Sem `import 'vscode'`.
- **Coisas que só existem dentro da VS Code** (ativação, comandos, API do git) → suíte de
  integração em `src/test/`, rodada por `@vscode/test-cli`.

Se um módulo precisa de `vscode` para ser testado, provavelmente ele está misturando adaptação com
lógica — separe antes de testar.

## Idioma

- Documentação em português.
- Identificadores, comentários de código e mensagens de log em inglês.
- `README.md` em inglês: é a página da Marketplace e o que faz a extensão ser encontrada.
