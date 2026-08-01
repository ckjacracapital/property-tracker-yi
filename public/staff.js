async function loadAll() {
  const me = await initAuth();
  if (!me) return;
  const properties = await fetchProperties();
  renderNav(properties);
  await renderStaffList();
  renderNewStaffStages();
}

window.onPortfoliosChanged = loadAll;

async function renderStaffList() {
  const staff = await fetchJSON('/api/staff');
  const listEl = document.getElementById('staff-list');
  listEl.innerHTML = '';
  if (staff.length === 0) {
    listEl.innerHTML = '<p class="empty-hint">No staff logins yet.</p>';
    return;
  }
  for (const user of staff) {
    const row = document.createElement('div');
    row.className = 'staff-row';

    const name = document.createElement('span');
    name.className = 'staff-name';
    name.textContent = user.username;
    row.appendChild(name);

    const adminLabel = document.createElement('label');
    adminLabel.innerHTML = '<input type="checkbox"> Admin (all)';
    const adminCheck = adminLabel.querySelector('input');
    adminCheck.checked = user.allowedStages === 'all';
    row.appendChild(adminLabel);

    const checksWrap = document.createElement('div');
    checksWrap.className = 'stage-checks';
    checksWrap.innerHTML = STAGE_META.map((stage) => {
      const checked = Array.isArray(user.allowedStages) && user.allowedStages.includes(stage.id);
      return `<label><input type="checkbox" value="${stage.id}" ${checked ? 'checked' : ''}> ${stage.label}</label>`;
    }).join('');
    row.appendChild(checksWrap);

    function updateDisabled() {
      checksWrap.querySelectorAll('input').forEach((cb) => { cb.disabled = adminCheck.checked; });
    }
    updateDisabled();
    adminCheck.onchange = updateDisabled;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'secondary';
    saveBtn.textContent = 'Save';
    saveBtn.onclick = async () => {
      const allowedStages = adminCheck.checked
        ? 'all'
        : Array.from(checksWrap.querySelectorAll('input:checked')).map((cb) => cb.value);
      await fetch(`/api/staff/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedStages })
      });
      renderStaffList();
    };
    row.appendChild(saveBtn);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'secondary';
    resetBtn.textContent = 'Reset password';
    resetBtn.onclick = async () => {
      const newPassword = prompt(`New password for ${user.username}:`);
      if (!newPassword) return;
      await fetch(`/api/staff/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      });
      alert('Password updated.');
    };
    row.appendChild(resetBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'secondary';
    delBtn.textContent = 'Delete';
    delBtn.onclick = async () => {
      if (!confirm(`Delete the login for "${user.username}"?`)) return;
      await fetch(`/api/staff/${user.id}`, { method: 'DELETE' });
      renderStaffList();
    };
    row.appendChild(delBtn);

    listEl.appendChild(row);
  }
}

function renderNewStaffStages() {
  const wrap = document.getElementById('new-staff-stages');
  wrap.innerHTML = STAGE_META.map((stage) => `<label><input type="checkbox" class="new-stage-check" value="${stage.id}"> ${stage.label}</label>`).join('');
}

document.getElementById('staff-add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('new-staff-username').value.trim();
  const password = document.getElementById('new-staff-password').value;
  const allowedStages = Array.from(document.querySelectorAll('.new-stage-check:checked')).map((cb) => cb.value);
  const res = await fetch('/api/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, allowedStages })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    alert(body.error || 'Could not create login.');
    return;
  }
  document.getElementById('staff-add-form').reset();
  renderNewStaffStages();
  renderStaffList();
});

loadAll();
