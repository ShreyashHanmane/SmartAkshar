# AKSHAR Control Audit

This replaces CLAUDE.md "Step 0". There was no existing app to audit (the project folder held only CLAUDE.md and screenshots), so this lists every interactive element visible in `design/screens/` plus what CLAUDE.md §5 requires. Everything starts as **missing**. Each module flips its rows to **works** with evidence.

Status: works / broken / UI-only / missing / disabled (Coming soon). "Module" refers to CLAUDE.md §9.

## Shared shell (sidebar; mobile tab bar)

| Element                               | Expected behavior                                        | Status                                                   | Module | Target file                                      |
| ------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | ------ | ------------------------------------------------ |
| Logo + tagline                        | Original Figma logo; recolored in dark                   | missing (SVG needed)                                     | 2      | `src/ui/Logo.tsx`                                |
| Dashboard nav                         | Go to dashboard; active state                            | works                                                    | 2      | `src/app/shell/Sidebar.tsx`                      |
| Whiteboard nav                        | Go to notebooks/whiteboard                               | works (opens the notebooks area; list built in Module 3) | 2      | `src/app/shell/Sidebar.tsx`                      |
| Flashcards nav + due badge            | Go to flashcards; badge = real due-today count           | works for navigation; due badge missing (Module 7)       | 2, 7   | `src/app/shell/Sidebar.tsx`                      |
| Library nav                           | Go to library                                            | works (page built in Module 6)                           | 2      | `src/app/shell/Sidebar.tsx`                      |
| Subjects list (dot, name, count)      | Filter by subject; counts from data                      | works (list, colour dot, count, filter link)             | 2      | `src/features/subjects/SubjectsNav.tsx`          |
| Subject create / rename / delete      | Manage subjects (§9.2)                                   | works                                                    | 2      | `src/features/subjects/`                         |
| + New notebook                        | Dialog asking only title + subject                       | works (title + subject only)                             | 3      | `src/features/notebooks/NewNotebookProvider.tsx` |
| Settings                              | Go to settings                                           | works                                                    | 2      | `src/app/shell/Sidebar.tsx`                      |
| Mobile bottom tabs + floating "+ New" | Home, Whiteboard, Flashcards, Profile; hidden in editors | works                                                    | 2      | `src/app/shell/MobileBars.tsx`                   |

## Dashboard (`dashboard-desktop-light.png`)

| Element                     | Expected behavior                                             | Status                                                                  | Module | Target file                                  |
| --------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- | ------ | -------------------------------------------- |
| Search field                | Global search over notebooks, PDFs, flashcards                | works (subjects now; notebooks, books, decks as their modules add them) | 2      | `src/features/search/SearchBox.tsx`          |
| Ask AI                      | Opens the AI panel (server-side AI)                           | disabled (Coming soon) until Module 8                                   | 8      | `src/features/dashboard/DashboardPage.tsx`   |
| Greeting + date + name      | Time-of-day greeting, localized date, user name               | works                                                                   | 3      | `src/features/dashboard/DashboardPage.tsx`   |
| This week: hours focused    | From real tracked usage                                       | works (real tracked study time)                                         | 3      | `src/features/dashboard/stats.ts`            |
| Flashcards due + Review now | Real due count; starts review                                 | works (real due count; review screen in Module 7)                       | 3, 7   | `src/features/dashboard/DashboardPage.tsx`   |
| Weekly goal ring + streak   | Computed from real usage                                      | works (real usage; goal editable)                                       | 3      | `src/features/dashboard/stats.ts`            |
| Recent notebook cards       | Open notebook; live first-page preview or subject placeholder | works (live first-page preview or subject placeholder)                  | 3      | `src/features/notebooks/NotebookCard.tsx`    |
| Notebook rename / delete    | Per §9.3 (no menu visible in capture)                         | works (card menu)                                                       | 3      | `src/features/notebooks/NotebookDialogs.tsx` |
| Create notebook card        | Same dialog as "+ New notebook"                               | works                                                                   | 3      | `src/features/notebooks/NotebookCard.tsx`    |
| Recent PDFs and books       | Required by §5; not visible in capture (below fold?)          | works (real list and empty state; import in Module 6)                   | 3      | `src/features/dashboard/DashboardPage.tsx`   |

## Whiteboard (`whiteboard-desktop-light.png`)

| Element                                         | Expected behavior                                                   | Status  | Module | Target file                             |
| ----------------------------------------------- | ------------------------------------------------------------------- | ------- | ------ | --------------------------------------- |
| Back                                            | Return to previous screen                                           | missing | 4      | `src/features/whiteboard/TopBar.tsx`    |
| Subject + title                                 | Show; rename via "..." menu                                         | missing | 4      | same                                    |
| Saved chip                                      | Saving / Saved / Offline / Error                                    | missing | 4      | same                                    |
| Paged / Infinite switch, AI sparkle, "..." menu | Per §5 (hidden under notification in capture)                       | missing | 4, 8   | same                                    |
| Toolbar drag handle                             | Drag; dock left/right/bottom; collapse; remembered                  | missing | 4      | `src/features/whiteboard/Toolbar.tsx`   |
| Lasso                                           | Circle-select; Move / Erase / Convert to text / Explain / Translate | missing | 4, 8   | same                                    |
| Pen, Highlighter, Eraser, Shapes, Text          | Real tools; text font picker (sans / serif / handwriting)           | missing | 4      | same                                    |
| 5 color swatches                                | Set stroke color                                                    | missing | 4      | same                                    |
| Palette button                                  | Paper style + background, saved per notebook                        | missing | 4      | same                                    |
| Undo / Redo                                     | History                                                             | missing | 4      | same                                    |
| Size slider                                     | Pen thickness / highlighter opacity                                 | missing | 4      | same                                    |
| Dotted paper                                    | Paper style; fixed logical coordinates, scaled to fit               | missing | 4      | `src/features/whiteboard/Canvas.tsx`    |
| Prev / next page, Page X of Y                   | Navigate pages                                                      | missing | 4      | `src/features/whiteboard/BottomBar.tsx` |
| Add page                                        | Append page                                                         | missing | 4      | same                                    |
| Zoom −, %, +                                    | Zoom                                                                | missing | 4      | same                                    |

