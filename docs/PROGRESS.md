# AKSHAR Progress

## Module 0: Setup & foundation (branch `feat/setup`)

**Status:** approved 2026-10-18.

**Done**

- Project scaffold: Vite + React + TS strict, Tailwind v4, ESLint (zero warnings), Prettier.
- Design tokens for light, dark and paper. Light is sampled from the screenshots; all three are AA-checked by a test.
- Self-hosted multi-script Noto Sans.
- i18n `t()` with English fallback.
- Lazy Firebase data layer with zod-validated config; emulators with the `demo-akshar` project in development.
- Default-deny Firestore and Storage rules, with emulator tests including negative cases.
- Hosting security headers.
- Error boundary, 404 page, Playwright smoke tests on desktop, tablet and mobile.
- Docs: DESIGN, ARCHITECTURE, AUDIT, PROGRESS.

**Decisions**

- 2026-10-18: Build from scratch; there was no existing code. Dependencies are installed locally only. Nothing global, nothing written outside the project.
- 2026-10-18: Active nav text on pale blue uses `#1166b3` instead of `#1270c4`, for AA compliance (user approved).
- TypeScript 6.0.3 instead of 7.x, because typescript-eslint 8.71 supports TypeScript below 6.1.
- `ignore-scripts=true`: no dependency install scripts run.
- Storage writes are fully closed until upload types and sizes are decided.
- No i18n library; a small typed `t()` is enough.

**Open issues**

- `npm audit`: 12 high and 4 moderate findings, none critical. Details are in the module report.
  - **Runtime:** `firebase` pins `@grpc/grpc-js ~1.9` (GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4). It is used only by Firestore's Node.js build; the browser build has 0 references (verified). The upstream fix was published 2026-10-08, which is too new for our 2-week rule. Recheck when Firebase updates.
  - **Dev-only (`firebase-tools`):** braces, basic-ftp, uuid, @opentelemetry/core and others. These run only for local emulators.
- `@types/node` is used via a transitive dependency (locked in `package-lock.json`), not listed directly.
- Needed from the user: the logo SVG exported from Figma; clean screenshots (the top-right corners are covered); tablet and mobile captures, dark and paper captures, auth screens.
- The design ↔ CLAUDE.md conflicts are listed at the end of `docs/AUDIT.md`.
- The Functions emulator is deferred to the AI module (no `functions/` folder yet).

## Product decisions (2026-10-18, from the user)

- Modules run back-to-back without waiting for "approved" (explicit override of CLAUDE.md §4). A report is still sent after each module.
- Later dependencies approved: @tiptap/react, @tiptap/pm, @tiptap/starter-kit, @tiptap/extension-image 3.31.4; pdfjs-dist 6.4.299; dompurify 3.4.16; in `functions/` only: firebase-functions 7.4.0, firebase-admin 14.5.0. Everything else is hand-written: plain-canvas whiteboard, EPUB unzip, ZIP/DOCX/CSV/whiteboard-PDF writers, service worker. Notes→PDF uses browser print-to-PDF.
- AI provider: Google Gemini, called from a Cloud Function with plain fetch.
- Limits ("Strict"): AI 20 requests/day for accounts, 5/day for guests. Uploads 25 MB per file (guests 5 MB), 200 MB total (guests 25 MB).
- Interface languages: English only at first.

## Module 1: Auth and session (branch `feat/auth`)

**Status:** complete.

**Done**

- Login, sign up, forgot password, verify email (resend with a 60-second cooldown, "I've verified" check, switch account).
- Google sign-in (popup), guest mode, and guest upgrade in place through linking (same uid, so data under `users/{uid}` is kept) with email or Google.
- Protected routes with a validated `?next=` redirect (no open redirects). Unverified password accounts are held at `/verify-email`.
- Session persistence (Firebase local persistence). Sign-out clears the Firestore offline cache, Cache Storage and `akshar:*` storage keys, then does a full page load. Guests confirm before signing out, because their data can't be recovered.
- Friendly error mapping: one message for a wrong email or a wrong password, so sign-in never reveals which emails have accounts; password reset shows the same message whether or not the account exists.
- Offline notice that disables the auth actions. zod form validation with inline, translatable messages.
- Shared UI: Icon set, Button/IconButton, TextField (show/hide password), Alert, Dialog (native `<dialog>`), FullPageLoader, useOnline.

**Decisions**

