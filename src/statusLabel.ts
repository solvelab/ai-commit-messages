/**
 * What the status bar says about the configuration in effect.
 *
 * Nothing on screen told anyone which endpoint and which model were being used. The endpoint is
 * machine-scoped and disappears from the User tab; the model is a text box that another scope can
 * shadow; and a settings description is static text, so the page itself cannot show an effective
 * value. The status bar is the one place that can.
 *
 * Pure: the text is a function of the configuration, so it is testable without an editor.
 */

export interface StatusInput {
  readonly model: string
  readonly host: string
  readonly backendLabel: string
  /** Whether a credential is stored for this host. Never the credential itself. */
  readonly hasKey: boolean
  /** Whether the backend needs one at all. */
  readonly requiresKey: boolean
  readonly endpoint: string
}

export interface StatusLabel {
  readonly text: string
  readonly tooltip: string
  /** Set when something is missing and the click should lead somewhere useful. */
  readonly warning?: string
}

export function statusLabel(input: StatusInput): StatusLabel {
  const model = input.model.trim()
  const host = input.host.trim()

  if (!model || !host) {
    const missing = !model && !host ? 'not configured' : !model ? 'no model' : 'no endpoint'
    return {
      text: `$(git-commit) AI commit: ${missing}`,
      tooltip: 'AI Commit Messages is not configured yet.\nClick to set backend, endpoint and model.',
      warning: missing,
    }
  }

  const keyMissing = input.requiresKey && !input.hasKey
  const lines = [
    `Backend: ${input.backendLabel}`,
    `Endpoint: ${input.endpoint}`,
    `Model: ${model}`,
    `API key: ${describeKey(input)}`,
    '',
    'Click to configure.',
  ]

  return {
    text: `$(git-commit) ${model} @ ${host}${keyMissing ? ' $(warning)' : ''}`,
    tooltip: lines.join('\n'),
    ...(keyMissing ? { warning: 'no API key' } : {}),
  }
}

/** Says whether a credential exists, never anything about its value. */
function describeKey(input: StatusInput): string {
  if (!input.requiresKey) {
    return input.hasKey ? 'stored (not required by this backend)' : 'not needed'
  }
  return input.hasKey ? 'stored for this host' : 'missing — this backend needs one'
}

/**
 * What the status bar says while a message is being generated.
 *
 * `sync~spin` is a theme icon with the spin modifier, which the status bar renders animated. The
 * first request to a cold model can pass 30 s, and a button that looks identical before and after
 * the click reads as a click that did not register.
 */
export function busyLabel(model: string): string {
  const name = model.trim()
  return name ? `$(sync~spin) Generating with ${name}…` : '$(sync~spin) Generating…'
}

