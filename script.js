// =====================================================================
// Cafe Kitchen Inventory - script.js
// Loads every item from the Supabase `items` table and shows them
// grouped under category headings, in shelf order (sort_order).
// =====================================================================

// ---------------------------------------------------------------------
// 1. Connect to Supabase
// ---------------------------------------------------------------------
// The project URL and the PUBLISHABLE key are safe to put in front-end
// code: what a visitor can do is limited by the Row Level Security (RLS)
// policies on the table. NEVER put a secret key (sb_secret_...) here.
const SUPABASE_URL = "https://kcwyjigynawdaaxozlpx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MHFAislgYRdCkLn1RyTRSA_KkVy0jUK";

// The CDN script in index.html creates a global `supabase` object.
// createClient() gives us a client we use for all database calls.
// We call it `db` so it doesn't clash with that global name.
const db = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// The <main id="item-list"> element we fill with the list.
const listEl = document.getElementById("item-list");

// The three statuses, in the order the buttons appear.
// `value` is what's stored in the database; `label` is the button text.
const STATUSES = [
  { value: "out", label: "Out" },
  { value: "low", label: "Low" },
  { value: "good", label: "Good" },
];

// The last saved version of each item we know about, by id (as text,
// because that's how ids come back from the page's data-id attributes).
// Used to decide whether a save response is newer than what's shown
// (see saveStatus below).
const itemsById = new Map();

// When each item's last save was confirmed (performance.now() time), by
// id. A Count reload that STARTED before that moment may carry the old
// status, so it leaves that item alone (see updateRow below).
const lastSaveFinished = new Map();

// ---------------------------------------------------------------------
// 2. Make sure we're signed in (anonymously)
// ---------------------------------------------------------------------
// The SELECT policy only lets signed-in users read items, so we need a
// session. Supabase saves the session in the browser (localStorage), so
// we only create a new anonymous user when there is no saved session.
// Otherwise every refresh would add another user to the project.
async function ensureSignedIn() {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;

  if (data.session) {
    // Already signed in from an earlier visit: reuse that session.
    return data.session;
  }

  // No saved session: sign in anonymously (no login screen needed).
  const result = await db.auth.signInAnonymously();
  if (result.error) throw result.error;
  return result.data.session;
}

// Sign-in that can be tried again (issue #34).
// Every load waits on getSignedIn(). It:
//   * reuses a sign-in that worked (no new user), or one that's still
//     running (so two loads at once share ONE sign-in: two
//     signInAnonymously() calls at once would create two users);
//   * starts a NEW sign-in only if the last one failed, so a weak
//     connection at the first visit can recover without a page refresh.
// Each wait gives up after SIGN_IN_TIMEOUT_MS, so the screen never sits
// on "Loading..." forever. Giving up doesn't cancel the request itself:
// it keeps running, and the next try waits for that same request instead
// of starting a second one. If its reply arrives late, supabase-js saves
// the session and the next try simply reuses it (no extra user).
const SIGN_IN_TIMEOUT_MS = 10 * 1000;

let signInRequest = null; // the sign-in running now, or the last one
let signInFailed = false; // true once that sign-in has failed

function getSignedIn() {
  if (signInRequest === null || signInFailed) {
    const request = ensureSignedIn();
    signInRequest = request;
    signInFailed = false;
    // Note when THIS request fails (an older one failing late can't
    // mark a newer one as failed).
    request.catch(() => {
      if (signInRequest === request) signInFailed = true;
    });
  }
  return withTimeout(signInRequest, SIGN_IN_TIMEOUT_MS);
}

