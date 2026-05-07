# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Link Saver is a vanilla JS single-page app — no build step, no package manager, no framework. Data is stored in Supabase (Postgres + Auth) so each user has their own private library accessible from any device.

## Running the app

You need a `config.js` file at the repo root with your Supabase credentials. Copy `config.example.js` to `config.js` and fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Then open `index.html` in a browser, or serve statically:

```bash
npx serve .
# or
python -m http.server
```

There are no tests, no linting config, and no CI pipeline.

### Supabase setup

The app expects a `links` table with row-level security. Run this once in the SQL editor of a new Supabase project:

```sql
create table links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  title text not null,
  note text default '',
  tags text[] default '{}',
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table links enable row level security;

create policy "users see own links"   on links for select using (auth.uid() = user_id);
create policy "users insert own links" on links for insert with check (auth.uid() = user_id);
create policy "users update own links" on links for update using (auth.uid() = user_id);
create policy "users delete own links" on links for delete using (auth.uid() = user_id);

create index links_user_position_idx on links(user_id, position);
```

In Authentication → Providers → Email, "Confirm email" should be off for instant signup (or leave on to require email verification).

## Architecture

Four files of code:

- **[index.html](index.html)** — markup: animated mesh background, sticky glassy navbar, collapsible search bar, responsive card grid, modal form, **auth overlay**, and **loading state**. Loads the Supabase JS SDK from a CDN, then `config.js`, then `app.js`.
- **[app.js](app.js)** — all runtime logic. Initialised via `DOMContentLoaded → init()`.
- **[style.css](style.css)** — all styling, no preprocessor. Design tokens in `:root` CSS variables.
- **[config.js](config.js)** *(gitignored)* — sets `window.LV_CONFIG` with Supabase project URL and anon key. Use [config.example.js](config.example.js) as a template.

### State model (app.js)

All state is module-level:

| Variable | Purpose |
|---|---|
| `links` | Array of link objects (camelCase: `createdAt`), populated from Supabase via `fetchLinks()` after sign-in |
| `currentUser` | The signed-in Supabase user object, or `null` |
| `supabase` | The Supabase client instance |
| `activeTag` | Currently selected tag filter (`'all'` or a tag string) |
| `searchQuery` | Current search string |
| `sortOrder` | Sort preference, persisted in `localStorage` under `ls_sort` (per-device, not per-user) |
| `modalTags` | Tags being built in the open modal |
| `tagColorMap` | `Map<string, cssClass>` — deterministic colour assignment per tag, session lifetime |

### Storage flow

Source of truth is Supabase. Each mutation makes an API call, then updates the in-memory `links` array, then calls `render()`. On failure it shows an error toast and does NOT touch local state — no optimistic updates in v1.

- **Boundary mapping**: DB columns are snake_case (`user_id`, `created_at`); the in-memory shape is camelCase. `rowToLink()` maps at the boundary so the rest of the app uses `link.createdAt` etc. unchanged.
- **`fetchLinks()`** — `select * from links order by position` (RLS scopes to the current user). Called on sign-in.
- **`addLink()`** — INSERT with `position = min(current) - 1` so new links sort to the top in custom order.
- **`updateLink()`** — UPDATE by id.
- **`deleteLink()`** — DELETE by id, after the card's exit animation.
- **`onDrop()` + `persistPositions()`** — drag-reorder rewrites every row's `position` to its new index in parallel.
- **`importLinks()`** — DELETEs all rows for the user, then bulk INSERTs the imported ones.

`localStorage` is used only for: (a) the Supabase JS client's session (handled internally by the SDK), and (b) the user's sort preference (`ls_sort`).

### Auth flow

- `init()` calls `supabase.auth.getSession()`. If there's no session, the auth overlay is shown.
- The auth overlay has a single email+password form that toggles between sign-in and sign-up modes via `setAuthMode()`.
- `supabase.auth.onAuthStateChange()` reacts to SIGNED_IN (call `onSignedIn` → fetch + render) and SIGNED_OUT (clear state, show overlay).
- Sign-out button is in the navbar; calls `supabase.auth.signOut()`.

### Key design decisions

- **`escHtml()`** is used on all user-supplied strings injected via `innerHTML`. Do not bypass it.
- Tag colour classes (`tag-violet`, `tag-pink`, …) are defined in CSS but all currently render identically (unified lime-on-dark theme). The class names are preserved for easy per-colour customisation.
- Favicon fetched from Google S2 service; falls back to an inline SVG data URI on error.
- Delete animation: card gets `.deleting` class → `animationend` event → server delete → array splice + re-render. If the server call fails the card is restored.
- Custom sort order is server-side via the `position` column; other sort orders (newest/oldest/title) are computed client-side from already-fetched data.

## Design system

Primary accent: `--accent: #d1fe17` (lime yellow). Background: near-black `#0a0a0a`. All interactive elements use the same glass/blur aesthetic. Responsive breakpoint at `600px`.
