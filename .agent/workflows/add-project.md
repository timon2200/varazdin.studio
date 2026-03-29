---
description: How to add a new project to the portfolio
---

# Add a New Project

## Steps

1. **Prepare the thumbnail image**
   - Save the image to `website/assets/images/` as a PNG
   - Recommended: 16:9 aspect ratio, ~1280x720px, under 1MB
   - Name it with a URL-safe slug: `project-name.png`

2. **Add the project data** in `website/scripts/data.js`
   - Add a new object to the `PROJECTS` array
   - Required fields:

   ```js
   {
     id: "unique-slug",
     title: "Project Title",
     subtitle: "Subtitle or Context",
     year: 2025,
     client: "Client Name",
     category: "documentary",  // see valid categories below
     type: "Human Readable Type",
     duration: "~3 min",
     director: "Timon Terzić",
     team: ["Timon Terzić"],
     thumbnail: "assets/images/project-name.png",
     heroImage: "assets/images/project-name.png",
     themeColor: "hsl(40, 55%, 18%)",  // warm, muted HSL
     tagline: "A single-line quote.",
     description: "Full paragraph description of the project.",
     awards: [],
     featured: false,
     badges: ["Tag1", "Tag2", "Tag3"],
     youtubeUrl: "https://www.youtube.com/watch?v=VIDEO_ID"  // or null
   }
   ```

3. **Choose a category**
   - Valid: `documentary`, `music-video`, `short-film`, `festival`, `event`, `immersive`, `institutional`, `campaign`
   - The project will appear in the matching category row automatically

4. **Set featured** (optional)
   - Set `featured: true` to include in the hero slideshow rotation
   - Keep featured count between 4-6 for best UX

5. **Verify**
   - Start the dev server: `npx -y serve -l 5173 -s ./website`
   - Check that the card appears in the correct category row
   - If featured, verify it appears in the hero rotation
   - Click the card to verify the expanded view works
   - If it has a YouTube URL, verify video playback

## Category → Row Mapping

| Category | Row Label |
|----------|-----------|
| `documentary` | Documentary & Portrait Films |
| `immersive` | Immersive Experiences |
| `short-film` | Historical Drama & Short Films |
| `festival`, `event` | Festival & Event Films |
| `music-video` | Music Videos |
| `institutional`, `campaign` | Institutional & Campaign |
