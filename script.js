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

// ---------------------------------------------------------------------
// 3. Load the items from the database
// ---------------------------------------------------------------------
// sort_order is the shelf order. If two rows share a sort_order, id
// breaks the tie so the order is always the same on every phone.
async function loadItems() {
  const { data, error } = await db
    .from("items")
    .select("id, name, category, sort_order, status, updated_at")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;
  return data;
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
function renderList(items) {
  listEl.replaceChildren(); // clear "Loading..." or an old list

  if (items.length === 0) {
    showMessage(listEl, "No items found.");
    return;
  }

  for (const [category, categoryItems] of groupByCategory(items)) {
    // One <section> per category: a heading, then its items.
    const section = document.createElement("section");
    section.className = "category";

    const heading = document.createElement("h2");
    heading.textContent = category;
    section.appendChild(heading);

    const ul = document.createElement("ul");
    for (const item of categoryItems) {
      itemsById.set(String(item.id), item); // remember the saved version
      ul.appendChild(renderItem(item));
    }
    section.appendChild(ul);

    listEl.appendChild(section);
  }
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
  const button = event.target.closest(".status-button");
  if (!button) return; // the tap wasn't on a status button

  const li = button.closest(".item");
  saveStatus(li, li.dataset.id, button.dataset.status);
});

// Saves the status to the database, THEN updates the page.
// The highlight only moves after the database confirms the save, so
// the page never shows a status that wasn't saved.
// Tapping the status that's already selected still saves: the database
// trigger refreshes updated_at (the "still good" check).
async function saveStatus(li, id, status) {
  // .select().single() asks the database to send back the saved row.
  // If the update was refused or matched no row, .single() returns an
  // error instead of silently doing nothing.
  const { data, error } = await db
    .from("items")
    .update({ status: status })
    .eq("id", id)
    .select("id, status, updated_at")
    .single();

  if (error) {
    // Nothing changes on the page: the old status stays highlighted.
    // (Issue #6 adds a visible "Didn't save, tap again" message.)
    console.error(`Could not save "${status}" for item ${id}:`, error);
    return;
  }

  // Last save wins: if two taps on the same item land close together,
  // their responses can come back in either order. Only show this
  // result if it's at least as new as the last saved one we've shown,
  // so the page matches what's in the database.
  const shown = itemsById.get(id);
  if (shown && new Date(data.updated_at) < new Date(shown.updated_at)) {
    return; // an older save answered late; a newer one is already shown
  }

  itemsById.set(id, { ...shown, ...data });
  showStatus(li, data.status);
  // Show the new saved time ("just now") from the database's answer.
  setUpdated(li.querySelector(".updated"), data.updated_at);
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
}

countTab.addEventListener("click", () => showTab("count"));

// Opening the Dashboard always loads fresh data from the database,
// so it shows what every phone (and the Table Editor) has saved.
dashboardTab.addEventListener("click", () => {
  showTab("dashboard");
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
// a load finishes, only the newest load is allowed to draw the list.
let dashboardLoadNumber = 0;

// The Refresh button reloads the data without reloading the page.
refreshButton.addEventListener("click", loadDashboard);

// Loads every item fresh from the database and draws the dashboard.
async function loadDashboard() {
  const thisLoad = ++dashboardLoadNumber;

  // Show that a load is happening, and stop repeat taps meanwhile.
  refreshButton.disabled = true;
  refreshButton.textContent = "Refreshing...";
  showMessage(dashboardListEl, "Loading...");

  try {
    await signedIn;
    const items = await loadItems();
    if (thisLoad === dashboardLoadNumber) renderDashboard(items);
  } catch (err) {
    console.error("Could not load the dashboard:", err);
    if (thisLoad === dashboardLoadNumber) {
      showMessage(dashboardListEl, "Couldn't load the dashboard. Check the connection and tap Refresh.");
    }
  } finally {
    // Turn the button back on once the newest load is done (or failed).
    if (thisLoad === dashboardLoadNumber) {
      refreshButton.disabled = false;
      refreshButton.textContent = "Refresh";
    }
  }
}

// Draws Out, then Low, then Good. Inside each status, items are grouped
// by category in shelf order (loadItems already sorted them by
// sort_order, and filtering keeps that order).
//   <section class="status-section status-out">
//     <h2>Out (3)</h2>
//     <h3>Dairy</h3> <ul><li>Milk <span class="updated">2h ago</span></li>...</ul>
function renderDashboard(items) {
  dashboardListEl.replaceChildren();

  for (const status of DASHBOARD_SECTIONS) {
    const statusItems = items.filter((item) => item.status === status.value);

    const section = document.createElement("section");
    // status-out / status-low / status-good set the red/yellow/green color.
    section.className = `status-section status-${status.value}`;

    const heading = document.createElement("h2");
    heading.textContent = `${status.label} (${statusItems.length})`;
    section.appendChild(heading);

    if (statusItems.length === 0) {
      const none = document.createElement("p");
      none.className = "none";
      none.textContent = "None";
      section.appendChild(none);
    }

    for (const [category, categoryItems] of groupByCategory(statusItems)) {
      const categoryHeading = document.createElement("h3");
      categoryHeading.textContent = category;
      section.appendChild(categoryHeading);

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
      section.appendChild(ul);
    }

    dashboardListEl.appendChild(section);
  }
}

// ---------------------------------------------------------------------
// 9. Start the app
// ---------------------------------------------------------------------
// Sign in once, and keep the promise so both tabs can wait on the same
// sign-in. (Calling ensureSignedIn() twice at the same moment on a first
// visit could create two anonymous users.)
const signedIn = ensureSignedIn();

async function start() {
  showMessage(listEl, "Loading...");
  try {
    await signedIn;
    const items = await loadItems();
    renderList(items);
  } catch (err) {
    // Log the details for debugging, and tell the user in plain words.
    console.error("Could not load the item list:", err);
    showMessage(listEl, "Couldn't load the item list. Check the connection and refresh.");
  }
}

start();
