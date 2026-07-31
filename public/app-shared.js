const STAGE_META = [
  { id: 'acquisitions', label: 'Acquisitions & Legals', href: 'acquisitions.html' },
  { id: 'refurb', label: 'Refurb & Payment', href: 'refurb.html' },
  { id: 'due_diligence', label: 'Due Diligence', href: 'due-diligence.html' },
  { id: 'handed_over', label: 'Handed Over', href: 'handed-over.html' },
  { id: 'inventory', label: 'Inventory', href: 'inventory.html' }
];

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  if (res.status === 204) return null;
  return res.json();
}

function fetchProperties() {
  return fetchJSON('/api/properties');
}

function fetchPortfolios() {
  return fetchJSON('/api/portfolios');
}

function isCompletedIn(property, stage) {
  return Boolean(property.stageHistory && property.stageHistory[stage]);
}

function isActiveIn(property, stage) {
  return property.stage === stage && !isCompletedIn(property, stage);
}

function portfolioName(portfolios, id) {
  const found = (portfolios || []).find((p) => p.id === id);
  return found ? found.name : 'Unassigned';
}

function groupByPortfolio(list, portfolios) {
  const groups = {};
  for (const p of list) {
    const key = p.portfolioId ? portfolioName(portfolios, p.portfolioId) : 'Unassigned';
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }
  return Object.keys(groups).sort().map((key) => ({ portfolio: key, items: groups[key] }));
}

function renderNav(properties) {
  const tabsEl = document.getElementById('tabs');
  if (!tabsEl) return;
  const currentStage = document.body.dataset.stage;
  tabsEl.innerHTML = '';
  for (const stage of STAGE_META) {
    const activeCount = properties.filter((p) => isActiveIn(p, stage.id)).length;
    const a = document.createElement('a');
    a.className = 'tab-btn' + (stage.id === currentStage ? ' active' : '');
    a.href = stage.href;
    a.innerHTML = `${stage.label}<span class="tab-count">${activeCount}</span>`;
    tabsEl.appendChild(a);
  }
}

async function refreshNav() {
  const properties = await fetchProperties();
  renderNav(properties);
  return properties;
}

// The Due Diligence checklist, matching the source sheet's columns and
// data-validation lists exactly (5 items are Yes/No only; the rest also
// allow "AFL with Allium" as a resolution).
const YES_NO = ['Yes', 'No'];
const YES_NO_AFL = ['Yes', 'No', 'AFL with Allium'];
const DD_ITEMS = [
  { key: 'loanAgreement', label: 'Loan Agreement', options: YES_NO_AFL },
  { key: 'ch1', label: 'CH1', options: YES_NO_AFL },
  { key: 'beforePhotos', label: 'Before Photos', options: YES_NO_AFL },
  { key: 'afterPhotos', label: 'After Photos', options: YES_NO_AFL },
  { key: 'leases', label: 'Leases', options: YES_NO_AFL },
  { key: 'titlePlan', label: 'Title Plan', options: YES_NO_AFL },
  { key: 'titleReport', label: 'Title Report', options: YES_NO_AFL },
  { key: 'insurance', label: 'Insurance', options: YES_NO_AFL },
  { key: 'fra', label: 'FRA', options: YES_NO_AFL },
  { key: 'asbestos', label: 'Asbestos', options: YES_NO_AFL },
  { key: 'gasCert', label: 'Gas Cert', options: YES_NO_AFL },
  { key: 'eicr', label: 'EICR', options: YES_NO_AFL },
  { key: 'epc', label: 'EPC', options: YES_NO_AFL },
  { key: 'certificateOfTitle', label: 'Certificate of Title', options: YES_NO_AFL },
  { key: 'sdlt5', label: 'SDLT5', options: YES_NO_AFL },
  { key: 'spa', label: 'SPA', options: YES_NO_AFL },
  { key: 'externalPlans', label: 'External Plans', options: YES_NO_AFL },
  { key: 'internalPlans', label: 'Internal Plans', options: YES_NO_AFL },
  { key: 'workingDrawings', label: 'Working Drawings', options: YES_NO_AFL },
  { key: 'agentsParticulars', label: "Agent's Particulars", options: YES_NO_AFL },
  { key: 'contractorAgreements', label: 'Contractor Agreements', options: YES_NO_AFL },
  { key: 'technicalSurveys', label: 'Technical Surveys', options: YES_NO_AFL },
  { key: 'applicableReports', label: 'Applicable Reports', options: YES_NO },
  { key: 'costPlan', label: 'Cost Plan', options: YES_NO },
  { key: 'applicableInvoices', label: 'Applicable Invoices', options: YES_NO },
  { key: 'buildingContract', label: 'Building Contract', options: YES_NO },
  { key: 'warranties', label: 'Warranties', options: YES_NO },
  { key: 'buildingControl', label: 'Building Control', options: YES_NO_AFL },
  { key: 'operatorSignoff', label: 'Operator Signoff', options: YES_NO_AFL },
  { key: 'rpSignoff', label: 'RP Signoff', options: YES_NO_AFL },
  { key: 'scheduleOfRents', label: 'Schedule of Rents', options: YES_NO_AFL },
  { key: 'aflWithAllium', label: 'AFL with Allium', options: YES_NO_AFL },
  { key: 'mortgageRegister', label: 'Mortgage Register', options: YES_NO_AFL }
];

