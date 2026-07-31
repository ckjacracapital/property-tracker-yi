const STAGE = 'due_diligence';

let properties = [];
let portfolios = [];

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
  const el = document.createElement('div');
  el.className = 'card' + (completed ? ' completed-card' : '');
  const { done, total } = ddProgress(p);

  el.innerHTML = `<h3></h3><p class="subline"></p><div class="figures"></div><div class="actions"></div>`;
  el.querySelector('h3').textContent = p.propertyAddress || '(no address)';
  el.querySelector('.subline').textContent = `${done} / ${total} checklist items complete`;
  const figuresEl = el.querySelector('.figures');
  const span = document.createElement('span');
  span.textContent = done === total ? 'All documents in place' : `${total - done} outstanding`;
  figuresEl.appendChild(span);

  const actions = el.querySelector('.actions');

  const openBtn = document.createElement('button');
  openBtn.textContent = 'Open checklist';
  openBtn.onclick = () => { window.location.href = `due-diligence-detail.html?id=${p.id}`; };
  actions.appendChild(openBtn);

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
  }

  const delBtn = document.createElement('button');
  delBtn.className = 'secondary';
  delBtn.textContent = 'Delete';
  delBtn.onclick = () => deleteProperty(p.id);
  actions.appendChild(delBtn);

  return el;
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

loadAll();
