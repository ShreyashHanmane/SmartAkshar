import { describe, expect, it } from 'vitest';
import { createTranslator, t } from './i18n';
import en from './locales/en.json';

describe('i18n', () => {
  it('returns English strings', () => {
    expect(t('app.tagline')).toBe('Smart Study Space');
  });

  it('falls back to English for keys missing in another language', () => {
    const hi = createTranslator({ 'app.tagline': 'स्मार्ट स्टडी स्पेस' });
    expect(hi('app.tagline')).toBe('स्मार्ट स्टडी स्पेस');
    expect(hi('error.reload')).toBe(en['error.reload']);
  });

  it('fills placeholders and leaves unknown ones intact', () => {
    const tr = createTranslator({ 'app.name': 'Hi {name}, {missing}' });
    expect(tr('app.name', { name: 'Asha' })).toBe('Hi Asha, {missing}');
  });

  it('has no empty English strings', () => {
    for (const value of Object.values(en)) expect(value.trim()).not.toBe('');
  });
});