function ddProgress(property) {
  const g = (property && property.dueDiligence) || {};
  const done = DD_ITEMS.filter((item) => g[item.key] === 'Yes' || g[item.key] === 'AFL with Allium').length;
  return { done, total: DD_ITEMS.length };
}

// --- Portfolio select + manage-portfolios modal, shared markup expected on every page ---

function populatePortfolioSelect(selectEl, portfolios, selectedId) {
  selectEl.innerHTML = '<option value="">Unassigned</option>';
  for (const p of portfolios) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === selectedId) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function initPortfolioManager() {
  const openBtn = document.getElementById('manage-portfolios-btn');
  const backdrop = document.getElementById('portfolio-modal-backdrop');
  const closeBtn = document.getElementById('portfolio-modal-close');
  const listEl = document.getElementById('portfolio-list');
  const addForm = document.getElementById('portfolio-add-form');
  const nameInput = document.getElementById('new-portfolio-name');
  if (!openBtn || !backdrop) return;

  async function renderList() {
    const portfolios = await fetchPortfolios();
    listEl.innerHTML = '';
    if (portfolios.length === 0) {
      listEl.innerHTML = '<p class="empty-hint">No portfolios yet.</p>';
    }
    for (const p of portfolios) {
      const row = document.createElement('div');
      row.className = 'portfolio-row';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = p.name;
      row.appendChild(input);
      const saveBtn = document.createElement('button');
      saveBtn.className = 'secondary';
      saveBtn.textContent = 'Save';
      saveBtn.onclick = async () => {
        await fetch(`/api/portfolios/${p.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: input.value })
        });
        renderList();
        if (window.onPortfoliosChanged) window.onPortfoliosChanged();
      };
      row.appendChild(saveBtn);
      const delBtn = document.createElement('button');
      delBtn.className = 'secondary';
      delBtn.textContent = 'Delete';
      delBtn.onclick = async () => {
        if (!confirm(`Delete portfolio "${p.name}"? Properties in it become Unassigned.`)) return;
        await fetch(`/api/portfolios/${p.id}`, { method: 'DELETE' });
        renderList();
        if (window.onPortfoliosChanged) window.onPortfoliosChanged();
      };
      row.appendChild(delBtn);
      listEl.appendChild(row);
    }
  }

  openBtn.onclick = () => {
    backdrop.classList.remove('hidden');
    renderList();
  };
  closeBtn.onclick = () => backdrop.classList.add('hidden');

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!nameInput.value.trim()) return;
    await fetch('/api/portfolios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.value.trim() })
    });
    nameInput.value = '';
    renderList();
    if (window.onPortfoliosChanged) window.onPortfoliosChanged();
  });
}

document.addEventListener('DOMContentLoaded', initPortfolioManager);
