const STAGE = 'acquisitions';
const GROUP = 'acquisitions';

const GROUP_FIELDS = [
  'status', 'pictureUrl', 'pictures', 'floorplan', 'refurbRequired', 'agentName', 'agentContact',
  'propertyUsage', 'targetedRent', 'netYield', 'valuationAt8', 'totalCapitalLoan',
  'purchasePrice', 'refurbCost', 'utilities', 'certs', 'yiMargin', 'stampDuty',
  'fees', 'legals', 'comms', 'notes'
];
const CHECKBOX_FIELDS = ['numbersConfirmed', 'priority'];

// Every field that counts as a "deal number" — a box gets the needs-numbers
// note if any of these are blank.
const FINANCIAL_FIELDS = [
  'targetedRent', 'netYield', 'valuationAt8', 'totalCapitalLoan', 'purchasePrice',
  'refurbCost', 'utilities', 'certs', 'yiMargin', 'stampDuty', 'fees', 'legals', 'comms'
];

const TIMELINE_STEPS = [
  'Offer Accepted', 'Memo Sent', 'Drafts Received', 'Enquiries Sent',
  'Ready to List', 'Listed', 'Allocated', 'Complete'
];

function missingNumbers(g) {
  return FINANCIAL_FIELDS.some((f) => g[f] === undefined || g[f] === null || g[f] === '');
}

let properties = [];
let portfolios = [];

const modalBackdrop = document.getElementById('modal-backdrop');
const propertyForm = document.getElementById('property-form');
const modalTitle = document.getElementById('modal-title');
const portfolioSelect = document.getElementById('f-portfolioId');

async function loadAll() {
  const me = await initAuth();
  if (!me) return;
  [properties, portfolios] = await Promise.all([fetchProperties(), fetchPortfolios()]);
  renderNav(properties);
  render();
}

window.onPortfoliosChanged = loadAll;

function render() {
  const panelsEl = document.getElementById('panels');
  panelsEl.innerHTML = '';

  const activeItems = properties.filter((p) => isActiveIn(p, STAGE));
  const completedItems = properties.filter((p) => isCompletedIn(p, STAGE));

  panelsEl.appendChild(renderMasthead());
  panelsEl.appendChild(renderToolbar(completedItems));

  panelsEl.appendChild(renderSection('Active', activeItems, false));
  panelsEl.appendChild(renderSection('Completed', completedItems, true));

  panelsEl.appendChild(renderFootnote(activeItems.length + completedItems.length));
}

function renderMasthead() {
  const wrap = document.createElement('div');
  wrap.className = 'acq-reg-masthead';

  const left = document.createElement('div');
  const title = document.createElement('p');
  title.className = 'acq-reg-title';
  title.textContent = 'Acquisitions Register';
  const sub = document.createElement('p');
  sub.className = 'acq-reg-subtitle';
  sub.textContent = 'Acquisitions & Legals — sourcing through completion';
  left.appendChild(title);
  left.appendChild(sub);

  const meta = document.createElement('div');
  meta.className = 'acq-reg-meta';
  const preparedFor = document.createElement('div');
  preparedFor.innerHTML = '<strong>Prepared for</strong> ';
  preparedFor.appendChild(document.createTextNode('Jacra Capital'));
  const asOf = document.createElement('div');
  asOf.innerHTML = '<strong>As of</strong> ';
  asOf.appendChild(document.createTextNode(new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })));
  meta.appendChild(preparedFor);
  meta.appendChild(asOf);

  wrap.appendChild(left);
  wrap.appendChild(meta);
  return wrap;
}

