// Acquisitions and Refurb are "gated" stages with an open/complete split, so
// their nav count is the number currently active there. Due Diligence and
// Handed Over have no gate — a property either has reached that stage or
// hasn't — so their count is just how many have the flag set.
const STAGE_META = [
  { id: 'offers', label: 'Offers', href: 'offers.html', count: (props) => props.filter((p) => isActiveIn(p, 'offers') && !(p.offers && p.offers.rejected)).length },
  { id: 'acquisitions', label: 'Acquisitions & Legals', href: 'acquisitions.html', count: (props) => props.filter((p) => isActiveIn(p, 'acquisitions')).length },
  { id: 'refurb', label: 'Refurb & Payment', href: 'refurb.html', count: (props) => props.filter((p) => isActiveIn(p, 'refurb')).length },
  { id: 'due_diligence', label: 'Due Diligence', href: 'due-diligence.html', count: (props) => props.filter((p) => p.reachedDueDiligence).length },
  { id: 'handed_over', label: 'Handed Over', href: 'handed-over.html', count: (props) => props.filter((p) => p.reachedHandedOver).length }
];

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  if (res.status === 204) return null;
  return res.json();
}

// The storage backend can take a few seconds to reflect a write it has already
// accepted, so a re-fetch straight after saving can come back without the
// change (a new property missing, an edit reverted). To hide that, every
// property write that succeeds is remembered for a short while, and
// fetchProperties() lays those writes over whatever the server returns until
// the server has caught up. Writes are spotted by wrapping fetch, so no page
// needs to know about it.
const WRITE_GRACE_MS = 20000;
const recentWrites = new Map(); // property id -> { property } | { deleted: true }, plus `at`

const nativeFetch = window.fetch.bind(window);
window.fetch = async function (input, init) {
  const res = await nativeFetch(input, init);
  try {
    const url = typeof input === 'string' ? input : input.url;
    const method = ((init && init.method) || 'GET').toUpperCase();
    const m = url.match(/^\/api\/properties(?:\/([^/?]+))?(?:\/(complete|reopen))?$/);
    if (m && method !== 'GET' && res.ok) {
      const id = m[1];
      if (method === 'DELETE' && id) {
        recentWrites.set(id, { deleted: true, at: Date.now() });
      } else if (res.status !== 204 && id !== 'bulk-delete' && id !== 'bulk-import') {
        const property = await res.clone().json();
        if (property && property.id) recentWrites.set(property.id, { property, at: Date.now() });
      }
    }
  } catch { /* bookkeeping only — never break the real request */ }
  return res;
};

function reconcileProperties(list) {
  const now = Date.now();
  for (const [id, w] of recentWrites) if (now - w.at > WRITE_GRACE_MS) recentWrites.delete(id);
  if (recentWrites.size === 0) return list;
  const byId = new Map(list.map((p) => [p.id, p]));
  for (const [id, w] of recentWrites) {
    if (w.deleted) { byId.delete(id); continue; }
    const fetched = byId.get(id);
    const fetchedAt = fetched ? Date.parse(fetched.updatedAt || 0) : -1;
    if (!fetched || fetchedAt < Date.parse(w.property.updatedAt || 0)) byId.set(id, w.property);
  }
  return Array.from(byId.values());
}

async function fetchProperties() {
  const list = await fetchJSON('/api/properties');
  return Array.isArray(list) ? reconcileProperties(list) : list;
}

// Pages call this once so lists keep themselves current (other people's
// changes, or anything the storage was slow to show) without a manual refresh.
// It skips while the tab is hidden or a popup is open, so it never yanks a form
// out from under someone.
let autoRefreshStarted = false;
function startAutoRefresh(refreshFn, intervalMs = 15000) {
  if (autoRefreshStarted) return;
  autoRefreshStarted = true;
  const tick = () => {
    if (document.hidden) return;
    if (document.querySelector('[id$="modal-backdrop"]:not(.hidden)')) return;
    refreshFn();
  };
  setInterval(tick, intervalMs);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}

function fetchPortfolios() {
  return fetchJSON('/api/portfolios');
}

// --- Session: who's logged in, and which stages can they see ---

let currentUser = null;

