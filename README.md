# Cafe Inventory Tracker

A phone app for the cafe kitchen's stock list. Staff mark each item **Out**, **Low** or **Good**, and the GM uses the Dashboard as a shopping list.

- **Live app:** https://delgadowrites.github.io/cafe-inventory/
- **Printable QR code for the wall:** https://delgadowrites.github.io/cafe-inventory/qr.html
- **PRD:** [docs/PRD.md](docs/PRD.md)
- **Launch checklist:** [docs/launch-checklist.md](docs/launch-checklist.md)

## What it does

- Opens straight to the **Count** tab, with no login. Every kitchen item is listed under its category heading, in shelf order.
- Each item has **Out / Low / Good** buttons and shows how long ago it was last updated ("just now", "15m ago", "2h ago", "3d ago").
- A tap is saved to the database first. The highlight moves only when the save worked. If it didn't (bad wifi), the item says **"Didn't save, tap again"**.
- The **Count** list reloads whenever it comes back into view: when the phone returns to the page (from another app, or after unlocking) and when you switch from Dashboard back to Count. Items being saved, or showing "Didn't save", are left as they are. If the reload fails, the list stays and a yellow bar says it couldn't be refreshed, with a **Try again** button.
- The **Dashboard** tab lists everything that's **Out** (red), then **Low** (yellow), then **Good** (green), grouped by category. It loads fresh every time you open it, and **Refresh** reloads it.
- Every phone sees the same statuses: the database is the one source of truth.

## How to use it

### Kitchen staff (end of shift)
1. Scan the QR code on the wall. The app opens on **Count**.
2. Walk the shelves in order and tap **Out**, **Low** or **Good** for each item.
3. If an item is still fine, tap **Good** again anyway. That refreshes its time, so the GM knows it was checked tonight.
4. If you see **"Didn't save, tap again"**, tap the same button again. Wait for the ✓ to move before going on.

### GM (shopping and restocking)
1. Open the app and tap **Dashboard**. Out items are at the top, then Low.
2. Use it as the shopping list. Tap **Refresh** if staff are updating while you look.
3. After restocking, go to **Count** and tap **Good** on each restocked item.

## Adding, removing or renaming items

The app can only change an item's **status**. Items themselves are managed in Supabase: project **cafe-inventory** → **Table Editor** → `items`.

**`sort_order` sets the shelf order.** Items are numbered in steps of 10 (10, 20, 30...), and categories appear in the order of their first item.

| To... | Do this |
|---|---|
| **Add an item** | Insert a row. Fill in `name` and `category` (spelled exactly like the existing category, e.g. `Dairy`), and a `sort_order` between the two items it sits between on the shelf (e.g. `75` between `70` and `80`). Leave `status` and `updated_at` empty: they default to `good` and now. Leave `id` empty too, so the Table Editor generates it. |
| **Remove an item** | Delete its row. |
| **Rename an item** | Edit `name`. |
| **Move an item** | Change its `sort_order`. |
| **Add a category** | Add an item with the new category name and a `sort_order` where that shelf section starts. |

Changes show up when the app is reloaded (Count) or the Dashboard is opened or refreshed.

## How it's built

- Plain HTML, CSS and JavaScript with no build step, hosted on **GitHub Pages** from the `main` branch.
- **supabase-js** is loaded from the jsDelivr CDN, **pinned to version 2.119.2** in `index.html`, so the app only changes when we choose to update it. To update, change the version in the `<script>` tag, then retest on a phone (items load, a tap saves, the Dashboard loads, airplane mode shows "Didn't save, tap again").
- **Supabase** (Postgres) stores the `items` table. The page signs in **anonymously** in the background, only when the browser has no saved session, so each phone is one anonymous user.
- Only the **publishable** key is in the front-end code. What a visitor can do is limited by the database permissions below. Never put a secret key (`sb_secret_...`) in this repo.

| File | What it is |
|---|---|
| `index.html` | Page structure: tabs, Count list, Dashboard |
| `script.js` | Sign-in, loading, saving, Dashboard, "X ago" times (commented section by section) |
| `style.css` | Phone-first, high-contrast styles; status colors are CSS variables at the top |
| `qr.html` | Printable QR code sign |
| `sql/` | Database changes, run in order in the Supabase SQL Editor |

### Database permissions (`sql/`)
| File | What it does |
|---|---|
| `00-schema.sql` | **New projects only.** Creates the `items` table (status check: out / low / good), turns on RLS, adds the read policy, and inserts the 46 items. Already done on the live project; see "Rebuild the database from scratch" below. |
| `01-grant-read.sql` | Signed-in users can **read** `items` |
| `02-update-status.sql` | Signed-in users can **update the `status` column only**, through an RLS update policy, plus a trigger that sets `updated_at` to the database time |
| `03-keep-manual-updated-at.sql` | The trigger keeps an `updated_at` typed in by hand (for testing). App taps still get the database time. |
| `04-revoke-extra-privileges.sql` | **Live project.** Removes TRUNCATE, REFERENCES and TRIGGER from app users (leftovers the app never used), so they can only read and change status. Not needed for a rebuild: `00` never grants them. |

Row Level Security is on. There are no insert or delete permissions for app users: items are only added or removed in the Table Editor.

### Rebuild the database from scratch
If the Supabase project is ever lost or paused for good, everything can be rebuilt from this repo:

1. Create a **new** Supabase project (free tier).
2. Turn on anonymous sign-ins: **Authentication** → **Sign In / Providers** → **Allow anonymous sign-ins**.
3. In the **SQL Editor**, run the files in `sql/` in order, one at a time: `00-schema.sql`, `01-grant-read.sql`, `02-update-status.sql`, `03-keep-manual-updated-at.sql`. After `00`, its check queries should show 46 items in 10 categories.
4. Copy the new project's URL and **publishable** key (**Project Settings** → **API Keys**) into `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` at the top of `script.js`, then commit to `main`.
5. Retest: items load, a tap saves, the Dashboard loads.

Every item starts as **Good** in the new project, so do a full walk to set the real statuses. Never run `00-schema.sql` on the live project: it would stop at "relation items already exists" and change nothing.

### Run it locally
Serve the folder with any static server and open http://localhost:8000:

```bash
python3 -m http.server 8000
```
