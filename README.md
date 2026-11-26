# Cafe Inventory Tracker

A phone app for the cafe's stock lists: one for the kitchen, one for the barista station (front of house, FOH). Staff mark each item **Out**, **Low** or **Good**, and the GM uses each list's Dashboard as a shopping list.

- **Kitchen list:** https://delgadowrites.github.io/cafe-inventory/
- **Front-of-house list:** https://delgadowrites.github.io/cafe-inventory/?area=foh
- **Printable QR signs:** kitchen wall https://delgadowrites.github.io/cafe-inventory/qr.html, barista station https://delgadowrites.github.io/cafe-inventory/qr.html?area=foh
- **PRD:** [docs/PRD.md](docs/PRD.md)
- **Launch checklist:** [docs/launch-checklist.md](docs/launch-checklist.md)

## What it does

- **Two lists in one app.** The link decides which one: no `?area` opens **Kitchen Inventory**, `?area=foh` opens **Front of House Inventory**. Each list shows only its own items, plus the **Shared** items (Salt, Black Pepper, Honey: one container each, used by both teams) under a "Shared" heading at the bottom. A Shared item has **one status**: a tap in either list shows in the other after a refresh. A mistyped link (e.g. `?area=bar`) shows an "Unknown area" screen with links to both lists, and loads and saves nothing.
- Opens with no login. **Each phone reopens on the tab it was last on** (Count or Dashboard); a phone opening it for the first time starts on **Count**. Only the tab is remembered, on that phone, and separately for each list. Every item in the list is listed under its category heading, in shelf order.
- Each item has **Out / Low / Good** buttons and shows how long ago it was last updated ("just now", "15m ago", "2h ago", "3d ago").
- A tap is saved to the database first. The highlight moves only when the save worked. If it didn't (bad wifi), the item says **"Didn't save, tap again"**.
- The **Count** list reloads whenever it comes back into view: when the phone returns to the page (from another app, or after unlocking) and when you switch from Dashboard back to Count. Items being saved, or showing "Didn't save", are left as they are. If the reload fails, the list stays and a yellow bar says it couldn't be refreshed, with a **Try again** button.
- The **Dashboard** tab lists everything that's **Out** (red), then **Low** (yellow), then **Good** (green), grouped by category. It loads fresh every time you open it, **Refresh** reloads it, and it reloads by itself when the phone comes back to the page (like Count). If that reload fails, the list stays and the same yellow "Couldn't refresh" bar appears.
- **Headings fold.** On **Count**, tap a category heading to collapse or expand it. Every heading shows a summary, e.g. "Dairy (6) · 1 Out · 2 Low", so a collapsed category never hides a problem. If a save in that category failed, the heading also flags it in red, e.g. "Dairy (6) · 1 Out · **1 didn't save**", until the retry saves. On the **Dashboard**, **Good** starts collapsed ("Good (38) ▸") and Out and Low start open; tap any heading to open or close it.
  - What's open or closed is never saved on the phone. Reloading the page, or switching tabs, puts the tab you open back to its defaults (Count: all expanded; Dashboard: Good closed). Leaving the app and coming back keeps everything as it was, including where you'd scrolled to.
- Every phone sees the same statuses: the database is the one source of truth.

## How to use it

### Kitchen staff (end of shift)
1. Scan the QR code on the wall. The app opens on **Count** (it reopens on the tab your phone used last, so tap **Count** if it shows the Dashboard).
2. Walk the shelves in order and tap **Out**, **Low** or **Good** for each item. When a shelf is done, you can tap its category heading to fold it away.
3. If an item is still fine, tap **Good** again anyway. That refreshes its time, so the GM knows it was checked tonight.
4. If you see **"Didn't save, tap again"**, tap the same button again. Wait for the ✓ to move before going on.

### Baristas (front of house)
1. Scan the QR code at the barista station. It opens **Front of House Inventory**.
2. The rest is the same as the kitchen walk above: tap **Out**, **Low** or **Good** for each item, tap **Good** again on items that are still fine, and re-tap if you see **"Didn't save, tap again"**.
3. Salt, Black Pepper and Honey are under **Shared** at the bottom. The kitchen sees the same status for them.

### GM (shopping and restocking)
1. Open the list you're shopping for (kitchen or front of house) and tap **Dashboard**. Each list has its own Dashboard, with the Shared items in both. Out items are at the top, then Low. After the first time, your phone reopens straight on the Dashboard.
2. Use it as the shopping list. Tap **Refresh** if staff are updating while you look. **Good** items are folded away; tap the Good heading to see them.
3. After restocking, go to **Count** and tap **Good** on each restocked item.

## Adding, removing or renaming items

The app can only change an item's **status**. Items themselves are managed in Supabase: project **cafe-inventory** → **Table Editor** → `items`.

**`area` sets which list an item is in:** `kitchen`, `foh` (front of house) or `shared` (both lists, one status). It's required: the database refuses a row without it, or with any other value.

**`sort_order` sets the shelf order, per list.** Items are numbered in steps of 10 (10, 20, 30...), and categories appear in the order of their first item. Each list counts on its own: the front-of-house list starts at 10 too. Shared items use 1000 and up, so the "Shared" heading comes last in both lists.