- `onIdTokenChanged` instead of `onAuthStateChanged`, because the latter doesn't fire when a guest is upgraded in place.
- Guests may open `/login`, with a warning that guest notes stay behind; to keep them they should create an account instead.
- Password policy: 8–128 characters, at least one letter and one number.
- The Google "G" mark keeps its brand colors (the only non-token colors, in `GoogleButton.tsx`).
- E2E runs a production build wired to the emulators (`VITE_USE_EMULATORS=true`, demo project).

**Open issues**

- A Google sign-in conflict (the Google account already exists) can't merge guest data. The user sees an explanation instead.
- The production Firebase project must have the Email/Password, Google and Anonymous providers enabled, plus email enumeration protection. That's a console change for you to make before launch.
- Guest quotas are enforced where they apply (uploads in Module 6, AI in Module 8).

## Module 2: App shell (branch `feat/shell`)

**Status:** complete.

**Done**

- Sidebar (desktop and tablet) matching the design: wordmark, Dashboard / Whiteboard / Flashcards / Library, SUBJECTS, "+ New notebook", Settings. Active item uses the approved AA-safe `accent-on-soft`.
- Mobile: top bar (menu drawer with the full sidebar, wordmark, search), bottom tabs Home / Whiteboard / Flashcards / Profile, floating "+ New". Editors will render outside the shell, so the tab bar is hidden there.
- Subjects: create, rename, recolour (6 AA-checked colours), and delete with confirmation (notebooks and decks in the subject move to "No subject"). Loading skeleton, empty and error states.
- Global search: ARIA combobox over the user's subjects, notebooks, books and decks (client-side index; diacritic- and case-insensitive; works for any script). Full-page search on mobile.
- Settings → Appearance: theme, text size, language (English only), whiteboard toolbar side. Changes apply instantly, are saved per user in Firestore, and are cached locally so the next load paints in the right theme. A toast confirms each save.
- Account card with Sign out (moved from the temporary home page).
- Shared UI: Toast, Menu (WAI-ARIA keyboard pattern), Segmented (radio group).
- Firestore rules rewritten without the recursive wildcard: validated profile `settings` and `subjects` (field whitelist, enums, 40-character names, server timestamps, fixed `createdAt`). Read-only access to notebooks, decks and books until their modules add write rules.

**Decisions**

- Subject colours are a named palette (blue, purple, teal, orange, green, rose) instead of fixed subjects. New users start with no subjects; there's no demo data.
- Writes don't wait for the server to confirm. Firestore applies them locally at once, so dialogs close immediately, even offline. Server rejections show an error toast.
- "+ New notebook" is disabled with a "Coming soon" tooltip until Module 3.
- `/notebooks`, `/flashcards` and `/library` show an honest "coming soon" page until their modules land.

**Open issues**

- Subject counts and the flashcards due badge arrive with notebooks (Module 3) and decks (Module 7).
- Deleting a subject while offline fails with an error toast (it has to query notebooks and decks first). Module 11 revisits this with offline persistence.

## Module 3: Dashboard (branch `feat/dashboard`)

**Status:** complete.

**Done**

