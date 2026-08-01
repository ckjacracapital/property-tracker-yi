const STAGE_ORDER = ['acquisitions', 'refurb', 'due_diligence', 'handed_over', 'inventory'];
const STAGE_HREF = {
  acquisitions: 'acquisitions.html',
  refurb: 'refurb.html',
  due_diligence: 'due-diligence.html',
  handed_over: 'handed-over.html',
  inventory: 'inventory.html'
};

function firstAllowedHref(allowedStages) {
  if (allowedStages === 'all') return 'acquisitions.html';
  for (const s of STAGE_ORDER) {
    if (Array.isArray(allowedStages) && allowedStages.includes(s)) return STAGE_HREF[s];
  }
  return 'login.html';
}

const form = document.getElementById('login-form');
const errorEl = document.getElementById('login-error');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.classList.add('hidden');
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: document.getElementById('f-username').value,
      password: document.getElementById('f-password').value
    })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    errorEl.textContent = body.error || 'Login failed.';
    errorEl.classList.remove('hidden');
    return;
  }
  const me = await res.json();
  window.location.href = firstAllowedHref(me.allowedStages);
});
