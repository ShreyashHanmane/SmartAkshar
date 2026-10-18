/**
 * CSV for spreadsheets. Cells that a spreadsheet could run as a formula
 * (starting with = + - @, or a tab / carriage return) get a leading
 * apostrophe, so card text is always shown as text.
 */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  // BOM so Excel reads UTF-8; CRLF line ends per RFC 4180.
  return `\uFEFF${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export interface CsvCard {
  front: string;
  back: string;
  box: number;
  due: number;
}

export function cardsCsv(deck: string, cards: CsvCard[]): string {
  return toCsv(
    ['front', 'back', 'deck', 'box', 'due'],
    cards.map((c) => [c.front, c.back, deck, c.box, new Date(c.due).toISOString().slice(0, 10)]),
  );
}