function renderToolbar(completedItems) {
  const wrap = document.createElement('div');
  wrap.className = 'acq-reg-toolbar';

  let totalCapital = 0;
  let totalRent = 0;
  for (const p of completedItems) {
    const g = p[GROUP] || {};
    if (g.totalCapitalLoan) totalCapital += Number(g.totalCapitalLoan) || 0;
    if (g.targetedRent) totalRent += Number(g.targetedRent) || 0;
  }
  const blendedYield = totalCapital > 0 ? (totalRent / totalCapital) * 100 : 0;

  const capChip = document.createElement('span');
  capChip.className = 'acq-reg-stat-chip';
  const capLabel = document.createElement('span');
  capLabel.textContent = 'Capital deployed';
  const capValue = document.createElement('b');
  capValue.textContent = `£${totalCapital.toLocaleString()}`;
  capChip.appendChild(capLabel);
  capChip.appendChild(capValue);

  const yieldChip = document.createElement('span');
  yieldChip.className = 'acq-reg-stat-chip is-headline';
  const yieldLabel = document.createElement('span');
  yieldLabel.textContent = 'Blended yield';
  const yieldValue = document.createElement('b');
  yieldValue.textContent = `${blendedYield.toFixed(1)}%`;
  yieldChip.appendChild(yieldLabel);
  yieldChip.appendChild(yieldValue);

  wrap.appendChild(capChip);
  wrap.appendChild(yieldChip);
  return wrap;
}

function renderFootnote(totalCount) {
  const wrap = document.createElement('div');
  wrap.className = 'acq-reg-footnote';

  const left = document.createElement('span');
  left.textContent = `${totalCount} ${totalCount === 1 ? 'entry' : 'entries'} · grouped by portfolio, ordered by pipeline stage`;

  const legend = document.createElement('span');
  legend.className = 'legend';
  const needsData = document.createElement('span');
  needsData.innerHTML = '<span class="acq-reg-legend-swatch" style="background:var(--jacra-jasper)"></span>Needs data';
  const reviewed = document.createElement('span');
  reviewed.innerHTML = '<span class="acq-reg-rev-check" style="font-size:11px;">&#10003;</span> Numbers reviewed';
  legend.appendChild(needsData);
  legend.appendChild(reviewed);

  wrap.appendChild(left);
  wrap.appendChild(legend);
  return wrap;
}

function renderSection(title, items, completed) {
  const block = document.createElement('div');
  block.className = 'section-block';

  const heading = document.createElement('div');
  heading.className = 'section-heading';
  heading.innerHTML = `${title}<span class="count">${items.length}</span>`;
  block.appendChild(heading);

  if (items.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = completed ? 'Nothing has completed this stage yet.' : 'No properties here right now.';
    block.appendChild(hint);
    return block;
  }

  block.appendChild(renderRegisterTable(items, completed));
  return block;
}

function renderRegisterTable(items, completed) {
  const wrap = document.createElement('div');
  wrap.className = 'acq-register';
  const scroll = document.createElement('div');
  scroll.className = 'acq-register-scroll';
  const table = document.createElement('table');

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th class="acq-reg-thumb-col"></th>
      <th>Property</th>
      <th>Status</th>
      <th>Unit</th>
      <th>Usage</th>
      <th class="acq-reg-rev-col">Numbers Reviewed</th>
      <th class="acq-reg-num">Total capital loan</th>
      <th class="acq-reg-num">Rent p/a</th>
      <th class="acq-reg-num">Yield</th>
    </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const group of groupByPortfolio(items, portfolios)) {
    tbody.appendChild(groupRowEl(group.portfolio, group.items.length));

    for (const stageGroup of groupByStage(group.items)) {
      tbody.appendChild(stageRowEl(stageGroup.stage));
      for (const p of stageGroup.items) tbody.appendChild(renderEntryRow(p, completed));
    }
  }
  table.appendChild(tbody);
  scroll.appendChild(table);
  wrap.appendChild(scroll);
  return wrap;
}

function groupRowEl(portfolioName, count) {
  const tr = document.createElement('tr');
  tr.className = 'acq-reg-group-row';
  const td = document.createElement('td');
  td.colSpan = 9;
  td.appendChild(document.createTextNode(portfolioName));
  const countSpan = document.createElement('span');
  countSpan.className = 'count';
  countSpan.textContent = `${count} ${count === 1 ? 'property' : 'properties'}`;
  td.appendChild(countSpan);
  tr.appendChild(td);
  return tr;
}

