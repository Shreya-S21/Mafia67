# 🚀 Deployment Guide

The app reads Firebase keys **only** from environment variables (never hardcoded).
Set them on your hosting platform after pushing to GitHub.

## 🔑 The 6 required env vars

All are prefixed with `VITE_` so Vite exposes them to the browser at build time:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

Get them from: **Firebase Console → Project Settings → Your apps → Web app → Firebase SDK snippet (config object)**.

---

## Vercel

1. Push repo to GitHub.
2. Go to https://vercel.com/new → import your repo.
3. Framework = **Vite** (auto-detected).
4. Before clicking Deploy, open **Environment Variables**.
5. Add all 6 `VITE_FIREBASE_*` keys.
6. Click **Deploy**.

To edit later: **Project → Settings → Environment Variables**.

---

## Netlify

1. Push repo to GitHub.
2. Go to https://app.netlify.com → **Add new site → Import from Git**.
3. Build command: `npm run build` · Publish directory: `dist`.
4. Open **Advanced build settings → Environment variables**.
5. Add all 6 `VITE_FIREBASE_*` keys.
6. Deploy.

To edit later: **Site settings → Environment variables**.

---

## GitHub Pages (via Actions)

Add a `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install
      - run: npm run build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
```

Then add the 6 keys under **GitHub repo → Settings → Secrets and variables → Actions**.

---

## Local development

For local dev, either:

- **Demo mode** (no Firebase needed) — just `npm run dev` with an empty `.env`.
- **Real Firebase** — create a `.env` file with your keys (git-ignored, never committed):

```bash
cp .env.example .env
# fill in your real VITE_FIREBASE_* values
npm run dev
```

---

## ⚠️ Security notes

- `VITE_` prefixed keys are embedded into the client bundle — **Firebase API keys are designed for this**. Lock them down via:
  - Firebase Console → Authentication → Authorized domains
  - Google Cloud Console → API restrictions (limit API key to your domain)
- **Never** commit your `.env` file. It's already in `.gitignore`.
- The real security boundary is **Firebase Security Rules** + **Firebase Admin SDK** on the server.
