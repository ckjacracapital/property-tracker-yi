const params = new URLSearchParams(window.location.search);
const propertyId = params.get('id');

let property = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A property created just now may not show up on the very next read (the
// storage backend is eventually consistent), so retry briefly before
// concluding it really doesn't exist.
async function loadAll() {
  let properties = await fetchProperties();
  property = properties.find((p) => p.id === propertyId);
  for (const delayMs of [1000, 2000, 3000, 5000]) {
    if (property) break;
    await wait(delayMs);
    properties = await fetchProperties();
    property = properties.find((p) => p.id === propertyId);
  }
  renderNav(properties);
  if (!property) {
    document.getElementById('detail-address').textContent = 'Property not found';
    return;
  }
  render();
}

window.onPortfoliosChanged = loadAll;

function render() {
  document.getElementById('detail-address').textContent = property.propertyAddress || '(no address)';
  const { done, total } = ddProgress(property);
  document.getElementById('detail-progress').textContent = `${done} / ${total} checklist items complete`;

  const g = property.dueDiligence || {};
  const checklistEl = document.getElementById('checklist');
  checklistEl.innerHTML = '';
  for (const item of DD_ITEMS) {
    const row = document.createElement('div');
    row.className = 'checklist-row';
    const label = document.createElement('span');
    label.textContent = item.label;
    row.appendChild(label);

    const select = document.createElement('select');
    select.innerHTML = '<option value=""></option>' + item.options.map((o) => `<option>${o}</option>`).join('');
    select.value = g[item.key] || '';
    select.onchange = () => saveChecklistItem(item.key, select.value);
    row.appendChild(select);

    checklistEl.appendChild(row);
  }

  document.getElementById('f-notes').value = g.notes || '';

  const actionsEl = document.getElementById('stage-actions');
  actionsEl.innerHTML = '';
  actionsEl.appendChild(handoverToggleButton(property, loadAll));
}

async function saveChecklistItem(key, value) {
  await fetch(`/api/properties/${propertyId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dueDiligence: { [key]: value } })
  });
  const properties = await fetchProperties();
  property = properties.find((p) => p.id === propertyId);
  render();
}

document.getElementById('save-notes-btn').onclick = async () => {
  await fetch(`/api/properties/${propertyId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dueDiligence: { notes: document.getElementById('f-notes').value } })
  });
};

loadAll();
