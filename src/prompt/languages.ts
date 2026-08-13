/** How each language tag is named to the model. Shared by the command path and the pipeline. */
const NAMES: Record<string, string> = {
  'pt-br': 'português brasileiro',
  pt: 'português',
  en: 'English',
  'en-us': 'English',
  'en-gb': 'English',
  es: 'español',
  fr: 'français',
  de: 'Deutsch',
  it: 'italiano',
}

export function languageName(tag: string): string {
  return NAMES[tag.trim().toLowerCase()] ?? tag
}
