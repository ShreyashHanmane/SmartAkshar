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
