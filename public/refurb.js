const STAGE = 'refurb';
const GROUP = 'refurb';
const NUM_WEEKS = 12;
const NUM_PAYMENTS = 6;

let properties = [];
let portfolios = [];

const modalBackdrop = document.getElementById('modal-backdrop');
const propertyForm = document.getElementById('property-form');
const modalTitle = document.getElementById('modal-title');
const portfolioSelect = document.getElementById('f-portfolioId');
const weekGrid = document.getElementById('week-grid');
const paymentGrid = document.getElementById('payment-grid');
const totalPaidDisplay = document.getElementById('total-paid-display');

// Build the fixed 12-week and 6-payment inputs once.
for (let i = 0; i < NUM_WEEKS; i++) {
  const label = document.createElement('label');
  label.innerHTML = `Wk ${i + 1} <input type="text" id="f-week-${i}" placeholder="Note for this week">`;
  weekGrid.appendChild(label);
}
for (let i = 0; i < NUM_PAYMENTS; i++) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <label>Pay ${i + 1} date <input type="date" id="f-pay-date-${i}"></label>
    <label>Pay ${i + 1} £ <input type="number" id="f-pay-amount-${i}" oninput="updateTotalPaid()"></label>
  `;
  paymentGrid.appendChild(row);
}

function updateTotalPaid() {
  let total = 0;
  for (let i = 0; i < NUM_PAYMENTS; i++) {
    const val = Number(document.getElementById(`f-pay-amount-${i}`).value);
    if (!isNaN(val)) total += val;
  }
  totalPaidDisplay.textContent = `£${total.toLocaleString()}`;
}

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

  const weeksNoted = (g.weeks || []).filter(Boolean).length;
  const totalPaid = (g.payments || []).reduce((sum, pay) => sum + (Number(pay && pay.amount) || 0), 0);

  const subBits = [g.contractor, g.contractorAgreement ? `Agreement: ${g.contractorAgreement}` : ''].filter(Boolean).join(' · ');
  const figures = [`${weeksNoted}/${NUM_WEEKS} weeks noted`, `£${totalPaid.toLocaleString()} paid`];

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
    completeBtn.textContent = 'Complete → Due Diligence & Inventory';
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

async function deleteProperty(id) {
  if (!confirm('Delete this property record?')) return;
  await fetch(`/api/properties/${id}`, { method: 'DELETE' });
  loadAll();
}

async function completeStage(id) {
  await fetch(`/api/properties/${id}/complete`, { method: 'POST' });
  loadAll();
}

async function reopen(id) {
  await fetch(`/api/properties/${id}/reopen`, { method: 'POST' });
  loadAll();
}

function openModal(property) {
  propertyForm.reset();
  populatePortfolioSelect(portfolioSelect, portfolios, property ? property.portfolioId : '');
  document.getElementById('f-id').value = property ? property.id : '';
  modalTitle.textContent = property ? 'Edit Refurb & Payment' : 'New Property';
  document.getElementById('f-propertyAddress').value = property ? property.propertyAddress || '' : '';
  document.getElementById('f-bedrooms').value = property ? property.bedrooms || '' : '';

  const g = (property && property[GROUP]) || {};
  document.getElementById('f-contractor').value = g.contractor || '';
  document.getElementById('f-contractorAgreement').value = g.contractorAgreement || '';

  const weeks = g.weeks || [];
  for (let i = 0; i < NUM_WEEKS; i++) {
    document.getElementById(`f-week-${i}`).value = weeks[i] || '';
  }
  const payments = g.payments || [];
  for (let i = 0; i < NUM_PAYMENTS; i++) {
    const pay = payments[i] || {};
    document.getElementById(`f-pay-date-${i}`).value = pay.date || '';
    document.getElementById(`f-pay-amount-${i}`).value = pay.amount || '';
  }
  updateTotalPaid();

  document.getElementById('f-notes').value = g.notes || '';
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
  const weeks = [];
  for (let i = 0; i < NUM_WEEKS; i++) weeks.push(document.getElementById(`f-week-${i}`).value);
  const payments = [];
  for (let i = 0; i < NUM_PAYMENTS; i++) {
    payments.push({
      date: document.getElementById(`f-pay-date-${i}`).value,
      amount: document.getElementById(`f-pay-amount-${i}`).value
    });
  }
  const group = {
    contractor: document.getElementById('f-contractor').value,
    contractorAgreement: document.getElementById('f-contractorAgreement').value,
    weeks,
    payments,
    notes: document.getElementById('f-notes').value
  };
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
      body: JSON.stringify({ ...payload, startStage: 'refurb' })
    });
  }
  closeModal();
  loadAll();
});

loadAll();
