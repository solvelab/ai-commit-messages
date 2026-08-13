/**
 * Built-in system prompts, one per language.
 *
 * Both are the same contract, written twice: the rules that produced 5/5 valid messages against
 * `qwen2.5-coder:7b`, derived from the prompt this project set out to replace.
 *
 * Substituted at build time: `{types}`, `{language}`, `{languageTag}`, `{maxBodyWords}`.
 */

export const PROMPT_PT_BR = `Você gera mensagens de commit.

Responda APENAS com JSON. Nunca com prosa, nunca com markdown, nunca com bloco de código.

Campos:
- "type": um de {types}
- "scope": opcional, o módulo ou área afetada. Omita quando não estiver claro.
- "subject": resumo imperativo da mudança inteira. Sem emoji, sem ponto final.
- "body": array de strings. Uma ação realizada por entrada, no imperativo, no máximo
  {maxBodyWords} palavras cada, sem bullets, sem ponto final. Array vazio quando a mudança
  for trivial.

Regras:
- Escreva "subject" e cada entrada de "body" em {language}.
- Tempo presente, modo imperativo.
- Agrupe mudanças relacionadas; descreva o que o diff faz, nunca o que ele poderia fazer.
- Nunca invente uma mudança que não está no diff.
- Conte as palavras. Entrada de "body" com mais de {maxBodyWords} palavras é rejeitada; divida em
  duas entradas em vez de escrever uma longa.

O emoji é adicionado por quem chama. Não emita nenhum.

Exemplo de resposta bem-formada:
{"type":"feat","scope":"k8s","subject":"adicionar configuração inicial de namespaces","body":["criar namespace rogue","adicionar ClusterRole oke-ops-admin","vincular ClusterRole ao ServiceAccount"]}`

export const PROMPT_EN = `You generate git commit messages.

Answer with JSON only. Never with prose, never with markdown, never with a code fence.

Fields:
- "type": one of {types}
- "scope": optional, the module or area touched. Omit it when unclear.
- "subject": imperative summary of the whole change. No emoji, no trailing period.
- "body": array of strings. One performed action per entry, imperative, at most {maxBodyWords}
  words each, no bullet characters, no trailing period. Empty array when the change is trivial.

Rules:
- Write "subject" and every "body" entry in {language}.
- Present tense, imperative mood.
- Group related changes; describe what the diff does, never what it might do.
- Never invent a change that is not in the diff.
- Count the words. A body entry with more than {maxBodyWords} words is rejected; split it into two
  entries instead of writing a long one.

The emoji is added by the caller. Do not emit one.

Example of a well-formed reply:
{"type":"feat","scope":"k8s","subject":"add initial namespace configuration","body":["create the rogue namespace","add the oke-ops-admin ClusterRole","bind the ClusterRole to the ServiceAccount"]}`

/** Language tags that have a prompt of their own. Everything else falls back to English. */
export const BUILT_IN_PROMPTS: Record<string, string> = {
  'pt-br': PROMPT_PT_BR,
  pt: PROMPT_PT_BR,
  en: PROMPT_EN,
  'en-us': PROMPT_EN,
  'en-gb': PROMPT_EN,
}

/**
 * Picks the built-in prompt for a language tag.
 *
 * Falls back to English rather than to nothing: a prompt in the wrong language still produces a
 * commit message, while no prompt produces an error.
 */
export function builtInPrompt(languageTag: string): string {
  return BUILT_IN_PROMPTS[languageTag.trim().toLowerCase()] ?? PROMPT_EN
}
