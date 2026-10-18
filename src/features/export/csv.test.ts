import { describe, expect, it } from 'vitest';
import { cardsCsv, csvCell, toCsv } from './csv';

describe('csv', () => {
  it('neutralises formula injection', () => {
    for (const bad of ['=HYPERLINK("http://evil")', '+1', '-2+3', '@SUM(A1)', '\t=1', '\r=1'])
      expect(csvCell(bad).startsWith(`"'`)).toBe(true);
    expect(csvCell('F = ma')).toBe('"F = ma"');
    expect(csvCell(-5)).toBe(`"'-5"`);
  });

  it('quotes commas, quotes and new lines', () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell(null)).toBe('""');
  });

  it('writes a header, CRLF rows and a BOM', () => {
    expect(toCsv(['a', 'b'], [['1', '2']])).toBe('\uFEFF"a","b"\r\n"1","2"\r\n');
  });

  it('exports cards with deck, box and due date', () => {
    const csv = cardsCsv('Physics', [{ front: 'F?', back: '=ma', box: 2, due: Date.UTC(2026, 9, 20) }]);
    expect(csv).toContain(`"F?","'=ma","Physics","2","2026-10-20"`);
  });
});