// Waits for `promise`, but fails with a "TimeoutError" after `ms`.
// (The promise itself keeps going; we just stop waiting for it.)
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Gave up waiting after ${ms / 1000}s`);
      err.name = "TimeoutError";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ---------------------------------------------------------------------
// 3. Load the items from the database
// ---------------------------------------------------------------------
// sort_order is the shelf order. If two rows share a sort_order, id
// breaks the tie so the order is always the same on every phone.
// Like saves, loads give up after a while, so a hanging connection ends
// in a clear "couldn't load / couldn't refresh" message instead of
// waiting forever.
const LOAD_TIMEOUT_MS = 15 * 1000;

async function loadItems() {
  const { data, error, status } = await db
    .from("items")
    .select("id, name, category, sort_order, status, updated_at")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .abortSignal(AbortSignal.timeout(LOAD_TIMEOUT_MS));

  if (error) {
    // Keep the HTTP status (e.g. 401) with the error, for the
    // "Details:" line (issue #34). It's 0 when there was no reply at all.
    error.status = status;
    throw error;
  }
  return data;
}

// ---------------------------------------------------------------------
// 3b. Sign in, load, and retry on a first load (issue #34)
// ---------------------------------------------------------------------
// Both tabs load the same way: sign in (if needed), then load the items.
// If it fails, the error remembers WHICH step failed ("sign-in" or
// "list"), so the error on screen can say so.
async function signInAndLoadItems() {
  try {
    await getSignedIn();
  } catch (err) {
    throw loadFailure("sign-in", err);
  }
  try {
    return await loadItems();
  } catch (err) {
    throw loadFailure("list", err);
  }
}

function loadFailure(step, cause) {
  const err = new Error(`Load failed at ${step}`, { cause });
  err.step = step;
  return err;
}

// On a FIRST load (no list on screen yet), a failed load is tried again
// automatically, after about 2s and then about 5s: a weak kitchen signal
// often works a moment later. Reloads with a list on screen don't retry
// (they keep the list and show the "Couldn't refresh" bar instead).
const FIRST_LOAD_RETRY_DELAYS_MS = [2 * 1000, 5 * 1000];

// Runs signInAndLoadItems(), retrying `retryDelays` times.
//   onRetry():   called before each retry (to show "Still connecting...")
//   isCurrent(): false once a newer load has started; then this one
//                stops retrying (the newer load takes over).
// Each failed try is logged. Returns the items, or throws the last error.
async function loadItemsWithRetries(retryDelays, onRetry, isCurrent) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await signInAndLoadItems();
    } catch (err) {
      console.error(`Load try ${attempt + 1} failed:`, err);
      if (attempt >= retryDelays.length || !isCurrent()) throw err;
      onRetry();
      await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
      if (!isCurrent()) throw err;
    }
  }
}

// The short "Details: <step> · <reason>" line under a load error, so a
// screenshot of the error tells us why it failed. It only ever contains
// the step and a short reason (never keys, tokens or user ids):
//   step:   "sign-in" or "list"
//   reason: "timed out", "no connection", an HTTP status like "401",
//           or the error's code or name.
function loadErrorDetails(err) {
  const step = err.step ?? "list";
  return `Details: ${step} · ${loadErrorReason(err.cause ?? err)}`; // · = middle dot
}

function loadErrorReason(err) {
  if (!err) return "unknown";
  const name = String(err.name ?? "");
  // The database library turns a failed request into an error whose
  // message starts with the original error's name, e.g.
  // "TimeoutError: signal timed out" or "TypeError: Load failed".
  const message = String(err.message ?? "");

  if (/^(TimeoutError|AbortError)$/.test(name) || /^(TimeoutError|AbortError)\b/.test(message)) {
    return "timed out";
  }
  // No reply at all: offline, airplane mode, connection dropped.
  // (Safari says "Load failed", Chrome "Failed to fetch", Firefox
  // "NetworkError...". Sign-in reports it as AuthRetryableFetchError.)
  if (
    name === "TypeError" ||
    name === "AuthRetryableFetchError" ||
    /^TypeError\b|load failed|failed to fetch|networkerror/i.test(message)
  ) {
    return "no connection";
  }
  if (typeof err.status === "number" && err.status > 0) return String(err.status);
  // Codes and names are short words like "PGRST301"; anything else
  // (spaces, long text) is left out, so nothing private can show.
  for (const value of [err.code, name]) {
    if (typeof value === "string" && /^[\w-]{1,40}$/.test(value)) return value;
  }
  return "unknown";
}

// Shows a first-load error in place of a list: the message, the
// "Details:" line, and a Try again button that runs `retry` (the same
// steps again, with no page refresh).
function showLoadError(container, text, err, retry) {
  const box = document.createElement("div");
  box.className = "load-error";

  const p = document.createElement("p");
  p.className = "message";
  p.textContent = text;

  const details = document.createElement("p");
  details.className = "load-details";
  details.textContent = loadErrorDetails(err);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "retry-button";
  button.textContent = "Try again";
  button.addEventListener("click", retry);

  box.append(p, details, button);
  container.replaceChildren(box);
}

// ---------------------------------------------------------------------
// 4. Group items by category
// ---------------------------------------------------------------------
// Items arrive already in shelf order. A Map remembers the order keys
// were first added, so categories appear in the order of their first
// item on the shelf, and items stay in sort_order inside each category.
function groupByCategory(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.category)) {
      groups.set(item.category, []);
    }
    groups.get(item.category).push(item);
  }
  return groups;
}

// ---------------------------------------------------------------------
// 5. Draw the list on the page
// ---------------------------------------------------------------------
// We build elements with createElement + textContent (not innerHTML),
// so an item name can never be treated as HTML.
//
// This draws the first load AND every reload (issue #18). On a reload,
// an item that's already on screen keeps its existing row (the same
// <li>, moved into place), so a save that's in progress or a
// "Didn't save, tap again" message on it survives the reload.
// New items get a new row; removed items disappear; renamed or moved
// items (Table Editor) show their new name and place.
//
// `loadStartedAt` is when this load's request was sent (performance.now()).
function renderList(items, loadStartedAt) {
  // Note the scroll position FIRST: moving existing rows into the new
  // list (below) takes them off the page, which shrinks it and makes the
  // browser scroll up before the new list is swapped in.
  const scrollY = window.scrollY;

  // The rows on screen now, by id (empty on the first load).
  const oldRows = new Map();
  for (const li of listEl.querySelectorAll("li.item")) {
    oldRows.set(li.dataset.id, li);
  }

  if (items.length === 0) {
    showMessage(listEl, "No items found.");
    return;
  }

  // Build the new list off-screen first, then swap it in all at once.
  const sections = [];
  let index = 0;
  for (const [category, categoryItems] of groupByCategory(items)) {
    // One <section> per category: a heading button, then its items.
    // The section remembers its category name, so a tap on the heading
    // knows which category to collapse (issue #26).
    const section = document.createElement("section");
    section.className = "category";
    section.dataset.category = category;

    const ul = document.createElement("ul");
    ul.id = `category-items-${index++}`;
    // Collapsed if this category was collapsed before the reload (the
    // Set is empty on a page load or after switching back to Count).
    const expanded = !collapsedCategories.has(category);
    section.appendChild(renderSectionHeading(ul.id, expanded));

    for (const item of categoryItems) {
      const id = String(item.id);
      let li = oldRows.get(id);
      if (li) {
        updateRow(li, item, loadStartedAt); // already on screen: refresh it
      } else {
        itemsById.set(id, item); // remember the saved version
        li = renderItem(item);
      }
      ul.appendChild(li);
    }
    ul.hidden = !expanded;
    section.appendChild(ul);
    updateCategorySummary(section); // "Dairy (6) · 1 Out · 2 Low"
    sections.push(section);
  }

  // Swap in the new list, and put the scroll back where it was, so a
  // reload doesn't throw the cook back to the top of the shelf.
  listEl.replaceChildren(...sections);
  window.scrollTo(0, scrollY);
}

// ---------------------------------------------------------------------
// 5b. Collapsible headings (issue #26)
// ---------------------------------------------------------------------
// Category headings on Count, and status headings on the Dashboard, are
// buttons: a tap collapses or expands what's under them.
//
// What's collapsed lives only in the page (never saved on the phone):
//   * page reload or new visit         -> defaults
//   * switching tabs (Count <-> Dash)  -> the tab being opened resets
//   * leaving the app and coming back  -> kept (the reloads read it)
// Defaults: Count all expanded; Dashboard Out and Low open, Good closed.

// Names of the collapsed Count categories. Empty = all expanded.
const collapsedCategories = new Set();

// Builds a heading: <h2><button aria-expanded aria-controls>
//   <span class="toggle-label">…</span><span class="toggle-arrow">▾</span>
// </button></h2>. The label text is filled in by the caller.
// aria-expanded tells screen readers whether it's open; the arrow is
// only for sight (▾ open, ▸ closed), so screen readers skip it.
function renderSectionHeading(controlsId, expanded) {
  const heading = document.createElement("h2");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "section-toggle";
  button.setAttribute("aria-controls", controlsId);

  const label = document.createElement("span");
  label.className = "toggle-label";
  const arrow = document.createElement("span");
  arrow.className = "toggle-arrow";
  arrow.setAttribute("aria-hidden", "true");

  button.append(label, arrow);
  heading.appendChild(button);
  setHeadingExpanded(button, expanded);
  return heading;
}

// Shows a heading as open or closed, and shows or hides what it controls.
function setHeadingExpanded(button, expanded) {
  button.setAttribute("aria-expanded", String(expanded));
  button.querySelector(".toggle-arrow").textContent = expanded ? "▾" : "▸"; // ▾ / ▸
  const body = document.getElementById(button.getAttribute("aria-controls"));
  if (body) body.hidden = !expanded;
}

// Collapses or expands one section after its heading was tapped.
// If the heading was stuck to the top of the screen (you'd scrolled
// into that section), collapsing would leave you further down the page,
// past it. So in that case, scroll back to the heading itself.
function toggleSection(button) {
  const section = button.closest("section");
  const wasStuck = section.getBoundingClientRect().top < 0;
  const expanded = button.getAttribute("aria-expanded") !== "true";
  setHeadingExpanded(button, expanded);
  if (!expanded && wasStuck) section.scrollIntoView({ block: "start" });
  return expanded;
}

// Sets a Count heading's text from the items in its section:
// "Dairy (6)", plus " · 1 Out" and " · 2 Low" only when there are any.
// Counts use each item's SAVED status (itemsById), so a save in
// progress or a "Didn't save" tap never changes them; they always match
// the highlighted buttons. Shown the same whether collapsed or not, so a
// collapsed category can't hide a problem.
//
// Issue #32: it also flags rows showing "Didn't save, tap again", e.g.
// "Dairy (6) · 1 Out · 1 didn't save", so a failed save can't hide in a
// collapsed category. The flag is its own <span> (styled to stand out),
// and it's part of the button's text, so screen readers read it too.
// It's recounted whenever a "Didn't save" message appears or goes away
// (see showSaveError) and on every reload.
function updateCategorySummary(section) {
  const counts = { out: 0, low: 0, good: 0 };
  let failed = 0;
  const rows = section.querySelectorAll("li.item");
  for (const li of rows) {
    const status = itemsById.get(li.dataset.id)?.status;
    if (status in counts) counts[status]++;
    if (!li.querySelector(".save-error").hidden) failed++;
  }
  let text = `${section.dataset.category} (${rows.length})`;
  if (counts.out > 0) text += ` · ${counts.out} Out`; // · = middle dot
  if (counts.low > 0) text += ` · ${counts.low} Low`;

  const label = section.querySelector(".toggle-label");
  label.textContent = text;
  if (failed > 0) {
    label.append(" · "); // stays plain, like the separators before it
    const flag = document.createElement("span");
    flag.className = "toggle-flag";
    flag.textContent = `${failed} didn't save`;
    label.appendChild(flag);
  }
}

