# Studio Varaždin — Coding Conventions

> Follow these patterns when making any changes to the website codebase.

## CSS

### Naming
- **Component-element pattern**: `.component-element` (e.g., `.hero-title`, `.card-info`, `.player-back-btn`)
- State classes: `.is-active`, `.in-view`, `.scrolled`, `.dragging`, `.player-idle`
- Modifier via context: `.project-card:hover .card-play` (not BEM `--modifier`)

### Colors
- **Always use tokens** — never hardcode hex/rgb/hsl except in `tokens.css`
- Gold palette: `--gold-deep` → `--gold-mid` → `--gold-bright` → `--gold-foil`
- Green palette: `--green-void` → `--green-deep` → `--green-dark` → `--green-mid`
- Text hierarchy: `--white` → `--cream` → `--cream-dim` → `--cream-muted`

### Typography
- Display titles → `var(--font-display)` — Cinzel Decorative
- Section headings → `var(--font-heading)` — Cinzel
- Body text → `var(--font-body)` — Cormorant Garamond
- UI labels, badges, buttons → `var(--font-ui)` — Inter

### Spacing
- Page padding: `var(--page-pad)` (4vw desktop, 16px mobile)
- Section gaps: `var(--section-gap)` (56px)
- Card gap: `var(--card-gap)` (8px)

### Transitions
- Use tokens: `var(--t-fast)` (180ms), `var(--t-normal)` (300ms), `var(--t-slow)` (500ms)
- Easing: `var(--ease-cinematic)` for UI, `var(--ease-entrance)` for reveals

### Responsive
- All breakpoints go in `responsive.css` — never inline media queries in component files
- Breakpoints: `900px` (tablet), `600px` (mobile)
- Landscape override at `(orientation: landscape) and (max-width: 900px)`

### New Component Checklist
1. Create `styles/component.css`
2. Add `<link>` in `index.html` BEFORE `responsive.css`
3. Add any responsive overrides to `responsive.css`

---

## JavaScript

### Module Structure
Each JS file is a self-contained concern with a `'use strict'` declaration. No ES module imports — all communication happens via globals defined in `main.js`.

### Naming
- Builder functions: `build*()` — `buildHero()`, `buildCatalogue()`, `buildCard()`
- Initializers: `init*()` — `initNav()`, `initScrollObserver()`, `initAmbientScroll()`
- Toggle/action: `togglePlay()`, `toggleMute()`, `closeProject()`, `openProject()`
- Internal helpers: `startHeroTimer()`, `resetIdleTimer()`, `showCenterPulse()`

### Event Handling
- Add event listeners in `initGlobalEvents()` (main.js) for global concerns
- Add component-specific listeners within the component's own file
- Use `?.addEventListener()` for optional elements

### Animation Usage
```js
// Fog lift — returns a Promise
await fogLift(element, { duration: 700, delay: 200, y: 14, blur: 10 });

// Word stagger — synchronous
wordStagger(paragraph, { delay: 0, wordDelay: 38, duration: 480 });

// Spring pop — synchronous
springPop(badge, { delay: 300 });
```

### Adding a New Module
1. Create `scripts/module-name.js` with `'use strict'`
2. Add `<script>` in `index.html` BEFORE `main.js`
3. If it needs shared state, use globals from `main.js`
4. Add entry function and call it from `init()` in `main.js`

---

## HTML

### Section Pattern
```html
<!-- ══════════════════════ SECTION NAME ══════════════════════ -->
<section id="section-id" aria-label="Section description">
  <!-- Content -->
</section>
```

### Accessibility
- All interactive elements need unique `id` attributes
- Use `aria-label` on landmark sections
- Cards use `role="button"` and `tabindex="0"`
- Support keyboard navigation (Enter/Space to open, Escape to close)

---

## Data

### Adding a New Project
See workflow: `.agent/workflows/add-project.md`

### Category Tags
Valid categories: `documentary`, `music-video`, `short-film`, `festival`, `event`, `immersive`, `institutional`, `campaign`

### Featured Projects
Set `featured: true` in the project object to include it in the hero rotation. Keep this to 4–6 projects maximum for good UX.
