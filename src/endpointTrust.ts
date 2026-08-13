/**
 * Whether the endpoint about to receive the staged diff was chosen by the repository.
 *
 * The endpoint used to be `machine`-scoped, which made it unwritable from `.vscode/settings.json` —
 * a cloned repository could not redirect the diff. It also made the field invisible on the User tab,
 * which is where people configure it, so the scope had to go.
 *
 * The guarantee does not go with it. Instead of forbidding the value, it is confirmed once: a
 * workspace-provided endpoint that differs from the user's own is announced before anything leaves
 * the machine.
 */

export interface TrustInput {
  /** Endpoint in effect, after all scopes resolved. */
  readonly effective: string
  /** Value from `.vscode/settings.json`, when the repository sets one. */
  readonly workspaceValue?: string
  readonly workspaceFolderValue?: string
  /** Value from the user's own settings. */
  readonly userValue?: string
  /** Endpoints already confirmed for this workspace. */
  readonly confirmed: readonly string[]
}

export interface TrustVerdict {
  readonly needsConfirmation: boolean
  /** The endpoint to confirm, when one has to be. */
  readonly endpoint?: string
}

export function endpointTrust(input: TrustInput): TrustVerdict {
  const fromRepository = input.workspaceFolderValue ?? input.workspaceValue
  if (!fromRepository?.trim()) {
    return { needsConfirmation: false }
  }

  // A repository that agrees with the user's own setting is not redirecting anything.
  if (normalize(fromRepository) === normalize(input.userValue ?? '')) {
    return { needsConfirmation: false }
  }

  // Confirmation is per endpoint, not per workspace: changing the value in the repository asks
  // again, which is the whole point.
  if (input.confirmed.some(entry => normalize(entry) === normalize(input.effective))) {
    return { needsConfirmation: false }
  }

  return { needsConfirmation: true, endpoint: input.effective }
}

function normalize(value: string): string {
  return value.trim().replace(/\/+$/, '').toLowerCase()
}
