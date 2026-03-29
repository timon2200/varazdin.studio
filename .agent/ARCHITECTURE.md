# Studio Varaždin — Website Architecture

> This document is the primary reference for any AI agent working on this codebase.  
> Read this FIRST before making any changes.

## Project Overview

A cinematic portfolio website for **Studio Varaždin** (operating as Lotus RC d.o.o.), directed by **Timon Terzić**. Built as a **static site** with vanilla HTML/CSS/JS — no build tools, no bundler, no framework.

Served locally via:
```bash
npx -y serve -l 5173 -s ./website
```

---

## Directory Structure

```
varazdin.studio/
├── .agent/                          # AI agent config & docs
│   ├── skills/                      # Agent skills
│   │   └── narration_assistant/     # Creative writing skill
│   ├── workflows/                   # Step-by-step workflows
│   │   ├── dev-server.md
│   │   ├── add-project.md
│   │   └── add-section.md
│   ├── ARCHITECTURE.md              # ← YOU ARE HERE
│   └── CONVENTIONS.md               # Coding patterns & naming
│
├── website/                         # THE WEBSITE (static site root)
│   ├── index.html                   # Single-page entry point
│   │
│   ├── styles/                      # CSS (order matters)
│   │   ├── tokens.css               # Design tokens, reset, utilities
│   │   ├── nav.css                  # Navigation signboard header
│   │   ├── hero.css                 # Hero slideshow section + buttons
│   │   ├── catalogue.css            # Category rows + ambient glow
│   │   ├── cards.css                # Project cards + Netflix hover
│   │   ├── modal.css                # Legacy modal (retained)
│   │   ├── player.css               # Expanded view + video player UI
│   │   ├── footer.css               # Footer + about section + gold rule
│   │   └── responsive.css           # All @media queries
│   │
│   ├── scripts/                     # JS (order matters)
│   │   ├── data.js                  # Project data, ROWS, FEATURED
│   │   ├── animations.js            # fogLift, wordStagger, springPop
│   │   ├── hero.js                  # Hero slideshow logic
│   │   ├── catalogue.js             # Row building, cards, drag scroll
│   │   ├── player.js                # Expanded view, YouTube, controls
│   │   ├── nav.js                   # Navigation scroll + hamburger
│   │   ├── scroll-effects.js        # IntersectionObserver, ambient glow
│   │   └── main.js                  # Orchestrator: state, DOM refs, init
│   │
│   └── assets/
│       └── images/                  # Project thumbnails (PNG)
│
├── portfolio/                       # Separate Vite-based portfolio app (legacy)
└── projects/                        # Markdown project files from Notion
```

---

## Script Load Order & Dependencies

Scripts are loaded via `<script>` at the end of `<body>`. Order is **critical**:

```
1. YouTube IFrame API (external)
2. data.js        → defines PROJECTS, ROWS, FEATURED, CATEGORY_LABELS
3. animations.js  → defines fogLift(), wordStagger(), springPop()
4. hero.js        → uses data.js + animations.js globals
5. catalogue.js   → uses data.js + main.js globals (PLAY_ICON, etc.)
6. player.js      → uses data.js + main.js globals
7. nav.js         → uses main.js globals (nav DOM ref)
8. scroll-effects.js → standalone (queries DOM directly)
9. main.js        → defines shared state & DOM refs, wires events, calls init()
```

### Shared Globals (defined in main.js, used cross-module)

| Variable | Type | Used By |
|----------|------|---------|
| `heroIndex` | number | hero.js |
| `heroTimer` | interval ID | hero.js |
| `activeProject` | object/null | player.js, main.js |
| `activeCard` | element/null | player.js |
| `isDragging` | boolean | catalogue.js |
| `nav` | DOM element | nav.js |
| `heroSlidesEl` | DOM element | hero.js |
| `heroContentEl` | DOM element | hero.js |
| `heroDots` | DOM element | hero.js |
| `heroTint` | DOM element | hero.js |
| `catalogue` | DOM element | catalogue.js |
| `expandedView` | DOM element | player.js, main.js |
| `expandedMedia` | DOM element | player.js |
| `expandedGlass` | DOM element | player.js |
| `PLAY_ICON` | SVG string | catalogue.js |
| `CHEVRON_LEFT` | SVG string | catalogue.js |
| `CHEVRON_RIGHT` | SVG string | catalogue.js |
| `CATEGORY_LABELS` | object | hero.js, catalogue.js, player.js |

---

## CSS Architecture

### Design Tokens (`tokens.css`)

All visual values are defined as CSS custom properties:

| Category | Examples |
|----------|---------|
| Colors | `--gold-deep`, `--gold-mid`, `--green-void`, `--cream` |
| Typography | `--font-display` (Cinzel Decorative), `--font-heading` (Cinzel), `--font-body` (Cormorant Garamond), `--font-ui` (Inter) |
| Spacing | `--page-pad`, `--card-gap`, `--section-gap`, `--hero-height` |
| Shadows | `--shadow-card`, `--shadow-hover`, `--shadow-modal` |
| Transitions | `--ease-cinematic`, `--ease-entrance`, `--t-fast/normal/slow` |
| Z-index | `--z-base(1)`, `--z-card-hover(100)`, `--z-nav(500)`, `--z-modal(900)` |

### Partial Load Order (in `index.html`)

```
tokens.css → nav.css → hero.css → catalogue.css → cards.css →
modal.css → player.css → footer.css → responsive.css
```

`responsive.css` MUST be last — it overrides component styles at breakpoints.

---

## Key Patterns

### Animation System
Three reusable animation functions in `animations.js`:
- **`fogLift(el, opts)`** — blur + fade + translateY reveal (returns Promise)
- **`wordStagger(el, opts)`** — word-by-word text reveal
- **`springPop(el, opts)`** — bouncy scale-in for badges

### Netflix Card Hover
Uses `:has()` CSS selector for sibling accommodation:
- Hovered card scales to 1.35×
- Cards before shift left 48px
- Cards after shift right 48px

### View Transitions API
Used for smooth card → expanded view morphing. Gracefully falls back to instant DOM swap if unsupported.

### YouTube Integration
Uses the IFrame API with custom player controls overlay. Video autoplays muted, with scrubber synced at 250ms intervals.

### Idle Fade
After 3.5s of mouse inactivity on the expanded view, player controls fade out (`player-idle` class) and cursor hides.

---

## Data Schema

Each project in `data.js` follows this shape:

```js
{
  id: string,           // URL-safe unique slug
  title: string,        // Project display name
  subtitle: string,     // Subtitle / tagline pair
  year: number,
  client: string,
  category: string,     // 'documentary' | 'music-video' | 'short-film' | etc.
  type: string,         // Human-readable type label
  duration: string,
  director: string,
  team: string[],
  thumbnail: string,    // Relative path to image
  heroImage: string,    // Relative path to image
  themeColor: string,   // HSL string for hero tint
  tagline: string,      // One-line quote
  description: string,  // Full paragraph
  awards: string[],
  featured: boolean,    // Shows in hero rotation
  badges: string[],
  youtubeUrl: string | null
}
```

---

## Known Issues

- **Missing images**: 7 thumbnails referenced in `data.js` don't exist on disk (`advent-sonica.png`, `dvorista-sjevera.png`, `foi-promo.png`, `carobni-grad.png`, `irma-dora.png`, `stefany-eden.png`, `stare-fotke.png`)
- **Modal CSS retained**: The old modal styles in `modal.css` are unused in the current UI (replaced by expanded view) but retained for potential future use
