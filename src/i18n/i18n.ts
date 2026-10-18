import en from './locales/en.json';

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
export type Vars = Record<string, string | number>;

const LOCALES = { en } satisfies Record<string, Messages>;
export type Locale = keyof typeof LOCALES;
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * Builds a translator. Missing keys fall back to the fallback catalog (English),
 * so a partially translated language never shows raw keys. `{name}` placeholders
 * are filled from `vars`; output is plain text (render it as text, never as HTML).
 */
export function createTranslator(messages: Partial<Messages>, fallback: Messages = en) {
  return (key: MessageKey, vars?: Vars): string => {
    const template = messages[key] ?? fallback[key];
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in vars ? String(vars[name]) : match,
    );
  };
}

export function getTranslator(locale: Locale = DEFAULT_LOCALE) {
  return createTranslator(LOCALES[locale]);
}

export const t = getTranslator();

export function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(en, key);
}

/** Translates a key that arrives as a plain string (e.g. a zod message). */
export function tDynamic(key: string | undefined): string | undefined {
  if (key === undefined) return undefined;
  return isMessageKey(key) ? t(key) : t('auth.error.generic');
}
