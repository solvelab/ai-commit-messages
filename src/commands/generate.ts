import * as vscode from 'vscode'

import { currentSettings } from '../config.js'
import { runExclusive } from './inflight.js'
import { collectChanges } from '../git/collect.js'
import { getGitApi } from '../git/api.js'
import { createCollectHost } from '../git/collectHost.js'
import { createResolverHost } from '../git/host.js'
import { resolveRepository } from '../git/resolve.js'
import { endpointTrust } from '../endpointTrust.js'
import { getLog } from '../log.js'
import { markBusy } from '../statusBar.js'
import { CONFIG_SECTION } from '../meta.js'
import { withAbort } from '../net.js'
import { readToken } from './secrets.js'
import { createProvider } from '../providers/registry.js'
import { ProviderError, type FetchLike } from '../providers/types.js'
import { generateMessage, PipelineError } from '../prompt/pipeline.js'
import { languageName } from '../prompt/languages.js'
import { sanitize } from '../prompt/sanitize.js'
import { packWithinBudget } from '../budget/pack.js'
import { redactFiles } from '../redact.js'
import { diffBudgetChars, usableContextTokens, type Settings } from '../settings.js'
import type { Repository } from '../types/git.js'

const CONFIRMED_ENDPOINTS_KEY = 'confirmedEndpoints'
/** Read by the `when` clause that swaps the toolbar button for a spinning one. */
const GENERATING_CONTEXT = 'aiCommitMessages.generating'

/** Cancels the generation in flight, for the toolbar button that replaces the original one. */
let cancelInFlight: (() => void) | undefined

export function cancelGeneration(): void {
  cancelInFlight?.()
}

let workspaceMemory: vscode.Memento | undefined

/** Confirmations are per workspace, so they live in workspace state. */
export function initEndpointConfirmations(context: vscode.ExtensionContext): void {
  workspaceMemory = context.workspaceState
}

export async function generateCommitMessage(arg?: unknown): Promise<void> {
  const log = getLog()

  const git = await getGitApi()
  if (!git) {
    void vscode.window.showErrorMessage(
      'The built-in Git extension is unavailable, so no repository can be read.',
    )
    return
  }

  const { repository, source } = await resolveRepository(arg, createResolverHost(git))
  if (!repository) {
    log.warn('no repository resolved')
    void vscode.window.showErrorMessage('No git repository to generate a commit message for.')
    return
  }
  log.info(`repository resolved from ${source}: ${repository.rootUri.fsPath}`)

  const { settings, problems } = currentSettings(repository.rootUri)
  for (const problem of problems) {
    log.warn(`configuration: ${problem.message}`)
  }

  // Nothing leaves the machine before this: the endpoint is a plain setting now, so a repository can
  // carry one, and a repository's choice of where to send your staged diff is worth one question.
  if (!(await confirmEndpoint(settings.endpoint, repository.rootUri))) {
    log.warn(`generation cancelled: endpoint ${settings.endpoint} not confirmed`)
    return
  }

  // Three surfaces can fire this command; two at once against the same repository produced two
  // progress notifications and a race for the commit box.
  const outcome = await runExclusive(repository.rootUri.toString(), () =>
    generateForRepository(repository, settings),
  )
  if (!outcome.started) {
    void vscode.window.showInformationMessage(
      'A commit message is already being generated for this repository.',
    )
  }
}

async function generateForRepository(
  repository: Repository,
  settings: Settings,
): Promise<void> {
  const log = getLog()

  // Three indicators, because no single one does the job: `SourceControl` marks the view where the
  // button was clicked but cannot be cancelled, the status bar spins with a theme icon, and only
  // `Notification` carries a cancel button (`vscode.d.ts:13014-13057`).
  const restoreStatus = markBusy(settings.model)
  const done = withSourceControlProgress()
  // Swaps the toolbar button for the spinning one: the click happened there, so that is where the
  // answer belongs.
  await vscode.commands.executeCommand('setContext', GENERATING_CONTEXT, true)

  try {
    await runGeneration(repository, settings, log)
  } finally {
    await vscode.commands.executeCommand('setContext', GENERATING_CONTEXT, false)
    cancelInFlight = undefined
    done()
    restoreStatus()
  }
}

/**
 * Puts the spinner on the Source Control view for as long as the returned call is not made.
 *
 * `withProgress` owns a promise, so the promise is one this function resolves by hand — the work
 * itself runs under the cancellable notification.
 */
function withSourceControlProgress(): () => void {
  let finish = (): void => undefined
  void vscode.window.withProgress(
    { location: vscode.ProgressLocation.SourceControl, title: 'Generating commit message…' },
    () => new Promise<void>(resolve => {
      finish = resolve
    }),
  )
  return () => finish()
}

