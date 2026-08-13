import * as vscode from 'vscode'

import { currentSettings } from '../config.js'
import { planConfiguration, validateEndpointInput, type ConfigureAnswers } from '../configurePlan.js'
import { getLog } from '../log.js'
import { CONFIG_SECTION } from '../meta.js'
import { createProvider, isImplemented } from '../providers/registry.js'
import { readToken } from './secrets.js'
import type { FetchLike } from '../providers/types.js'
import { PROVIDERS, type ProviderId } from '../settings.js'

const PROVIDER_LABELS: Record<ProviderId, { label: string; detail: string }> = {
  ollama: {
    label: 'Ollama',
    detail: "Ollama's native API — supports num_ctx, structured output and think:false",
  },
  'openai-compat': {
    label: 'OpenAI-compatible',
    detail: 'LM Studio, OpenRouter, Groq, vLLM, llama.cpp — /v1/chat/completions',
  },
}

const MANUAL_MODEL = '$(edit) Type the model name…'

/**
 * Guided setup.
 *
 * It exists because the settings that matter most are machine-scoped, and with a remote session
 * VS Code hides those from the **User** tab — they live under **Remote**. Correct, documented, and
 * impossible to find. This command sidesteps the question entirely.
 */
export async function configure(): Promise<void> {
  const log = getLog()
  const { settings } = currentSettings()

  const providerPick = await vscode.window.showQuickPick(
    PROVIDERS.map(id => ({
      id,
      ...PROVIDER_LABELS[id],
      // Say it in the list rather than after three steps of setup.
      description: isImplemented(id) ? undefined : 'not available yet',
      picked: id === settings.provider,
    })),
    { title: 'AI Commit Messages (1/3)', placeHolder: 'Which backend?' },
  )
  if (!providerPick) {
    return
  }

  const endpoint = await vscode.window.showInputBox({
    title: 'AI Commit Messages (2/3)',
    prompt: 'Base URL of the model server. A full endpoint is trimmed automatically.',
    value: settings.endpoint,
    placeHolder: 'http://192.168.15.6:11434',
    validateInput: validateEndpointInput,
    ignoreFocusOut: true,
  })
  if (endpoint === undefined) {
    return
  }

  const model = await pickModel(providerPick.id, endpoint, settings.model)
  if (model === undefined) {
    return
  }

  const answers: ConfigureAnswers = { provider: providerPick.id, endpoint, model }

  try {
    const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION)
    for (const write of planConfiguration(answers)) {
      // Always Global: `endpoint` is machine-scoped, and under a remote session VS Code resolves
      // this to the remote settings file — where a per-machine endpoint belongs.
      await configuration.update(write.key, write.value, vscode.ConfigurationTarget.Global)
      log.info(`configured ${write.key} = ${write.value}`)
    }
  } catch (error) {
    log.error(error instanceof Error ? error : String(error))
    void vscode.window.showErrorMessage(
      `Could not save the configuration: ${error instanceof Error ? error.message : String(error)}`,
    )
    return
  }

  void vscode.window.showInformationMessage(
    `AI Commit Messages is set up: ${answers.model} at ${answers.endpoint}.`,
  )
}

/** Lists the server's models, falling back to typing when it cannot be reached. */
async function pickModel(
  providerId: ProviderId,
  endpoint: string,
  current: string,
): Promise<string | undefined> {
  const log = getLog()
  let models: { id: string; label: string; detail?: string }[] = []

  try {
    const token = await readToken(providerId)
    const provider = createProvider(providerId, {
      endpoint,
      fetch: globalThis.fetch as FetchLike,
      ...(token ? { token } : {}),
    })
    models = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Reading the model list…' },
      () => provider.listModels(),
    )
  } catch (error) {
    log.warn(`could not list models at ${endpoint}: ${String(error)}`)
  }

  if (models.length === 0) {
    // Unreachable server must not block setup: the user may be configuring it before starting it.
    return vscode.window.showInputBox({
      title: 'AI Commit Messages (3/3)',
      prompt: `No model list could be read from ${endpoint}. Type the model name.`,
      value: current,
      placeHolder: 'qwen2.5-coder:7b',
      ignoreFocusOut: true,
    })
  }

  const items = [
    ...models.map(m => ({
      label: m.label,
      ...(m.detail ? { detail: m.detail } : {}),
      description: m.id === current ? 'current' : undefined,
      id: m.id,
    })),
    { label: MANUAL_MODEL, id: MANUAL_MODEL },
  ]

  const choice = await vscode.window.showQuickPick(items, {
    title: 'AI Commit Messages (3/3)',
    placeHolder: `${models.length} model(s) installed on the server`,
  })
  if (!choice) {
    return undefined
  }
  if (choice.id === MANUAL_MODEL) {
    return vscode.window.showInputBox({
      title: 'AI Commit Messages (3/3)',
      prompt: 'Model name',
      value: current,
      ignoreFocusOut: true,
    })
  }
  return choice.id
}
