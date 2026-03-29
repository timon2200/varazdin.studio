---
description: How to start/stop the local development server
---

# Dev Server

The website is a static site served directly from the `website/` directory.

## Start the server

```bash
npx -y serve -l 5173 -s "./website"
```

// turbo

This starts a local server at `http://localhost:5173`.

## Stop the server

Press `Ctrl+C` in the terminal running the server, or kill the process.

## Notes

- The `-s` flag enables single-page app mode (all routes → index.html)
- Port 5173 is used by convention (matches Vite default)
- No build step required — all files are served as-is
- Changes to HTML/CSS/JS take effect on page refresh (no hot reload)
