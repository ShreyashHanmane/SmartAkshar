# AKSHAR Design Reference

The source of truth is the approved screenshots in `design/screens/`. They are desktop, light theme, captured from the published Figma site. This file records what was measured from them. It does not add new design.

## Tokens (`src/index.css`)

Colors are sampled pixel-exact from the screenshots. Components use the Tailwind utilities generated from these tokens (`bg-surface`, `text-ink`, `border-line`, ...). Tailwind's default palette is disabled, so off-token colors do not compile.

| Token                                 | Light (design)                    | Dark                  | Paper                 | Used for                                      |
| ------------------------------------- | --------------------------------- | --------------------- | --------------------- | --------------------------------------------- |
| `canvas`                              | `#f5fbff`                         | `#0b1726`             | `#f4ecdc`             | App background                                |
| `surface`                             | `#ffffff`                         | `#12233a`             | `#fbf6ec`             | Cards, sidebar, inputs                        |
| `surface-sunken`                      | `#e4eef7`                         | `#0e1c2f`             | `#ece1cb`             | Segmented-control track                       |
| `line`                                | `#cfe3f5`                         | `#22405f`             | `#e0d2b6`             | Card and sidebar borders                      |
| `line-strong`                         | `#9cc3e6`                         | `#3a6590`             | `#c9b48d`             | Inputs, outline buttons, dashed "Create" card |
| `ink`                                 | `#0f2a4a`                         | `#e6f0fa`             | `#2e2416`             | Headings, body text                           |
| `ink-muted`                           | `#4a6582`                         | `#a3b8ce`             | `#65533b`             | Secondary text, nav labels                    |
| `primary` / `on-primary`              | `#1270c4` / `#fff`                | `#1a6fbd` / `#fff`    | `#1d5f9e` / `#fff`    | Filled buttons                                |
| `primary-soft`                        | `#e2f1fd`                         | `#16365a`             | `#e6e6dc`             | Active nav background, count badges           |
| `accent`                              | `#1270c4`                         | `#7dbcf2`             | `#1d5f9e`             | Links, "Guest", "3 due"                       |
| `accent-on-soft`                      | `#1166b3` *                       | `#7dbcf2`             | `#1d5f9e`             | Text on `primary-soft` (active nav)           |
| `progress` / `track`                  | `#1270c4` / `#d6ebfc`             | `#7dbcf2` / `#22405f` | `#1d5f9e` / `#e6dac3` | Progress bars, goal ring                      |
| `highlight`                           | `#fde68a`                         | `#6b5a14`             | `#f4d97c`             | Reader text highlights                        |
| `subject-physics`                     | `#1270c4`                         | `#7dbcf2`             | `#1d5f9e`             | Subject dot and label                         |
| `subject-math`                        | `#7a4bd0`                         | `#b9a0ee`             | `#6a3fb8`             |                                               |
| `subject-chemistry`                   | `#0f7f73`                         | `#5cc8bb`             | `#0d6e63`             |                                               |
| `subject-history`                     | `#b44f12`                         | `#f29b63`             | `#9a420f`             |                                               |
| `subject-math-soft`                   | `#efe9f9`                         | `#2a2347`             | `#ece3f2`             | Empty-notebook placeholder (math)             |
| `file-pdf` / `file-epub` / `file-txt` | `#c22a2a` / `#7a4bd0` / `#0f7f73` | same family           | darker                | Library file badges                           |

\* **Approved deviation (2026-10-18):** in the design, the active nav item is `#1270c4` text on `#e2f1fd`, which is 4.40:1 and below WCAG AA. The user approved `#1166b3` for text on pale-blue backgrounds only, which gives 5.10:1.

The dark and paper themes are derived, not designed. Every text and UI pair in every theme is checked against WCAG AA by `src/theme/contrast.test.ts`.

**Type:** Noto Sans, self-hosted via `@fontsource/noto-sans`, weights 400/500/600/700. It covers Latin, Latin-ext, Cyrillic, Greek, Devanagari and Vietnamese, and each subset loads only when its characters appear. The text-size setting changes the root size: Small 15px, Medium 16px, Large 18px.

**Spacing:** 8px grid. Touch targets are at least 44px (`min-h-11`).

## Screens (desktop, light)

| File                             | Route in Figma | Notes                                                                                                                                                                                                                         |
| -------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dashboard-desktop-light.png`    | `#/dashboard`  | Search, Ask AI, date and greeting, three stat cards (focus hours, cards due + Review now, weekly-goal ring + streak), Recent notebooks grid (first-page preview or subject placeholder), dashed "Create notebook" card        |
| `whiteboard-desktop-light.png`   | `#/whiteboard` | Top bar (back, subject, title, Saved chip), floating left toolbar (drag handle, lasso, pen, highlighter, eraser, shapes, text, 5 swatches, Size slider), dotted paper, bottom bar (tip, page prev/next, add page, zoom −/%/+) |
| `flashcards-desktop-light.png`   | `#/flashcards` | Tabs Decks / Progress / Create, deck cards (subject, title, cards and due, progress, Review, Quiz), empty deck state                                                                                                          |
| `library-desktop-light.png`      | `#/library`    | Import PDF or book, filter All/PDF/EPUB/TXT, rows (type badge, title, author, pages, last opened, progress, Read, Read with notes)                                                                                            |
| `reader-split-desktop-light.png` | `#/split/:id`  | Header (type, author, title), book pane with page indicator and highlight, resizable divider, handwritten notes pane                                                                                                          |
| `settings-desktop-light.png`     | `#/settings`   | Appearance (Theme, Text size, Language, Whiteboard toolbar side), Account (photo, name, email, password, sign out); the rest is below the fold                                                                                |

**Shared shell:** a left sidebar with the logo, then Dashboard, Whiteboard, Flashcards (with due count) and Library. Below that, SUBJECTS with a color dot and count, then "+ New notebook" and Settings.

## Gaps in the captures (to request)

- The top-right corner of the dashboard, whiteboard, flashcards and reader screens is covered by screenshot notifications. That hides the whiteboard top-bar controls, the "+ Create deck" button and any reader header actions.
- There are no tablet or mobile captures, and no dark or paper captures.
- There are no captures of the login, sign-up, verify-email or forgot-password screens, or of the lasso menu, AI panel, review and quiz modes, or the lower part of Settings.
- The logo is only available as a raster in the screenshots. It needs the original SVG exported from Figma.
