# AKSHAR Architecture

## Stack

React 19 + Vite 8 + TypeScript 6 (strict), React Router 7, Tailwind CSS 4 driven by CSS-variable tokens, Firebase 12 (Auth, Firestore, Storage), zod, Vitest, Playwright, and the Firebase Emulator Suite. Exact versions are pinned in `package.json` and `package-lock.json`.

## Folders

```
src/
  app/        App root, router, error boundary, error and 404 pages
  features/   One folder per feature (home now; auth, dashboard, whiteboard, ... later)
  data/       The only place that talks to Firebase (lint-enforced)
  i18n/       t() and locales/<lang>.json (one file per language)
  theme/      Appearance (theme + text size) and WCAG contrast helpers
  ui/         Shared presentational components
  index.css   Design tokens per [data-theme]
tests/
  e2e/        Playwright (desktop, tablet 820x1180 touch, mobile Pixel 7)
  rules/      Firestore and Storage rules tests (emulator)
design/screens/  Approved screenshots
```

## Rules enforced by tooling

- **ESLint:** `firebase/*` imports are allowed only in `src/data/` and `tests/`. `dangerouslySetInnerHTML` and `innerHTML`/`outerHTML` assignment are lint errors. Lint runs with `--max-warnings 0`.
- **Tailwind:** the default color and font palettes are removed, so only token utilities exist.
- **Contrast test:** every theme must define the same token set and meet AA for the listed pairs.

## Data layer

`src/data/firebase.ts` exposes `getFirebase()`, which initializes lazily so screens that don't need Firebase never load it. Its config comes from `src/data/config.ts`, which validates the `VITE_FIREBASE_*` variables with zod:

- **Development:** uses the emulators by default, with project `demo-akshar`. A `demo-` project can never reach real resources.
- **Production:** every config value is required.

Feature modules add typed repositories in `src/data/<feature>.ts`.

**Session:** `src/data/auth.ts` wraps Firebase Auth and exposes `SessionUser` (UI code never sees the Firebase `User`). `src/app/session/` holds the provider, the pure guard functions (`guards.ts`, unit-tested), `safeNextPath`, and the guard components used by the router.

## Security rules

- `firestore.rules`: default-deny. Only `users/{uid}/**` is reachable, and only by that uid.
- `storage.rules`: default-deny. The owner can read; all writes are closed until upload types and sizes are decided.
- Hosting headers in `firebase.json`: CSP (no `unsafe-eval`, `frame-ancestors 'none'`, `object-src 'none'`), HSTS, nosniff, Referrer-Policy, Permissions-Policy and COOP.
  - `script-src` allows `https://apis.google.com` for Google sign-in.
  - `style-src` allows `'unsafe-inline'` for React style attributes (canvas positioning).
- There is no deploy target configured. Deploys require explicit approval.

## Local-only tooling

Nothing is installed globally, and no tool writes outside the project:

- `.npmrc`: `cache=./.npm-cache`, `ignore-scripts=true` (dependency install scripts never run).
- Playwright browsers: `PLAYWRIGHT_BROWSERS_PATH=0` → `node_modules/playwright-core/.local-browsers`.
- Firebase emulators: `FIREBASE_EMULATORS_PATH=./.emulators` and `XDG_CONFIG_HOME=./.config-local`.

Requirements: Node ≥ 22 and Java (for the Firestore emulator).

## Commands

```
npm run dev               # Vite dev server
npm run typecheck         # tsc -b
npm run lint              # eslint, zero warnings
npm run format:check      # prettier
npm run test              # Vitest unit tests
npm run test:rules        # Firestore/Storage rules tests in the emulator
npm run test:e2e:install  # one-time: Chromium into node_modules
npm run test:e2e          # Playwright inside the emulators (builds + previews automatically)
npm run build             # typecheck + production build
npm run emulators         # start auth/firestore/storage emulators
```
