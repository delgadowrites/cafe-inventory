# Cafe Inventory Tracker — PRD (v1)

Nov 21, 2026 · @Carlos Luis Delgado

## Overview

|  |  |
| --- | --- |
| **Product** | Cafe Inventory Tracker, a phone web app opened by scanning a QR code |
| **Version** | v1 (MVP) |
| **Status** | Draft |
| **Author / builder / maintainer** | Carlos |
| **Stakeholders** | Cafe owner (approval) · General manager (dashboard user, buys stock) · Kitchen staff (count entry) |
| **Demo date** | Wednesday, Nov 25, 2026 |
| **Cost to the cafe** | Free (built and maintained by Carlos) |

## Summary

The cafe's kitchen has no consistent way to track inventory or see what is running low, so ingredients run out unnoticed and menu items become unavailable. The Cafe Inventory Tracker is a phone web app that kitchen staff open by scanning a QR code; they tap Out, Low or Good for each item mid-shift, after restocking, and during the end-of-shift walk. The GM gets an up-to-date shopping list before each supply run without asking the cooks on shift, and can check before work that the end-of-shift update was done. Success means fewer menu items 86'd and a GM who says the app makes his job easier.

## Problem

At the end of each shift, a cook walked the kitchen with a paper inventory sheet and marked each item as good, low, or 86 (kitchen lingo for completely out). We once tried recording live counts of exactly what was in stock, but that wasn't sustainable across different staff, and we kept defaulting to out, low, or good. The cook then sent a photo of the sheet to a group chat with the owner, the general manager, and the kitchen staff.

Even then, checking our current inventory meant scrolling through photos and piecing it together: low on this on Monday, out of this on Tuesday, restocked on Wednesday. When the sheets ran out, staff improvised by texting only what was out or needed replacing. The chat no longer shows what is available, so the GM has to check in with staff before each supply run, and items get missed.

For example, we might run out of avocado, which several menu items need, and restock it. But if no one mentioned we were low on sourdough, we still can't make avocado toast. We're 86 on avocado toast, and we can't sell it.

## Goals and non-goals

**Goals (v1)**

1. Give the cafe one shared, up-to-date view of what is out, low, or in stock: ingredients, cleaning products and packaging (46 items in 10 categories).
2. Make updating an item fast enough to do mid-shift: one tap, no login.
3. Replace the end-of-shift paper count with a phone walk-through.
4. Give the GM a shopping list (red, then yellow) before each supply run.

**Non-goals (v1)**

- **Numeric counts and par levels.** Staff record a status (Out / Low / Good), not a quantity.
- **Ordering or purchasing.** The app shows what is needed; the GM still shops at Restaurant Depot and the supermarket.
- **Logins or roles.** Anyone with the link can update statuses.
- **Adding or removing items in the app.** Carlos manages the item list in the database.
- **Status history or reports.** Only the current status and its last-updated time are kept.
- **Live updates.** The dashboard loads fresh when opened; it does not change on screen by itself.
- **Spanish language.** English only in v1.
- **Notifications.** No texts, pushes, or alarms.
- **Front-of-house inventory.** Barista inventory is a separate system and is out of scope for v1. Kitchen cleaning products and packaging are in scope.

## Success metrics

Success means fewer menu items become unavailable because of missed or late restocks. All metrics are measured over the first two weeks after launch; v1 keeps no history, so each one uses a daily check or a weekly tally.

| Type | Metric | Target | How it's measured |
| --- | --- | --- | --- |
| **Primary** | Menu items 86'd because an ingredient was missed on a supply run | Fewer than before launch | Weekly tally with the GM; baseline from the GM before launch |
| **Supporting** | End-of-shift walks completed | After every shift | Each morning, every item's `updated_at` is from the previous night |
| **Supporting** | Items that reach Out | Fewer over time, as Low items are flagged earlier | Count of items marked Out at the morning check |
| **Supporting** | Inventory messages in the group chat | Emergencies only | Weekly count, before vs. after launch |
| **Guardrail** | Time to do the end-of-shift walk | No longer than the paper sheet | Timed during the test run, paper vs. app |
| **Supporting** | GM feedback | The GM says the app makes his job easier | Short check-in with the GM after two weeks |

Restocks can't always happen the day an item runs low. A clear, consistent Low status gives the GM and owner time to plan a restock before the item runs out.

**Added benefit:** no more printed inventory sheets, which saves paper and removes the "we ran out of sheets" failure.

## Users and use cases

v1 covers the kitchen (back of house) only. Kitchen staff use the app on their own phones, often in a busy kitchen. Carlos maintains it from the backend.

| User | When they use it | What they need |
| --- | --- | --- |
| **Cook, mid-shift** | They notice something is low or just ran out | Scan, find the item, tap Low or Out, get back to work in seconds |
| **Closing staff, end of shift** | Every shift, they walk the kitchen and check every item | Go down the list in shelf order and tap a status for each item, including Good |
| **General manager** | Before his daily supply run | See everything that is Out, then Low, grouped by category, as a shopping list. After restocking, tap Good |
| **Carlos (maintainer)** | When staff ask to add or remove an item | Change the item list in the database without touching the code |

## Requirements

### Functional requirements