// Resets the Count tab to its defaults (all expanded). Used when
// switching to Count from the Dashboard.
function resetCountSections() {
  collapsedCategories.clear();
  for (const button of listEl.querySelectorAll(".section-toggle")) {
    setHeadingExpanded(button, true);
  }
}

// Refreshes one existing row with the status, time and name from a
// reload, unless that would undo something on screen:
//   * a save is in progress on it (its buttons are off), or
//   * it shows "Didn't save, tap again" (the cook still needs to see that), or
//   * a save on it was confirmed AFTER this reload was sent, so the
//     reload may carry the status from before that save.
// In those cases the row is left exactly as it is.
function updateRow(li, item, loadStartedAt) {
  const id = li.dataset.id;
  const saving = li.getAttribute("aria-busy") === "true";
  const errorShowing = !li.querySelector(".save-error").hidden;
  const savedSinceLoadStarted = (lastSaveFinished.get(id) ?? -Infinity) > loadStartedAt;
  if (saving || errorShowing || savedSinceLoadStarted) return;

  itemsById.set(id, item);
  li.querySelector(".item-name").textContent = item.name;
  showStatus(li, item.status);
  setUpdated(li.querySelector(".updated"), item.updated_at);
}

// Builds one item row: the name and last-updated time, then the
// Out / Low / Good buttons.
//   <li class="item" data-id="12">
//     <div class="item-head">
//       <span class="item-name">Milk</span>
//       <span class="updated" data-updated="2026-11-21T...">15m ago</span>
//     </div>
//     <div class="status-buttons">
//       <button data-status="out" aria-pressed="false">Out</button> ...
//     </div>
//     <p class="save-error" hidden>Didn't save, tap again</p>
function renderItem(item) {
  const li = document.createElement("li");
  li.className = "item";
  li.dataset.id = item.id; // tells the click handler which item was tapped

  // Top line: name on the left, "15m ago" on the right.
  const head = document.createElement("div");
  head.className = "item-head";

  const name = document.createElement("span");
  name.className = "item-name";
  name.textContent = item.name;
  head.appendChild(name);
  head.appendChild(renderUpdated(item.updated_at));
  li.appendChild(head);

  const buttons = document.createElement("div");
  buttons.className = "status-buttons";
  for (const status of STATUSES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "status-button";
    button.dataset.status = status.value;
    button.textContent = status.label;
    buttons.appendChild(button);
  }
  li.appendChild(buttons);

  // Hidden until a save fails. role="alert" makes screen readers
  // announce it as soon as it appears.
  const error = document.createElement("p");
  error.className = "save-error";
  error.setAttribute("role", "alert");
  error.textContent = "Didn't save, tap again";
  error.hidden = true;
  li.appendChild(error);

  showStatus(li, item.status);
  return li;
}

