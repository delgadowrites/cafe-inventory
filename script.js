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
      const li = document.createElement("li");
      li.className = "item";
      li.dataset.id = item.id; // handy later for saving a status (#2)
      li.textContent = item.name;
      ul.appendChild(li);
    }
    section.appendChild(ul);

    listEl.appendChild(section);
  }
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
// 6. Start the app
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