| # | User story | Acceptance criteria |
| --- | --- | --- |
| R1 | As staff, I scan the QR code on the kitchen wall so I can open the tracker without typing anything. | The QR code opens one URL. The page opens on the Count tab. No login screen appears. |
| R2 | As staff, I see every item in the same order as the shelves so I can walk the kitchen top to bottom. | Items are grouped by category and ordered by `sort_order`, matching the cleaned-up paper sheet. |
| R3 | As staff, I tap Out, Low or Good on an item so everyone knows its status. | Each item has three buttons. The current status is highlighted in its color (red, yellow, green). |
| R4 | As closing staff, I tap Good on items that are still fine so the GM knows they were checked tonight. | Tapping the already-selected status saves again and refreshes its time. |
| R5 | As anyone, I see when each item was last updated so I know whether a status is fresh. | Each item shows how long ago it was updated (for example, "2h ago"). |
| R6 | As staff, I know whether my tap was saved so I can trust the app on spotty wifi. | The page changes only after the database confirms the save. Buttons are disabled while saving. A failed save shows a visible "Didn't save, tap again" message on that item. |
| R7 | As the GM, I open the Dashboard tab before shopping so I see what to buy. | Out items at the top, then Low, then Good, grouped by category inside each status. Data loads fresh every time the tab opens. |
| R8 | As the GM, I tap Refresh so I see updates made while the screen was open. | A Refresh button reloads the data from the database. |
| R9 | As the GM, I tap Good after restocking so the item leaves the shopping list. | Same buttons and rule as R3. |
| R10 | As the maintainer, I add, remove or reorder items without changing code. | Items are database rows. A new row appears in the app on the next load, in its `sort_order` position. |

### Non-functional requirements

| Area | Requirement |
| --- | --- |
| **Device** | Built for phone screens first; works in any modern mobile browser. Nothing to install. |
| **Readability** | Plain, high-contrast style. Large text, tap targets at least 44 px, strong red / yellow / green. Readable at arm's length mid-shift. |
| **Speed** | Updating one item takes one tap after the page loads. |
| **Reliability** | No status ever shows as saved unless the database saved it. If two people tap the same item, the last save wins. |
| **Security** | Anyone with the link can read items and change statuses only. No one can add, delete or rename items from the app (enforced by the database, not just the page). |
| **Cost** | Free: GitHub Pages hosting and the Supabase free tier. |
| **Language** | English. |

## Technical approach

A static front end on GitHub Pages talks directly to a Supabase Postgres database. Row Level Security (RLS) in the database decides what each request may do.

| Layer | Choice | Why |
| --- | --- | --- |
| Front end | HTML, CSS, vanilla JavaScript; repo `cafe-inventory` on GitHub Pages | Free, no build step, same stack as Carlos's other projects |
| Database | New Supabase project (Postgres), separate from Carlos's personal apps | One shared source of truth; the cafe doesn't depend on a personal project |
| Identity | Supabase anonymous sign-in; sign in only if there is no saved session | Gives each phone a signed-in session with no login screen |
| Access rules | RLS policies: signed-in users can **select** all items and **update** the status only; no insert or delete policies | A public link can't wipe or rename the list |
| Entry point | One printed QR code linking to the app's URL | One scan from the kitchen wall |

**Data model: `items` table**

| Column | Type | Holds |
| --- | --- | --- |
| `id` | uuid | Unique id |
| `name` | text | Item name, e.g. "Potatoes (Box)" |
| `category` | text | e.g. "Produce (Fresh)" |
| `sort_order` | integer | Position in the shelf / paper-sheet order |
| `status` | text | Only `out`, `low` or `good` (enforced by a check constraint) |
| `updated_at` | timestamptz | Time of the last tap |

**Save flow for one tap:** disable the item's buttons → send the update → if the database confirms, show the new status and time → if it fails, show "Didn't save, tap again" → re-enable the buttons.

## Milestones

1. **Sun, Nov 22 (night): build checkpoint.** Anything Carlos hasn't built by hand by now is built with AI help, chunk by chunk.
2. **Mon, Nov 23: working core.** Count tab saves to Supabase, dashboard sorts red / yellow / green, QR code opens the app. Basic styling. Introduce the concept to the owner (and the GM if he's in).
3. **Tue, Nov 24: polish.** Layout, colors, error messages, bug fixes. Load the cleaned-up item list.
4. **Wed, Nov 25: demo and launch.** Demo for the owner and GM. QR code goes on the kitchen wall. First full walk sets the real statuses. Walk Jose and the GM through using it.

## Risks and open questions

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Staff don't adopt it and keep texting the group chat | The dashboard goes stale and the GM stops trusting it | One-tap updates, no login, hands-on walkthroughs at launch; owner and GM endorsement |
| The GM forgets to tap Good after restocking | Items stay red after they've been bought | Restocking is part of the GM walkthrough; the end-of-shift walk corrects statuses daily |
| Anyone with the URL can change statuses | Wrong statuses from outside the cafe | RLS allows status updates only; the list can't be deleted or renamed. Logins are planned for later. |
| Supabase pauses free projects after a period of no activity | The app stops loading | Daily use should keep it active; Carlos can restore the project if it pauses |
| Spotty cafe wifi | Taps fail to save | Save-first rule and a visible "tap again" message (R6) |
| Carlos leaves the cafe | No one on site can maintain it | Carlos stays the point of contact and maintainer |

**Open questions**

- [ ] Does the owner approve the QR code on the kitchen wall?
- [ ] Final cleaned-up item list (Carlos drafts, GM confirms).

## Future versions

| Feature | What it adds |
| --- | --- |
| Spanish toggle | Full Spanish interface for Spanish-speaking staff |
| GM sign-in with permissions | The GM adds, removes and reorders items in the app |
| Status history | A log of every change, to answer "what runs out most often?" |
| Live updates | The dashboard changes on screen when anyone taps (Supabase Realtime) |
| Numeric counts and par levels | Quantities with per-item thresholds that set Low automatically |
| Front of house | Barista inventory, offered if the kitchen version succeeds |
| Supplies | Front-of-house supplies |
| Whole-cafe inventory | Long-term: one inventory tracking system for the entire cafe |