| To... | Do this |
|---|---|
| **Add an item** | Insert a row. Fill in `name`, `area` (`kitchen`, `foh` or `shared`; required) and `category` (spelled exactly like the existing category, e.g. `Dairy`; Shared items use `Shared` and then show under the "Shared" heading in both lists), and a `sort_order` between the two items it sits between on the shelf (e.g. `75` between `70` and `80`). Leave `status` and `updated_at` empty: they default to `good` and now. Leave `id` empty too, so the Table Editor generates it. |
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
| `index.html` | Page structure: tabs, Count list, Dashboard, "Unknown area" screen |
| `script.js` | Which list (`?area`), sign-in, loading, saving, Dashboard, "X ago" times (commented section by section) |
| `style.css` | Phone-first, high-contrast styles; status colors are CSS variables at the top |
| `qr.html` | Printable QR code signs: `qr.html` prints the kitchen sign, `qr.html?area=foh` the front-of-house sign |
| `sql/` | Database changes, run in order in the Supabase SQL Editor |

### Database permissions (`sql/`)
| File | What it does |
|---|---|
| `00-schema.sql` | **New projects only.** Creates the `items` table (status check: out / low / good), turns on RLS, adds the read policy, and inserts the 46 items. Already done on the live project; see "Rebuild the database from scratch" below. |
| `01-grant-read.sql` | Signed-in users can **read** `items` |
| `02-update-status.sql` | Signed-in users can **update the `status` column only**, through an RLS update policy, plus a trigger that sets `updated_at` to the database time |
| `03-keep-manual-updated-at.sql` | The trigger keeps an `updated_at` typed in by hand (for testing). App taps still get the database time. |
| `04-revoke-extra-privileges.sql` | **Live project.** Removes TRUNCATE, REFERENCES and TRIGGER from app users (leftovers the app never used), so they can only read and change status. Not needed for a rebuild: `00` never grants them. |
| `05-add-area.sql` | Adds the `area` column: which list a row belongs to (`kitchen`, `foh` or `shared`). Existing rows get `kitchen`; after that there's no default, so every new row must name its area, and the database refuses any other value. App users can read `area` but not change it. **Live project:** run before merging the "Load one area from the link" change (#37). |
| `06-foh-items.sql` | Adds the 44 front-of-house items (7 categories, `area = 'foh'`) and moves Salt and Black Pepper, plus a new Honey, to a **Shared** heading (`area = 'shared'`, `sort_order` 1000 / 1010 / 1020) that shows at the bottom of both lists with one status. Salt and Black Pepper keep their status; Black Pepper is added if it's missing. A second run stops with an error and changes nothing. **Live project:** run only after #37 is merged and live. |
| `99-rollback-foh.sql` | **Not run. Only to undo the front-of-house launch**, before reverting the code: see "Undo the front-of-house launch" below. |

Row Level Security is on. There are no insert or delete permissions for app users: items are only added or removed in the Table Editor.

### Rebuild the database from scratch
If the Supabase project is ever lost or paused for good, everything can be rebuilt from this repo:

1. Create a **new** Supabase project (free tier).
2. Turn on anonymous sign-ins: **Authentication** → **Sign In / Providers** → **Allow anonymous sign-ins**.
3. In the **SQL Editor**, run the files in `sql/` in order, one at a time: `00-schema.sql`, `01-grant-read.sql`, `02-update-status.sql`, `03-keep-manual-updated-at.sql`, `05-add-area.sql`, `06-foh-items.sql`. After `00`, its check queries should show 46 items in 10 categories. `05` and `06` run after `03` (`04` isn't needed): the project gets `00`'s 46 kitchen items, then `06` adds Black Pepper, Honey and the front-of-house items, so its check queries should show `kitchen` 45, `foh` 44, `shared` 3.
4. Copy the new project's URL and **publishable** key (**Project Settings** → **API Keys**) into `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` at the top of `script.js`, then commit to `main`.
5. Retest: items load, a tap saves, the Dashboard loads.

Every item starts as **Good** in the new project, so do a full walk to set the real statuses. Never run `00-schema.sql` on the live project: it would stop at "relation items already exists" and change nothing.

### Undo the front-of-house launch
Only if the front-of-house (FOH) list has to come out. Do these **in this order**:

1. **Run `sql/99-rollback-foh.sql`** in the Supabase SQL Editor. It deletes the 44 FOH items and moves Salt, Black Pepper and Honey back into the kitchen list (Dry Goods / Spices and Condiments / Sauces), keeping their statuses. Its check query should show only `kitchen`, 48 items.
2. **Then revert the code:** revert the FOH pull requests on GitHub, newest first, or revert `main` to the commit before #37's merge (PR #44).
3. **Kitchen check on a phone:** the kitchen QR opens "Kitchen Inventory" with Salt, Black Pepper and Honey back in their categories, a tap saves, and the Dashboard loads. Take the FOH QR sign down from the barista station.

The SQL has to go first: the old code loads every row, so reverting the code first would put all 44 FOH items on the kitchen phones until the SQL ran. The `area` column stays (the old code ignores it), so FOH can be tried again later by running `06` once the code is back.

### Run it locally
Serve the folder with any static server and open http://localhost:8000:

```bash
python3 -m http.server 8000
```