// Highlights the button matching `status` in one item row.
// aria-pressed="true" marks the selected button: the CSS colors it,
// and screen readers announce it as "pressed".
function showStatus(li, status) {
  for (const button of li.querySelectorAll(".status-button")) {
    const selected = button.dataset.status === status;
    button.setAttribute("aria-pressed", String(selected));
  }
}

// ---------------------------------------------------------------------
// 6. Save a status when a button is tapped
// ---------------------------------------------------------------------
// One click listener on the whole list (instead of one per button).
// It finds which button and which item row the tap landed on.
listEl.addEventListener("click", (event) => {
  // A category heading: collapse or expand it, and remember that until
  // the next reset (see 5b).
  const toggle = event.target.closest(".section-toggle");
  if (toggle) {
    const category = toggle.closest("section").dataset.category;
    if (toggleSection(toggle)) {
      collapsedCategories.delete(category);
    } else {
      collapsedCategories.add(category);
    }
    return;
  }

  const button = event.target.closest(".status-button");
  if (!button) return; // the tap wasn't on a status button

  const li = button.closest(".item");
  saveStatus(li, li.dataset.id, button.dataset.status);
});

// How long to wait for a save before giving up. Kitchen wifi can hang
// instead of failing, and the buttons stay off while a save is going,
// so without a limit an item could stay stuck.
const SAVE_TIMEOUT_MS = 10 * 1000;

