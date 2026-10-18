# AKSHAR Architecture

AKSHAR runs entirely on one computer. A small local server holds the data. There are no third-party services for storage or sign-in. The only optional online piece is AI (Gemini), and only when a key is set in `.env.local`.

## Stack

- **Front end:** React 19, Vite 8, TypeScript 6 (strict), React Router 7, Tailwind CSS 4 with CSS-variable tokens, zod, Tiptap, pdf.js, DOMPurify.
- **Server:** Node 26, built-ins only (`node:http`, `node:sqlite`, `node:crypto`, `node:fs`) plus zod. Node runs the TypeScript directly; there's no server build step.
- **Tests:** Vitest (unit and API) and Playwright (end to end).

Exact versions are pinned in `package.json` and `package-lock.json`. `npm audit`: 0 vulnerabilities.

## Folders

```
server/          Local API server: app.ts (HTTP + static files), routes.ts, auth.ts, db.ts (SQLite schema),
                 security.ts (headers, CSRF, rate limits), events.ts (live updates), http.ts
scripts/         dev.ts (server + Vite), reset-password.ts
src/
  shared/        Validation and pure helpers used by BOTH browser and server (schemas, file-type checks,
                 note cleaning). Imports use explicit .ts extensions so Node can run them directly.
  data/          The only code that talks to the server (lint-enforced): api.ts, events.ts, one module per feature
  app/ features/ ui/ i18n/ theme/   UI (unchanged by the backend switch)
tests/
  server/        API + authorization tests (real server, throwaway data folder)
  e2e/           Playwright on desktop, tablet, mobile (built app served by the real server)
data/            Local database (akshar.db) and uploaded files — gitignored, created on first run
```

## Data

- **Database:** one SQLite file, `data/akshar.db` (WAL mode, foreign keys on, versioned migrations in `server/db.ts`).
  - Tables: `users`, `sessions`, `settings`, `subjects`, `notebooks`, `pages`, `notes`, `activity`, `files`, `books`, `highlights`, `cards`.
  - Every user-owned row has `user_id`, and every query filters by the session's user.
- **Files:** `data/files/<userId>/{images,books}/<random hex>.<ext>`. Each file has a row in `files` (owner, size) used for access checks and the 200 MB-per-user quota.
- **Pages:** each whiteboard page is one row; its elements are stored as JSON in the compact format (`src/shared/schemas.ts` → `storedElement`). Last write wins per page.
- **Live updates:** the server pushes topic names (for example `notebooks`, `pages:<id>`) over server-sent events at `/api/events`. `src/data/*` `subscribe…()` functions refetch on matching topics and after reconnects. Requests also report reachability, so the UI can show "Can't reach the AKSHAR server".

## Security

- **Bound to 127.0.0.1** only.
- **Accounts:** scrypt password hashes (per-user salt). Unknown usernames take as long as wrong passwords, and both give the same error.
- **Sessions:** random 32-byte token, stored hashed, in an `HttpOnly; SameSite=Strict` cookie with sliding 30-day expiry. Logout and password changes revoke sessions.
- **CSRF:** writes require the `X-Akshar: 1` header and a same-origin `Origin`.
- **Rate limits:** login is limited per username and IP; password changes are limited too.
- **Validation:** every body is checked with zod (`src/shared/schemas.ts`) and has a size cap (JSON 64 KB by default, pages and notes 2 MB).
- **Notes:** cleaned by `cleanContent` on the server, as well as in the browser.
- **Uploads:**
  - Streamed to disk with byte caps (books 25 MB, images 5 MB, 200 MB per user).
  - Type checked by magic bytes and extension; random names; never overwritten.
  - Served only to their owner, with `Content-Security-Policy: sandbox` and `nosniff`; books as attachments.
- **Headers:** CSP without `unsafe-eval`, `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy, COOP and CORP.
- **Password reset:** `npm run reset-password -- <username>`. It prompts for the new password (hidden) and signs out every session.

## Commands

```
npm run dev               # API server (port 5174) + Vite dev server (proxies /api)
npm start                 # build, then serve app + API at http://127.0.0.1:5174
npm run typecheck | lint | test | test:server | build
npm run test:e2e:install  # one-time: Chromium into node_modules
npm run test:e2e          # builds, starts the server with a fresh .tmp-test/e2e folder, runs Playwright
npm run reset-password -- <username>
```

Nothing is written outside the project folder: the npm cache and logs live in `.npm-cache/`, Playwright browsers in `node_modules/`, and test data in `.tmp-test/`.