function stageRowEl(stageName) {
  const tr = document.createElement('tr');
  tr.className = 'acq-reg-stage-row';
  const td = document.createElement('td');
  td.colSpan = 9;
  td.textContent = stageName;
  tr.appendChild(td);
  return tr;
}

// Splits a portfolio's properties into their sales-progression stages, in
// TIMELINE_STEPS order, so each stage renders as its own labelled row.
function groupByStage(items) {
  const buckets = new Map(TIMELINE_STEPS.map((step) => [step, []]));
  const other = [];
  for (const p of items) {
    const status = (p[GROUP] || {}).status;
    if (status && buckets.has(status)) buckets.get(status).push(p);
    else other.push(p);
  }
  const result = [];
  for (const step of TIMELINE_STEPS) {
    const arr = buckets.get(step);
    if (arr.length) result.push({ stage: step, items: arr });
  }
  if (other.length) result.push({ stage: 'Not yet started', items: other });
  return result;
}

function emptyThumbEl() {
  const div = document.createElement('div');
  div.className = 'acq-reg-thumb-empty';
  return div;
}

function regTagEl(cls, text) {
  const span = document.createElement('span');
  span.className = 'acq-reg-tag ' + cls;
  span.textContent = text;
  return span;
}

function regNumCell(value, unitSuffix) {
  const td = document.createElement('td');
  td.className = 'acq-reg-num-cell';
  if (value === undefined || value === null || value === '') {
    td.classList.add('empty');
    td.textContent = 'NEEDS DATA';
    return td;
  }
  td.appendChild(document.createTextNode(`£${Number(value).toLocaleString()}`));
  if (unitSuffix) {
    const unit = document.createElement('span');
    unit.className = 'unit';
    unit.textContent = unitSuffix;
    td.appendChild(unit);
  }
  return td;
}

function regYieldCell(value) {
  const td = document.createElement('td');
  td.className = 'acq-reg-num-cell acq-reg-yield-cell';
  if (value === undefined || value === null || value === '') {
    td.classList.add('empty');
    td.textContent = 'NEEDS DATA';
  } else {
    td.textContent = `${value}%`;
  }
  return td;
}

function renderEntryRow(p, completed) {
  const g = p[GROUP] || {};
  const tr = document.createElement('tr');
  tr.className = 'acq-reg-entry' + (missingNumbers(g) ? ' acq-reg-flagged' : '');
  tr.onclick = () => openDetailModal(p);

  const thumbTd = document.createElement('td');
  if (g.pictureUrl) {
    const img = document.createElement('img');
    img.className = 'acq-reg-thumb';
    img.src = g.pictureUrl;
    img.alt = '';
    img.onerror = () => { img.remove(); thumbTd.appendChild(emptyThumbEl()); };
    thumbTd.appendChild(img);
  } else {
    thumbTd.appendChild(emptyThumbEl());
  }
  tr.appendChild(thumbTd);

  const addrTd = document.createElement('td');
  addrTd.className = 'acq-reg-addr-cell';
  const addrSpan = document.createElement('span');
  addrSpan.className = 'acq-reg-addr';
  addrSpan.textContent = p.propertyAddress || '(no address)';
  addrTd.appendChild(addrSpan);
  const flags = [];
  if (g.priority) flags.push(regTagEl('priority', '★ PRIORITY'));
  if (missingNumbers(g)) flags.push(regTagEl('needs-data', 'NEEDS DATA'));
  if (flags.length) {
    const flagsWrap = document.createElement('span');
    flagsWrap.className = 'acq-reg-flags';
    flags.forEach((f) => flagsWrap.appendChild(f));
    addrTd.appendChild(flagsWrap);
  }
  tr.appendChild(addrTd);

  const statusTd = document.createElement('td');
  const pill = document.createElement('span');
  pill.className = 'acq-reg-status-pill' + (completed ? ' is-complete' : '');
  pill.textContent = g.status || '—';
  statusTd.appendChild(pill);
  tr.appendChild(statusTd);

  const unitTd = document.createElement('td');
  unitTd.textContent = p.bedrooms ? `${p.bedrooms} bed` : '—';
  tr.appendChild(unitTd);

  const usageTd = document.createElement('td');
  usageTd.className = 'acq-reg-usage';
  usageTd.textContent = g.propertyUsage || '—';
  tr.appendChild(usageTd);

  const revTd = document.createElement('td');
  revTd.className = 'acq-reg-rev-cell';
  const revSpan = document.createElement('span');
  if (g.numbersConfirmed) {
    revSpan.className = 'acq-reg-rev-check';
    revSpan.textContent = '✓';
  } else {
    revSpan.className = 'acq-reg-rev-dash';
    revSpan.textContent = '–';
  }
  revTd.appendChild(revSpan);
  tr.appendChild(revTd);

  tr.appendChild(regNumCell(g.totalCapitalLoan));
  tr.appendChild(regNumCell(g.targetedRent, '/yr'));
  tr.appendChild(regYieldCell(g.netYield));

  return tr;
}

