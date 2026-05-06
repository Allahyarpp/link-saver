# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Link Saver is a zero-dependency, vanilla JS single-page app. No build step, no package manager, no framework. Open `index.html` directly in a browser to run it.

## Running the app

Open `index.html` in a browser — no server required. For development, a local static server avoids any CORS edge cases:

```bash
npx serve .
# or
python -m http.server
```

There are no tests, no linting config, and no CI pipeline.

## Architecture

Three files, no modules:

- **[index.html](index.html)** — full markup: animated mesh background, sticky glassy navbar, collapsible search bar, responsive card grid, and a modal form for adding links.
- **[app.js](app.js)** — all runtime logic. Initialised via `DOMContentLoaded → init()`.
- **[style.css](style.css)** — all styling, no preprocessor. Design tokens live in `:root` CSS variables.

### State model (app.js)

All state is module-level:

| Variable | Purpose |
|---|---|
| `links` | Array of link objects, source of truth, mirrored to `localStorage` under key `ls_links` |
| `activeTag` | Currently selected tag filter (`'all'` or a tag string) |
| `searchQuery` | Current search string |
| `modalTags` | Tags being built in the open modal |
| `tagColorMap` | `Map<string, cssClass>` — deterministic colour assignment per tag, persists for session lifetime |

Every state mutation calls `persistLinks()` then `render()`. `render()` is a full re-render of both the tag bar and the link grid each time.

### Key design decisions

- **`escHtml()`** is used on all user-supplied strings injected via `innerHTML`. Do not bypass it.
- Tag colour classes (`tag-violet`, `tag-pink`, …) are defined in CSS but all currently render identically (unified lime-on-dark theme). The class names are preserved for easy per-colour customisation.
- Favicon fetched from Google S2 service; falls back to an inline SVG data URI on error.
- Delete animation: card gets `.deleting` class → `animationend` event → array splice + re-render. No optimistic removal before animation.

## Design system

Primary accent: `--accent: #d1fe17` (lime yellow). Background: near-black `#0a0a0a`. All interactive elements use the same glass/blur aesthetic. Responsive breakpoint at `600px`.
