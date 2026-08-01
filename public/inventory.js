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

  const delBtn = document.createElement('button');
  delBtn.className = 'secondary';
  delBtn.textContent = 'Delete';
  delBtn.onclick = () => deleteProperty(p.id);
  actions.appendChild(delBtn);

  return el;
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