// --- Detail / timeline modal ---

const DETAIL_STAT_FIELDS = [
  ['agentName', 'Agent Name'], ['agentContact', 'Agent Contact'], ['propertyUsage', 'Property Usage'],
  ['pictures', 'Pictures'], ['floorplan', 'Floorplan'],
  ['purchasePrice', 'Purchase Price'], ['targetedRent', 'Rent p/a'], ['netYield', 'Net Yield'],
  ['valuationAt8', 'Valuation @8%'], ['totalCapitalLoan', 'Total Capital Loan'], ['refurbCost', 'Refurb Cost'],
  ['stampDuty', 'Stamp Duty'], ['fees', 'Fees'], ['legals', 'Legals'],
  ['comms', 'Comms'], ['utilities', 'Utilities'], ['certs', 'Certs'], ['yiMargin', 'YI Margin']
];

const TEXT_STAT_FIELDS = ['agentName', 'agentContact', 'propertyUsage', 'pictures', 'floorplan'];

const detailModalBackdrop = document.getElementById('detail-modal-backdrop');
let detailPropertyId = null;

function formatStatValue(field, value) {
  if (value === undefined || value === null || value === '') return '';
  if (TEXT_STAT_FIELDS.includes(field)) return String(value);
  if (field === 'netYield') return `${value}%`;
  return `£${Number(value).toLocaleString()}`;
}

function detailRow(label, value) {
  const row = document.createElement('div');
  const isMissing = !value;
  row.className = 'acq-detail-row' + (isMissing ? ' missing' : '');
  const labelEl = document.createElement('span');
  labelEl.className = 'label';
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className = 'value';
  valueEl.textContent = isMissing ? 'Needs data' : value;
  row.appendChild(labelEl);
  row.appendChild(valueEl);
  return row;
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return '<1m';
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const totalDays = Math.floor(totalHours / 24);
  if (totalDays >= 30) {
    const months = Math.floor(totalDays / 30);
    const days = totalDays % 30;
    return days > 0 ? `${months}mo ${days}d` : `${months}mo`;
  }
  if (totalDays > 0) return hours > 0 ? `${totalDays}d ${hours}h` : `${totalDays}d`;
  if (totalHours > 0) return minutes > 0 ? `${totalHours}h ${minutes}m` : `${totalHours}h`;
  return `${minutes}m`;
}

