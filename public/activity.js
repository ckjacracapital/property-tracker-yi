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
  await refreshActivity();
  setInterval(refreshActivity, 10000);
}

window.onPortfoliosChanged = () => fetchProperties().then(renderNav);

async function refreshActivity() {
  const data = await fetchJSON('/api/activity');
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
