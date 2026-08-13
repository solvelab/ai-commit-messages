# Setup

Do zero até rodar a extensão a partir do código, e até instalar o `.vsix` na sua VS Code.

## Pré-requisitos

| item | versão | por quê |
|---|---|---|
| Node.js | 22+ | `@vscode/vsce` exige Node ≥ 20; o CI roda em 22 |
| npm | 10+ | o workspace inteiro usa npm — não há pnpm/yarn |
| VS Code | ≥ 1.100 | valor de `engines.vscode` no manifesto |
| Ollama | qualquer | local ou na LAN; veja *Servidor Ollama* abaixo |

## Ambiente de desenvolvimento

```bash
git clone git@github.com:solvelab/ai-commit-messages.git
cd ai-commit-messages
npm ci
```

Validações (as mesmas que o CI roda):

```bash
npm run check-types   # tsc --noEmit — o esbuild NÃO faz type check
npm run lint          # ESLint 9 flat config
npm run test:unit     # vitest: módulos puros, sem Electron
npm test              # @vscode/test-cli: sobe uma VS Code de verdade
```

No Linux (inclusive WSL) a suíte de integração precisa de display virtual:

```bash
xvfb-run -a npm test
```

Rodar a extensão: <kbd>F5</kbd> na VS Code abre o **Extension Development Host** com ela carregada.

## Instalar o `.vsix`

```bash
npm run vsix
code --install-extension ai-commit-messages.vsix --force
```

> ⚠️ **Em WSL/Remote-SSH, execute isso no terminal integrado de uma janela já conectada ao
> remoto.** O `code` desse terminal é o shim do VS Code Server e instala em
> `~/.vscode-server/extensions`. Rodado de um shell Windows, a extensão é instalada do lado da UI
> e aparece esmaecida — porque esta é uma *workspace extension*: ela precisa rodar onde estão o
> repositório e o binário `git`.
>
> Alternativa pela interface: **Extensions: Install from VSIX…** na Command Palette, com a janela
> conectada ao remoto.

Releases publicados trazem o `.vsix` anexado — baixe de
[Releases](https://github.com/solvelab/ai-commit-messages/releases) e use o mesmo comando.

## Servidor Ollama

Local, nada a fazer: o default é `http://127.0.0.1:11434`.

Numa outra máquina da LAN, o Ollama precisa parar de escutar só em loopback:

```ini
# Linux/systemd — `systemctl edit ollama.service`
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
```

```bash
systemctl daemon-reload && systemctl restart ollama
```

macOS: `launchctl setenv OLLAMA_HOST "0.0.0.0:11434"` e reabrir o app.
Windows: variável de ambiente do usuário `OLLAMA_HOST`, sair do Ollama pela bandeja e reabrir.

Conferir de dentro do WSL — mesmo namespace de rede da extensão:

```bash
curl -s --max-time 5 http://192.168.15.6:11434/api/tags
```

`OLLAMA_ORIGINS` **não** é necessário: a extensão faz a requisição no extension host (Node), sem
cabeçalho `Origin`. Aquilo só vale para requisições vindas de navegador/webview.

## Troubleshooting

### `curl` funciona no terminal, a extensão não

Quase sempre é o patch de proxy do extension host, não a rede. O host reescreve `globalThis.fetch`
(`http.proxySupport` default `"override"`), e sob WSL ele resolve o proxy pela configuração do
**Windows**. O bypass embutido cobre **apenas loopback** — um IP de LAN não é isento.

Na aba **Remote [WSL: …]** das settings:

```jsonc
{
  // casamento é por SUFIXO: "192.168.15.0/24" e "192.168.*" NÃO funcionam
  "http.noProxy": ["192.168.15.6"]
}
```

Ou, para parar de perguntar ao Windows: `"http.useLocalProxyConfiguration": false`.

Para ver o que o resolvedor decidiu: **Developer: Set Log Level…** → `Trace`, e leia
`ProxyResolver#resolveProxy` no canal de saída **Window**.

### Primeira geração demora muito

Carregar o modelo na memória pode passar de 30 s. O timeout default é generoso por isso; depois do
primeiro uso o modelo fica residente por 5 minutos (`keep_alive` do Ollama).

### TLS na frente do Ollama

Instale a CA no *trust store* do sistema, dentro do WSL:

```bash
sudo cp minha-ca.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates
```

E recarregue a janela. Não existe (e não vai existir) uma opção de "ignorar erro de certificado": o
patch de proxy descarta o `rejectUnauthorized` do dispatcher, então a opção mentiria.

### Onde entra a API key

Não existe campo de chave nas settings, e isso é deliberado: `settings.json` é texto puro no disco,
legível por qualquer outra extensão via `getConfiguration()`, sincronizado pela conta e commitável
quando cai em `.vscode/settings.json`. A chave vive no `SecretStorage`, que é por extensão,
criptografado e não sincroniza.

Três caminhos, todos gravando no mesmo lugar:

- o link **Set API key…** na página de settings — na descrição do **Provider** (aba User) e do
  **Endpoint** (aba Remote, a única setting da conexão visível ali numa sessão remota);
- o passo do assistente `AI Commit Messages: Configure…`, que pergunta a chave quando o backend
  escolhido exige uma;
- o comando `AI Commit Messages: Set API key…` na paleta.

A chave fica presa ao **host** do endpoint: trocar de provider não reaproveita a credencial do
anterior. Para apagar, `AI Commit Messages: Clear API key`.

### Gateway com cabeçalho fora do padrão

`aiCommitMessages.authHeader` descreve a linha inteira do cabeçalho, com `{token}` no lugar da
chave. O default `Authorization: Bearer {token}` serve para OpenAI, Groq, OpenRouter e Gemini.
Um gateway que espere outra coisa:

```jsonc
"aiCommitMessages.authHeader": "x-api-key: {token}"      // cabeçalho próprio
"aiCommitMessages.authHeader": "Authorization: {token}"  // token cru, sem esquema
```

Sem `{token}` o valor é recusado e o default vale — um cabeçalho montado sem a chave falharia no
servidor, longe da causa.
