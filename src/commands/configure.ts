import * as vscode from 'vscode'

import { currentSettings } from '../config.js'
import {
  planConfiguration,
  validateEndpointInput,
  wizardProviderContext,
  type ConfigureAnswers,
} from '../configurePlan.js'
import { getLog } from '../log.js'
import { withAbort } from '../net.js'
import { CONFIG_SECTION } from '../meta.js'
import { createProvider } from '../providers/registry.js'
import { readToken, setToken } from './secrets.js'
import { ProviderError, type FetchLike } from '../providers/types.js'
import { BACKENDS, type Backend } from '../providers/catalog.js'
import { type ProviderId, type Settings } from '../settings.js'

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

  const backendPick = await vscode.window.showQuickPick(
    BACKENDS.map(backend => ({
      label: backend.label,
      description: backend.defaultEndpoint || 'you supply the URL',
      detail: backend.description,
      backend,
      picked: backend.id === settings.backend.id,
    })),
    { title: 'AI Commit Messages (1/3)', placeHolder: 'Which backend?' },
  )
  if (!backendPick) {
    return
  }
  const backend: Backend = backendPick.backend

  // The endpoint the catalog knows beats whatever is configured for a different backend.
  const suggestedEndpoint =
    backend.id === settings.backend.id ? settings.endpoint : backend.defaultEndpoint

  const endpoint = await vscode.window.showInputBox({
    title: 'AI Commit Messages (2/3)',
    prompt: 'Base URL of the model server. A full endpoint is trimmed automatically.',
    value: suggestedEndpoint,
    placeHolder: 'http://192.168.15.6:11434',
    validateInput: value => validateEndpointInput(value, backend.adapter),
    ignoreFocusOut: true,
  })
  if (endpoint === undefined) {
    return
  }

  const model = await pickModel(backend, endpoint, settings)
  if (model === undefined) {
    return
  }

  const answers: ConfigureAnswers = { provider: backend.id, endpoint, model }

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
  backend: Backend,
  endpoint: string,
  settings: Settings,
): Promise<string | undefined> {
  const providerId: ProviderId = backend.adapter
  const log = getLog()
  const current = settings.model
  let models: { id: string; label: string; detail?: string }[] = []
  let unauthorized = false

  try {
    const token = await readToken(providerId, endpoint)
    // The wizard must speak the same authentication the generation will.
    const provider = createProvider(providerId, {
      ...wizardProviderContext({
        endpoint,
        ...(backend.presetId ? { presetId: backend.presetId } : {}),
        ...(token ? { token } : {}),
        authHeader: settings.authHeader,
        authScheme: settings.authScheme,
        headers: settings.headers,
      }),
      fetch: globalThis.fetch as FetchLike,
    })
    // `fetch` has no timeout of its own; an endpoint that accepts the connection and never answers
    // used to hang the wizard with no way out.
    const outcome = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Reading the model list…',
        cancellable: true,
      },
      (_progress, token) =>
        withAbort({ token, timeoutMs: settings.timeoutMs }, signal => provider.listModels(signal)),
    )
    if (!outcome.ok) {
      log.info(`model listing ${outcome.reason}`)
      return undefined
    }
    models = outcome.value
  } catch (error) {
    unauthorized = error instanceof ProviderError && error.code === 'unauthorized'
    log.warn(`could not list models at ${endpoint}: ${String(error)}`)
  }

  if (unauthorized) {
    // Falling through to "type the model name" would hide the actual cause.
    const choice = await vscode.window.showErrorMessage(
      `${endpoint} rejected the credential. A gateway or a hosted endpoint usually needs a token.`,
      'Set token…',
    )
    if (choice === 'Set token…') {
      await setToken(providerId, endpoint)
    }
    return undefined
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
