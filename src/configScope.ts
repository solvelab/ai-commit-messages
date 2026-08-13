/**
 * Choosing where a setting should be written.
 *
 * `insertDefaultPrompt` detected a custom value in the workspace and then wrote to the global
 * target, where the workspace value keeps winning. The command reported success and changed
 * nothing the user could see.
 *
 * Pure on purpose: mirrors `vscode.ConfigurationTarget` without importing it.
 */

export type ConfigScope = 'global' | 'workspace' | 'workspaceFolder'

export interface InspectedValue<T> {
  readonly globalValue?: T
  readonly workspaceValue?: T
  readonly workspaceFolderValue?: T
}

/** True when the user actually set the value somewhere, as opposed to inheriting the default. */
export function hasCustomValue<T>(inspected: InspectedValue<T> | undefined): boolean {
  return scopeOfCustomValue(inspected) !== undefined
}

/**
 * The narrowest scope carrying a value, which is also the one that wins at read time.
 *
 * Order matters: folder beats workspace beats global, so writing anywhere broader than where the
 * value lives is a write nobody will observe.
 */
export function scopeOfCustomValue<T>(
  inspected: InspectedValue<T> | undefined,
): ConfigScope | undefined {
  if (!inspected) {
    return undefined
  }
  if (isSet(inspected.workspaceFolderValue)) {
    return 'workspaceFolder'
  }
  if (isSet(inspected.workspaceValue)) {
    return 'workspace'
  }
  if (isSet(inspected.globalValue)) {
    return 'global'
  }
  return undefined
}

/** Where to write so the value takes effect: over the existing one, or globally when there is none. */
export function targetForWrite<T>(inspected: InspectedValue<T> | undefined): ConfigScope {
  return scopeOfCustomValue(inspected) ?? 'global'
}

function isSet(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false
  }
  return typeof value === 'string' ? value.trim().length > 0 : true
}
