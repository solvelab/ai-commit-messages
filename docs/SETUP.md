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

## Instalar em uma linha

```bash
curl -fsSL -o /tmp/ai-commit-messages.vsix https://github.com/solvelab/ai-commit-messages/releases/latest/download/ai-commit-messages.vsix && code --install-extension /tmp/ai-commit-messages.vsix --force
```

A URL de nome fixo aponta sempre para a release mais nova, então o comando não envelhece — rodar de
novo atualiza. Não existe atualização automática por este caminho: a VS Code só atualiza sozinha o
que veio de uma loja.

Numa sessão remota (WSL, SSH, container), rode de um terminal **daquele lado**, senão a extensão é
instalada do lado local e aparece esmaecida.

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
curl -s --max-time 5 http://192.168.1.10:11434/api/tags
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
  "http.noProxy": ["192.168.1.10"]
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

### O painel de configuração

`AI Commit Messages: Settings` — também no clique da barra de status e no link da página de settings.

O formulário segue o backend escolhido, o que a página nativa não consegue fazer: um schema de
setting não tem `when`, então lá todo campo aparece sempre. No painel, escolher OpenAI esconde o
endpoint e pede a chave; escolher Ollama mostra o endpoint e trata a chave como opcional, que é o
caso de gateway na frente dele. A lista de modelos é lida do servidor, com recarregar, e aceita
nome digitado para o que a lista não trouxer. `Testar conexão` diz o que o servidor respondeu, com a
causa quando falha.

A chave digitada ali vai para o `SecretStorage` e **nunca** volta para o painel: ele só recebe
"guardada" ou "não guardada". Ela fica presa ao host que está no formulário, não ao que estava salvo.

As settings nativas continuam valendo, para quem edita `settings.json` na mão.

### Onde fica o endpoint

Na página de settings, campo **Endpoint**, ao lado do Provider. Default `http://localhost:11434`,
que serve para um Ollama na própria máquina. Para um servidor na rede, digite o endereço:
`http://192.168.1.10:11434`. Caminho completo (`/api/generate`) é aparado sozinho.

O campo teve escopo `machine` até a v1.10, o que o escondia da aba **User** numa sessão remota. Isso
saiu: o campo que a pessoa configura primeiro não pode ficar em outra aba.

O que aquele escopo comprava era impedir que um repositório clonado gravasse endpoint em
`.vscode/settings.json` e redirecionasse o teu diff staged. Essa garantia continua, em outro lugar:
se o endpoint efetivo vier do repositório e for diferente do teu, a extensão pergunta antes de
mandar qualquer coisa, uma vez por endpoint. Recusou, a geração é cancelada.

### A mesma setting aparecendo com dois valores

Sessão remota tem **dois** arquivos de settings de usuário: o local e o remoto. Os dois podem conter
a mesma chave, o remoto ganha, e a aba **User** mostra o local — daí o selo *(Modified in Remote)*
com um valor na tela e outro em uso.

Isso é resíduo de quando `endpoint`, `model` e `provider` tinham escopo `machine`, que gravava no
arquivo remoto. Da v1.12 em diante a extensão desfaz isso sozinha na primeira ativação: move o valor
em uso para o arquivo que a aba User mostra, sem mudar o valor. Cópia vinda de
`.vscode/settings.json` não é tocada.

Para ver de onde cada setting vem, rode `AI Commit Messages: Diagnose connection` — o relatório
termina com a lista de todas as settings, o valor em uso e a origem.

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

## Publicação

O pipeline publica sozinho a cada release, nos dois registries, usando o mesmo `.vsix` que anexa ao
release do GitHub — o que se baixa daqui e o que as lojas servem são os mesmos bytes.

Sem os segredos configurados, os dois passos se pulam e o job termina verde, avisando o que ficou de
fora. É o estado antes de existirem os tokens.

### Marketplace (`VSCE_PAT`)

A publicação sem segredo já existe no `vsce` (`publish --oidc`), mas exige uma política de *trusted
publishing* no portal, que ainda não aparece para este publisher — a página tem apenas **Extensions**,
**Details** e **Members**. Enquanto isso, PAT:

1. `dev.azure.com` → **Create new organization**, se não houver nenhuma: a tela de tokens vive dentro
   de uma organização, e ela serve só para isso.
2. Perfil → **Personal access tokens** → **New Token**
   - **Organization: All accessible organizations** — restrito a uma organização, o token não publica.
   - **Scopes: Custom defined → Show all scopes → Marketplace → Manage**
3. `gh secret set VSCE_PAT --repo solvelab/ai-commit-messages`

Quando o portal oferecer trusted publishing, o passo do workflow vira
`vsce publish --oidc --packagePath …` e o segredo pode ser apagado.

### Open VSX (`OVSX_PAT`)

1. Login com GitHub em <https://open-vsx.org>, assinar o *Publisher Agreement*.
2. Token em **User Settings → Access Tokens**.
3. Criar o namespace uma vez: `npx ovsx create-namespace solvelab -p <token>`.
4. `gh secret set OVSX_PAT --repo solvelab/ai-commit-messages`

Criar o namespace **não** garante exclusividade: qualquer pessoa pode publicar nele até a propriedade
ser reivindicada, o que é um pedido separado ao Eclipse.
