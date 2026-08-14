import * as vscode from 'vscode'

import { clearToken, readToken, setTokenValue } from '../commands/secrets.js'
import { warmModelCache } from '../commands/selectModel.js'
import { reportWriteFailure, writeSetting } from '../commands/writeSetting.js'
import { currentSettings } from '../config.js'
import { hostOf } from '../endpoint.js'
import { getLog } from '../log.js'
import { knownModels } from '../models/catalog.js'
import { withAbort } from '../net.js'
import { BACKENDS } from '../providers/catalog.js'
import { createProvider } from '../providers/registry.js'
import { normalizeBaseUrl, type ProviderId } from '../settings.js'
import type { FetchLike, ModelInfo } from '../providers/types.js'
import { formFields, modelReadPlan } from './formModel.js'
import { panelHtml } from './panelHtml.js'

/**
 * The configuration panel.
 *
 * The settings page cannot hide a field that does not apply — there is no `when` in a setting's
 * schema — so choosing OpenAI leaves an endpoint box pointing at someone's Ollama and a model name
 * that backend never heard of. A panel can. It is also the only place a model list read from the
 * server can be a real dropdown.
 *
 * The credential crosses this boundary in one direction only: typed in the panel, stored in
 * `SecretStorage`, and never sent back — the panel is told whether one exists, nothing more.
 */

let panel: vscode.WebviewPanel | undefined

export function openSettingsPanel(context: vscode.ExtensionContext): void {
  if (panel) {
    panel.reveal()
    return
  }

  panel = vscode.window.createWebviewPanel(
    'aiCommitMessages.settings',
    'AI Commit Messages',
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  )

  const current = panel
  current.webview.html = panelHtml(current.webview.cspSource, BACKENDS)

  current.onDidDispose(
    () => {
      panel = undefined
    },
    undefined,
    context.subscriptions,
  )

  current.webview.onDidReceiveMessage(
    (message: IncomingMessage) => void handle(message, current),
    undefined,
    context.subscriptions,
  )

  // Configuration edited elsewhere must not leave the panel showing a stale form.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('aiCommitMessages') && panel === current) {
        void post(current)
      }
    }),
  )

  void post(current)
}

type IncomingMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'backendChanged'; readonly backendId: string }
  | { readonly type: 'loadModels'; readonly backendId: string; readonly endpoint: string }
  | { readonly type: 'test'; readonly backendId: string; readonly endpoint: string }
  | {
      readonly type: 'setKey'
      readonly key: string
      readonly backendId: string
      readonly endpoint: string
    }
  | { readonly type: 'clearKey'; readonly backendId: string; readonly endpoint: string }
  | {
      readonly type: 'save'
      readonly backendId: string
      readonly endpoint: string
      readonly model: string
    }

async function handle(message: IncomingMessage, target: vscode.WebviewPanel): Promise<void> {
  const log = getLog()

  switch (message.type) {
    case 'ready':
      return post(target)

    case 'backendChanged':
      return post(target, message.backendId)

    case 'loadModels':
      return sendModels(target, message.backendId, message.endpoint)

    case 'test': {
      const outcome = await listModels(message.backendId, message.endpoint)
      return void target.webview.postMessage({
        type: 'testResult',
        ok: outcome.source === 'server',
        detail:
          outcome.source === 'server'
            ? `${outcome.list.length} model(s) answered from ${hostOf(message.endpoint)}`
            : (outcome.error ?? 'the server did not answer'),
      })
    }

    // Against the backend and endpoint on the form, not the ones still saved: someone picking
    // OpenAI and pasting a key before saving would otherwise store it for the previous host.
    case 'setKey': {
      const { adapter, base } = credentialTarget(message.backendId, message.endpoint)
      await setTokenValue(adapter, base, message.key)
      await post(target, message.backendId, message.endpoint)
      // The key was the only thing missing, so the list is what the person wanted next.
      return sendModels(target, message.backendId, message.endpoint)
    }

    case 'clearKey': {
      const { adapter, base } = credentialTarget(message.backendId, message.endpoint)
      await clearToken(adapter, base)
      await post(target, message.backendId, message.endpoint)
      return sendModels(target, message.backendId, message.endpoint)
    }

    case 'save': {
      const writes: [string, string][] = [
        ['provider', message.backendId],
        ['endpoint', message.endpoint.trim()],
        ['model', message.model.trim()],
      ]
      for (const [key, value] of writes) {
        const written = await writeSetting(key, value)
        if (!written.ok) {
          await reportWriteFailure(key, value, written)
          return
        }
        log.info(`panel saved ${key} = ${written.effective}`)
      }
      void vscode.window.showInformationMessage('AI Commit Messages: configuration saved.')
      return post(target)
    }
  }
}

