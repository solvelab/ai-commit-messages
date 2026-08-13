# [1.3.0](https://github.com/solvelab/ai-commit-messages/compare/v1.2.0...v1.3.0) (2026-08-13)


### Features

* **budget:** excluir arquivos gerados do orçamento de diff ([8ca13f6](https://github.com/solvelab/ai-commit-messages/commit/8ca13f62456f88329148c4e28f28ea573cfceef4))

# [1.2.0](https://github.com/solvelab/ai-commit-messages/compare/v1.1.0...v1.2.0) (2026-08-13)


### Features

* **security:** redigir segredos no diff antes de sair da máquina ([1f60a77](https://github.com/solvelab/ai-commit-messages/commit/1f60a77f6a93639c06522c76696b099ccaa1272f))

# [1.1.0](https://github.com/solvelab/ai-commit-messages/compare/v1.0.0...v1.1.0) (2026-08-13)


### Features

* **providers:** adapter OpenAI-compatible com presets por provider ([23c94ab](https://github.com/solvelab/ai-commit-messages/commit/23c94ab88c086039b55ec3856d93013348894604))

# 1.0.0 (2026-08-13)


### Bug Fixes

* **build:** alinhar esbuild com o do vitest para destravar npm ci ([6f7e890](https://github.com/solvelab/ai-commit-messages/commit/6f7e890b4ab2b06734d91670744229e78644caa0))
* **prompt:** evitar caractere combinado em character class ([0b3f344](https://github.com/solvelab/ai-commit-messages/commit/0b3f344a72d6722f5aa8f43a90d63dcfc08a9c4f))
* **providers:** despachar pelo provider escolhido em vez de sempre usar Ollama ([432cef8](https://github.com/solvelab/ai-commit-messages/commit/432cef803d8926661286161829ebf9faa05e2a2b))
* **settings:** manter as novas chaves de auth visíveis na aba User ([56dd9ad](https://github.com/solvelab/ai-commit-messages/commit/56dd9ad67f822b3a74bcfbe9dee37bb49278dea8)), closes [#28](https://github.com/solvelab/ai-commit-messages/issues/28)
* **test:** construir o bundle antes da suíte de integração ([593681b](https://github.com/solvelab/ai-commit-messages/commit/593681b3dbf76f05cdca3d47d3ef8609263bdb08))


### Features

* ativar extensão com canal de log e identidade testada ([c536fbb](https://github.com/solvelab/ai-commit-messages/commit/c536fbb988744d5854d6926ed7cbbcd2f191ab94))
* **git:** coletar diff staged por arquivo com untracked e fallback ([478863a](https://github.com/solvelab/ai-commit-messages/commit/478863a8be42d5b60b12da00578ccafea0711a71))
* **git:** resolver o repositório correto em workspace multi-root ([3a23b2f](https://github.com/solvelab/ai-commit-messages/commit/3a23b2f38b8a31b21c6810144a6854240767c3a3))
* **migrate:** importar as settings da extensão ollama-commit ([c4fff70](https://github.com/solvelab/ai-commit-messages/commit/c4fff707d82b617195539fcb0f0bfef8ad096019))
* **net:** timeout, cancelamento e liberação garantida de recursos ([0d8fc46](https://github.com/solvelab/ai-commit-messages/commit/0d8fc467d0c2b9e32b5a0e6b56f26349e4b006cf))
* **prompt:** formato determinístico com schema, render e validação ([16d6752](https://github.com/solvelab/ai-commit-messages/commit/16d675284fc2959bac446af0d3e1761316365fc6))
* **prompt:** prompt padrão por idioma, derivado do prompt de referência ([d771c8b](https://github.com/solvelab/ai-commit-messages/commit/d771c8b9026b425be0851a6a2eb0a0d134b15bef))
* **prompt:** sanitizar saída do modelo com think, fences e preâmbulos ([433a24f](https://github.com/solvelab/ai-commit-messages/commit/433a24f0ad033b77739182d48ebf8874338b6906))
* **providers:** adapter Ollama com /api/chat, structured output e think false ([ff42c35](https://github.com/solvelab/ai-commit-messages/commit/ff42c35e2c51bece1a5910ae12721e14819b8473))
* **providers:** credencial opcional para Ollama atrás de gateway ([9ffd4f1](https://github.com/solvelab/ai-commit-messages/commit/9ffd4f1f49500605d93b57107805227d0a0ec16f))
* **scm:** registrar comando de geração e botão na barra do Source Control ([d844e12](https://github.com/solvelab/ai-commit-messages/commit/d844e1236ce4cab5b8ecefa5bcc41007193ba549))
* **settings:** agrupar e ordenar as settings em três seções ([9c4f267](https://github.com/solvelab/ai-commit-messages/commit/9c4f267ac7cd49dfc50873c56b370454393f1576))
* **settings:** declarar configuração com escopos corretos e ligar o pipeline ([305724d](https://github.com/solvelab/ai-commit-messages/commit/305724ddf8bfb9d59818ddff8c08f078a8927c1e))
* **settings:** tornar provider, endpoint e modelo encontráveis ([7b4c7a1](https://github.com/solvelab/ai-commit-messages/commit/7b4c7a12d03ee4cfacb8ce19d6fe54cad3ec05a6))