async function fetchMe() {
  const res = await fetch('/api/auth/me');
  if (!res.ok) return null;
  return res.json();
}

function stageAllowedForCurrentUser(stageId) {
  if (!currentUser) return false;
  if (currentUser.allowedStages === 'all') return true;
  return Array.isArray(currentUser.allowedStages) && currentUser.allowedStages.includes(stageId);
}

function firstAllowedHref(allowedStages) {
  if (allowedStages === 'all') return 'acquisitions.html';
  for (const stage of STAGE_META) {
    if (Array.isArray(allowedStages) && allowedStages.includes(stage.id)) return stage.href;
  }
  return 'login.html';
}

// Every page calls this before loading any data. Redirects away (and
// returns null) if the session is missing or isn't allowed on this page —
// this is defense in depth alongside the edge function's own page gate,
// since a session can expire mid-visit.
async function initAuth() {
  currentUser = await fetchMe();
  if (!currentUser) {
    window.location.href = 'login.html';
    return null;
  }
  const requiredStage = document.body.dataset.stage;
  if (requiredStage && !stageAllowedForCurrentUser(requiredStage)) {
    window.location.href = firstAllowedHref(currentUser.allowedStages);
    return null;
  }
  if (document.body.dataset.adminOnly === 'true' && currentUser.allowedStages !== 'all') {
    window.location.href = firstAllowedHref(currentUser.allowedStages);
    return null;
  }

  const staffBtn = document.getElementById('manage-staff-btn');
  if (staffBtn) {
    staffBtn.style.display = currentUser.allowedStages === 'all' ? '' : 'none';
    staffBtn.onclick = () => { window.location.href = 'staff.html'; };
  }

  const activityBtn = document.getElementById('activity-btn');
  if (activityBtn) {
    activityBtn.style.display = currentUser.allowedStages === 'all' ? '' : 'none';
    activityBtn.onclick = () => { window.location.href = 'activity.html'; };
  }

  startActivityPing(document.body.dataset.stage || document.body.dataset.pageId || 'other');

  // Portfolio create/rename/delete is admin-only server-side; hide the
  // entry point for restricted staff rather than let it silently no-op.
  const portfoliosBtn = document.getElementById('manage-portfolios-btn');
  if (portfoliosBtn && currentUser.allowedStages !== 'all') {
    portfoliosBtn.style.display = 'none';
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = 'login.html';
    };
  }

  return currentUser;
}

// Pings the server every 20s while this page is visible so the admin
// Activity dashboard can show who's online and how long they've spent on
// each page. The first ping (initial:true) also logs a page-view event.
let activityPingStarted = false;
function startActivityPing(stage) {
  // initAuth() runs again on every page refresh — start the timer only once,
  // otherwise each refresh stacks another one and inflates time-spent figures.
  if (activityPingStarted) return;
  activityPingStarted = true;
  let first = true;
  const ping = () => {
    if (document.hidden) return;
    fetch('/api/activity/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, initial: first })
    }).catch(() => {});
    first = false;
  };
  ping();
  setInterval(ping, 20000);
}

function isCompletedIn(property, stage) {
  return Boolean(property.stageHistory && property.stageHistory[stage]);
}

function isActiveIn(property, stage) {
  return property.stage === stage && !isCompletedIn(property, stage);
}

function portfolioName(portfolios, id) {
  const found = (portfolios || []).find((p) => p.id === id);
  return found ? found.name : 'Unassigned';
}

function groupByPortfolio(list, portfolios) {
  const groups = {};
  for (const p of list) {
    const key = p.portfolioId ? portfolioName(portfolios, p.portfolioId) : 'Unassigned';
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }
  return Object.keys(groups).sort().map((key) => ({ portfolio: key, items: groups[key] }));
}

