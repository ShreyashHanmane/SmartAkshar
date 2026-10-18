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

## Module 5: Notes editor (branch `feat/notes`)

**Status:** complete.

**Decision (user, 2026-10-18):** typed notes live in a **Whiteboard | Notes** switch inside each notebook (`?view=notes`): one Tiptap note per notebook, with no new creation flow.

**Done**

- Tiptap editor: undo/redo, H1–H3, bold, italic, underline, strikethrough, inline code, bulleted and numbered lists, quote, code block, divider, link (dialog; only http/https/mailto; `rel="noopener noreferrer nofollow"`), and images (button, paste, drop).
- Autosave with `DocSaver` (unit-tested): 800 ms debounce, retries with backoff, Error and Retry, never drops the latest edit, and stale retries can't overwrite newer saves. The Saved chip in the top bar is shared with the whiteboard. Remote updates apply only when there are no unsaved local edits and the editor isn't focused.
- Security:
  - Every load and save passes through `cleanContent`: allow-listed nodes and marks only, safe links only, images only from the owner's own Storage folder, depth and size caps.
  - Pasted HTML is sanitised with DOMPurify before parsing.
  - Image uploads are checked by magic bytes against the extension, use random object names, and live under `users/{uid}/notes/{notebookId}/`. Storage rules enforce type, name pattern, size (5 MB, guests 2 MB) and no overwrites.
  - Deleting a notebook deletes its note and images.
- Loading skeleton, error state, "too long to save" warning (900 kB), and an offline message for images.
- Study time is tracked while the notes are open.
- Mobile: the top bar puts the view and mode switches on their own row; the formatting bar scrolls horizontally.

**Open issues**

- Notes → PDF / DOCX export arrives with Module 9 (menu items disabled with "Coming soon").
- Total per-user storage quotas (200 MB / guests 25 MB) can't be enforced in Storage rules alone. Planned with the Cloud Functions work (Modules 8 and 12); per-file limits are enforced now.

## Backend switch: local-only (branch `feat/local-backend`)

**Decision (user, 2026-10-18):** drop Firebase and every third-party service for data and sign-in. Everything runs locally and is stored in a folder. Local username + password accounts (no Google, no guest mode, no email verification; `npm run reset-password` instead). AI stays optional via Gemini from the local server (Module 8). This overrides CLAUDE.md §2 and §7, which were updated.

**Done**

- `server/`: Node built-ins only (+ zod): SQLite schema and migrations, scrypt accounts, hashed sessions in HttpOnly SameSite=Strict cookies, CSRF header and Origin checks, login rate limits, per-user repositories for every feature, streamed uploads with magic-byte checks and quotas, owner-only file serving, live updates over SSE, security headers, static serving of the built app, bound to 127.0.0.1.
- `src/shared/`: schemas, file-type and image checks, and note cleaning, shared by browser and server.
- `src/data/` rewritten against the API with the same function names, so the screens are unchanged. Auth screens simplified to username + password; "Forgot password?" explains the local reset command.
- Saves treat "server unreachable" as pending, never failed: the Saved chip shows "Server unreachable · not saved yet" and retries every 3 s. If the server isn't running at all, the app shows a "Can't reach the AKSHAR server" screen with the start command.
- Removed: `firebase`, `firebase-tools`, `@firebase/rules-unit-testing` (691 packages), `firebase.json`, the rules files, the rules tests and the emulator caches. `npm audit`: 16 findings → **0 vulnerabilities**. Added `@types/node` 26.6.3 (dev, type-only; approved).
- Tests: 14 server API tests replace the rules tests, covering accounts, authorization (including negative cases), CSRF, rate limits, validation, server-side note cleaning, uploads, account deletion and live updates. All e2e tests run against the real server.

**Notes**

- Edits made while the server is unreachable are kept in memory and retried. Closing the tab before the server is back loses them; the browser warns before closing. Module 11 can add an on-device outbox.
- The parked reader work (Module 6) is on `feat/reader` (WIP commit) and continues on this backend next.

## Module 6: Book reader (branch `feat/reader-local`, on the local backend)

**Status:** complete.

**Done**

- **Library:**
  - Import PDF, EPUB or TXT. The file is checked by content and extension (also re-checked by the server); title, author and page or chapter count are read locally; upload shows progress and can be cancelled.
  - Filter tabs (All, PDF, EPUB, TXT) and rows as in the design, with a progress bar, Read, Read with notes, and Rename and Delete.
  - Loading, empty and error states; import is disabled while the server is unreachable.
