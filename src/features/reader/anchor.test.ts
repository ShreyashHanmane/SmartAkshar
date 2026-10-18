import { describe, expect, it } from 'vitest';
import { findQuote, makeQuote } from './anchor';

const text =
  'The acceleration of an object is inversely proportional to its mass. Mass and acceleration are linked.';

describe('quote anchors', () => {
  it('round-trips a selection', () => {
    const start = text.indexOf('inversely');
    const end = text.indexOf(' to its mass') + ' to its mass'.length;
    const q = makeQuote(text, start, end);
    expect(q.exact).toBe('inversely proportional to its mass');
    expect(findQuote(text, q)).toBe(start);
  });

  it('uses context to pick the right repeat', () => {
    const second = text.lastIndexOf('acceleration');
    const q = makeQuote(text, second, second + 'acceleration'.length);
    expect(findQuote(text, q)).toBe(second);
    const first = text.indexOf('acceleration');
    expect(findQuote(text, makeQuote(text, first, first + 12))).toBe(first);
  });

  it('still finds text when the surroundings changed slightly', () => {
    const q = makeQuote(text, text.indexOf('its mass'), text.indexOf('its mass') + 8);
    expect(findQuote(`Edited intro. ${text}`, q)).toBe(`Edited intro. ${text}`.indexOf('its mass'));
  });

  it('returns -1 when the text is gone', () => {
    expect(findQuote(text, { exact: 'quantum', prefix: '', suffix: '' })).toBe(-1);
    expect(findQuote(text, { exact: '', prefix: '', suffix: '' })).toBe(-1);
  });
});
