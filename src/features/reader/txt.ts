/** Splits plain text into readable sections (about 40k characters, on paragraph breaks). */
export function splitText(text: string, target = 40_000): string[][] {
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const sections: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const p of paragraphs) {
    // Very long paragraphs are cut so a single section never grows unbounded.
    for (let i = 0; i < p.length; i += target) {
      const piece = p.slice(i, i + target);
      if (size + piece.length > target && current.length) {
        sections.push(current);
        current = [];
        size = 0;
      }
      current.push(piece);
      size += piece.length;
    }
  }
  if (current.length || sections.length === 0) sections.push(current);
  return sections;
}
