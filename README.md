# My Apps — starting with **Splitsy** 💸

One website, many apps. Each app has its **own URL, name and homescreen icon**:

| App | URL | Homescreen icon |
|---|---|---|
| Hub (list of apps) | `/` | — |
| **Splitsy** | `/splitsy/` | Buddy (green guy) |
| Your next app | `/next-app/` | its own icon |

When someone opens `/splitsy/` and taps **Add to Home Screen**, the phone reads Splitsy's own
`manifest.webmanifest` + `apple-touch-icon`, so it shows the Splitsy logo and opens straight into Splitsy.
Another app at another path gets its own manifest/icon, so it shows up as a separate app.

---

## 1. Run it

```bash
npm install
npm run dev
```

Open the "Network" URL Vite prints (e.g. `http://192.168.1.5:5173/splitsy/`) on your phone (same Wi-Fi).

With no Supabase keys it runs in **Demo mode**: everything works, but it's saved on that one phone only.

> Camera & location need **HTTPS** on phones (localhost is fine on desktop). For real phone testing,
> deploy it (step 3), or run `npx vite --host` behind a tunnel like ngrok/cloudflared.

## 2. Turn on accounts + shared groups (Supabase, free)

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** → paste all of `supabase/schema.sql` → **Run**. (Creates tables, security rules, photo bucket, live updates.)
3. **Authentication → Sign In / Providers → Email**: turn **off** "Confirm email" so sign-up is instant.
4. **Project Settings → API**: copy the URL and the `anon` key.
5. `cp .env.example .env` and paste them in:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
6. Restart `npm run dev`. The Demo badge disappears, and invite links now work across phones.

## 3. Deploy (Vercel or Netlify)

- Build command: `npm run build` · Output folder: `dist`
- Add the two `VITE_SUPABASE_*` env vars in the host's settings.
- No rewrite rules needed (Splitsy uses `#/` links like `/splitsy/#/join/ABCD2345`).

---

## What Splitsy does

- **Accounts**: name → selfie (front camera) → email + password.
- **Groups**: pick a name, mascot and currency (₱ by default). **Anyone with the invite link can join**.
  If they're not signed up yet, they sign up first and are dropped right back into the group.
- **Add expense, assistant style (7 quick steps)**
  1. 📸 Snap a photo → **on-device AI (MobileNet)** suggests what it is, e.g. *Pizza · Food*.
     If GPS finds a named place, it combines them, e.g. *Pizza Hut Restaurant*.
  2. Confirm/edit the name + category
  3. Amount (with "₱x each" preview)
  4. **Who paid**
  5. **Who's splitting**: equal or custom amounts (always adds up to the exact centavo)
  6. **Cash or card**, **online or in person**, auto **location** (OpenStreetMap), auto **date & time**, extra photos (receipts), note
  7. Review → Save → gets a **unique ID** like `SPL-7F3K9Q`
- **Group dashboard**
  - Total spending, your balance, friendly assistant tip
  - KPIs: your share, you paid, # of transactions, average bill, top spender, top category
  - 14-day spending chart, category breakdown, cash vs card, online vs in person
  - **Who owes who** (simplified to the fewest payments) + one-tap **Settle up**
  - Activity feed by day → tap for details (photo gallery, ID, map link, split per person, delete)
- **Live updates**: when a friend adds an expense, your screen refreshes on its own (Supabase Realtime).

## Project structure

```
index.html                     ← hub page listing all apps
splitsy/index.html             ← Splitsy entry (links its own manifest + icons)
public/apps/splitsy/           ← Splitsy icons, manifest, mascot stickers
public/splitsy/sw.js           ← Splitsy service worker (installable / offline shell)
src/splitsy/
  App.jsx  auth.jsx  main.jsx  index.css
  lib/        api (cloud + demo), ai, geo, balances, format, router, …
  components/ ui kit (Mascot, Assistant bubble, Avatar, Sheet, …) + icons
  screens/    Welcome, SignUp, SignIn, Home, CreateGroup, Invite, Join,
              Group, AddExpense, ExpenseDetail, Profile
supabase/schema.sql            ← database setup
media/                         ← original sticker artwork
```

## Adding your next app

1. Create `my-app/index.html` (copy `splitsy/index.html` and change the title, manifest and icon paths).
2. Create `public/apps/my-app/manifest.webmanifest` with `"id"`, `"start_url"` and `"scope"` set to `/my-app/`, plus its icons.
3. Put its code in `src/my-app/`.
4. Add it to `build.rollupOptions.input` in `vite.config.js` and to the hub's `index.html`.

## Packages (kept lean on purpose)

- `react`, `react-dom`
- `tailwindcss` v4 + `@tailwindcss/vite`
- `@supabase/supabase-js` (auth, database, storage, realtime)
- `@tensorflow/tfjs` + `@tensorflow-models/mobilenet` (photo recognition, loaded **only** when you scan)

No router, icon or animation libraries. Those are built in, so the app loads fast on mobile data.

Artwork: "70s groovy elements" by Vecteezy (license in `media/`).
