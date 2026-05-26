// ------------------------------------------------------------------
// Service worker
// ------------------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((err) => {
      console.error('Service worker registration failed', err);
    });
  });

  // Auto-reload when a new SW takes control so updates land without a second refresh.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

// ------------------------------------------------------------------
// Database
// ------------------------------------------------------------------
const db = new Dexie('Gratitude');
db.version(1).stores({
  // `synced` is intentionally NOT indexed — IndexedDB can't index booleans; we filter instead.
  entries: '++id, &uuid, iso_date, timestamp',
});

// ------------------------------------------------------------------
// Date / number helpers
// ------------------------------------------------------------------
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function isoDate(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function uuid() {
  if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
function formatHeading(d) {
  const target = isoDate(d);
  if (target === isoDate(new Date())) return 'Today';
  if (target === isoDate(addDays(new Date(), -1))) return 'Yesterday';
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}
function formatTime(ts) {
  const d = new Date(ts);
  let hr = d.getHours() % 12; if (hr === 0) hr = 12;
  return `${hr}.${String(d.getMinutes()).padStart(2, '0')}`;
}

// ------------------------------------------------------------------
// Seasonal theme — six UK mini-seasons, follows the viewed day's month
// ------------------------------------------------------------------
const SEASON_CLASSES = ['theme-spring', 'theme-earlysummer', 'theme-latesummer', 'theme-autumn', 'theme-advent', 'theme-winter'];
function seasonForDate(d) {
  const m = d.getMonth();
  if (m <= 1) return 'theme-winter';      // Jan–Feb
  if (m <= 3) return 'theme-spring';      // Mar–Apr
  if (m <= 5) return 'theme-earlysummer'; // May–Jun
  if (m <= 8) return 'theme-latesummer';  // Jul–Sep
  if (m <= 10) return 'theme-autumn';     // Oct–Nov
  return 'theme-advent';                  // Dec
}
function applySeason(d) {
  document.body.classList.remove(...SEASON_CLASSES);
  document.body.classList.add(seasonForDate(d));
}

// ------------------------------------------------------------------
// Categories — single source of truth, fixed display order
// ------------------------------------------------------------------
const CATEGORIES = [
  { key: 'wife',   label: 'Bella',  icon: 'ic-heart' },
  { key: 'family', label: 'Family', icon: 'ic-family' },
  { key: 'nature', label: 'Nature', icon: 'ic-leaf' },
  { key: 'me',     label: 'Me',     icon: 'ic-me' },
  { key: 'god',    label: 'God',    icon: 'ic-cross' },
];
const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

// ------------------------------------------------------------------
// State + DOM refs
// ------------------------------------------------------------------
let currentDate = startOfDay(new Date());

const els = {
  date:  document.getElementById('day-date'),
  count: document.getElementById('day-count'),
  prev:  document.getElementById('day-prev'),
  next:  document.getElementById('day-next'),
  today: document.getElementById('day-today'),
  list:  document.getElementById('entry-list'),
  fab:   document.getElementById('fab'),
};

// compose overlay refs
const compose = {
  overlay:  document.getElementById('compose-overlay'),
  close:    document.getElementById('compose-close'),
  date:     document.getElementById('compose-date'),
  field:    document.getElementById('compose-field'),
  chips:    document.getElementById('compose-chips'),
  add:      document.getElementById('compose-add'),
  addLabel: document.getElementById('compose-add-label'),
  selected: null,
};

// ------------------------------------------------------------------
// Data access
// ------------------------------------------------------------------
async function getEntriesForDate(d) {
  return db.entries.where('iso_date').equals(isoDate(d)).toArray();
}

// Used by sync.js to find rows that still need pushing to the sheet.
async function getUnsyncedEntries() {
  return db.entries.filter((e) => !e.synced).toArray();
}
window.getUnsyncedEntries = getUnsyncedEntries;

// ------------------------------------------------------------------
// Actions
// ------------------------------------------------------------------
async function addEntry(text, category) {
  const trimmed = (text || '').trim();
  if (!trimmed) return;
  const onToday = isoDate(currentDate) === isoDate(new Date());
  // For past days, anchor the moment to noon so it can't drift across a day boundary.
  const timestamp = onToday ? Date.now() : startOfDay(currentDate).getTime() + 12 * 3600 * 1000;
  await db.entries.add({
    uuid: uuid(),
    type: 'gratitude',
    timestamp,
    iso_date: isoDate(currentDate),
    text: trimmed,
    category: category || '',
    synced: false,
  });
  await renderDay();
  window.scheduleSync && window.scheduleSync();
}

async function deleteEntry(id) {
  const entry = await db.entries.get(id);
  if (!entry) return;
  // Remove from the sheet first so a later pull doesn't resurrect it on this client.
  if (entry.synced && window.deleteEntryFromSheet) {
    await window.deleteEntryFromSheet(entry.uuid);
  }
  await db.entries.delete(id);
  await renderDay();
}

function setDate(d) {
  currentDate = startOfDay(d);
  renderDay();
}

// ------------------------------------------------------------------
// Rendering
// ------------------------------------------------------------------
// One sketch counter shared across all groups so neighbouring cards always differ.
let sketchCursor = 0;
function entryCard(e) {
  const card = document.createElement('article');
  card.className = `entry s${(sketchCursor++ % 3) + 1}`;

  const p = document.createElement('p');
  p.className = 'entry-text';
  p.textContent = e.text;

  const time = document.createElement('span');
  time.className = 'entry-time';
  time.textContent = formatTime(e.timestamp);

  const del = document.createElement('button');
  del.className = 'entry-del';
  del.type = 'button';
  del.setAttribute('aria-label', 'Delete entry');
  del.textContent = '×';
  del.addEventListener('click', () => deleteEntry(e.id));

  card.append(p, time, del);
  return card;
}

function catGroup(entries, cat) {
  const section = document.createElement('section');
  section.className = cat ? `cat-group is-${cat.key}` : 'cat-group';
  if (cat) {
    const head = document.createElement('h3');
    head.className = 'cat-head';
    head.innerHTML =
      `<svg class="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#${cat.icon}"/></svg>`;
    head.append(document.createTextNode(cat.label));
    section.appendChild(head);
  }
  const list = document.createElement('div');
  list.className = 'entry-list';
  entries.forEach((e) => list.appendChild(entryCard(e)));
  section.appendChild(list);
  return section;
}

async function renderDay() {
  applySeason(currentDate);
  if (els.date) els.date.textContent = formatHeading(currentDate);
  const entries = await getEntriesForDate(currentDate);
  entries.sort((a, b) => a.timestamp - b.timestamp);

  if (els.count) {
    els.count.innerHTML = entries.length
      ? `<strong>${entries.length}</strong> ${entries.length === 1 ? 'thing' : 'things'}`
      : '';
  }

  els.list.innerHTML = '';
  sketchCursor = 0;
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'entry-empty';
    empty.textContent = 'Nothing here yet.';
    els.list.appendChild(empty);
    return;
  }

  // Known categories first, in fixed order; uncategorised/legacy rows fall into a
  // headingless neutral group rendered last.
  for (const cat of CATEGORIES) {
    const group = entries.filter((e) => e.category === cat.key);
    if (group.length) els.list.appendChild(catGroup(group, cat));
  }
  const leftover = entries.filter((e) => !CATEGORY_BY_KEY[e.category]);
  if (leftover.length) els.list.appendChild(catGroup(leftover, null));
}
window.renderDay = renderDay;

// ------------------------------------------------------------------
// Compose (full-screen) controller
// ------------------------------------------------------------------
function buildChips() {
  if (!compose.chips) return;
  compose.chips.innerHTML = '';
  for (const cat of CATEGORIES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip is-${cat.key}`;
    chip.dataset.key = cat.key;
    chip.innerHTML =
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#${cat.icon}"/></svg>`;
    chip.append(document.createTextNode(cat.label));
    chip.addEventListener('click', () => selectChip(cat.key));
    compose.chips.appendChild(chip);
  }
}

function selectChip(key) {
  compose.selected = key;
  if (compose.chips) {
    for (const chip of compose.chips.children) {
      chip.classList.toggle('sel', chip.dataset.key === key);
    }
  }
  updateAddState();
}

function updateAddState() {
  const ready = !!compose.field?.value.trim() && !!compose.selected;
  if (!compose.add) return;
  compose.add.disabled = !ready;
  compose.add.classList.toggle('is-disabled', !ready);
}

function openCompose() {
  if (!compose.overlay) return;
  compose.selected = null;
  if (compose.field) compose.field.value = '';
  if (compose.chips) for (const chip of compose.chips.children) chip.classList.remove('sel');
  if (compose.date) compose.date.textContent = formatHeading(currentDate);
  if (compose.addLabel) {
    const onToday = isoDate(currentDate) === isoDate(new Date());
    compose.addLabel.textContent = onToday ? 'Add to today' : `Add to ${formatHeading(currentDate)}`;
  }
  updateAddState();
  compose.overlay.hidden = false;
  if (compose.field) compose.field.focus();
}

function closeCompose() {
  if (compose.overlay) compose.overlay.hidden = true;
}

function submitCompose() {
  const text = compose.field?.value || '';
  if (!text.trim() || !compose.selected) return;
  addEntry(text, compose.selected);
  closeCompose();
}

// ------------------------------------------------------------------
// Init
// ------------------------------------------------------------------
function init() {
  els.prev && els.prev.addEventListener('click', () => setDate(addDays(currentDate, -1)));
  els.next && els.next.addEventListener('click', () => setDate(addDays(currentDate, 1)));
  els.today && els.today.addEventListener('click', () => setDate(new Date()));

  buildChips();
  els.fab && els.fab.addEventListener('click', openCompose);
  compose.close && compose.close.addEventListener('click', closeCompose);
  compose.field && compose.field.addEventListener('input', updateAddState);
  compose.add && compose.add.addEventListener('click', submitCompose);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && compose.overlay && !compose.overlay.hidden) closeCompose();
  });

  const settingsBtn = document.getElementById('settings-btn');
  settingsBtn && settingsBtn.addEventListener('click', () => window.openSettings && window.openSettings());

  renderDay();
}

init();
