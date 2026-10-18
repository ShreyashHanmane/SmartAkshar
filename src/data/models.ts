import { z } from 'zod';

/**
 * Shapes of the user's Firestore documents. Every read is parsed with these
 * schemas: stored data is treated as untrusted and invalid fields fall back to
 * safe defaults instead of crashing the UI. Matching validation lives in
 * firestore.rules.
 */

export const SUBJECT_COLORS = ['blue', 'purple', 'teal', 'orange', 'green', 'rose'] as const;
export type SubjectColor = (typeof SUBJECT_COLORS)[number];

export const LIMITS = {
  subjectName: 40,
  title: 120,
} as const;

export const settingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'paper']).catch('light'),
  textSize: z.enum(['sm', 'md', 'lg']).catch('md'),
  locale: z.enum(['en']).catch('en'),
  toolbarSide: z.enum(['left', 'right']).catch('left'),
});
export type Settings = z.infer<typeof settingsSchema>;
export const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  textSize: 'md',
  locale: 'en',
  toolbarSide: 'left',
};

export const subjectSchema = z.object({
  name: z.string().min(1).max(LIMITS.subjectName),
  color: z.enum(SUBJECT_COLORS).catch('blue'),
});
export type SubjectData = z.infer<typeof subjectSchema>;
export interface Subject extends SubjectData {
  id: string;
}

/** Parses a document; returns null if it is unusable. */
export function parseDoc<T>(schema: z.ZodType<T>, id: string, data: unknown): (T & { id: string }) | null {
  const result = schema.safeParse(data);
  return result.success ? { ...result.data, id } : null;
}
