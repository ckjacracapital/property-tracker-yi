function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(diffMs / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const NON_STAGE_PAGE_LABELS = { staff: 'Manage Staff', activity: 'Activity Dashboard' };

function stageLabel(stageId) {
  const found = STAGE_META.find((s) => s.id === stageId);
  if (found) return found.label;
  if (NON_STAGE_PAGE_LABELS[stageId]) return NON_STAGE_PAGE_LABELS[stageId];
  return stageId || 'Unknown page';
}

function describeEvent(e) {
  const d = e.detail || {};
  const who = e.username;
  switch (e.type) {
    case 'login': return `${who} logged in`;
    case 'logout': return `${who} logged out`;
    case 'page_view': return `${who} viewed ${stageLabel(d.stage)}`;
    case 'export': return `${who} exported ${stageLabel(d.stage)} as CSV (${d.rowCount ?? '?'} rows)`;
    case 'property_created': return `${who} added a property (${d.address || d.id || 'unknown'})`;
    case 'property_updated': return `${who} updated a property (${d.address || d.id || 'unknown'})${d.groups && d.groups.length ? ' — ' + d.groups.join(', ') : ''}`;
    case 'property_deleted': return `${who} deleted a property (${d.address || d.id || 'unknown'})`;
    case 'stage_completed': return `${who} completed ${stageLabel(d.stage)} for ${d.address || d.id || 'a property'}`;
    case 'status_changed': return `${who} moved ${d.address || 'a property'} from ${d.from || 'not started'} to ${d.to}`;
    case 'offer_rejected': return `${who} rejected the offer on ${d.address || 'a property'}`;
    case 'offer_reopened': return `${who} reopened the offer on ${d.address || 'a property'}`;
    case 'stage_reopened': return `${who} reopened ${stageLabel(d.stage)} for ${d.address || d.id || 'a property'}`;
    case 'staff_created': return `${who} added staff login "${d.username}"`;
    case 'staff_updated': return `${who} updated staff login "${d.username}"`;
    case 'staff_deleted': return `${who} removed staff login "${d.username}"`;
    case 'portfolio_created': return `${who} created portfolio "${d.name}"`;
    case 'portfolio_updated': return `${who} renamed a portfolio to "${d.name}"`;
    case 'portfolio_deleted': return `${who} deleted portfolio "${d.name}"`;
    default: return `${who} — ${e.type}`;
  }
}

async function loadAll() {
  const me = await initAuth();
  if (!me) return;
  const properties = await fetchProperties();
  renderNav(properties);
  renderNeedsData(properties);
  await refreshActivity();
  setInterval(refreshActivity, 10000);
}

window.onPortfoliosChanged = () => fetchProperties().then(renderNav);

async function refreshActivity() {
  const data = await fetchJSON('/api/activity');
  renderUpdates(data.propertyUpdates || []);
  fetchProperties().then(renderNeedsData);
  renderOnline(data.online);
  renderTimeSpent(data.timeSpent);
  renderFeed(data.feed);
}

function renderOnline(online) {
  document.getElementById('online-count').textContent = online.length;
  const listEl = document.getElementById('online-list');
  listEl.innerHTML = '';
  if (online.length === 0) {
    listEl.innerHTML = '<p class="empty-hint">Nobody is online right now.</p>';
    return;
  }
  const sorted = [...online].sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
  for (const u of sorted) {
    const row = document.createElement('div');
    row.className = 'activity-row';
    row.innerHTML = `<span class="activity-user">${u.username}</span><span class="activity-detail">on ${stageLabel(u.path)}</span><span class="activity-time">${timeAgo(u.lastSeen)}</span>`;
    listEl.appendChild(row);
  }
}

function renderTimeSpent(rows) {
  document.getElementById('timespent-count').textContent = rows.length;
  const listEl = document.getElementById('timespent-list');
  listEl.innerHTML = '';
  if (rows.length === 0) {
    listEl.innerHTML = '<p class="empty-hint">No time tracked yet.</p>';
    return;
  }
  const sorted = [...rows].sort((a, b) => b.seconds - a.seconds);
  for (const r of sorted) {
    const row = document.createElement('div');
    row.className = 'activity-row';
    row.innerHTML = `<span class="activity-user">${r.username}</span><span class="activity-detail">${stageLabel(r.stage)}</span><span class="activity-time">${formatDuration(r.seconds)}</span>`;
    listEl.appendChild(row);
  }
}

function renderFeed(feed) {
  document.getElementById('feed-count').textContent = feed.length;
  const listEl = document.getElementById('feed-list');
  listEl.innerHTML = '';
  if (feed.length === 0) {
    listEl.innerHTML = '<p class="empty-hint">No activity recorded yet.</p>';
    return;
  }
  for (const e of feed) {
    const row = document.createElement('div');
    row.className = 'activity-row';
    row.innerHTML = `<span class="activity-desc">${describeEvent(e)}</span><span class="activity-time">${timeAgo(e.ts)}</span>`;
    listEl.appendChild(row);
  }
}

loadAll();

// --- Property updates: properties added, and moves between stages ---

const NEXT_STAGE_LABEL = {
  offers: 'Acquisitions & Legals',
  acquisitions: 'Refurb & Payment',
  refurb: 'Due Diligence & Inventory'
};

function describeUpdate(e) {
  const d = e.detail || {};
  const who = e.username;
  const addr = d.address || 'a property';
  switch (e.type) {
    case 'property_created':
      return { tag: 'Added', kind: 'added', text: `${addr} added to ${stageLabel(d.stage)} by ${who}` };
    case 'stage_completed':
      return {
        tag: 'Moved', kind: 'moved',
        text: d.stage === 'offers'
          ? `${addr}: offer accepted, moved to ${NEXT_STAGE_LABEL.offers} by ${who}`
          : `${addr} moved from ${stageLabel(d.stage)} to ${NEXT_STAGE_LABEL[d.stage] || 'the next stage'} by ${who}`
      };
    case 'stage_reopened':
      return { tag: 'Moved', kind: 'moved', text: `${addr} moved back to ${stageLabel(d.stage)} by ${who}` };
    case 'status_changed':
      return { tag: 'Timeline', kind: 'moved', text: `${addr}: ${d.from || 'not started'} → ${d.to} (${who})` };
    case 'offer_rejected':
      return { tag: 'Rejected', kind: 'rejected', text: `${addr}: offer rejected by ${who}` };
    case 'offer_reopened':
      return { tag: 'Reopened', kind: 'moved', text: `${addr}: offer reopened by ${who}` };
    default:
      return { tag: e.type, kind: 'moved', text: `${who} — ${e.type}` };
  }
}

function renderUpdates(updates) {
  document.getElementById('updates-count').textContent = updates.length;
  const listEl = document.getElementById('updates-list');
  listEl.innerHTML = '';
  if (updates.length === 0) {
    listEl.innerHTML = '<p class="empty-hint">No properties added or moved yet.</p>';
    return;
  }
  for (const e of updates) {
    const u = describeUpdate(e);
    const row = document.createElement('div');
    row.className = 'activity-row';

    const tag = document.createElement('span');
    tag.className = 'activity-tag ' + u.kind;
    tag.textContent = u.tag;
    const desc = document.createElement('span');
    desc.className = 'activity-desc';
    desc.textContent = u.text;
    const time = document.createElement('span');
    time.className = 'activity-time';
    time.textContent = `${timeAgo(e.ts)} · ${new Date(e.ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;

    row.appendChild(tag);
    row.appendChild(desc);
    row.appendChild(time);
    listEl.appendChild(row);
  }
}

// --- Needs essential data: what's still blank on each live property ---

const ESSENTIAL_CHECKS = [
  {
    stage: 'offers', group: 'offers',
    applies: (p) => isActiveIn(p, 'offers') && !(p.offers && p.offers.rejected),
    fields: [['offerAmount', 'Offer'], ['agentName', 'Agent']]
  },
  {
    stage: 'acquisitions', group: 'acquisitions',
    applies: (p) => isActiveIn(p, 'acquisitions'),
    fields: [
      ['agentName', 'Agent name'], ['agentPhone', 'Agent phone'], ['agentEmail', 'Agent email'],
      ['propertyUsage', 'Property usage'], ['pictures', 'Pictures'], ['floorplan', 'Floorplan'],
      ['refurbRequired', 'Refurb required'], ['purchasePrice', 'Purchase price'], ['targetedRent', 'Rent'],
      ['netYield', 'Net yield'], ['valuationAt8', 'Valuation @8%'], ['totalCapitalLoan', 'Total capital loan'],
      ['refurbCost', 'Refurb cost'], ['utilities', 'Utilities'], ['certs', 'Certs'], ['yiMargin', 'YI margin'],
      ['stampDuty', 'Stamp duty'], ['fees', 'Fees'], ['legals', 'Legals'], ['comms', 'Comms'],
      ['numbersConfirmed', 'Numbers reviewed']
    ]
  },
  {
    stage: 'refurb', group: 'refurb',
    applies: (p) => isActiveIn(p, 'refurb'),
    fields: [['contractor', 'Contractor'], ['contractorAgreement', 'Contractor agreement']]
  },
  {
    stage: 'handed_over', group: 'handedOver',
    applies: (p) => Boolean(p.reachedHandedOver),
    fields: [['dateOfHandover', 'Date of handover'], ['handoverStatus', 'Handover status']]
  }
];

function hasValue(v) {
  return !(v === undefined || v === null || v === '' || v === false);
}

function renderNeedsData(properties) {
  const rows = [];
  for (const check of ESSENTIAL_CHECKS) {
    for (const p of properties) {
      if (!check.applies(p)) continue;
      const g = p[check.group] || {};
      const missing = check.fields.filter(([key]) => !hasValue(g[key])).map(([, label]) => label);
      if (missing.length) rows.push({ p, stage: check.stage, missing });
    }
  }
  rows.sort((a, b) => b.missing.length - a.missing.length);

  document.getElementById('needs-count').textContent = rows.length;

  const summaryEl = document.getElementById('needs-summary');
  const listEl = document.getElementById('needs-list');
  summaryEl.innerHTML = '';
  listEl.innerHTML = '';

  if (rows.length === 0) {
    listEl.innerHTML = '<p class="empty-hint">Nothing outstanding — every live property has its essential data.</p>';
    return;
  }

  const totalMissing = rows.reduce((sum, r) => sum + r.missing.length, 0);
  const byStage = new Map();
  for (const r of rows) byStage.set(r.stage, (byStage.get(r.stage) || 0) + 1);
  const chips = [`${rows.length} ${rows.length === 1 ? 'property needs' : 'properties need'} data`, `${totalMissing} fields missing`];
  for (const [stage, n] of byStage) chips.push(`${stageLabel(stage)}: ${n}`);
  for (const text of chips) {
    const chip = document.createElement('span');
    chip.className = 'acq-reg-stat-chip';
    chip.textContent = text;
    summaryEl.appendChild(chip);
  }

  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'activity-row needs-row';

    const name = document.createElement('span');
    name.className = 'activity-user';
    name.textContent = r.p.propertyAddress || '(no address)';
    const stage = document.createElement('span');
    stage.className = 'activity-detail';
    stage.textContent = stageLabel(r.stage);
    const count = document.createElement('span');
    count.className = 'activity-time';
    count.textContent = `${r.missing.length} missing`;
    const list = document.createElement('div');
    list.className = 'needs-missing';
    for (const label of r.missing) {
      const c = document.createElement('span');
      c.className = 'needs-chip';
      c.textContent = label;
      list.appendChild(c);
    }

    row.appendChild(name);
    row.appendChild(stage);
    row.appendChild(count);
    row.appendChild(list);
    listEl.appendChild(row);
  }
}
