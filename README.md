# Final XI

**Draft 11 legends. Conquer Europe.**

Final XI is a browser game where you draft a squad of football icons into a
formation, arrange them into their real positions, build chemistry and tactical
synergies, then simulate a full European run — an 8-match **League Phase**
followed by a possible **Knockout Play-Off** and the knockout rounds
(Round of 16 → Quarter-final → Semi-final → Final) — and share your result.

It includes a **Daily Challenge** (everyone gets the same seeded draft each day),
**Random Run**, three difficulties, two player pools (Legends Only / Modern Mix),
3 rerolls per draft, transparent scoring, a generated PNG share card, and local
stats tracking.

## Tech stack

- **React 18** + **Vite 6** (single-page app)
- **Tailwind CSS 3** (dark, premium theme; no UI framework)
- **PostCSS** + **Autoprefixer**
- 100% **frontend-only** — no backend, no accounts, no database, no network
  calls. All state (stats) lives in `localStorage`; the share card PNG is drawn
  client-side with the Canvas API.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default `http://localhost:5173`).

## Build

```bash
npm run build
```

The optimized static site is written to the **`dist/`** folder.

Preview the production build locally:

```bash
npm run preview
```

## Deployment

The app is a static, frontend-only site — deploy the **`dist/`** folder to any
static host. No server, environment variables, or runtime configuration are
required.

The Vite `base` is set to `'./'` (relative paths), so the build works whether it
is served from a root domain or a subfolder.

**Recommended platforms** (any works):

- **Vercel / Netlify / Cloudflare Pages** — set the build command to
  `npm run build` and the output/publish directory to `dist`.
- **GitHub Pages** — push the contents of `dist/` to your Pages branch.
- Any static file server / CDN / S3 bucket.

Because the app has no client-side router, no SPA rewrite/redirect rules are
needed.

## Project structure

```
final-xi/
├── index.html          # entry HTML + meta/OG tags
├── vite.config.js      # Vite config (base: './')
├── tailwind.config.js  # theme tokens (colors)
├── postcss.config.js
└── src/
    ├── main.jsx        # React entry
    ├── App.jsx         # all screens + flow (intro → draft → set XI → bonuses → sim → result)
    ├── data.js         # players, scoring, eligibility, simulation engine, stats
    ├── share.js        # share text + PNG share-card generation
    └── index.css       # Tailwind + animations (with prefers-reduced-motion)
```

## Notes

- No images, logos, player photos, or club badges are used.
- No real-competition branding is referenced anywhere in the UI or share output.