- **Reader:**
  - **PDF:** pdf.js with a selectable text layer. Character maps, standard fonts and WASM decoders are self-hosted under `/pdfjs/`, never from a CDN.
  - **EPUB:** a hand-written ZIP reader with zip-bomb and path guards. Chapters are sanitised with DOMPurify (no scripts, forms, inline styles or remote URLs; images come only from inside the EPUB as blob URLs) and shown in a sandboxed iframe without `allow-scripts`, with a restrictive CSP.
  - **TXT:** split into sections.
  - Page, chapter or part navigation (buttons and arrow keys); position and progress are saved and restored.
- **Highlights:** text-quote anchors (exact text + prefix/suffix) that survive reflow; saved to the server, redrawn after reload, removable by clicking.
- **Selection menu:** Highlight works; Create flashcard (Module 7) and Explain / Summarize / Translate (Module 8) are disabled with "Coming soon".
- **Read with notes:** a split view with a resizable divider (drag or keyboard; ratio remembered) and Book / Notes tabs on mobile. The notes pane embeds the whiteboard of a notebook linked to the book (created on first use as "<title> — Notes").
- Study time is tracked while reading.

**Tests:** 7 new e2e scenarios on desktop, tablet and mobile (21 runs). They cover import of all three formats with metadata, filtering, rejecting a disguised file, PDF paging and resume, highlight persistence and removal, the EPUB sandbox (script and inline-handler content never runs, no tracker requests, external links stripped), EPUB and TXT highlights, notes linking with saved handwriting, and rename and delete (the file returns 404 afterwards).

## Module 7: Flashcards (branch `feat/flashcards`)

**Status:** complete.

**Done**