// Saves the status to the database, THEN updates the page.
// The highlight only moves after the database confirms the save, so
// the page never shows a status that wasn't saved.
// Tapping the status that's already selected still saves: the database
// trigger refreshes updated_at (the "still good" check).
async function saveStatus(li, id, status) {
  // While this save is going, turn this item's buttons off, so a double
  // tap sends only one save. Other items stay tappable.
  setSaving(li, true);

  try {
    // .select().single() asks the database to send back the saved row.
    // If the update was refused or matched no row, .single() returns an
    // error instead of silently doing nothing.
    // .abortSignal() cancels the request if it takes too long.
    const { data, error } = await db
      .from("items")
      .update({ status: status })
      .eq("id", id)
      .select("id, status, updated_at")
      .single()
      .abortSignal(AbortSignal.timeout(SAVE_TIMEOUT_MS));

    if (error) throw error;

    // Saved. Note when, so a Count reload sent before now won't put
    // the old status back (see updateRow).
    lastSaveFinished.set(id, performance.now());

    // Clear any earlier "Didn't save" message on this item.
    showSaveError(li, false);

    // Only show this result if it's at least as new as what's already
    // shown, so the page always matches the newest save.
    const shown = itemsById.get(id);
    if (shown && new Date(data.updated_at) < new Date(shown.updated_at)) {
      return;
    }

    itemsById.set(id, { ...shown, ...data });
    showStatus(li, data.status);
    // Show the new saved time ("just now") from the database's answer.
    setUpdated(li.querySelector(".updated"), data.updated_at);
    // Update the category heading's Out / Low counts (issue #26).
    // (No section if a reload removed this item meanwhile.)
    const section = li.closest(".category");
    if (section) updateCategorySummary(section);
  } catch (err) {
    // Offline, timed out, or refused. Nothing else changes: the old
    // status stays highlighted and the old time stays. The message tells
    // staff the tap didn't count.
    console.error(`Could not save "${status}" for item ${id}:`, err);
    showSaveError(li, true);
  } finally {
    // Turn the buttons back on after a save, whether it worked or not.
    setSaving(li, false);
  }
}

// Turns one item's buttons off (while saving) or back on.
// aria-busy tells screen readers the item is updating; the CSS also
// fades the buttons a little while they're off.
function setSaving(li, saving) {
  for (const button of li.querySelectorAll(".status-button")) {
    button.disabled = saving;
  }
  li.setAttribute("aria-busy", String(saving));
}

// Shows or hides the "Didn't save, tap again" message on one item.
// Also recounts the category heading's "didn't save" flag (issue #32),
// so it appears and clears at the same moment as the message.
// (No section if a reload removed this item meanwhile.)
function showSaveError(li, show) {
  li.querySelector(".save-error").hidden = !show;
  const section = li.closest(".category");
  if (section) updateCategorySummary(section);
}

