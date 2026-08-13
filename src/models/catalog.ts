/**
 * Models known per backend, used only when the server cannot be reached and no cache exists.
 *
 * Declaredly approximate: model catalogues change weekly, and this list is a starting point for
 * someone configuring an endpoint that is not up yet — never a replacement for what the server
 * actually reports. Every entry the picker shows from here is labelled as such.
 */

export const KNOWN_MODELS: Record<string, readonly string[]> = {
  ollama: ['qwen2.5-coder:7b', 'qwen3:8b', 'llama3.2:latest', 'llama3.1:8b', 'deepseek-r1:8b'],
  'ollama-openai': ['qwen2.5-coder:7b', 'qwen3:8b', 'llama3.2:latest'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'o4-mini'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'qwen-2.5-coder-32b'],
  openrouter: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku', 'meta-llama/llama-3.3-70b-instruct'],
  gemini: ['gemini-2.0-flash', 'gemini-2.5-flash'],
  lmstudio: [],
  vllm: [],
  llamacpp: [],
  custom: [],
}

export function knownModels(backendId: string): readonly string[] {
  return KNOWN_MODELS[backendId] ?? []
}
