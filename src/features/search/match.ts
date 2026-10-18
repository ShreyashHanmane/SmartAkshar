import type { SearchItem } from '../../data/search';

export type { SearchItem } from '../../data/search';

/** Lowercases and strips diacritics so "Écrit" matches "ecrit". Keeps all scripts intact. */
export function normalize(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

/**
 * Returns items whose title or detail contains every word of the query,
 * ranked: title starts with query > title contains > detail-only match.
 */
export function searchItems(items: SearchItem[], query: string, limit = 20): SearchItem[] {
  const q = normalize(query.trim());
  if (!q) return [];
  const words = q.split(/\s+/);
  const scored: { item: SearchItem; score: number }[] = [];
  for (const item of items) {
    const title = normalize(item.title);
    const all = `${title} ${normalize(item.detail ?? '')}`;
    if (!words.every((w) => all.includes(w))) continue;
    const score = title.startsWith(q) ? 0 : words.every((w) => title.includes(w)) ? 1 : 2;
    scored.push({ item, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.item.title.localeCompare(b.item.title))
    .slice(0, limit)
    .map((s) => s.item);
}