// ---------------------------------------------------------------------
// 6b. "Last updated" times ("just now", "15m ago", "2h ago", "3d ago")
// ---------------------------------------------------------------------
// Turns a saved time (updated_at from the database) into short text.
function timeAgo(isoTime) {
  const seconds = (Date.now() - new Date(isoTime).getTime()) / 1000;

  // Under a minute, or slightly in the future (if this phone's clock is
  // a little behind the database's clock), counts as "just now".
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Makes the <span class="updated"> for one item. The exact time is kept
// in data-updated so the text can be refreshed later (see below).
function renderUpdated(isoTime) {
  const span = document.createElement("span");
  span.className = "updated";
  setUpdated(span, isoTime);
  return span;
}

// Sets a time span to a new saved time.
// The `title` shows the exact date and time on hover (desktop).
function setUpdated(span, isoTime) {
  span.dataset.updated = isoTime;
  span.textContent = timeAgo(isoTime);
  span.title = new Date(isoTime).toLocaleString();
}

// "just now" should become "1m ago" without a reload, so once a minute
// recompute every time on the page from its data-updated value.
setInterval(() => {
  for (const span of document.querySelectorAll(".updated")) {
    span.textContent = timeAgo(span.dataset.updated);
  }
}, 60 * 1000);

// Shows a single line of text in place of a list
// (used for "Loading..." and for errors).
// `container` is where it goes: listEl (Count) or dashboardListEl.
function showMessage(container, text) {
  const p = document.createElement("p");
  p.className = "message";
  p.textContent = text;
  container.replaceChildren(p);
}

// ---------------------------------------------------------------------
// 7. Tabs: Count and Dashboard
// ---------------------------------------------------------------------
const countTab = document.getElementById("tab-count");
const dashboardTab = document.getElementById("tab-dashboard");
const countView = document.getElementById("count-view");
const dashboardView = document.getElementById("dashboard-view");

// Shows one tab's panel and hides the other.
// aria-selected marks the open tab (the CSS styles it); `hidden` hides
// the closed panel completely.
function showTab(name) {
  const isDashboard = name === "dashboard";
  countTab.setAttribute("aria-selected", String(!isDashboard));
  dashboardTab.setAttribute("aria-selected", String(isDashboard));
  countView.hidden = isDashboard;
  dashboardView.hidden = !isDashboard;
  saveLastTab(isDashboard ? "dashboard" : "count");
}

// ---------------------------------------------------------------------
// 7b. Remember the last tab on this phone (issue #25)
// ---------------------------------------------------------------------
// Cooks mostly use Count and the GM mostly uses the Dashboard, so each
// phone reopens on the tab it was last on. Only the tab name is saved,
// in this browser's localStorage (it stays on the phone; nothing is
// sent anywhere). A phone that has never opened the app opens on Count.
//
// Some private-browsing modes block localStorage or throw an error when
// it's touched, so every use is wrapped in try/catch: if storage doesn't
// work, the app simply opens on Count each time.
const LAST_TAB_KEY = "cafe-inventory:last-tab";

function saveLastTab(name) {
  try {
    localStorage.setItem(LAST_TAB_KEY, name);
  } catch {
    // Storage not available: nothing to do, the app still works.
  }
}

// Returns "dashboard" or "count". Anything else (nothing saved, an old
// or unexpected value, storage blocked) means Count.
function readLastTab() {
  try {
    return localStorage.getItem(LAST_TAB_KEY) === "dashboard" ? "dashboard" : "count";
  } catch {
    return "count";
  }
}

// Coming back to Count from the Dashboard reloads the Count list, so it
// shows what other phones saved meanwhile (issue #18). Tapping Count
// while already on Count does nothing.
// Switching to Count also resets it to its defaults: every category
// expanded (issue #26).
countTab.addEventListener("click", () => {
  const fromDashboard = !dashboardView.hidden;
  showTab("count");
  if (fromDashboard) {
    resetCountSections();
    loadCount();
  }
});

// Opening the Dashboard always loads fresh data from the database,
// so it shows what every phone (and the Table Editor) has saved.
// Switching to it from Count also resets it to its defaults: Out and
// Low open, Good closed (issue #26). Tapping Dashboard while already on
// it reloads, but keeps the open/closed sections.
dashboardTab.addEventListener("click", () => {
  const fromCount = dashboardView.hidden;
  showTab("dashboard");
  if (fromCount) resetDashboardSections();
  loadDashboard();
});

// ---------------------------------------------------------------------
// 8. Dashboard: the GM's shopping list
// ---------------------------------------------------------------------
const dashboardListEl = document.getElementById("dashboard-list");
const refreshButton = document.getElementById("refresh-button");

// Section headings for each status, in the order they appear.
const DASHBOARD_SECTIONS = [
  { value: "out", label: "Out" },
  { value: "low", label: "Low" },
  { value: "good", label: "Good" },
];

// Counts dashboard loads. If the tab or Refresh is tapped again before
// a load finishes (or the phone comes back to the page), only the newest
// load is allowed to draw the list.
let dashboardLoadNumber = 0;

// The "Couldn't refresh the list" bar for the Dashboard and its
// Try again button (same look as the Count tab's, issue #24).
const dashboardNoticeEl = document.getElementById("dashboard-notice");
// The bar's "Details:" line (issue #34).
const dashboardNoticeDetailsEl = dashboardNoticeEl.querySelector(".load-details");
document.getElementById("dashboard-retry").addEventListener("click", () => {
  loadDashboard({ quiet: true });
});

// The Refresh button reloads the data without reloading the page.
refreshButton.addEventListener("click", () => loadDashboard());

// Loads every item fresh from the database and draws the dashboard.
//
// Two kinds of load:
//   * Normal (opening the tab, tapping Refresh): shows "Loading..." and
//     "Refreshing...", and replaces the list with an error if it fails.
//   * Quiet (`{ quiet: true }`: coming back to the page, Try again):
//     the list on screen stays while it loads. If it fails, the list
//     stays and the "Couldn't refresh" bar appears instead (issue #24).
async function loadDashboard({ quiet = false } = {}) {
  const thisLoad = ++dashboardLoadNumber;

  // Is a list already on screen? A quiet load with nothing to keep
  // (e.g. the last load failed) behaves like a normal one.
  const hasList = dashboardListEl.querySelector(".status-section") !== null;
  const keepList = quiet && hasList;

  if (!keepList) {
    // Show that a load is happening, and stop repeat taps meanwhile.
    refreshButton.disabled = true;
    refreshButton.textContent = "Refreshing...";
    showMessage(dashboardListEl, "Loading...");
  }

  // Issue #34: when no list is on screen yet, a failed load is retried
  // automatically (see 3b), showing "Still connecting..." meanwhile.
  // With a list on screen (a normal Refresh, or a quiet reload), the
  // list is already there to look at, so no automatic retries.
  const retryDelays = hasList ? [] : FIRST_LOAD_RETRY_DELAYS_MS;

  try {
    const items = await loadItemsWithRetries(
      retryDelays,
      () => showMessage(dashboardListEl, "Still connecting..."),
      () => thisLoad === dashboardLoadNumber,
    );
    if (thisLoad === dashboardLoadNumber) {
      renderDashboard(items);
      dashboardNoticeEl.hidden = true; // the list is fresh again
    }
  } catch (err) {
    console.error("Could not load the dashboard:", err);
    if (thisLoad === dashboardLoadNumber) {
      if (keepList) {
        // Keep the list that's on screen (it may be old), and say so,
        // with the short reason (issue #34).
        dashboardNoticeDetailsEl.textContent = loadErrorDetails(err);
        dashboardNoticeEl.hidden = false;
      } else {
        dashboardNoticeEl.hidden = true; // the message below says it all
        // The error, its "Details:" line, and a Try again button that
        // runs this same load again (issue #34).
        showLoadError(
          dashboardListEl,
          "Couldn't load the dashboard. Check the connection and tap Try again.",
          err,
          () => loadDashboard(),
        );
      }
    }
  } finally {
    // Turn the button back on once the newest load is done (or failed).
    if (thisLoad === dashboardLoadNumber) {
      refreshButton.disabled = false;
      refreshButton.textContent = "Refresh";
    }
  }
}

// Which Dashboard sections are open (issue #26). Default: Out and Low
// open, Good closed, so the shopping list isn't buried under Good items.
// Kept across Refresh and coming back to the page; reset when switching
// to the Dashboard from Count (see 5b for the rules).
const DEFAULT_OPEN_SECTIONS = ["out", "low"];
const openDashboardSections = new Set(DEFAULT_OPEN_SECTIONS);

function resetDashboardSections() {
  openDashboardSections.clear();
  for (const value of DEFAULT_OPEN_SECTIONS) openDashboardSections.add(value);
}

// Tapping a status heading opens or closes that section.
dashboardListEl.addEventListener("click", (event) => {
  const toggle = event.target.closest(".section-toggle");
  if (!toggle) return;
  const status = toggle.closest("section").dataset.status;
  if (toggleSection(toggle)) {
    openDashboardSections.add(status);
  } else {
    openDashboardSections.delete(status);
  }
});

// Draws Out, then Low, then Good. Inside each status, items are grouped
// by category in shelf order (loadItems already sorted them by
// sort_order, and filtering keeps that order).
//   <section class="status-section status-out" data-status="out">
//     <h2><button aria-expanded="true">Out (3) ▾</button></h2>
//     <div class="status-body">
//       <h3>Dairy</h3> <ul><li>Milk <span class="updated">2h ago</span></li>...</ul>
//     </div>
function renderDashboard(items) {
  // Keep the scroll position across a reload (the list is rebuilt).
  const scrollY = window.scrollY;
  dashboardListEl.replaceChildren();

  for (const status of DASHBOARD_SECTIONS) {
    const statusItems = items.filter((item) => item.status === status.value);

    const section = document.createElement("section");
    // status-out / status-low / status-good set the red/yellow/green color.
    section.className = `status-section status-${status.value}`;
    section.dataset.status = status.value;

    // Everything under the heading goes in one box, which the heading
    // shows or hides.
    const body = document.createElement("div");
    body.className = "status-body";
    body.id = `dashboard-section-${status.value}`;
    const expanded = openDashboardSections.has(status.value);
    body.hidden = !expanded;

    const heading = renderSectionHeading(body.id, expanded);
    heading.querySelector(".toggle-label").textContent = `${status.label} (${statusItems.length})`;
    section.appendChild(heading);
    section.appendChild(body);

    if (statusItems.length === 0) {
      const none = document.createElement("p");
      none.className = "none";
      none.textContent = "None";
      body.appendChild(none);
    }

    for (const [category, categoryItems] of groupByCategory(statusItems)) {
      const categoryHeading = document.createElement("h3");
      categoryHeading.textContent = category;
      body.appendChild(categoryHeading);

      const ul = document.createElement("ul");
      for (const item of categoryItems) {
        // Name on the left, "15m ago" on the right.
        const li = document.createElement("li");
        li.className = "dashboard-item";
        const name = document.createElement("span");
        name.textContent = item.name;
        li.appendChild(name);
        li.appendChild(renderUpdated(item.updated_at));
        ul.appendChild(li);
      }
      body.appendChild(ul);
    }

    dashboardListEl.appendChild(section);
  }

  // Emptying the list above shrank the page and scrolled it up; now
  // that the new list is in, put the scroll back.
  window.scrollTo(0, scrollY);
}

// ---------------------------------------------------------------------
// 9. Start the app
// ---------------------------------------------------------------------
// Sign-in starts with the first load: both tabs call getSignedIn()
// (section 2), which shares one sign-in between them and starts a new
// one only if the last one failed (issue #34).

// ---------------------------------------------------------------------
// 10. Load (and reload) the Count list
// ---------------------------------------------------------------------
// Phones keep tabs open for hours or days, so the Count list is loaded
// when the page opens AND again whenever it comes back into view
// (issue #18). This is not live updating: it's one fresh load at the
// moments staff look at the list.

// The "Couldn't refresh the list" bar and its Try again button.
const countNoticeEl = document.getElementById("count-notice");
// The bar's "Details:" line (issue #34).
const countNoticeDetailsEl = countNoticeEl.querySelector(".load-details");
document.getElementById("count-retry").addEventListener("click", () => loadCount());

// Counts Count loads. If several start close together (quick tab
// switches), only the newest one is allowed to draw.
let countLoadNumber = 0;

async function loadCount() {
  const thisLoad = ++countLoadNumber;
  const loadStartedAt = performance.now();

  // Is a list already on screen? (No on the first load, or after the
  // first load failed.) Only then is this a quiet "refresh".
  const hasList = listEl.querySelector("li.item") !== null;
  if (!hasList) showMessage(listEl, "Loading...");

  // Issue #34: with no list on screen yet, a failed load is retried
  // automatically (see 3b), showing "Still connecting..." meanwhile.
  const retryDelays = hasList ? [] : FIRST_LOAD_RETRY_DELAYS_MS;

  try {
    const items = await loadItemsWithRetries(
      retryDelays,
      () => showMessage(listEl, "Still connecting..."),
      () => thisLoad === countLoadNumber,
    );
    if (thisLoad !== countLoadNumber) return; // a newer load is coming
    renderList(items, loadStartedAt);
    countNoticeEl.hidden = true; // the list is fresh again
  } catch (err) {
    // Log the details for debugging, and tell the user in plain words.
    console.error("Could not load the item list:", err);
    if (thisLoad !== countLoadNumber) return;
    if (hasList) {
      // Keep the list that's on screen (statuses may be old), and say so,
      // with the short reason (issue #34).
      countNoticeDetailsEl.textContent = loadErrorDetails(err);
      countNoticeEl.hidden = false;
    } else {
      // The error, its "Details:" line, and a Try again button that runs
      // this same load again, with no page refresh (issue #34).
      showLoadError(
        listEl,
        "Couldn't load the item list. Check the connection and tap Try again.",
        err,
        () => loadCount(),
      );
    }
  }
}

// Reloads whichever tab is showing, and only that one (one load per
// return): Count (issue #18) or the Dashboard, quietly (issue #24).
function reloadShownTab() {
  if (!countView.hidden) {
    loadCount();
  } else {
    loadDashboard({ quiet: true });
  }
}

// Reload when the phone comes back to this page (from another app or
// tab, or after unlocking).
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") reloadShownTab();
});

// Some phones (Safari especially) restore a page from memory when you
// go Back to it, without reloading it. Treat that as coming back too.
// (If visibilitychange also fires, the load counters keep only one.)
window.addEventListener("pageshow", (event) => {
  if (event.persisted) reloadShownTab();
});

// ---------------------------------------------------------------------
// 11. Open on the last tab used (issue #25)
// ---------------------------------------------------------------------
// Load only the tab that opens. If it's the Dashboard, the Count list
// loads when someone switches to Count (it shows "Loading..." then).
if (readLastTab() === "dashboard") {
  showTab("dashboard");
  loadDashboard(); // fresh, the same as switching to it
} else {
  showTab("count");
  loadCount();
}
