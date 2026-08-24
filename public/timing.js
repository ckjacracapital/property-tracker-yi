const GROUP = 'acquisitions';

const TIMELINE_STEPS = [
  'Offer Accepted', 'Memo Sent', 'Drafts Received', 'Enquiries Sent',
  'Ready to List', 'Listed', 'Allocated', 'Complete'
];

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return '<1m';
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const totalDays = Math.floor(totalHours / 24);
  if (totalDays >= 30) {
    const months = Math.floor(totalDays / 30);
    const days = totalDays % 30;
    return days > 0 ? `${months}mo ${days}d` : `${months}mo`;
  }
  if (totalDays > 0) return hours > 0 ? `${totalDays}d ${hours}h` : `${totalDays}d`;
  if (totalHours > 0) return minutes > 0 ? `${totalHours}h ${minutes}m` : `${totalHours}h`;
  return `${minutes}m`;
}

async function loadAll() {
  const me = await initAuth();
  if (!me) return;
  const properties = await fetchProperties();
  renderNav(properties);
  render(properties);
}

window.onPortfoliosChanged = loadAll;

// Turns every property's statusHistory into a flat list of per-stage
// durations (gap to the next entry, or to now for whichever stage is
// still current), then buckets those by stage name for averaging.
function computeStageDurations(properties) {
  const now = Date.now();
  const byStage = new Map(TIMELINE_STEPS.map((s) => [s, []]));
  const currentWaits = new Map(TIMELINE_STEPS.map((s) => [s, []]));
  const cycleTimes = [];
  let trackedCount = 0;

  for (const p of properties) {
    const history = ((p[GROUP] || {}).statusHistory) || [];
    if (history.length === 0) continue;
    trackedCount++;

    history.forEach((entry, i) => {
      const isLast = i === history.length - 1;
      const startMs = new Date(entry.enteredAt).getTime();
      const endMs = isLast ? now : new Date(history[i + 1].enteredAt).getTime();
      const duration = endMs - startMs;
      if (byStage.has(entry.status)) byStage.get(entry.status).push(duration);
      if (isLast && currentWaits.has(entry.status)) currentWaits.get(entry.status).push(duration);
    });

    const completeEntry = history.find((e) => e.status === 'Complete');
    if (completeEntry) {
      const startMs = new Date(history[0].enteredAt).getTime();
      const endMs = new Date(completeEntry.enteredAt).getTime();
      cycleTimes.push(endMs - startMs);
    }
  }

  return { byStage, currentWaits, cycleTimes, trackedCount };
}

function average(arr) {
  if (arr.length === 0) return null;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

function render(properties) {
  document.getElementById('timing-as-of').textContent = formatDateTime(new Date().toISOString());

  const { byStage, currentWaits, cycleTimes, trackedCount } = computeStageDurations(properties);

  document.getElementById('timing-total-count').textContent = trackedCount;
  const avgCycle = average(cycleTimes);
  document.getElementById('timing-cycle-time').textContent = avgCycle === null ? '—' : formatDuration(avgCycle);

  const rowsEl = document.getElementById('timing-rows');
  rowsEl.innerHTML = '';

  let anyData = false;
  for (const stage of TIMELINE_STEPS) {
    const durations = byStage.get(stage);
    const waits = currentWaits.get(stage);
    if (durations.length > 0) anyData = true;

    const tr = document.createElement('tr');
    tr.className = 'acq-reg-entry';

    const stageTd = document.createElement('td');
    stageTd.className = 'acq-reg-addr';
    stageTd.textContent = stage;
    tr.appendChild(stageTd);

    const avgTd = document.createElement('td');
    avgTd.className = 'acq-reg-num-cell';
    const avg = average(durations);
    avgTd.textContent = avg === null ? '—' : formatDuration(avg);
    tr.appendChild(avgTd);

    const countTd = document.createElement('td');
    countTd.className = 'acq-reg-num-cell';
    countTd.textContent = String(durations.length);
    tr.appendChild(countTd);

    const longestTd = document.createElement('td');
    longestTd.className = 'acq-reg-num-cell';
    const longest = waits.length > 0 ? Math.max(...waits) : null;
    longestTd.textContent = longest === null ? '—' : formatDuration(longest);
    tr.appendChild(longestTd);

    rowsEl.appendChild(tr);
  }

  document.getElementById('timing-empty-hint').style.display = anyData ? 'none' : '';
}

loadAll();