async function runGeneration(
  repository: Repository,
  settings: Settings,
  log: ReturnType<typeof getLog>,
): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'AI Commit Messages: generating…',
      cancellable: true,
    },
    async (progress, token) => {
      // One source of cancellation for both surfaces: the notification's button and the spinning
      // toolbar button cancel the same token.
      const cancellation = new vscode.CancellationTokenSource()
      token.onCancellationRequested(() => cancellation.cancel())
      cancelInFlight = () => cancellation.cancel()

      await repository.status()
      const changes = await collectChanges(createCollectHost(repository))

      for (const skipped of changes.skipped) {
        log.debug(`skipped ${skipped.path}: ${skipped.reason}`)
      }

      if (changes.files.length === 0) {
        void vscode.window.showErrorMessage(
          'Nothing to describe: no staged or unstaged changes in this repository.',
        )
        return
      }
      if (changes.source === 'worktree') {
        void vscode.window.showWarningMessage(
          'Nothing is staged, so the working tree changes were used instead.',
        )
      }

      // `globalThis.fetch` is the one the extension host patched for proxy and certificates.
      // Deliberate: fighting that patch is how LAN calls break in corporate setups.
      // Optional everywhere: no token means the request goes out exactly as before, which is the
      // common local case. A token appears when a gateway sits in front of the server.
      const credential = await readToken(settings.provider, settings.endpoint)
      let provider
      try {
        provider = createProvider(settings.provider, {
          endpoint: settings.endpoint,
          fetch: globalThis.fetch as FetchLike,
          headers: settings.headers,
          presetId: settings.compatPreset,
          ...(credential ? { token: credential } : {}),
          auth: { header: settings.authHeader, scheme: settings.authScheme },
        })
      } catch (error) {
        reportFailure(error, settings)
        return
      }

      const abort = { token: cancellation.token, timeoutMs: settings.timeoutMs }
      const outcome = await withAbort(abort, async signal => {
        progress.report({ message: 'reading the model' })
        // Capabilities decide the budget and whether the reasoning trace must be suppressed.
        // A failure here is not fatal: generation still works with the fallback budget.
        let reportedContext: number | undefined
        let thinking = false
        try {
          const capabilities = await provider.describeModel(settings.model, signal)
          reportedContext = capabilities.contextLength
          thinking = capabilities.thinking
        } catch (error) {
          log.warn(`could not describe ${settings.model}: ${String(error)}`)
        }

        // One number governs both the budget and the request. Two numbers is how the prompt gets
        // built larger than the window asked for, and the model truncates without saying so.
        const contextTokens = usableContextTokens(reportedContext)
        log.info(
          `model ${settings.model}: reported=${reportedContext ?? 'unknown'} ` +
            `usable=${contextTokens ?? 'unknown'} thinking=${thinking} ` +
            `maxOutputTokens=${settings.maxOutputTokens}`,
        )

        const budget = diffBudgetChars({
          ...(contextTokens ? { contextTokens } : {}),
          systemPromptChars: 1400,
          maxOutputTokens: settings.maxOutputTokens,
          fallbackChars: settings.maxDiffChars,
        })
        const { kept, omitted, excluded, invalidGlobs } = packWithinBudget(changes.files, budget, {
          excludeGlobs: settings.excludeGlobs,
        })
        for (const glob of invalidGlobs) {
          log.warn(`ignoring invalid exclude glob: ${glob}`)
        }
        if (excluded.length > 0) {
          log.info(`generated files reduced to a header: ${excluded.join(', ')}`)
        }
        if (omitted.length > 0) {
          log.info(`omitted from the prompt to fit ${budget} chars: ${omitted.join(', ')}`)
        }

        // Last thing before the diff leaves the machine. The values never reach the log.
        let prompted = kept
        if (settings.redactSecrets) {
          const redaction = redactFiles(kept)
          prompted = redaction.files
          if (redaction.total > 0) {
            for (const file of redaction.byFile) {
              log.warn(`redacted ${file.total} secret(s) in ${file.path}: ${file.kinds.join(', ')}`)
            }
            void vscode.window.showWarningMessage(
              `${redaction.total} secret value(s) were masked before sending the diff.`,
            )
          }
        }

        progress.report({ message: `${kept.length} file(s)` })
        return generateMessage(
          provider,
          prompted,
          {
            model: settings.model,
            maxBodyWords: settings.maxBodyWords,
            maxTokens: settings.maxOutputTokens,
            temperature: settings.temperature,
            systemTemplate: settings.promptTemplate,
            language: { tag: settings.language, name: languageName(settings.language) },
            repository: repository.rootUri.path.split('/').pop() ?? '',
            branch: repository.state.HEAD?.name ?? '',
            omitted,
            suppressThinking: thinking,
            sanitize,
            ...(contextTokens ? { contextTokens } : {}),
          },
          signal,
        )
      }).catch((error: unknown) => {
        reportFailure(error, settings)
        return undefined
      })

      if (!outcome) {
        return
      }
      if (!outcome.ok) {
        log.info(`generation ${outcome.reason}`)
        if (outcome.reason === 'timeout') {
          void vscode.window.showErrorMessage(
            `The model did not answer within ${Math.round(settings.timeoutMs / 1000)}s. A cold model can take longer to load.`,
          )
        }
        return
      }

      const { message, retried, degradedToText, droppedBodyEntries, finishReason } = outcome.value
      if (finishReason) {
        log.info(`the model stopped because: ${finishReason}`)
      }
      if (retried) {
        log.info('the first reply broke the format; a corrective retry was used')
      }
      if (degradedToText) {
        log.info('the model refused the schema; plain text was parsed instead')
      }
      for (const dropped of droppedBodyEntries) {
        log.info(`body entry dropped for exceeding the word budget: ${dropped}`)
      }

      repository.inputBox.value = message
      log.info('commit message written to the input box')
    },
  )
}

