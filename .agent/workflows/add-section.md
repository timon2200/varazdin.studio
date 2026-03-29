---
description: How to add a new page section to the website
---

# Add a New Section

## Steps

1. **Create the CSS partial**
   - Create `website/styles/section-name.css`
   - Use design tokens from `tokens.css` for all values
   - Follow naming convention: `.section-element` pattern
   - Do NOT add media queries here — those go in `responsive.css`

2. **Add the CSS link to `index.html`**
   - Add `<link rel="stylesheet" href="styles/section-name.css">` 
   - Place it BEFORE `responsive.css` (which must always be last)

3. **Add the HTML section to `index.html`**
   - Follow the section pattern:
   ```html
   <!-- ══════════════════════ SECTION NAME ══════════════════════ -->
   <section id="section-id" aria-label="Section description">
     <!-- Content -->
   </section>
   ```
   - Place it in the correct position within the page flow

4. **Create the JS module** (if needed)
   - Create `website/scripts/section-name.js`
   - Start with `'use strict';`
   - Define a `buildSectionName()` or `initSectionName()` function
   - Add `<script src="scripts/section-name.js"></script>` in `index.html` BEFORE `main.js`
   - Call the init function from `init()` in `main.js`

5. **Add responsive overrides**
   - Add any breakpoint-specific styles to `responsive.css`
   - Use existing breakpoints: `900px` and `600px`

6. **Update ARCHITECTURE.md**
   - Add the new files to the directory structure diagram
   - Document any new shared globals or dependencies

7. **Verify**
   - Reload page, check the section renders correctly
   - Test at all breakpoints (desktop, tablet, mobile)
   - Verify scroll animations work if applicable
   - Check browser console for errors