/** Sends the panel everything it may show. The credential is reported as a fact, never as a value. */
async function post(
  target: vscode.WebviewPanel,
  backendOverride?: string,
  endpointOverride?: string,
): Promise<void> {
  const { settings } = currentSettings()
  const backendId = backendOverride ?? settings.backend.id
  const fields = formFields(backendId)
  const unchanged = backendId === settings.backend.id

  // Changing the backend offers its address; keeping it keeps what is configured.
  const endpoint = endpointOverride ?? (unchanged ? settings.endpoint : fields.suggestedEndpoint)
  const { adapter, base } = credentialTarget(backendId, endpoint)

  await target.webview.postMessage({
    type: 'state',
    fields,
    endpoint,
    model: unchanged ? settings.model : '',
    // The credential is reported for the host on the form — the one it would actually be sent to.
    hasKey: Boolean(await readToken(adapter, base || endpoint)),
    host: hostOf(endpoint),
    knownModels: knownModels(backendId),
  })
}

/** The adapter and base URL a credential is bound to, for what the form currently says. */
function credentialTarget(backendId: string, endpoint: string): { adapter: ProviderId; base: string } {
  const backend = BACKENDS.find(b => b.id === backendId)
  const adapter = (backend?.adapter ?? 'ollama') as ProviderId
  return {
    adapter,
    base: normalizeBaseUrl(endpoint || backend?.defaultEndpoint || '', adapter) ?? endpoint,
  }
}

async function sendModels(
  target: vscode.WebviewPanel,
  backendId: string,
  endpoint: string,
): Promise<void> {
  const outcome = await listModels(backendId, endpoint)
  await target.webview.postMessage({
    type: 'models',
    models: outcome.list.map(m => ({ id: m.id, label: m.label })),
    source: outcome.source,
    ...(outcome.error ? { error: outcome.error } : {}),
  })
}

interface ModelOutcome {
  readonly list: readonly ModelInfo[]
  readonly source: 'server' | 'builtin'
  readonly error?: string
}

/** Reads the list from the server, falling back to what the catalogue knows. */
async function listModels(backendId: string, endpoint: string): Promise<ModelOutcome> {
  const { settings } = currentSettings()
  const backend = BACKENDS.find(b => b.id === backendId)
  const adapter = (backend?.adapter ?? 'ollama') as ProviderId
  // An unusable address is the answer, not a crash: the panel says so and keeps the form editable.
  const base = normalizeBaseUrl(endpoint || backend?.defaultEndpoint || '', adapter)
  if (!base) {
    return { list: builtin(backendId), source: 'builtin', error: 'no endpoint to read from' }
  }

  const token = await readToken(adapter, base)
  const plan = modelReadPlan({ backendId, hasKey: Boolean(token) })
  if (!plan.ask) {
    return { list: builtin(backendId), source: 'builtin', ...(plan.reason ? { error: plan.reason } : {}) }
  }

  try {
    const provider = createProvider(adapter, {
      endpoint: base,
      fetch: globalThis.fetch as FetchLike,
      ...(backend?.presetId ? { presetId: backend.presetId } : {}),
      ...(token ? { token } : {}),
      headers: settings.headers,
      auth: { header: settings.authHeader, scheme: settings.authScheme },
    })
    const outcome = await withAbort({ timeoutMs: settings.timeoutMs }, signal =>
      provider.listModels(signal),
    )
    if (outcome.ok) {
      await warmModelCache({ ...settings, backend: backend ?? settings.backend, endpoint: base }, outcome.value)
      return { list: outcome.value, source: 'server' }
    }
    return { list: builtin(backendId), source: 'builtin', error: `the request ${outcome.reason}` }
  } catch (error) {
    getLog().info(`panel could not list models: ${String(error)}`)
    return { list: builtin(backendId), source: 'builtin', error: describe(error) }
  }
}

function builtin(backendId: string): readonly ModelInfo[] {
  return knownModels(backendId).map(id => ({ id, label: id }))
}

/** `err.cause` carries the real reason; the message alone only ever says "fetch failed". */
function describe(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: { code?: string } }).cause
    return cause?.code ? `${error.message} (${cause.code})` : error.message
  }
  return String(error)
}
