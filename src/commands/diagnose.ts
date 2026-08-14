import * as vscode from 'vscode'

import { currentSettings } from '../config.js'
import { describeOrigin } from '../configScope.js'
import { CONFIG_SECTION } from '../meta.js'
import { SETTING_KEYS } from '../settings.js'
import { buildReport, formatReport, type DiagnosticFacts } from '../diagnostics.js'
import { getLog } from '../log.js'
import { createProvider } from '../providers/registry.js'
import { ProviderError, type FetchLike } from '../providers/types.js'
import { readToken } from './secrets.js'

/** Gathers the facts and prints the diagnosis. Changes nothing. */
export async function diagnose(): Promise<void> {
  const log = getLog()
  const { settings } = currentSettings()
  const http = vscode.workspace.getConfiguration('http')
  const credential = await readToken(settings.provider, settings.endpoint)

  const started = Date.now()
  let reach: DiagnosticFacts['reach']

  try {
    const provider = createProvider(settings.provider, {
      endpoint: settings.endpoint,
      fetch: globalThis.fetch as FetchLike,
      headers: settings.headers,
      presetId: settings.compatPreset,
      ...(credential ? { token: credential } : {}),
      auth: { header: settings.authHeader, scheme: settings.authScheme },
    })
    const models = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'AI Commit Messages: diagnosing…' },
      () => provider.listModels(),
    )
    reach = { ok: true, ms: Date.now() - started, models: models.map(m => m.id) }
  } catch (error) {
    reach = {
      ok: false,
      ms: Date.now() - started,
      ...(error instanceof ProviderError ? { code: error.code } : {}),
      // `err.cause` is where undici keeps the real reason; the message alone says "fetch failed".
      message: describeCause(error),
    }
  }

  const report = buildReport({
    provider: settings.provider,
    endpoint: settings.endpoint,
    model: settings.model,
    compatPreset: settings.compatPreset,
    // Presence only. The value never enters the report.
    hasCredential: Boolean(credential),
    authHeader: settings.authHeader,
    reach,
    ...(vscode.env.remoteName ? { remoteName: vscode.env.remoteName } : {}),
    ...(http.get<string>('proxySupport') ? { proxySupport: http.get<string>('proxySupport')! } : {}),
    ...(http.get<string[]>('noProxy') ? { noProxy: http.get<string[]>('noProxy')! } : {}),
    ...(typeof http.get<boolean>('useLocalProxyConfiguration') === 'boolean'
      ? { useLocalProxyConfiguration: http.get<boolean>('useLocalProxyConfiguration')! }
      : {}),
    ...(http.get<string>('proxy') ? { httpProxy: http.get<string>('proxy')! } : {}),
  })

  log.info(`\n${formatReport(report)}\n\n${settingsOrigins()}`)
  log.show(true)

  const hasProblem = report.lines.some(line => line.severity !== 'ok')
  if (hasProblem) {
    void vscode.window
      .showWarningMessage(report.summary, 'Configure…')
      .then(choice => {
        if (choice === 'Configure…') {
          void vscode.commands.executeCommand('aiCommitMessages.configure')
        }
      })
  } else {
    void vscode.window.showInformationMessage(report.summary)
  }
}

function describeCause(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: { code?: string; message?: string } }).cause
    if (cause?.code) {
      return `${error.message} (${cause.code})`
    }
    return error.message
  }
  return String(error)
}

/**
 * Where each setting's value comes from.
 *
 * Two files can hold the same key — the local and the remote user settings — and the settings editor
 * shows one of them per tab. Printing the value in effect next to the scope that defines it is the
 * only way to answer "what is actually loaded" without guessing.
 */
function settingsOrigins(): string {
  const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION)
  const lines = SETTING_KEYS.map(key => {
    const inspected = configuration.inspect(key)
    const value = configuration.get(key)
    return `  ${key}: ${format(value)}  [${describeOrigin(inspected)}]`
  })
  return ['Settings in effect', ...lines].join('\n')
}

function format(value: unknown): string {
  if (typeof value === 'string') {
    return value || '(empty)'
  }
  return JSON.stringify(value)
}
