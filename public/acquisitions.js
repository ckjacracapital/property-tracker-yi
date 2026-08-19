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

  panelsEl.appendChild(renderSection('Active', activeItems, false));
  panelsEl.appendChild(renderSection('Completed', completedItems, true));
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

  for (const group of groupByPortfolio(items, portfolios)) {
    const groupEl = document.createElement('div');
    groupEl.className = 'portfolio-group';
    const label = document.createElement('div');
    label.className = 'portfolio-label';
    label.textContent = group.portfolio;
    groupEl.appendChild(label);

    const cardsEl = document.createElement('div');
    cardsEl.className = 'acq-grid';
    for (const p of group.items) cardsEl.appendChild(renderCard(p, completed));
    groupEl.appendChild(cardsEl);
    block.appendChild(groupEl);
  }
  return block;
}

function renderCardImage(g) {
  const imgWrap = document.createElement('div');
  imgWrap.className = 'acq-card-image';
  if (g.pictureUrl) {
    const img = document.createElement('img');
    img.src = g.pictureUrl;
    img.alt = '';
    img.onerror = () => { imgWrap.classList.add('acq-no-image'); imgWrap.textContent = 'No photo'; };
    imgWrap.appendChild(img);
  } else {
    imgWrap.classList.add('acq-no-image');
    imgWrap.textContent = 'No photo';
  }
  return imgWrap;
}

function statBlock(value, label) {
  const stat = document.createElement('div');
  const isMissing = !value;
  stat.className = 'acq-stat' + (isMissing ? ' missing' : '');
  const valueEl = document.createElement('span');
  valueEl.className = 'acq-stat-value' + (isMissing ? ' empty' : '');
  valueEl.textContent = value || 'Needs adding';
  const labelEl = document.createElement('span');
  labelEl.className = 'acq-stat-label';
  labelEl.textContent = label;
  stat.appendChild(valueEl);
  stat.appendChild(labelEl);
  return stat;
}

function renderCard(p, completed) {
  const g = p[GROUP] || {};
  const el = document.createElement('div');
  el.className = 'acq-card' + (completed ? ' completed-card' : '') + (g.priority ? ' priority-card' : '');
  el.onclick = () => openDetailModal(p);

  el.appendChild(renderCardImage(g));

  const body = document.createElement('div');
  body.className = 'acq-card-body';

  const h3 = document.createElement('h3');
  h3.textContent = p.propertyAddress || '(no address)';
  body.appendChild(h3);

  const subBits = [g.status, g.priority ? '★ Priority' : '', p.bedrooms ? `${p.bedrooms} bed` : ''].filter(Boolean).join(' · ');
  const sub = document.createElement('p');
  sub.className = 'subline';
  sub.textContent = subBits;
  body.appendChild(sub);

  const stats = document.createElement('div');
  stats.className = 'acq-stats';
  stats.appendChild(statBlock(g.purchasePrice ? `£${Number(g.purchasePrice).toLocaleString()}` : '', 'Purchase'));
  stats.appendChild(statBlock(g.targetedRent ? `£${Number(g.targetedRent).toLocaleString()}` : '', 'Rent p/a'));
  stats.appendChild(statBlock(g.netYield ? `${g.netYield}%` : '', 'Yield'));
  body.appendChild(stats);

  if (missingNumbers(g)) {
    const note = document.createElement('p');
    note.className = 'acq-needs-numbers-note';
    note.textContent = '⚠ Needs numbers added';
    body.appendChild(note);
  }

  el.appendChild(body);
  return el;
}

// --- Detail / timeline modal ---

const DETAIL_STAT_FIELDS = [
  ['agentName', 'Agent Name'], ['agentContact', 'Agent Contact'], ['propertyUsage', 'Property Usage'],
  ['purchasePrice', 'Purchase Price'], ['targetedRent', 'Rent p/a'], ['netYield', 'Net Yield'],
  ['valuationAt8', 'Valuation @8%'], ['totalCapitalLoan', 'Total Capital Loan'], ['refurbCost', 'Refurb Cost'],
  ['stampDuty', 'Stamp Duty'], ['fees', 'Fees'], ['legals', 'Legals'],
  ['comms', 'Comms'], ['utilities', 'Utilities'], ['certs', 'Certs'], ['yiMargin', 'YI Margin']
];

const TEXT_STAT_FIELDS = ['agentName', 'agentContact', 'propertyUsage'];

const detailModalBackdrop = document.getElementById('detail-modal-backdrop');
let detailPropertyId = null;

function formatStatValue(field, value) {
  if (value === undefined || value === null || value === '') return '';
  if (TEXT_STAT_FIELDS.includes(field)) return String(value);
  if (field === 'netYield') return `${value}%`;
  return `£${Number(value).toLocaleString()}`;
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
    local.acquisitions = { ...(local.acquisitions || {}), status };
    render();
    openDetailModal(local);
  }
  loadAll();
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
  document.getElementById('detail-subline').textContent = [g.propertyUsage, p.bedrooms ? `${p.bedrooms} bed` : '', g.agentName].filter(Boolean).join(' · ');

  const needsNumbersEl = document.getElementById('detail-needs-numbers');
  needsNumbersEl.classList.toggle('hidden', !missingNumbers(g));

  renderTimeline(g.status, p.id);

  const statsEl = document.getElementById('detail-stats');
  statsEl.innerHTML = '';
  for (const [field, label] of DETAIL_STAT_FIELDS) {
    statsEl.appendChild(statBlock(formatStatValue(field, g[field]), label));
  }

  document.getElementById('detail-notes').textContent = g.notes || 'No notes.';

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
  modalBackdrop.classList.remove('hidden');
}

function closeModal() {
  modalBackdrop.classList.add('hidden');
}

document.getElementById('new-btn').onclick = () => openModal(null);
document.getElementById('export-btn').onclick = () => { window.location.href = '/api/export/acquisitions'; };
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