- Dashboard matching the design: search, Ask AI (disabled until Module 8), localized date, time-of-day greeting with the name in accent colour, three stat cards, Recent notebooks (count, grid, dashed "Create notebook" card), Recent PDFs and books.
- Stats from real tracked usage. `useStudyTracker` counts visible, active time (idle after 2 minutes) on study screens and saves it per local day with capped increments. Focus hours this week (Monday start), study streak (days with at least 5 minutes; today still counts as yesterday's streak until the day ends), and the weekly goal ring (goal editable, 1–80 hours, saved in settings).
- Flashcards due: live count of cards due by the end of today; "Review now" appears only when there are cards due.
- Notebooks: create (title + subject only), rename, delete (removes every page), from the sidebar, FAB, dashboard and notebooks page. The `/notebooks` page has subject filter chips (only the user's own subject ids are accepted from the URL). Sidebar subject counts are live.
- Live thumbnails: the first page is rendered from the real stroke data with the paper style. Empty notebooks show a subject-coloured placeholder with an icon. Thumbnails load lazily when scrolled into view and redraw on resize.
- Whiteboard document model (used by Module 4): fixed logical page 1000×1414, compact stroke storage (Int16 deltas + base64, about 6 bytes per point), RDP simplification, a renderer with pressure-width pen, flat highlighter, shapes, wrapped text, and paper styles.
- Firestore: persistent offline cache enabled now (pending writes survive reloads; cleared on sign-out). Rules for notebooks, pages, activity (1–120-second increments only), and read-only cards. 16 rules tests in total.

**Decisions**

- Flashcards are stored flat in `users/{uid}/cards` with a `deckId`, so "due today" is one query.
- Persistent Firestore cache brought forward from Module 11, because reloading before a write synced could lose it.
- Verification check made fail-safe: password accounts must verify unless Google is linked, even if provider data is briefly empty.
- Fixed: closing a dialog opened from the mobile drawer also closed the drawer (React forwards `close` events from nested dialogs).
- Playwright assertion timeout raised to 10 s: under three parallel browsers the Auth emulator occasionally takes longer than 5 s to restore a session. Measured reloads take 50–400 ms when idle.

**Open issues**

- The whiteboard editor route (`/notebooks/:id`) shows a coming-soon page until Module 4 (next).
- Typed-text fonts: serif and handwriting fonts are not yet self-hosted (decided in Module 4).

## Module 4: Whiteboard (branch `feat/whiteboard`)

**Status:** complete.

**Done**

- Full-screen editor (no tab bar). Top bar: back, subject and title, Saved chip (Saving / Saved / Offline / Error with Retry), Paged | Infinite switch, AI sparkle (disabled until Module 8), and a "..." menu with focus mode, Export PDF / image (disabled until Module 9), Rename, and Delete with confirmation.
- Paged mode: fixed logical page, fit to the space left by the toolbar at any size. Infinite mode: unbounded canvas. Switching mode rewrites all pages in one atomic batch without dropping anything (pages are stacked on the infinite canvas, then split back by position). It warns if content extends past the page edges, and refuses if the combined content would exceed the document size limit.
- Tools: lasso (select, drag to move, arrow keys, Delete, floating menu with Move / Erase / AI actions), pen (pressure width), highlighter, eraser (erases everything inside the drawn loop), shapes (rectangle, ellipse, line, arrow), and text (sans / serif / handwriting, edit by tapping). Five ink swatches; the size slider controls pen width, highlighter opacity, or text size. Undo and redo.
- Toolbar: floating, draggable to dock left / right / bottom (also with arrow keys), collapsible, remembered. Defaults to the side from Settings, and to the bottom on mobile. Never covers the page.
- Palette panel: paper style and background, saved per notebook. On dark paper the default ink switches to a light colour.
- Bottom bar: previous / next page, add page, zoom out / % (fit) / in. Pinch, Ctrl+wheel, wheel pan, space or middle-drag pan. Keyboard shortcuts.
- Palm rejection: once a stylus is used, single touches never draw; two fingers still pan and zoom.
- Autosave (`EditorStore`, unit-tested): 700 ms debounce, per-page queue, retries rejected writes with 1/2/4/8 s backoff, then Error with manual Retry; local edits are never dropped. Last write wins per page, and pages with unsaved edits ignore remote snapshots. Edits made offline are queued by Firestore's persistent cache. A page refuses additions past 900 kB (Firestore's limit is 1 MiB) with a "page is full" message.
- Performance: a base canvas layer is redrawn only when content changes, or incrementally after a stroke; a live layer holds the current gesture; during pan and zoom the bitmap moves with a CSS transform. With 1200 strokes, a full drawn stroke including saving takes about 400 ms and two zoom steps about 90 ms (e2e).
- Study time is tracked while the whiteboard is open.

**Decisions**

- Fonts: @fontsource/noto-serif and @fontsource/caveat (user approved). They load only when used, and the canvas waits for them before drawing text.
- No canvas library: plain Canvas 2D (no Konva or Fabric installed).
- The menu supports disabled items with a "Coming soon" hint.

**Bugs found and fixed along the way**

- The selection menu could cover the selection: it now measures itself and sits above or below.
- The palette panel was clipped behind the canvas when the toolbar was docked at the bottom (a transformed parent): it's now rendered outside the toolbar.

**Test notes**

- Google popup sign-in: Firebase loads Google's gapi script from apis.google.com even against the emulator, so this test depends on the live internet (about 4% flake measured). That single test may retry up to 2 times; its assertions are unchanged.
- I removed my earlier attempt to pre-load that script on the login page, because it made every visitor load a Google script. It now loads only after someone clicks "Continue with Google".
- The notebooks subject-filter e2e test failed once under full-suite load and then passed 30 of 30 in isolation. I'm watching it.
