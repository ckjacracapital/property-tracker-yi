const STAGE = 'inventory';
const GROUP = 'inventory';

let properties = [];
let portfolios = [];

const modalBackdrop = document.getElementById('modal-backdrop');
const propertyForm = document.getElementById('property-form');

async function loadAll() {
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
  el.className = 'card' + (completed ? ' completed-card' : '');

  el.innerHTML = `<h3></h3><p class="subline"></p><div class="actions"></div>`;
  el.querySelector('h3').textContent = p.propertyAddress || '(no address)';
  el.querySelector('.subline').textContent = g.notes ? g.notes.slice(0, 60) : '';

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
    completeBtn.textContent = 'Mark complete';
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
  document.getElementById('f-id').value = property.id;
  document.getElementById('f-address-display').textContent = property.propertyAddress || '(no address)';
  document.getElementById('f-notes').value = (property[GROUP] || {}).notes || '';
  modalBackdrop.classList.remove('hidden');
}

function closeModal() {
  modalBackdrop.classList.add('hidden');
}

document.getElementById('cancel-btn').onclick = closeModal;

propertyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('f-id').value;
  await fetch(`/api/properties/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [GROUP]: { notes: document.getElementById('f-notes').value } })
  });
  closeModal();
  loadAll();
});

loadAll();