// For the three flag-based stages (no open/complete split): one heading with
// a total count, then properties grouped by portfolio underneath.
function renderFlatPortfolioSections(panelsEl, items, portfolios, cardRenderer) {
  panelsEl.innerHTML = '';

  const heading = document.createElement('div');
  heading.className = 'section-heading';
  heading.innerHTML = `Properties<span class="count">${items.length}</span>`;
  panelsEl.appendChild(heading);

  if (items.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = 'No properties here right now.';
    panelsEl.appendChild(hint);
    return;
  }

  for (const group of groupByPortfolio(items, portfolios)) {
    const groupEl = document.createElement('div');
    groupEl.className = 'portfolio-group';
    const label = document.createElement('div');
    label.className = 'portfolio-label';
    label.textContent = group.portfolio;
    groupEl.appendChild(label);

    const cardsEl = document.createElement('div');
    cardsEl.className = 'cards';
    for (const p of group.items) cardsEl.appendChild(cardRenderer(p));
    groupEl.appendChild(cardsEl);
    panelsEl.appendChild(groupEl);
  }
}

// --- Portfolio filter (lives in the sidebar, applies to every page's lists) ---

const PORTFOLIO_FILTER_KEY = 'jacra.portfolioFilter';

// Held in memory as well as localStorage: if the browser refuses to store
// anything (private windows, strict privacy settings) the filter still works
// for as long as the page is open instead of silently doing nothing.
let portfolioFilterMemory = null;

function currentPortfolioFilter() {
  if (portfolioFilterMemory !== null) return portfolioFilterMemory;
  try { return localStorage.getItem(PORTFOLIO_FILTER_KEY) || ''; } catch { return ''; }
}

function setPortfolioFilter(value) {
  portfolioFilterMemory = value;
  try { localStorage.setItem(PORTFOLIO_FILTER_KEY, value); } catch { /* just won't persist across pages */ }
}

// '' = all portfolios, 'none' = unassigned, otherwise a portfolio id.
function filterByPortfolio(list) {
  const f = currentPortfolioFilter();
  if (!f) return list;
  if (f === 'none') return list.filter((p) => !p.portfolioId);
  return list.filter((p) => p.portfolioId === f);
}

function sideHeading(text) {
  const el = document.createElement('div');
  el.className = 'side-heading';
  el.textContent = text;
  return el;
}

function sideLink(label, href, active, count) {
  const a = document.createElement('a');
  a.className = 'tab-btn' + (active ? ' active' : '');
  a.href = href;
  a.appendChild(document.createTextNode(label));
  if (count !== undefined) {
    const span = document.createElement('span');
    span.className = 'tab-count';
    span.textContent = count;
    a.appendChild(span);
  }
  return a;
}

// The filter sits at the top of each page's content (not in the sidebar).
// Only pages whose lists respond to it define window.onFilterChanged.
function renderPortfolioFilterBar() {
  const main = document.querySelector('main');
  if (!main || typeof window.onFilterChanged !== 'function') return;

  const old = document.getElementById('portfolio-filter-bar');
  if (old) old.remove();
  const bar = document.createElement('div');
  bar.id = 'portfolio-filter-bar';
  bar.className = 'portfolio-filter-bar';
  main.insertBefore(bar, main.firstChild);

  fetchPortfolios().then((list) => {
    const portfolios = list || [];
    let current = currentPortfolioFilter();
    if (current && current !== 'none' && !portfolios.some((p) => p.id === current)) {
      // The saved portfolio was deleted — fall back to everything.
      current = '';
      setPortfolioFilter('');
      window.onFilterChanged();
      return;
    }
    const label = document.createElement('span');
    label.className = 'pfb-label';
    label.textContent = 'Filter by portfolio';
    bar.appendChild(label);
    const options = [{ value: '', label: 'All portfolios' }]
      .concat(portfolios.map((p) => ({ value: p.id, label: p.name })))
      .concat([{ value: 'none', label: 'Unassigned' }]);
    for (const opt of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pfb-chip' + (opt.value === current ? ' active' : '');
      btn.textContent = opt.label;
      btn.onclick = () => {
        if (opt.value === currentPortfolioFilter()) return;
        setPortfolioFilter(opt.value);
        window.onFilterChanged();
      };
      bar.appendChild(btn);
    }
  }).catch(() => {});
}

