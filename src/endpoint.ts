/**
 * Endpoint identity, shared by everything that needs to name a host.
 *
 * Pure on purpose: the credential store keys on it and the diagnosis reports it, and neither
 * decision should require an editor to test.
 */

/** Host (including port) of an endpoint, or a stable placeholder when it cannot be parsed. */
export function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host || 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Hostname without the port, used by the proxy rules that match by suffix. */
export function hostnameOf(endpoint: string): string | undefined {
  try {
    return new URL(endpoint).hostname || undefined
  } catch {
    return undefined
  }
}
