const STAGE = 'offers';
const GROUP = 'offers';

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
window.onFilterChanged = () => { renderNav(properties); render(); };

// An accepted offer moves on to Acquisitions, so this page only ever
// holds offers still at the offer stage: open ones, and rejected ones (shown
// in their own section below).
function isRejected(p) {
  return Boolean((p[GROUP] || {}).rejected);
}

function render() {
  const panelsEl = document.getElementById('panels');
  panelsEl.innerHTML = '';

  const atOfferStage = filterByPortfolio(properties).filter((p) => isActiveIn(p, STAGE));
  const openOffers = atOfferStage.filter((p) => !isRejected(p));
  const rejectedOffers = atOfferStage.filter(isRejected);

  panelsEl.appendChild(renderSection('Offers', openOffers, false));
  panelsEl.appendChild(renderSection('Offer rejected', rejectedOffers, true));
}

function renderSection(title, items, rejected) {
  const block = document.createElement('div');
  block.className = 'section-block';

  const heading = document.createElement('div');
  heading.className = 'section-heading';
  heading.innerHTML = `${title}<span class="count">${items.length}</span>`;
  block.appendChild(heading);

  if (items.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = rejected ? 'No rejected offers.' : 'No open offers right now.';
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
    for (const p of group.items) cardsEl.appendChild(renderCard(p, rejected));
    groupEl.appendChild(cardsEl);
    block.appendChild(groupEl);
  }
  return block;
}

function renderCard(p, rejected) {
  const g = p[GROUP] || {};
  const el = document.createElement('div');
  el.className = 'card' + (rejected ? ' rejected-card' : '');

  el.innerHTML = `<h3></h3><p class="subline"></p><div class="figures"></div><div class="actions"></div>`;
  el.querySelector('h3').textContent = p.propertyAddress || '(no address)';

  const subBits = [g.agentName ? `Agent: ${g.agentName}` : 'No agent added'];
  if (rejected && g.rejectedAt) subBits.push(`Rejected ${new Date(g.rejectedAt).toLocaleDateString('en-GB')}`);
  el.querySelector('.subline').textContent = subBits.join(' · ');

  const figuresEl = el.querySelector('.figures');
  const offer = document.createElement('span');
  offer.textContent = g.offerAmount ? `Offer £${Number(g.offerAmount).toLocaleString()}` : 'No offer entered';
  figuresEl.appendChild(offer);

  const actions = el.querySelector('.actions');

  if (rejected) {
    const reopenBtn = document.createElement('button');
    reopenBtn.className = 'secondary';
    reopenBtn.textContent = 'Reopen offer';
    reopenBtn.onclick = () => setRejected(p.id, false);
    actions.appendChild(reopenBtn);
  } else {
    // Ticking "Accepted" moves the property on to Acquisitions.
    const acceptLabel = document.createElement('label');
    acceptLabel.className = 'accept-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.onchange = () => {
      if (!box.checked) return;
      if (confirm(`Offer accepted on ${p.propertyAddress || 'this property'}?\n\nIt will move to Acquisitions.`)) {
        acceptOffer(p.id);
      } else {
        box.checked = false;
      }
    };
    acceptLabel.appendChild(box);
    acceptLabel.appendChild(document.createTextNode(' Accepted'));
    actions.appendChild(acceptLabel);

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'secondary';
    rejectBtn.textContent = 'Reject';
    rejectBtn.onclick = () => setRejected(p.id, true);
    actions.appendChild(rejectBtn);

    const editBtn = document.createElement('button');
    editBtn.className = 'secondary';
    editBtn.textContent = 'Edit';
    editBtn.onclick = () => openModal(p);
    actions.appendChild(editBtn);
  }

  appendDeleteButton(actions, () => deleteProperty(p.id));

  return el;
}

async function acceptOffer(id) {
  const res = await fetch(`/api/properties/${id}/complete`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    alert(body.error || 'Could not accept this offer.');
  }
  loadAll();
}

async function setRejected(id, rejected) {
  await fetch(`/api/properties/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [GROUP]: { rejected, rejectedAt: rejected ? new Date().toISOString() : '' } })
  });
  // Update in place so the move between sections is instant — the storage
  // backend can take a moment to reflect a write it just accepted.
  const local = properties.find((p) => p.id === id);
  if (local) {
    local[GROUP] = { ...(local[GROUP] || {}), rejected, rejectedAt: rejected ? new Date().toISOString() : '' };
    renderNav(properties);
    render();
  }
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
  modalTitle.textContent = property ? 'Edit Offer' : 'New Offer';
  const g = (property && property[GROUP]) || {};
  document.getElementById('f-propertyAddress').value = property ? property.propertyAddress || '' : '';
  document.getElementById('f-offerAmount').value = g.offerAmount || '';
  document.getElementById('f-agentName').value = g.agentName || '';
  modalBackdrop.classList.remove('hidden');
}

function closeModal() {
  modalBackdrop.classList.add('hidden');
}

document.getElementById('new-btn').onclick = () => openModal(null);
document.getElementById('export-btn').onclick = () => { window.location.href = '/api/export/offers'; };
document.getElementById('cancel-btn').onclick = closeModal;

propertyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('f-id').value;
  const payload = {
    propertyAddress: document.getElementById('f-propertyAddress').value,
    portfolioId: portfolioSelect.value || null,
    [GROUP]: {
      offerAmount: document.getElementById('f-offerAmount').value,
      agentName: document.getElementById('f-agentName').value
    }
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
      body: JSON.stringify({ ...payload, startStage: 'offers' })
    });
  }
  closeModal();
  loadAll();
});

startAutoRefresh(loadAll);
loadAll();