## Flashcards (`flashcards-desktop-light.png`)

| Element                                               | Expected behavior                          | Status  | Module | Target file                |
| ----------------------------------------------------- | ------------------------------------------ | ------- | ------ | -------------------------- |
| Tabs Decks / Progress / Create                        | Switch views                               | missing | 7      | `src/features/flashcards/` |
| + Create deck (top right, partly hidden)              | Create deck                                | missing | 7      | same                       |
| Deck card (subject, title, N cards · N due, progress) | Real counts                                | missing | 7      | same                       |
| Review                                                | Swipe review (know / don't know → Leitner) | missing | 7      | same                       |
| Quiz                                                  | Multiple-choice quiz                       | missing | 7      | same                       |
| Empty deck state                                      | "Empty deck — add a card to begin."        | missing | 7      | same                       |
| Card create / edit / delete, CSV export               | Per §5                                     | missing | 7, 9   | same                       |

## Library (`library-desktop-light.png`)

| Element                                             | Expected behavior                                          | Status  | Module | Target file             |
| --------------------------------------------------- | ---------------------------------------------------------- | ------- | ------ | ----------------------- |
| Import PDF or book                                  | Validated upload (type by content + extension, size limit) | missing | 6      | `src/features/library/` |
| Filter All / PDF / EPUB / TXT                       | Filter list                                                | missing | 6      | same                    |
| Row (badge, title, author, pages, opened, progress) | Real metadata and progress                                 | missing | 6      | same                    |
| Read                                                | Open reader                                                | missing | 6      | `src/features/reader/`  |
| Read with notes                                     | Open split view                                            | missing | 6      | same                    |

## Reader split view (`reader-split-desktop-light.png`)

| Element             | Expected behavior                                          | Status  | Module  | Target file            |
| ------------------- | ---------------------------------------------------------- | ------- | ------- | ---------------------- |
| Back                | Return                                                     | missing | 6       | `src/features/reader/` |
| Page X of Y         | Reading position, saved progress                           | missing | 6       | same                   |
| Text selection menu | Highlight, Create flashcard, Explain, Summarize, Translate | missing | 6, 8    | same                   |
| Highlights          | Saved and restored                                         | missing | 6       | same                   |
| Divider             | Resize panes; tabs Book / Notes on mobile                  | missing | 6       | same                   |
| Notes pane          | Handwritten/typed notes linked to the book                 | missing | 4, 5, 6 | same                   |

## Settings (`settings-desktop-light.png`)

| Element                                                             | Expected behavior                            | Status                                                                         | Module | Target file                              |
| ------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ | ------ | ---------------------------------------- |
| Theme Light / Dark / Paper                                          | Applies instantly; saved per user            | works (saved per user)                                                         | 2, 10  | `src/features/settings/SettingsPage.tsx` |
| Text size S / M / L                                                 | Scales interface text; saved                 | works (saved per user)                                                         | 2, 10  | `src/features/settings/SettingsPage.tsx` |
| Interface language                                                  | Switch locale; saved                         | works (English is the only language for now)                                   | 2, 10  | `src/features/settings/SettingsPage.tsx` |
| Whiteboard toolbar side Left / Right                                | Default toolbar dock side                    | works (saved; used by the whiteboard in Module 4)                              | 10     | `src/features/settings/SettingsPage.tsx` |
| Change photo                                                        | Upload profile photo                         | missing                                                                        | 10     | same                                     |
| Name, Email                                                         | Edit profile; email change with verification | missing                                                                        | 10     | same                                     |
| Change password                                                     | Re-auth + change                             | missing                                                                        | 10     | same                                     |
| Sign out                                                            | Sign out, clear cached data                  | works (Module 1; on the temporary home page, moves into Settings in Module 10) | 1      | `src/features/auth/useSignOut.tsx`       |
| (below fold) Delete account, Data export, sync status, storage used | Per §5                                       | missing                                                                        | 10     | same                                     |

## Not in captures but required by CLAUDE.md

- **Auth screens: works (Module 1).** Login, sign up, forgot password, verify email, Google, guest, guest upgrade, protected routes, session persistence. Covered by `tests/e2e/auth.spec.ts`. There is no design capture for these yet; they use the same tokens and card style as the approved screens.
- **Notes editor:** Tiptap.
- **AI side panel / bottom sheet.**
- **Exports:** whiteboard PDF/PNG, notes PDF/DOCX, ZIP.
- **Offline / PWA.**
- **Missing states on every screen:** empty, loading (skeleton), error, offline, save confirmations and toasts.

## Design ↔ CLAUDE.md conflicts to resolve (I'll ask one at a time)

1. The whiteboard tip says "circle notes with the **pen** to select". CLAUDE.md §5 says circling with the **lasso** selects. Which is it?
2. Settings has "Whiteboard toolbar side Left / Right". CLAUDE.md says the toolbar is draggable and dockable left/right/bottom and remembers its position. I assume the setting picks the default side and dragging still works.