- **Decks:** create (title + subject), rename, delete (with their cards). Deck cards as in the design: subject label, "N cards · N due", learned-progress bar, Review and Quiz, empty-deck text. Live due-count badge on the sidebar.
- **Cards:** create, edit and delete on the deck page and the Create tab. With no decks yet, the Create tab starts one. The form clears immediately so the next card can be typed straight away (restored if saving fails).
- **Review:** due cards of one deck or all decks (the dashboard's "Review now"). Tap or Space to flip; swipe right or → for "Know it", left or ← for "Don't know"; buttons too. Forgotten cards come back once at the end of the session, followed by a summary.
- **Leitner scheduler** (`src/shared/leitner.ts`, unit-tested, applied by the server): boxes 1–5 with 1, 2, 4, 8 and 16 days; knowing moves a card up a box, not knowing sends it back to box 1.
- **Quiz:** up to 10 questions per round, the right answer plus up to 3 distinct distractors from the deck, immediate feedback, a score, and "Try again". Practice only; it doesn't change the schedule.
- **Progress tab:** total, due today, reviewed today, cards per box (bar chart), learned per deck.
- **Reader:** "Create flashcard" from selected text, with the answer prefilled from the selection.
- **Server:** migration v2 adds `decks` and full card fields, plus routes for decks, cards, reviews, due cards and stats. All per-user and validated (text ≤ 2000 characters, 20,000-card cap); deleting a subject keeps its decks.

**Bugs found and fixed**

- Creating a deck from the Flashcards page did nothing: `onCreated?.(await createDeck(…))` skips evaluating its argument when there's no callback.
- Review keyboard shortcuts stopped working after "Don't know" requeued the same card; they're now handled at window level (ignored while typing).
- **Stale refetch race (found by a flaky notes test):** a live-update refetch that started before a save could arrive after it and briefly show older content. Saves now return the server's `updatedAt`; the whiteboard store and the notes editor ignore copies older than their latest confirmed save (unit-tested).

**Tests:** 7 new e2e scenarios (deck and cards with due counts and badge; review by click, swipe and keyboard with schedule saved; quiz; edit and delete; Create and Progress tabs; flashcard from a PDF selection; dashboard Review now), 5 server tests and 7 scheduler unit tests. Full e2e suite: 172 passed, twice in a row.

## Module 8: AI (branch `feat/ai`)

**Status:** complete. Gemini through the local server; off until `GEMINI_API_KEY` is set in `.env.local`.

**Done**

- **Server** (`server/ai/`):
  - `POST /api/ai/run` and `GET /api/ai/status`, with the provider behind the `AiProvider` interface (Gemini by default).
  - Limits: session required; 5 requests per minute; 20 per day (counted in the new `ai_usage` table and refunded on provider errors); text capped at 12,000 characters; handwriting images capped; 30-second timeout; output capped.
  - Prompt-injection defense: fixed system instructions, with student material fenced and treated as data.
  - Logs are metadata only, with a hashed user id.
- **AI panel:** a side panel on desktop and tablet, a bottom sheet on mobile.
  - Actions: summarize, explain, translate (with a language picker), make flashcards, convert handwriting to text.
  - States what is sent and shows daily usage; spinner with Cancel; friendly errors (off, quota, too long, timeout, unreachable).
  - Results render as plain text. Result actions: Copy, Insert into notes, Save as flashcard, and choose a deck for generated cards.
- **Entry points:**
  - Dashboard "Ask AI".
  - Whiteboard sparkle (whole page) and lasso menu (Convert to text, Explain, Translate on the selection only).
  - Reader: selection menu (Explain, Summarize, Translate), "Make flashcards with AI" from a highlight, and the header "Summarize with AI" (this page or the whole book).
- **Starter content** (user request): every new account gets 4 subjects and 4 decks with 13 sample cards, created with the account and fully editable. CLAUDE.md §4 now records this exception.

**Bugs found and fixed**

- Notes editor re-applied Tiptap options on every render (new `extensions`/`editorProps` objects); they're now stable.
- Flaky mobile link test: ProseMirror hadn't yet read the browser's Shift+Home selection when the toolbar was tapped about 50 ms later. Instrumentation showed no remount or remote overwrite. The test now selects with Ctrl/Cmd+A, which the editor handles synchronously. It passed 180 times in a row.

**Tests:** 7 server AI tests (fake provider: auth, quota and refund, size limits, fenced prompts, card parsing, timeouts), prompt unit tests, a starter-content API test, and new e2e scenarios in `tests/e2e/ai.spec.ts` against a second test-only server with a scripted AI (no network). Full e2e suite: 192 passed, 3 skipped by design (mobile duplicates of selection flows).

**Remember:** set a budget alert in Google AI Studio / Cloud for the Gemini key.

## Module 9: Export (branch `feat/export`)

**Status:** complete. No new dependencies: the PDF, DOCX and ZIP writers are hand-written (`src/features/export/`, `src/shared/zip.ts`).

**Done**

- **Whiteboard:** "..." → Export PDF lets you choose this page or all pages, with a progress bar and Cancel. Paged notebooks export as A4 pages. Infinite mode exports the drawing's bounds. "Export image" saves a PNG of the current page at 2000 × 2828.
- **Notes:** Export PDF (A4, laid out with the app's fonts, so every script renders) and Export Word (DOCX: headings, marks, links, nested lists, quotes, code, dividers, images). Both use the editor's current content, so text typed just before exporting is included.
- **Flashcards:** deck menu → Export CSV (front, back, deck, box, due). Formula injection is neutralized, and there's a BOM so Excel reads UTF-8.
- **Full data export:** Settings → Data → Export ZIP. The server streams a ZIP of `data.json` (all of the user's data; never password hashes or sessions), their books and note images, and a README. Progress shows MB downloaded, with Cancel.
- File names are sanitized; ZIP entry names can't escape the archive.

**Decisions**

- PDFs are made of lossless page images (Flate RGB) rather than vector text. The output looks exactly like the app in every script, without embedding fonts. The trade-off is that PDF text isn't selectable or searchable; DOCX is the editable format.
- The Settings "Data" card was started here for the ZIP export; the rest of Settings is Module 10.

**Verification beyond the tests:** sample PDFs pass `qpdf --check`; LibreOffice opened the DOCX and converted it to PDF, which rendered correctly; Python's `zipfile` read the ZIPs with no errors.

**Tests:** unit tests for ZIP (CRC, round trip, path safety), PDF (opened with pdf.js: page count, sizes, title), DOCX (package parts, numbering, links, image scaling), notes layout (wrapping, margins, pagination) and CSV (injection, quoting). Server tests for the export cover contents, no secrets, owner-only and session required. E2E (`tests/e2e/export.spec.ts`) downloads each file and opens it: PDF page count and size, PNG pixels, DOCX text, CSV text, ZIP `data.json`. Full e2e suite: 204 passed, 3 skipped by design.
