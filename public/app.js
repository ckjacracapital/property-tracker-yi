const STAGES = ['acquisitions_legals', 'refurb_payment', 'due_diligence', 'handed_over'];
const STAGE_LABEL = {
  acquisitions_legals: 'Acquisitions & Legals',
  refurb_payment: 'Refurb & Payment',
  due_diligence: 'Due Diligence',
  handed_over: 'Handed Over'
};

let properties = [];
let activeTab = STAGES[0];

const modalBackdrop = document.getElementById('modal-backdrop');
const propertyForm = document.getElementById('property-form');
const modalTitle = document.getElementById('modal-title');

const EDIT_FIELDS = [
  'portfolio', 'propertyAddress', 'status', 'pictures', 'floorplan', 'refurbRequired',
  'agentName', 'agentContact', 'bedrooms', 'propertyUsage',
  'targetedRent', 'netYield', 'valuationAt8', 'totalCapitalLoan',
  'purchasePrice', 'refurbCost', 'utilities', 'certs', 'yiMargin',
  'stampDuty', 'fees', 'legals', 'comms', 'notes'
];

async function fetchProperties() {
  const res = await fetch('/api/properties');
  properties = await res.json();
  render();
}

function isCompletedIn(property, stage) {
  return Boolean(property.stageHistory && property.stageHistory[stage]);
}

function isActiveIn(property, stage) {
  return property.stage === stage && !isCompletedIn(property, stage);
}

function groupByPortfolio(list) {
  const groups = {};
  for (const p of list) {
    const key = (p.portfolio || '').trim() || 'Unassigned';
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }
  return Object.keys(groups).sort().map(key => ({ portfolio: key, items: groups[key] }));
}

function renderTabs() {
  const tabsEl = document.getElementById('tabs');
  tabsEl.innerHTML = '';
  for (const stage of STAGES) {
    const activeCount = properties.filter(p => isActiveIn(p, stage)).length;
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (stage === activeTab ? ' active' : '');
    btn.innerHTML = `${STAGE_LABEL[stage]}<span class="tab-count">${activeCount}</span>`;
    btn.onclick = () => { activeTab = stage; render(); };
    tabsEl.appendChild(btn);
  }
}

function renderPanels() {
  const panelsEl = document.getElementById('panels');
  panelsEl.innerHTML = '';
  for (const stage of STAGES) {
    const panel = document.createElement('div');
    panel.className = 'panel' + (stage === activeTab ? ' active' : '');

    const activeItems = properties.filter(p => isActiveIn(p, stage));
    const completedItems = properties.filter(p => isCompletedIn(p, stage));

    panel.appendChild(renderSection('Active', activeItems, stage, false));
    panel.appendChild(renderSection('Completed', completedItems, stage, true));

    panelsEl.appendChild(panel);
  }
}

function renderSection(title, items, stage, completed) {
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

  const groups = groupByPortfolio(items);
  for (const group of groups) {
    const groupEl = document.createElement('div');
    groupEl.className = 'portfolio-group';
    const label = document.createElement('div');
    label.className = 'portfolio-label';
    label.textContent = group.portfolio;
    groupEl.appendChild(label);

    const cardsEl = document.createElement('div');
    cardsEl.className = 'cards';
    for (const p of group.items) {
      cardsEl.appendChild(renderCard(p, stage, completed));
    }
    groupEl.appendChild(cardsEl);
    block.appendChild(groupEl);
  }
  return block;
}

function renderCard(p, stage, completed) {
  const el = document.createElement('div');
  el.className = 'card' + (completed ? ' completed-card' : '');

  const subBits = [p.status, p.propertyUsage, p.bedrooms ? `${p.bedrooms} bed` : ''].filter(Boolean).join(' · ');
  const figures = [];
  if (p.purchasePrice) figures.push(`£${Number(p.purchasePrice).toLocaleString()} purchase`);
  if (p.targetedRent) figures.push(`£${Number(p.targetedRent).toLocaleString()} pcm rent`);
  if (p.netYield) figures.push(`${p.netYield}% yield`);
  if (p.agentName) figures.push(p.agentName);

  el.innerHTML = `
    <h3></h3>
    <p class="subline"></p>
    <div class="figures"></div>
    <div class="actions"></div>
  `;
  el.querySelector('h3').textContent = p.propertyAddress || '(no address)';
  el.querySelector('.subline').textContent = subBits;
  const figuresEl = el.querySelector('.figures');
  figures.forEach(f => {
    const span = document.createElement('span');
    span.textContent = f;
    figuresEl.appendChild(span);
  });

  const actions = el.querySelector('.actions');

  if (completed) {
    const when = p.stageHistory[stage] ? new Date(p.stageHistory[stage]).toLocaleDateString() : '';
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
    const nextLabel = stage === 'handed_over' ? 'Mark complete' : `Complete → ${STAGE_LABEL[STAGES[STAGES.indexOf(stage) + 1]]}`;
    const completeBtn = document.createElement('button');
    completeBtn.textContent = nextLabel;
    completeBtn.onclick = () => completeStage(p.id);
    actions.appendChild(completeBtn);

    const editBtn = document.createElement('button');
    editBtn.className = 'secondary';
    editBtn.textContent = 'Edit';
    editBtn.onclick = () => openModal(p);
    actions.appendChild(editBtn);
  }

  const delBtn = document.createElement('button');
  delBtn.className = 'secondary';
  delBtn.textContent = 'Delete';
  delBtn.onclick = () => deleteProperty(p.id);
  actions.appendChild(delBtn);

  return el;
}

function render() {
  renderTabs();
  renderPanels();
}

async function completeStage(id) {
  await fetch(`/api/properties/${id}/complete`, { method: 'POST' });
  fetchProperties();
}

async function reopen(id) {
  await fetch(`/api/properties/${id}/reopen`, { method: 'POST' });
  fetchProperties();
}

async function deleteProperty(id) {
  if (!confirm('Delete this property record?')) return;
  await fetch(`/api/properties/${id}`, { method: 'DELETE' });
  fetchProperties();
}

function openModal(property) {
  propertyForm.reset();
  document.getElementById('f-id').value = property ? property.id : '';
  modalTitle.textContent = property ? 'Edit Property' : 'New Property';
  if (property) {
    for (const field of EDIT_FIELDS) {
      const el = document.getElementById('f-' + field);
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = Boolean(property[field]);
      else el.value = property[field] || '';
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
  const payload = {};
  for (const field of EDIT_FIELDS) {
    const el = document.getElementById('f-' + field);
    if (!el) continue;
    payload[field] = el.type === 'checkbox' ? el.checked : el.value;
  }
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
    activeTab = STAGES[0];
  }
  closeModal();
  fetchProperties();
});

fetchProperties();
