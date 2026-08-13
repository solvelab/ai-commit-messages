import * as vscode from 'vscode'

import { currentSettings } from '../config.js'
import { hostOf } from '../endpoint.js'
import { getLog } from '../log.js'
import { knownModels } from '../models/catalog.js'
import {
  cacheKey,
  describeSource,
  resolveModels,
  type CachedModels,
} from '../models/source.js'
import { withAbort } from '../net.js'
import { createProvider } from '../providers/registry.js'
import type { FetchLike, ModelInfo } from '../providers/types.js'
import { readToken } from './secrets.js'
import { reportWriteFailure, writeSetting } from './writeSetting.js'

const TYPE_MANUALLY = '$(edit) Type the model name…'
const REFRESH = '$(refresh) Reload from the server'

let storage: vscode.Memento | undefined

export function initModelCache(context: vscode.ExtensionContext): void {
  storage = context.globalState
}

/**
 * Picks a model from a list that matches the configured backend.
 *
 * A dropdown inside the settings page is impossible — a setting's `enum` is static in the manifest
 * and there is no API for an extension to populate one at runtime. A picker is the honest
 * equivalent, and it only feels like one if it opens instantly, hence the cache.
 */
export async function selectModel(): Promise<void> {
  const log = getLog()
  const { settings } = currentSettings()
  const key = cacheKey(settings.backend.id, hostOf(settings.endpoint))

  const fromServer = await loadFromServer(settings, log)
  if (fromServer) {
    await storage?.update(key, { models: fromServer, loadedAt: Date.now() } satisfies CachedModels)
  }

  const resolved = resolveModels({
    ...(fromServer ? { fromServer } : {}),
    cached: storage?.get<CachedModels>(key),
    builtin: knownModels(settings.backend.id),
  })
  const note = describeSource(resolved, Date.now())

  const items: (vscode.QuickPickItem & { id: string })[] = resolved.models.map(model => ({
    label: model.label,
    ...(model.detail ? { detail: model.detail } : {}),
    ...(model.id === settings.model ? { description: '$(check) current' } : {}),
    id: model.id,
  }))
  items.push({ label: TYPE_MANUALLY, id: TYPE_MANUALLY })
  if (!fromServer) {
    // Only worth offering when the list on screen is not already fresh.
    items.push({ label: REFRESH, id: REFRESH })
  }

  const choice = await vscode.window.showQuickPick(items, {
    title: `Model for ${settings.backend.label}`,
    placeHolder: note ?? `${resolved.models.length} model(s) on ${hostOf(settings.endpoint)}`,
  })
  if (!choice) {
    return
  }

  if (choice.id === REFRESH) {
    await storage?.update(key, undefined)
    return selectModel()
  }

  const model =
    choice.id === TYPE_MANUALLY
      ? await vscode.window.showInputBox({
          title: `Model for ${settings.backend.label}`,
          value: settings.model,
          ignoreFocusOut: true,
        })
      : choice.id
  if (!model?.trim()) {
    return
  }

  // Read back before announcing anything: this command used to report a model it had not managed
  // to set, because another scope was winning.
  const written = await writeSetting('model', model.trim())
  if (!written.ok) {
    await reportWriteFailure('model', model.trim(), written)
    return
  }
  log.info(`model set to ${written.effective} (${settings.backend.label})`)
  void vscode.window.showInformationMessage(`Model set to ${written.effective}.`)
}

/** Reads the list from the server, returning `undefined` on any failure — the cache covers it. */
async function loadFromServer(
  settings: ReturnType<typeof currentSettings>['settings'],
  log: ReturnType<typeof getLog>,
): Promise<ModelInfo[] | undefined> {
  try {
    const token = await readToken(settings.provider, settings.endpoint)
    const provider = createProvider(settings.provider, {
      endpoint: settings.endpoint,
      fetch: globalThis.fetch as FetchLike,
      ...(settings.backend.presetId ? { presetId: settings.backend.presetId } : {}),
      ...(token ? { token } : {}),
      headers: settings.headers,
      auth: { header: settings.authHeader, scheme: settings.authScheme },
    })
    const outcome = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: `Reading models from ${settings.backend.label}…`,
      },
      () => withAbort({ timeoutMs: settings.timeoutMs }, signal => provider.listModels(signal)),
    )
    return outcome.ok ? outcome.value : undefined
  } catch (error) {
    // Never fatal: a stale list beats no list, and the picker says which one it is showing.
    log.info(`model list unavailable, falling back: ${String(error)}`)
    return undefined
  }
}

/** Warms the cache for a backend, so the picker opens instantly afterwards. */
export async function warmModelCache(
  settings: ReturnType<typeof currentSettings>['settings'],
  models: readonly ModelInfo[],
): Promise<void> {
  if (models.length === 0) {
    return
  }
  const key = cacheKey(settings.backend.id, hostOf(settings.endpoint))
  await storage?.update(key, { models, loadedAt: Date.now() } satisfies CachedModels)
}

/** Models the cache holds for a backend, for deciding whether a configured model belongs to it. */
export function cachedModelIds(backendId: string, host: string): readonly string[] {
  return storage?.get<CachedModels>(cacheKey(backendId, host))?.models.map(m => m.id) ?? []
}
