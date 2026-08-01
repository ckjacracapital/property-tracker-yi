const STAGE = 'acquisitions';
const GROUP = 'acquisitions';

const GROUP_FIELDS = [
  'status', 'pictures', 'floorplan', 'refurbRequired', 'agentName', 'agentContact',
  'propertyUsage', 'targetedRent', 'netYield', 'valuationAt8', 'totalCapitalLoan',
  'purchasePrice', 'refurbCost', 'utilities', 'certs', 'yiMargin', 'stampDuty',
  'fees', 'legals', 'comms', 'notes'
];
const CHECKBOX_FIELDS = ['numbersConfirmed', 'priority'];

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
    cardsEl.className = 'cards';
    for (const p of group.items) cardsEl.appendChild(renderCard(p, completed));
    groupEl.appendChild(cardsEl);
    block.appendChild(groupEl);
  }
  return block;
}

function renderCard(p, completed) {
  const g = p[GROUP] || {};
  const el = document.createElement('div');
  el.className = 'card' + (completed ? ' completed-card' : '') + (g.priority ? ' priority-card' : '');

  const subBits = [g.status, g.propertyUsage, p.bedrooms ? `${p.bedrooms} bed` : ''].filter(Boolean).join(' · ');
  const figures = [];
  if (g.priority) figures.push('★ Priority');
  if (g.numbersConfirmed) figures.push('Numbers confirmed');
  if (g.purchasePrice) figures.push(`£${Number(g.purchasePrice).toLocaleString()} purchase`);
  if (g.targetedRent) figures.push(`£${Number(g.targetedRent).toLocaleString()} pcm rent`);
  if (g.netYield) figures.push(`${g.netYield}% yield`);
  if (g.agentName) figures.push(g.agentName);

  el.innerHTML = `<h3></h3><p class="subline"></p><div class="figures"></div><div class="actions"></div>`;
  el.querySelector('h3').textContent = p.propertyAddress || '(no address)';
  el.querySelector('.subline').textContent = subBits;
  const figuresEl = el.querySelector('.figures');
  figures.forEach((f) => {
    const span = document.createElement('span');
    span.textContent = f;
    figuresEl.appendChild(span);
  });

  const actions = el.querySelector('.actions');

  if (completed) {
    const when = p.stageHistory[STAGE] ? new Date(p.stageHistory[STAGE]).toLocaleDateString() : '';
    const doneNote = document.createElement('span');
    doneNote.className = 'subline';
    doneNote.style.margin = '0';
    doneNote.textContent = `Completed ${when}`;
    actions.appendChild(doneNote);

    const reopenBtn = document.createElement('button');
    reopenBtn.className = 'secondary';
    reopenBtn.textContent = 'Reopen';
    reopenBtn.onclick = () => reopen(p.id);
    actions.appendChild(reopenBtn);
  } else {
    const completeBtn = document.createElement('button');
    completeBtn.textContent = 'Complete → Refurb & Payment';
    completeBtn.onclick = () => completeStage(p.id);
    actions.appendChild(completeBtn);

    const editBtn = document.createElement('button');
    editBtn.className = 'secondary';
    editBtn.textContent = 'Edit';
    editBtn.onclick = () => openModal(p);
    actions.appendChild(editBtn);
  }

  appendDeleteButton(actions, () => deleteProperty(p.id));

  return el;
}

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
