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
    showMessage("No items found.");
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

// Builds one item row: the name, then the Out / Low / Good buttons.
//   <li class="item" data-id="12">
//     <span class="item-name">Milk</span>
//     <div class="status-buttons">
//       <button data-status="out" aria-pressed="false">Out</button> ...
function renderItem(item) {
  const li = document.createElement("li");
  li.className = "item";
  li.dataset.id = item.id; // tells the click handler which item was tapped

  const name = document.createElement("span");
  name.className = "item-name";
  name.textContent = item.name;
  li.appendChild(name);

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
}

// Shows a single line of text in place of the list
// (used for "Loading..." and for errors).
function showMessage(text) {
  const p = document.createElement("p");
  p.className = "message";
  p.textContent = text;
  listEl.replaceChildren(p);
}

// ---------------------------------------------------------------------
// 7. Start the app
// ---------------------------------------------------------------------
async function start() {
  showMessage("Loading...");
  try {
    await ensureSignedIn();
    const items = await loadItems();
    renderList(items);
  } catch (err) {
    // Log the details for debugging, and tell the user in plain words.
    console.error("Could not load the item list:", err);
    showMessage("Couldn't load the item list. Check the connection and refresh.");
  }
}

start();