function renderNav(properties) {
  const tabsEl = document.getElementById('tabs');
  if (!tabsEl) return;
  const currentStage = document.body.dataset.stage;
  const onToolPage = Boolean(document.body.dataset.pageId);
  const here = window.location.pathname.split('/').pop();
  const visible = filterByPortfolio(properties || []);
  tabsEl.innerHTML = '';

  tabsEl.appendChild(sideHeading('Sections'));
  for (const stage of STAGE_META.filter((s) => stageAllowedForCurrentUser(s.id))) {
    tabsEl.appendChild(sideLink(stage.label, stage.href, !onToolPage && stage.id === currentStage, stage.count(visible)));
  }

  const tools = [];
  if (stageAllowedForCurrentUser('acquisitions')) tools.push(['Stage Timing', 'timing.html']);
  if (currentUser && currentUser.allowedStages === 'all') {
    tools.push(['Activity', 'activity.html'], ['Manage staff', 'staff.html']);
  }
  if (tools.length) {
    tabsEl.appendChild(sideHeading('Tools'));
    for (const [label, href] of tools) tabsEl.appendChild(sideLink(label, href, here === href));
  }

  renderPortfolioFilterBar();
}

async function refreshNav() {
  const properties = await fetchProperties();
  renderNav(properties);
  return properties;
}

// The Due Diligence checklist, matching the source sheet's columns and
// data-validation lists exactly (5 items are Yes/No only; the rest also
// allow "AFL with Allium" as a resolution).
const YES_NO = ['Yes', 'No'];
const YES_NO_AFL = ['Yes', 'No', 'AFL with Allium'];
const DD_ITEMS = [
  { key: 'loanAgreement', label: 'Loan Agreement', options: YES_NO_AFL },
  { key: 'ch1', label: 'CH1', options: YES_NO_AFL },
  { key: 'beforePhotos', label: 'Before Photos', options: YES_NO_AFL },
  { key: 'afterPhotos', label: 'After Photos', options: YES_NO_AFL },
  { key: 'leases', label: 'Leases', options: YES_NO_AFL },
  { key: 'titlePlan', label: 'Title Plan', options: YES_NO_AFL },
  { key: 'titleReport', label: 'Title Report', options: YES_NO_AFL },
  { key: 'insurance', label: 'Insurance', options: YES_NO_AFL },
  { key: 'fra', label: 'FRA', options: YES_NO_AFL },
  { key: 'asbestos', label: 'Asbestos', options: YES_NO_AFL },
  { key: 'gasCert', label: 'Gas Cert', options: YES_NO_AFL },
  { key: 'eicr', label: 'EICR', options: YES_NO_AFL },
  { key: 'epc', label: 'EPC', options: YES_NO_AFL },
  { key: 'certificateOfTitle', label: 'Certificate of Title', options: YES_NO_AFL },
  { key: 'sdlt5', label: 'SDLT5', options: YES_NO_AFL },
  { key: 'spa', label: 'SPA', options: YES_NO_AFL },
  { key: 'externalPlans', label: 'External Plans', options: YES_NO_AFL },
  { key: 'internalPlans', label: 'Internal Plans', options: YES_NO_AFL },
  { key: 'workingDrawings', label: 'Working Drawings', options: YES_NO_AFL },
  { key: 'agentsParticulars', label: "Agent's Particulars", options: YES_NO_AFL },
  { key: 'contractorAgreements', label: 'Contractor Agreements', options: YES_NO_AFL },
  { key: 'technicalSurveys', label: 'Technical Surveys', options: YES_NO_AFL },
  { key: 'applicableReports', label: 'Applicable Reports', options: YES_NO },
  { key: 'costPlan', label: 'Cost Plan', options: YES_NO },
  { key: 'applicableInvoices', label: 'Applicable Invoices', options: YES_NO },
  { key: 'buildingContract', label: 'Building Contract', options: YES_NO },
  { key: 'warranties', label: 'Warranties', options: YES_NO },
  { key: 'buildingControl', label: 'Building Control', options: YES_NO_AFL },
  { key: 'operatorSignoff', label: 'Operator Signoff', options: YES_NO_AFL },
  { key: 'rpSignoff', label: 'RP Signoff', options: YES_NO_AFL },
  { key: 'scheduleOfRents', label: 'Schedule of Rents', options: YES_NO_AFL },
  { key: 'aflWithAllium', label: 'AFL with Allium', options: YES_NO_AFL },
  { key: 'mortgageRegister', label: 'Mortgage Register', options: YES_NO_AFL }
];

