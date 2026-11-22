# Launch checklist (issue #8)

Target: **Wed, Nov 25**. These are the in-person steps for going live. Tick them off here or in issue #8.

## 1. Before the cafe (desk)
- [ ] All PRs for #1–#7 merged; https://delgadowrites.github.io/cafe-inventory/ shows the Count and Dashboard tabs, with times
- [ ] All three `sql/` files have been run in the Supabase SQL Editor (01, 02, 03)
- [ ] The GM confirms the final item list: **46 items** (the 45 from the Final List, plus **Blueberries**, which was missing from it). This is an open question in the PRD.
- [ ] Print `qr.html` (one copy for the wall, one spare)

## 2. Full test on a real phone, in the kitchen, on the cafe wifi
Use a phone that's on the **cafe wifi**, not mobile data.
- [ ] Scan the printed QR code: the app opens on **Count** (on a phone that hasn't used the app before; after that, it reopens on the last tab used)
- [ ] Tap Out, Low, Good on one item: the ✓ moves each time, and the time shows "just now"
- [ ] Refresh the page: the statuses are still there
- [ ] Open **Dashboard**: that item is in the right section; tap **Refresh**
- [ ] Second phone (iPhone and Android if possible): same statuses
- [ ] Airplane mode on, tap: **"Didn't save, tap again"**. Airplane mode off, tap again: it saves
- [ ] Try the spots where the wifi is weakest (walk-in, back shelves)
- [ ] Readable at arm's length, with gloves or wet hands if that's normal mid-shift
- [ ] Set the test item back to its real status

## 3. Guardrail metric: end-of-shift walk, app vs. paper
Time the same walk both ways, ideally the same person on similar nights.

| Date | Who | Method | Start | End | Minutes | Notes |
|---|---|---|---|---|---|---|
|  |  | Paper |  |  |  |  |
|  |  | App |  |  |  |  |
|  |  | App |  |  |  |  |

- [ ] The app walk is no slower than paper (or the extra time is noted and acceptable)

## 4. Baseline from the GM: menu items 86'd now
Ask the GM before launch, so there's something to compare with later.
- How many times a week does a menu item get 86'd? ______
- Which items most often? ______
- Usual cause (didn't know it was low / knew but didn't order / delivery late)? ______
- Period this covers (e.g. last 4 weeks): ______

## 5. Demo and walkthrough
- [ ] **Demo for the owner and GM:** scan the QR code, Count tab, tap statuses, Dashboard as the shopping list, "X ago" times, what "Didn't save" means
- [ ] **Walkthrough with Jose and the GM:** Jose does an end-of-shift walk; the GM restocks one item and taps **Good** on it (the README's "How to use it" section has both flows)
- [ ] Questions or changes they asked for: ______

## 6. Go live
- [ ] QR code posted on the kitchen wall (eye level, away from steam and splashes; a plastic sleeve helps)
- [ ] **First full walk** sets every item's real status: afterwards, the Dashboard shows nothing older than tonight
- [ ] Issue #8 is closed (merging the launch PR closes it; reopen it if steps above are still open)