// Stage duration is derived, not stored: each history entry's time-in-stage
// is the gap to the next entry's enteredAt, and the current (last) entry's
// gap runs to now — so it keeps counting up while a property sits there.
function renderStageHistory(g) {
  const el = document.getElementById('detail-stage-history');
  el.innerHTML = '';
  const history = g.statusHistory || [];
  if (history.length === 0) {
    const hint = document.createElement('p');
    hint.className = 'empty-hint';
    hint.textContent = 'No stage changes recorded yet — history starts tracking from the next move.';
    el.appendChild(hint);
    return;
  }
  const now = Date.now();

  // Per-entry durations, computed once and reused for both the aggregated
  // summary and the chronological log below it.
  const durations = history.map((entry, i) => {
    const isLast = i === history.length - 1;
    const startMs = new Date(entry.enteredAt).getTime();
    const endMs = isLast ? now : new Date(history[i + 1].enteredAt).getTime();
    return endMs - startMs;
  });

  // Summary: total time spent in each stage, in pipeline order — a property
  // that revisited a stage (moved back and forth) has its visits summed.
  const totals = new Map(TIMELINE_STEPS.map((s) => [s, 0]));
  history.forEach((entry, i) => {
    if (totals.has(entry.status)) totals.set(entry.status, totals.get(entry.status) + durations[i]);
  });

  const summaryLabel = document.createElement('p');
  summaryLabel.className = 'acq-history-caption';
  summaryLabel.textContent = 'Summary';
  el.appendChild(summaryLabel);

  const summaryEl = document.createElement('div');
  summaryEl.className = 'acq-history-summary';
  for (const stage of TIMELINE_STEPS) {
    const total = totals.get(stage);
    if (total <= 0) continue;
    summaryEl.appendChild(detailRow(stage, formatDuration(total)));
  }
  el.appendChild(summaryEl);

  const logLabel = document.createElement('p');
  logLabel.className = 'acq-history-caption';
  logLabel.textContent = 'Detailed log';
  el.appendChild(logLabel);

  const logEl = document.createElement('div');
  logEl.className = 'acq-history-log';
  history.forEach((entry, i) => {
    const isLast = i === history.length - 1;

    const row = document.createElement('div');
    row.className = 'acq-history-row';

    const stageEl = document.createElement('span');
    stageEl.className = 'stage' + (isLast ? ' current' : '');
    stageEl.textContent = entry.status;

    const metaEl = document.createElement('span');
    metaEl.className = 'meta';
    metaEl.appendChild(document.createTextNode(`Entered ${formatDateTime(entry.enteredAt)} · `));
    const durationB = document.createElement('b');
    durationB.textContent = formatDuration(durations[i]);
    metaEl.appendChild(durationB);

    row.appendChild(stageEl);
    row.appendChild(metaEl);
    logEl.appendChild(row);
  });
  el.appendChild(logEl);
}

function renderTimeline(currentStatus, propertyId) {
  const el = document.getElementById('detail-timeline');
  el.innerHTML = '';
  const currentIdx = TIMELINE_STEPS.indexOf(currentStatus);
  TIMELINE_STEPS.forEach((step, i) => {
    const stepEl = document.createElement('div');
    const isDone = currentIdx >= 0 && i < currentIdx;
    stepEl.className = 'timeline-step' + (i === currentIdx ? ' active' : '') + (isDone ? ' done' : '');
    stepEl.innerHTML = `<span class="timeline-dot">${isDone ? '✓' : i + 1}</span><span class="timeline-label">${step}</span>`;
    stepEl.onclick = (e) => {
      e.stopPropagation();
      setStatus(propertyId, step);
    };
    el.appendChild(stepEl);
  });
}

