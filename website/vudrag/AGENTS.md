# Spatial Moodboard — agent workspace

This folder is a standalone, dependency-free spatial moodboard. Read
`ARCHITECTURE_RULES.md` before changing interaction or visual behavior. Its
zero-UI rule takes precedence over the presentation-deck controls described in
the parent `AGENTS.md`.

## Source map

- `index.html`: canvas, command palette, camera, media cards, lightbox, and client API calls.
- `api/board.php`: production API. Treat its response shapes as canonical.
- `api/services/`: persistence, media processing, link resolution, and archive export.
- `dev_server.js`: local preview. It must mirror the production API contract.
- `data/default_board.json`: seed composition; `data/boards/*.json` can contain live edits.
- `assets/boards/`: self-contained media for the non-Vudrag starter boards.

## Design and interaction rules

- The canvas contains imagery only. No persistent buttons, titles, badges, counters,
  hints, or toolbars over media.
- **Pure Ghost Text for Status / Actions:** Never use floating toast cards, pill badges, or background containers. Status feedback is rendered as pure, borderless ghost text in the corner with dynamic `⌘Z` undo cues (`rgba(255, 255, 255, 0.45)`, 13px, sans-serif).
- **Standardized Command Palette:** 480px max-width, frosted acrylic glass (`rgba(13, 15, 18, 0.82)`, `backdrop-filter: blur(28px)`), 1px hairline border (`rgba(255, 255, 255, 0.09)`), 20px radius, 14px item font, 11px monospace shortcut keycaps (`⌘N`, `⌘I`, `⌘V`), and luminous active selection pill (`rgba(56, 189, 248, 0.32)`).
- Space or Command-K opens the command palette. On touch screens, hold the
  canvas to open it; drag to pan or move a card, pinch to zoom, and double tap a
  card to open it.
- Every new canvas action gets a searchable palette command and keyboard path.
- Keep cards visually clean. Use size, crop, contrast, and spacing for hierarchy.
  Preserve intentional negative space without opening on an empty viewport.
- Do not overwrite a user's saved board positions while changing seed composition.
- Escape user supplied text before inserting HTML. Validate IDs and external URLs.

## API contract

- `GET ?action=get&board=ID` returns `{status, boardId, board: {items, positions}}`.
- `POST ?action=create_board` with `{title}` returns `{status, board: {id}}`.
- `POST ?action=delete_board&board=ID` deletes that custom board.
- `POST ?action=upload&board=ID` returns `{status, item}`.
- `POST ?action=reset_positions&board=ID` clears saved positions, preserving items.

Check new work against both the local preview and the PHP endpoint. The local
Node server is a preview adapter, not the source of truth. Before deploying,
review access control: the current production write API has no authentication.
