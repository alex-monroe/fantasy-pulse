---
description: Start the Next.js dev server on port 9002
---

Start the dev server (Turbopack, port **9002**, not 3000):

```bash
npm run dev
```

Open http://localhost:9002 to view the app.

If the port is already in use, check whether a previous `npm run dev`
is still attached to the terminal session before killing anything —
Playwright reuses an existing server outside of CI.