async function setStatus(id, status) {
  await fetch(`/api/properties/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [GROUP]: { status } })
  });
  // Update in place and re-render immediately rather than re-fetching —
  // the storage backend can take a few seconds to reflect a write it just
  // accepted, so an immediate re-fetch can briefly show the old value.
  const local = properties.find((p) => p.id === id);
  if (local) {
    const prevStatus = (local.acquisitions || {}).status;
    const history = ((local.acquisitions || {}).statusHistory || []).slice();
    if (status !== prevStatus) history.push({ status, enteredAt: new Date().toISOString() });
    local.acquisitions = { ...(local.acquisitions || {}), status, statusHistory: history };
    local.updatedAt = new Date().toISOString();
    render();
    openDetailModal(local);
  }
  loadAll();
}

function sublineItem(label, value) {
  if (!value) return null;
  const wrap = document.createElement('span');
  wrap.className = 'subline-item';
  const labelEl = document.createElement('span');
  labelEl.className = 'subline-label';
  labelEl.textContent = label;
  wrap.appendChild(labelEl);
  wrap.appendChild(document.createTextNode(String(value)));
  return wrap;
}

function renderDetailSubline(g, p) {
  const el = document.getElementById('detail-subline');
  el.innerHTML = '';
  const items = [
    sublineItem('Property Usage', g.propertyUsage),
    sublineItem('Bedrooms', p.bedrooms ? `${p.bedrooms} bed` : ''),
    sublineItem('Agent', g.agentName)
  ].filter(Boolean);
  items.forEach((item, i) => {
    if (i > 0) el.appendChild(document.createTextNode('   ·   '));
    el.appendChild(item);
  });
}

function openDetailModal(p) {
  const g = p[GROUP] || {};
  detailPropertyId = p.id;

  const imageEl = document.getElementById('detail-image');
  imageEl.innerHTML = '';
  imageEl.className = 'acq-card-image acq-detail-image';
  if (g.pictureUrl) {
    const img = document.createElement('img');
    img.src = g.pictureUrl;
    img.alt = '';
    img.onerror = () => { imageEl.classList.add('acq-no-image'); imageEl.textContent = 'No photo'; };
    imageEl.appendChild(img);
  } else {
    imageEl.classList.add('acq-no-image');
    imageEl.textContent = 'No photo';
  }

  document.getElementById('detail-address').textContent = p.propertyAddress || '(no address)';
  renderDetailSubline(g, p);

  document.getElementById('detail-last-edited').textContent = p.updatedAt ? `Last edited ${formatDateTime(p.updatedAt)}` : '';

  const needsNumbersEl = document.getElementById('detail-needs-numbers');
  needsNumbersEl.classList.toggle('hidden', !missingNumbers(g));

  const numbersReviewedEl = document.getElementById('detail-numbers-reviewed');
  numbersReviewedEl.classList.toggle('hidden', !g.numbersConfirmed);

  renderTimeline(g.status, p.id);

  const statsEl = document.getElementById('detail-stats');
  statsEl.innerHTML = '';
  for (const [field, label] of DETAIL_STAT_FIELDS) {
    statsEl.appendChild(detailRow(label, formatStatValue(field, g[field])));
  }

  document.getElementById('detail-notes').textContent = g.notes || 'No notes.';

  renderStageHistory(g);

  const completed = isCompletedIn(p, STAGE);
  document.getElementById('detail-complete-btn').style.display = completed ? 'none' : '';
  document.getElementById('detail-reopen-btn').style.display = completed ? '' : 'none';

  detailModalBackdrop.classList.remove('hidden');
}

function closeDetailModal() {
  detailModalBackdrop.classList.add('hidden');
  detailPropertyId = null;
}

document.getElementById('detail-close-btn').onclick = closeDetailModal;
document.getElementById('detail-delete-btn').onclick = () => { if (detailPropertyId) deleteProperty(detailPropertyId); closeDetailModal(); };
document.getElementById('detail-complete-btn').onclick = () => { if (detailPropertyId) completeStage(detailPropertyId); closeDetailModal(); };
document.getElementById('detail-reopen-btn').onclick = () => { if (detailPropertyId) reopen(detailPropertyId); closeDetailModal(); };
document.getElementById('detail-edit-btn').onclick = () => {
  const p = properties.find((x) => x.id === detailPropertyId);
  closeDetailModal();
  if (p) openModal(p);
};

async function completeStage(id) {
  await fetch(`/api/properties/${id}/complete`, { method: 'POST' });
  loadAll();
}

async function reopen(id) {
  await fetch(`/api/properties/${id}/reopen`, { method: 'POST' });
  loadAll();
}

async function deleteProperty(id) {
  if (!confirm('Delete this property record?')) return;
  await fetch(`/api/properties/${id}`, { method: 'DELETE' });
  loadAll();
}

function openModal(property) {
  propertyForm.reset();
  populatePortfolioSelect(portfolioSelect, portfolios, property ? property.portfolioId : '');
  document.getElementById('f-id').value = property ? property.id : '';
  modalTitle.textContent = property ? 'Edit Property' : 'New Property';
  if (property) {
    document.getElementById('f-propertyAddress').value = property.propertyAddress || '';
    document.getElementById('f-bedrooms').value = property.bedrooms || '';
    const g = property[GROUP] || {};
    for (const field of GROUP_FIELDS) {
      const el = document.getElementById('f-' + field);
      if (el) el.value = g[field] || '';
    }
    for (const field of CHECKBOX_FIELDS) {
      const el = document.getElementById('f-' + field);
      if (el) el.checked = Boolean(g[field]);
    }
  }
  updatePhotoPreview(property ? (property[GROUP] || {}).pictureUrl : '');
  setPhotoStatus('');
  modalBackdrop.classList.remove('hidden');
}

// --- Photo upload (drag & drop / click-to-browse) ---

const photoDropzone = document.getElementById('photo-dropzone');
const photoFileInput = document.getElementById('f-photo-file');
const photoPreview = document.getElementById('photo-preview');
const photoPreviewImg = document.getElementById('photo-preview-img');
const photoDropzoneHint = document.getElementById('photo-dropzone-hint');
const photoUrlInput = document.getElementById('f-pictureUrl');
const photoStatusEl = document.getElementById('photo-upload-status');

function setPhotoStatus(text, isError) {
  photoStatusEl.textContent = text;
  photoStatusEl.classList.toggle('error', Boolean(isError));
}

function updatePhotoPreview(url) {
  if (url) {
    photoPreviewImg.src = url;
    photoPreview.classList.remove('hidden');
    photoDropzoneHint.classList.add('hidden');
  } else {
    photoPreviewImg.src = '';
    photoPreview.classList.add('hidden');
    photoDropzoneHint.classList.remove('hidden');
  }
}

async function uploadPhoto(file) {
  if (!file.type || !file.type.startsWith('image/')) {
    setPhotoStatus('Please choose an image file.', true);
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    setPhotoStatus('Image is too large (max 8MB).', true);
    return;
  }
  setPhotoStatus('Uploading…');
  try {
    const res = await fetch('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Upload failed');
    }
    const data = await res.json();
    photoUrlInput.value = data.url;
    updatePhotoPreview(data.url);
    setPhotoStatus('Photo uploaded.');
  } catch (err) {
    setPhotoStatus(err.message || 'Upload failed.', true);
  }
}

photoDropzone.onclick = () => photoFileInput.click();

photoFileInput.onchange = () => {
  if (photoFileInput.files[0]) uploadPhoto(photoFileInput.files[0]);
  photoFileInput.value = '';
};

['dragenter', 'dragover'].forEach((evt) => {
  photoDropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    photoDropzone.classList.add('dragover');
  });
});

['dragleave', 'dragend'].forEach((evt) => {
  photoDropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    photoDropzone.classList.remove('dragover');
  });
});

photoDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  photoDropzone.classList.remove('dragover');
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) uploadPhoto(file);
});

photoUrlInput.addEventListener('input', () => {
  updatePhotoPreview(photoUrlInput.value.trim());
  setPhotoStatus('');
});

function closeModal() {
  modalBackdrop.classList.add('hidden');
}

document.getElementById('new-btn').onclick = () => openModal(null);
document.getElementById('export-btn').onclick = () => { window.location.href = '/api/export/acquisitions'; };
document.getElementById('timing-btn').onclick = () => { window.location.href = 'timing.html'; };
document.getElementById('cancel-btn').onclick = closeModal;

propertyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('f-id').value;
  const group = {};
  for (const field of GROUP_FIELDS) {
    const el = document.getElementById('f-' + field);
    if (el) group[field] = el.value;
  }
  for (const field of CHECKBOX_FIELDS) {
    const el = document.getElementById('f-' + field);
    if (el) group[field] = el.checked;
  }
  const payload = {
    propertyAddress: document.getElementById('f-propertyAddress').value,
    bedrooms: document.getElementById('f-bedrooms').value,
    portfolioId: portfolioSelect.value || null,
    [GROUP]: group
  };
  if (id) {
    await fetch(`/api/properties/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } else {
    await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
  closeModal();
  loadAll();
});

loadAll();
