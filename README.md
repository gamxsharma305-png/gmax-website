# GMAX

Website version of GMAX. Deploy this folder to **Vercel**. After deploy, use the Vercel URL in Web2APK.

This zip **includes `index.html` at the project root** — that is what Vercel needs. Do not upload the old Expo / React Native zip.

## Deploy on Vercel (no terminal)

1. Unzip this file. You should see `index.html`, `package.json`, `vercel.json`, `src/`, `public/`, `api/`.
2. Create a new GitHub repository and upload **all files inside the unzipped folder** (not the zip itself).
3. Go to [vercel.com](https://vercel.com) → **Add New** → **Project** → import that GitHub repo.
4. Vercel settings (usually auto-detected):
   - Framework: **Vite**
   - Build command: `npm run build`
   - Output: `dist`
5. Click **Deploy**.
6. Copy the live URL (example: `https://gmax.vercel.app`).
7. Paste that URL into Web2APK (website URL mode — not Zip2APK).

App name in the browser tab is **GMAX**, not `undefined`.

## What is in this project

- `index.html` — required by Vercel and Web2APK
- `src/` — the same GMAX music player UI
- `api/` — search on the server (YouTube + iTunes)
- `public/` — icons, favicon, share image

Liked songs, playlists, and history stay on the phone/browser. No login.