function reportFailure(error: unknown, settings: Settings): void {
  const log = getLog()
  log.error(error instanceof Error ? error : String(error))

  if (error instanceof ProviderError) {
    // `Configure…` comes first: with a remote session the endpoint setting is not in the User tab,
    // so pointing at plain settings is the least useful thing to offer.
    void vscode.window
      .showErrorMessage(
        providerMessage(error, settings),
        ...(error.code === 'unauthorized' ? ['Set API key…'] : []),
        'Configure…',
        'Show Log',
        'Open Settings',
      )
      .then(choice => {
        if (choice === 'Set API key…') {
          void vscode.commands.executeCommand('aiCommitMessages.setToken')
        } else if (choice === 'Configure…') {
          void vscode.commands.executeCommand('aiCommitMessages.configure')
        } else if (choice === 'Show Log') {
          log.show(true)
        } else if (choice === 'Open Settings') {
          void vscode.commands.executeCommand('workbench.action.openSettings', 'aiCommitMessages')
        }
      })
    return
  }

  if (error instanceof PipelineError) {
    log.error(`raw model reply: ${error.raw}`)
    void vscode.window.showErrorMessage(`${error.message} See the log for the raw reply.`, 'Show Log').then(choice => {
      if (choice === 'Show Log') {
        log.show(true)
      }
    })
    return
  }

  void vscode.window.showErrorMessage('Generating the commit message failed. See the log.', 'Show Log').then(choice => {
    if (choice === 'Show Log') {
      log.show(true)
    }
  })
}

function providerMessage(error: ProviderError, settings: Settings): string {
  switch (error.code) {
    case 'model-not-found':
      return `The model "${settings.model}" is not installed on ${settings.endpoint}.`
    case 'rate-limited':
      return `The backend is rate limiting: ${error.message}`
    case 'unsupported-parameter':
      return `The endpoint refused a request field: ${error.message} Try a different preset.`
    case 'unauthorized':
      return `${settings.endpoint} rejected the credential. A gateway in front of the server usually means a token is required.`
    case 'network':
      return error.message
    case 'malformed-response':
      return `${settings.endpoint} answered with something unexpected. ${error.message}`
    default:
      return `The model backend refused the request: ${error.message}`
  }
}

/** Asks once before a repository-provided endpoint receives the diff. See `endpointTrust`. */
async function confirmEndpoint(effective: string, scope: vscode.Uri): Promise<boolean> {
  const inspected = vscode.workspace.getConfiguration(CONFIG_SECTION, scope).inspect<string>('endpoint')
  const verdict = endpointTrust({
    effective,
    ...(inspected?.workspaceValue ? { workspaceValue: inspected.workspaceValue } : {}),
    ...(inspected?.workspaceFolderValue
      ? { workspaceFolderValue: inspected.workspaceFolderValue }
      : {}),
    ...(inspected?.globalValue ? { userValue: inspected.globalValue } : {}),
    confirmed: confirmedEndpoints(),
  })
  if (!verdict.needsConfirmation) {
    return true
  }

  const choice = await vscode.window.showWarningMessage(
    `This repository sets the model endpoint to ${verdict.endpoint}. Your staged diff would be sent there.`,
    { modal: true },
    'Send to this endpoint',
  )
  if (choice !== 'Send to this endpoint') {
    return false
  }

  await rememberEndpoint(verdict.endpoint ?? effective)
  return true
}

function confirmedEndpoints(): readonly string[] {
  return workspaceMemory?.get<string[]>(CONFIRMED_ENDPOINTS_KEY) ?? []
}

async function rememberEndpoint(endpoint: string): Promise<void> {
  await workspaceMemory?.update(CONFIRMED_ENDPOINTS_KEY, [...confirmedEndpoints(), endpoint])
}
