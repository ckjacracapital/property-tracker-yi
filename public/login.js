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

// Some browsers pause a muted autoplay video (e.g. when the tab is
// backgrounded for a moment during load) and never resume it on their own.
// Keep nudging it back to playing rather than leaving it frozen.
const bgVideo = document.getElementById('login-video');
if (bgVideo) {
  const tryPlay = () => bgVideo.play().catch(() => {});
  bgVideo.addEventListener('pause', tryPlay);
  bgVideo.addEventListener('canplay', tryPlay);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tryPlay();
  });
  tryPlay();
}

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
