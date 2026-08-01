const GROUP = 'inventory';

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
  const items = properties.filter((p) => p.reachedInventory);
  renderFlatPortfolioSections(panelsEl, items, portfolios, renderCard);
}

function renderCard(p) {
  const g = p[GROUP] || {};
  const el = document.createElement('div');
  el.className = 'card';

  el.innerHTML = `<h3></h3><p class="subline"></p><div class="actions"></div>`;
  el.querySelector('h3').textContent = p.propertyAddress || '(no address)';
  el.querySelector('.subline').textContent = g.notes ? g.notes.slice(0, 60) : '';

  const actions = el.querySelector('.actions');

  const editBtn = document.createElement('button');
  editBtn.textContent = 'Edit';
  editBtn.onclick = () => openModal(p);
  actions.appendChild(editBtn);

  appendDeleteButton(actions, () => deleteProperty(p.id));

  return el;
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
  modalTitle.textContent = property ? 'Edit Inventory' : 'New Property';
  document.getElementById('f-propertyAddress').value = property ? property.propertyAddress || '' : '';
  document.getElementById('f-bedrooms').value = property ? property.bedrooms || '' : '';
  document.getElementById('f-notes').value = (property && property[GROUP] && property[GROUP].notes) || '';
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
  const payload = {
    propertyAddress: document.getElementById('f-propertyAddress').value,
    bedrooms: document.getElementById('f-bedrooms').value,
    portfolioId: portfolioSelect.value || null,
    [GROUP]: { notes: document.getElementById('f-notes').value }
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
      body: JSON.stringify({ ...payload, startStage: 'inventory' })
    });
  }
  closeModal();
  loadAll();
});

loadAll();
