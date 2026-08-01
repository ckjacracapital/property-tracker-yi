let properties = [];
let portfolios = [];

const modalBackdrop = document.getElementById('modal-backdrop');
const propertyForm = document.getElementById('property-form');
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
  const items = properties.filter((p) => p.reachedDueDiligence);
  renderFlatPortfolioSections(panelsEl, items, portfolios, renderCard);
}

function renderCard(p) {
  const el = document.createElement('div');
  el.className = 'card';
  const { done, total } = ddProgress(p);

  el.innerHTML = `<h3></h3><p class="subline"></p><div class="figures"></div><div class="actions"></div>`;
  el.querySelector('h3').textContent = p.propertyAddress || '(no address)';
  el.querySelector('.subline').textContent = `${done} / ${total} checklist items complete`;
  const figuresEl = el.querySelector('.figures');
  const span = document.createElement('span');
  span.textContent = done === total ? 'All documents in place' : `${total - done} outstanding`;
  figuresEl.appendChild(span);
  if (p.reachedHandedOver) {
    const handedSpan = document.createElement('span');
    handedSpan.textContent = 'Handed over';
    figuresEl.appendChild(handedSpan);
  }

  const actions = el.querySelector('.actions');

  const openBtn = document.createElement('button');
  openBtn.textContent = 'Open checklist';
  openBtn.onclick = () => { window.location.href = `due-diligence-detail.html?id=${p.id}`; };
  actions.appendChild(openBtn);

  appendHandoverToggle(actions, p, loadAll);

  appendDeleteButton(actions, () => deleteProperty(p.id));

  return el;
}

async function deleteProperty(id) {
  if (!confirm('Delete this property record?')) return;
  await fetch(`/api/properties/${id}`, { method: 'DELETE' });
  loadAll();
}

function openModal() {
  propertyForm.reset();
  populatePortfolioSelect(portfolioSelect, portfolios, '');
  modalBackdrop.classList.remove('hidden');
}

function closeModal() {
  modalBackdrop.classList.add('hidden');
}

document.getElementById('new-btn').onclick = openModal;
document.getElementById('cancel-btn').onclick = closeModal;

propertyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    propertyAddress: document.getElementById('f-propertyAddress').value,
    bedrooms: document.getElementById('f-bedrooms').value,
    portfolioId: portfolioSelect.value || null,
    startStage: 'due_diligence'
  };
  const property = await fetch('/api/properties', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then((r) => r.json());
  window.location.href = `due-diligence-detail.html?id=${property.id}`;
});

loadAll();
