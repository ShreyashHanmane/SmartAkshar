import { z } from 'zod';

/**
 * Shapes shared by the browser and the local server. The server validates every
 * request body with these; the browser parses every response with them.
 */

export const LIMITS = { subjectName: 40, title: 120, bookTitle: 200, name: 60 } as const;
export const ID = /^[A-Za-z0-9_-]{1,40}$/;
export const idSchema = z.string().regex(ID);

// --- accounts -------------------------------------------------------------
export const PASSWORD_MIN = 8;
export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'auth.validation.usernameLength')
  .max(32, 'auth.validation.usernameLength')
  .regex(/^[A-Za-z0-9_.-]+$/, 'auth.validation.usernameChars');
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, 'auth.validation.passwordLength')
  .max(128, 'auth.validation.passwordLength')
  .regex(/[A-Za-z]/, 'auth.validation.passwordMix')
  .regex(/[0-9]/, 'auth.validation.passwordMix');
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'auth.validation.nameRequired')
  .max(LIMITS.name, 'auth.validation.nameLength');

export const signUpSchema = z.object({
  name: displayNameSchema,
  username: usernameSchema,
  password: passwordSchema,
});
export const loginSchema = z.object({
  username: z.string().trim().min(1, 'auth.validation.usernameRequired').max(32),
  password: z.string().min(1, 'auth.validation.passwordRequired').max(128),
});
export const userSchema = z.object({ id: idSchema, username: z.string(), displayName: z.string() });
export type User = z.infer<typeof userSchema>;

// --- settings --------------------------------------------------------------
export const settingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'paper']).catch('light'),
  textSize: z.enum(['sm', 'md', 'lg']).catch('md'),
  locale: z.enum(['en']).catch('en'),
  toolbarSide: z.enum(['left', 'right']).catch('left'),
  weeklyGoalHours: z.number().int().min(1).max(80).catch(10),
});
export type Settings = z.infer<typeof settingsSchema>;
export const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  textSize: 'md',
  locale: 'en',
  toolbarSide: 'left',
  weeklyGoalHours: 10,
};
/** PATCH body: strict (no unknown keys, no fallback values). */
export const settingsPatchSchema = z
  .object({
    theme: z.enum(['light', 'dark', 'paper']),
    textSize: z.enum(['sm', 'md', 'lg']),
    locale: z.enum(['en']),
    toolbarSide: z.enum(['left', 'right']),
    weeklyGoalHours: z.number().int().min(1).max(80),
  })
  .partial()
  .strict();

// --- subjects --------------------------------------------------------------
export const SUBJECT_COLORS = ['blue', 'purple', 'teal', 'orange', 'green', 'rose'] as const;
export type SubjectColor = (typeof SUBJECT_COLORS)[number];
export const subjectInputSchema = z
  .object({ name: z.string().trim().min(1).max(LIMITS.subjectName), color: z.enum(SUBJECT_COLORS) })
  .strict();
export const subjectSchema = z.object({
  id: idSchema,
  name: z.string(),
  color: z.enum(SUBJECT_COLORS).catch('blue'),
});
export type Subject = z.infer<typeof subjectSchema>;

// --- notebooks -------------------------------------------------------------
export const PAPER_STYLES = ['dots', 'grid', 'lines', 'blank'] as const;
export const PAPER_BACKGROUNDS = ['white', 'cream', 'sky', 'mint', 'slate'] as const;
export const notebookCreateSchema = z
  .object({ title: z.string().trim().min(1).max(LIMITS.title), subjectId: idSchema.nullable() })
  .strict();
export const notebookPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(LIMITS.title),
    subjectId: idSchema.nullable(),
    paper: z.enum(PAPER_STYLES),
    background: z.enum(PAPER_BACKGROUNDS),
  })
  .partial()
  .strict();
export const notebookSchema = z.object({
  id: idSchema,
  title: z.string(),
  subjectId: z.string().nullable(),
  mode: z.enum(['paged', 'infinite']).catch('paged'),
  paper: z.enum(PAPER_STYLES).catch('dots'),
  background: z.enum(PAPER_BACKGROUNDS).catch('white'),
  pageCount: z.number().int().min(1).catch(1),
  updatedAt: z.number().nullable(),
});
export type Notebook = z.infer<typeof notebookSchema>;

// --- whiteboard pages ------------------------------------------------------
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const coord = z.number().finite().min(-32767).max(32767);
const elementId = z.string().min(1).max(40);
export const storedElement = z.discriminatedUnion('k', [
  z.object({
    k: z.literal('s'),
    id: elementId,
    tool: z.enum(['pen', 'highlighter']),
    c: color,
    w: z.number().min(0.5).max(80),
    o: z.number().min(0.05).max(1),
    pts: z
      .string()
      .max(200_000)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/),
  }),
  z.object({
    k: z.literal('h'),
    id: elementId,
    shape: z.enum(['rect', 'ellipse', 'line', 'arrow']),
    c: color,
    w: z.number().min(0.5).max(80),
    x1: coord,
    y1: coord,
    x2: coord,
    y2: coord,
  }),
  z.object({
    k: z.literal('t'),
    id: elementId,
    c: color,
    f: z.enum(['sans', 'serif', 'hand']),
    s: z.number().min(6).max(200),
    x: coord,
    y: coord,
    bw: z.number().min(20).max(5000),
    v: z.string().max(5000),
  }),
]);
export type StoredElement = z.infer<typeof storedElement>;
export const MAX_ELEMENTS = 5000;
/** A page body. Byte size is capped separately (~900 kB). */
export const pageInputSchema = z
  .object({ index: z.number().int().min(0).max(499), elements: z.array(storedElement).max(MAX_ELEMENTS) })
  .strict();
export const PAGE_MAX_BYTES = 950_000;
export const replacePagesSchema = z
  .object({
    mode: z.enum(['paged', 'infinite']),
    pages: z.array(z.array(storedElement).max(MAX_ELEMENTS)).min(1).max(500),
  })
  .strict();

// --- study activity --------------------------------------------------------
export const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_FLUSH_SECONDS = 120;
export const activityInputSchema = z
  .object({ day: z.string().regex(DAY), seconds: z.number().int().min(1).max(MAX_FLUSH_SECONDS) })
  .strict();

// --- books -----------------------------------------------------------------
export const positionSchema = z
  .object({
    page: z.number().int().min(1).max(100_000).optional(),
    chapter: z.number().int().min(0).max(10_000).optional(),
    fraction: z.number().min(0).max(1).optional(),
  })
  .strict();
export const bookPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(LIMITS.bookTitle),
    progress: z.number().min(0).max(1),
    position: positionSchema,
    pageCount: z.number().int().min(0).max(100_000),
    notebookId: idSchema.nullable(),
    opened: z.literal(true),
  })
  .partial()
  .strict();
export const highlightInputSchema = z
  .object({
    section: z.number().int().min(0).max(100_000),
    exact: z.string().min(1).max(2000),
    prefix: z.string().max(64),
    suffix: z.string().max(64),
  })
  .strict();
