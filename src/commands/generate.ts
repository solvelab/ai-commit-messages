import * as vscode from 'vscode'

import { currentSettings } from '../config.js'
import { collectChanges } from '../git/collect.js'
import { getGitApi } from '../git/api.js'
import { createCollectHost } from '../git/collectHost.js'
import { createResolverHost } from '../git/host.js'
import { resolveRepository } from '../git/resolve.js'
import { getLog } from '../log.js'
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

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'AI Commit Messages: generating…',
      cancellable: true,
    },
    async (progress, token) => {
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
      const credential = await readToken(settings.provider)
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

      const outcome = await withAbort({ token, timeoutMs: settings.timeoutMs }, async signal => {
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
            `usable=${contextTokens ?? 'unknown'} thinking=${thinking}`,
        )

        const budget = diffBudgetChars({
          ...(contextTokens ? { contextTokens } : {}),
          systemPromptChars: 1400,
          maxOutputTokens: 512,
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

      const { message, retried, degradedToText, droppedBodyEntries } = outcome.value
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
        ...(error.code === 'unauthorized' ? ['Set token…'] : []),
        'Configure…',
        'Show Log',
        'Open Settings',
      )
      .then(choice => {
        if (choice === 'Set token…') {
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
