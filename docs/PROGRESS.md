# AKSHAR Progress

## Module 0: Setup & foundation (branch `feat/setup`), awaiting approval

**Status:** complete, pending user approval.

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

## Next: Module 1, Auth and session (after "approved")