function ddProgress(property) {
  const g = (property && property.dueDiligence) || {};
  const done = DD_ITEMS.filter((item) => g[item.key] === 'Yes' || g[item.key] === 'AFL with Allium').length;
  return { done, total: DD_ITEMS.length };
}

// Shared "Move to Handed Over" / "Remove from Handed Over" toggle, used on
// both the Due Diligence list and its per-property checklist page. This is
// the one deliberate manual click that moves a property into Handed Over —
// nothing does it automatically. Setting the flag requires 'handed_over'
// permission server-side, so a session without it doesn't get the button.
function appendHandoverToggle(actions, property, onChanged) {
  if (!stageAllowedForCurrentUser('handed_over')) return;
  const btn = document.createElement('button');
  if (property.reachedHandedOver) {
    btn.className = 'secondary';
    btn.textContent = 'Remove from Handed Over';
  } else {
    btn.textContent = 'Move to Handed Over';
  }
  btn.onclick = async () => {
    await fetch(`/api/properties/${property.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reachedHandedOver: !property.reachedHandedOver })
    });
    onChanged();
  };
  actions.appendChild(btn);
}

// Delete removes a property from every stage at once, so (matching the
// server-side check) only an admin session gets the button at all rather
// than clicking it and silently hitting a 403.
function appendDeleteButton(actions, onDelete) {
  if (!currentUser || currentUser.allowedStages !== 'all') return;
  const delBtn = document.createElement('button');
  delBtn.className = 'secondary';
  delBtn.textContent = 'Delete';
  delBtn.onclick = onDelete;
  actions.appendChild(delBtn);
}

// --- Portfolio select + manage-portfolios modal, shared markup expected on every page ---

function populatePortfolioSelect(selectEl, portfolios, selectedId) {
  selectEl.innerHTML = '<option value="">Unassigned</option>';
  for (const p of portfolios) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === selectedId) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function initPortfolioManager() {
  const openBtn = document.getElementById('manage-portfolios-btn');
  const backdrop = document.getElementById('portfolio-modal-backdrop');
  const closeBtn = document.getElementById('portfolio-modal-close');
  const listEl = document.getElementById('portfolio-list');
  const addForm = document.getElementById('portfolio-add-form');
  const nameInput = document.getElementById('new-portfolio-name');
  if (!openBtn || !backdrop) return;

  async function renderList() {
    const portfolios = await fetchPortfolios();
    listEl.innerHTML = '';
    if (portfolios.length === 0) {
      listEl.innerHTML = '<p class="empty-hint">No portfolios yet.</p>';
    }
    for (const p of portfolios) {
      const row = document.createElement('div');
      row.className = 'portfolio-row';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = p.name;
      row.appendChild(input);
      const saveBtn = document.createElement('button');
      saveBtn.className = 'secondary';
      saveBtn.textContent = 'Save';
      saveBtn.onclick = async () => {
        await fetch(`/api/portfolios/${p.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: input.value })
        });
        renderList();
        if (window.onPortfoliosChanged) window.onPortfoliosChanged();
      };
      row.appendChild(saveBtn);
      const delBtn = document.createElement('button');
      delBtn.className = 'secondary';
      delBtn.textContent = 'Delete';
      delBtn.onclick = async () => {
        if (!confirm(`Delete portfolio "${p.name}"? Properties in it become Unassigned.`)) return;
        await fetch(`/api/portfolios/${p.id}`, { method: 'DELETE' });
        renderList();
        if (window.onPortfoliosChanged) window.onPortfoliosChanged();
      };
      row.appendChild(delBtn);
      listEl.appendChild(row);
    }
  }

  openBtn.onclick = () => {
    backdrop.classList.remove('hidden');
    renderList();
  };
  closeBtn.onclick = () => backdrop.classList.add('hidden');

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!nameInput.value.trim()) return;
    await fetch('/api/portfolios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.value.trim() })
    });
    nameInput.value = '';
    renderList();
    if (window.onPortfoliosChanged) window.onPortfoliosChanged();
  });
}

document.addEventListener('DOMContentLoaded', initPortfolioManager);
