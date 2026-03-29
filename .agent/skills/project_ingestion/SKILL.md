---
name: Portfolio Project Ingestion
description: Skill for adding a new project or image to the portfolio when explicitly requested by the user.
---

# Portfolio Project Ingestion Skill

When the user gives you a new image, video, or asks to "add a new project", follow these steps systematically:

## 1. Process Assets
- If raw images (like `.jpeg` or `.png`) are provided, compress them to `.webp` format for web optimization using available tools (e.g. `cwebp` directly via command line). 
- Ensure the output path matches `assets/images/filename.webp`. 

## 2. Research & Context Gathering
- Check if the user provided external links (e.g. YouTube, Notion). Use the `read_url_content` tool to scan those links.
- Search the workspace's markdown files (especially in the `projects/` directory) for related project names to glean information like Timeline, Creative Direction Context, Phasing, or Key Deliverables. 
- You do NOT need to ask the user to explain everything; proactively find it.

## 3. Write Studio-Grade Copy
Using the `varazdin_studio_narration_assistant` tonal guidelines, write the copy for the new project entry:
- **Title & Subtitle**: Clear, punchy.
- **Tagline**: A single poetic line conveying the core emotion (e.g., "Every mountain holds a story older than its name.")
- **Description**: A ~40-50 word cinematic summary focusing on the narrative impact, not just technical lists. It should feel emotive.

## 4. Add to Project Data Base
- Read instructions in `.agent/workflows/add-project.md` to see the expected structure.
- Open `portfolio/src/data.js` and structure the newly gathered information as a JavaScript object.
- Append it to the `export const PROJECTS` array using the `multi_replace_file_content` tool. 
- Ensure all expected fields are correctly placed (`id`, `title`, `thumbnail` pointing to the new .webp, `themeColor`, `category`, and `youtubeUrl` if a video exists).
