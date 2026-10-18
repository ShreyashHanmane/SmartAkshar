# AKSHAR Control Audit

This replaces CLAUDE.md "Step 0". There was no existing app to audit (the project folder held only CLAUDE.md and screenshots), so this lists every interactive element visible in `design/screens/` plus what CLAUDE.md §5 requires. Everything starts as **missing**. Each module flips its rows to **works** with evidence.

Status: works / broken / UI-only / missing / disabled (Coming soon). "Module" refers to CLAUDE.md §9.

## Shared shell (sidebar; mobile tab bar)

| Element                               | Expected behavior                                        | Status               | Module | Target file                                    |
| ------------------------------------- | -------------------------------------------------------- | -------------------- | ------ | ---------------------------------------------- |
| Logo + tagline                        | Original Figma logo; recolored in dark                   | missing (SVG needed) | 2      | `src/ui/Logo.tsx`                              |
| Dashboard nav                         | Go to dashboard; active state                            | missing              | 2      | `src/app/shell/Sidebar.tsx`                    |
| Whiteboard nav                        | Go to notebooks/whiteboard                               | missing              | 2      | same                                           |
| Flashcards nav + due badge            | Go to flashcards; badge = real due-today count           | missing              | 2, 7   | same                                           |
| Library nav                           | Go to library                                            | missing              | 2      | same                                           |
| Subjects list (dot, name, count)      | Filter by subject; counts from data                      | missing              | 2      | `src/features/subjects/`                       |
| Subject create / rename / delete      | Manage subjects (§9.2)                                   | missing              | 2      | same                                           |
| + New notebook                        | Dialog asking only title + subject                       | missing              | 3      | `src/features/notebooks/NewNotebookDialog.tsx` |
| Settings                              | Go to settings                                           | missing              | 2      | `Sidebar.tsx`                                  |
| Mobile bottom tabs + floating "+ New" | Home, Whiteboard, Flashcards, Profile; hidden in editors | missing              | 2      | `src/app/shell/MobileTabs.tsx`                 |

## Dashboard (`dashboard-desktop-light.png`)

| Element                     | Expected behavior                                             | Status  | Module | Target file               |
| --------------------------- | ------------------------------------------------------------- | ------- | ------ | ------------------------- |
| Search field                | Global search over notebooks, PDFs, flashcards                | missing | 2      | `src/features/search/`    |
| Ask AI                      | Opens the AI panel (server-side AI)                           | missing | 8      | `src/features/ai/`        |
| Greeting + date + name      | Time-of-day greeting, localized date, user name               | missing | 3      | `src/features/dashboard/` |
| This week: hours focused    | From real tracked usage                                       | missing | 3      | same                      |
| Flashcards due + Review now | Real due count; starts review                                 | missing | 3, 7   | same                      |
| Weekly goal ring + streak   | Computed from real usage                                      | missing | 3      | same                      |
| Recent notebook cards       | Open notebook; live first-page preview or subject placeholder | missing | 3      | `src/features/notebooks/` |
| Notebook rename / delete    | Per §9.3 (no menu visible in capture)                         | missing | 3      | same                      |
| Create notebook card        | Same dialog as "+ New notebook"                               | missing | 3      | same                      |
| Recent PDFs and books       | Required by §5; not visible in capture (below fold?)          | missing | 3      | same                      |

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

| Element                                                             | Expected behavior                            | Status                                                                         | Module | Target file                        |
| ------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ | ------ | ---------------------------------- |
| Theme Light / Dark / Paper                                          | Applies instantly; saved per user            | missing (tokens done)                                                          | 2, 10  | `src/features/settings/`           |
| Text size S / M / L                                                 | Scales interface text; saved                 | missing (scale done)                                                           | 2, 10  | same                               |
| Interface language                                                  | Switch locale; saved                         | missing (i18n done)                                                            | 2, 10  | same                               |
| Whiteboard toolbar side Left / Right                                | Default toolbar dock side                    | missing                                                                        | 10     | same                               |
| Change photo                                                        | Upload profile photo                         | missing                                                                        | 10     | same                               |
| Name, Email                                                         | Edit profile; email change with verification | missing                                                                        | 10     | same                               |
| Change password                                                     | Re-auth + change                             | missing                                                                        | 10     | same                               |
| Sign out                                                            | Sign out, clear cached data                  | works (Module 1; on the temporary home page, moves into Settings in Module 10) | 1      | `src/features/auth/useSignOut.tsx` |
| (below fold) Delete account, Data export, sync status, storage used | Per §5                                       | missing                                                                        | 10     | same                               |

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
