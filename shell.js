// Shell — top-level tab switching + cross-tab pitcher sync.
// Tabs (Tunnels / Metrics) each own a full sidebar+stage; app.js and metrics.js
// expose window.ArsenalTunnels / window.ArsenalMetrics as thin bridges.

let currentId = null;   // last pitcher chosen in either tab
let activeTab = 'tunnels';

// Remember whoever the user clicks, wherever they click.
window.addEventListener('arsenal:picked', (e) => { currentId = +e.detail.id; });

function showTab(tab) {
  if (tab === activeTab) return;
  activeTab = tab;
  if (location.hash !== `#${tab}`) history.replaceState(null, '', `#${tab}`);
  document.querySelectorAll('#tabs button').forEach((b) =>
    b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('.workspace').forEach((w) =>
    w.classList.toggle('on', w.id === `tab-${tab}`));

  const api = tab === 'tunnels' ? window.ArsenalTunnels : window.ArsenalMetrics;
  if (!api) return;
  // The tunnel WebGL canvas was 0-sized while hidden — refit on reveal.
  if (tab === 'tunnels' && api.resize) requestAnimationFrame(api.resize);
  // Carry the selected pitcher across if this tab has him.
  if (currentId != null && api.has(currentId)) api.select(currentId);
}

document.querySelectorAll('#tabs button').forEach((b) => {
  b.onclick = () => showTab(b.dataset.tab);
});

// Global Season selector (masthead) — drives BOTH tabs so they stay in sync.
// window.__arsenalYear is the source of truth; each tab reads it on boot, so a
// year change made while a tab is still loading isn't lost (it picks it up).
window.__arsenalYear = 2026;
function setYear(year) {
  window.__arsenalYear = year;
  document.querySelectorAll('#yearsel button').forEach((b) =>
    b.classList.toggle('on', +b.dataset.year === year));
  if (window.ArsenalTunnels && window.ArsenalTunnels.setYear) window.ArsenalTunnels.setYear(year);
  if (window.ArsenalMetrics && window.ArsenalMetrics.setYear) window.ArsenalMetrics.setYear(year);
}
document.querySelectorAll('#yearsel button').forEach((b) => {
  b.onclick = () => setYear(+b.dataset.year);
});

// Both tabs should open on the SAME pitcher. Once both are ready, apply the tunnels
// canonical default to both (unless the user already picked one). Tabs load their own
// default first (invisible flash on the hidden tab), then this overrides to match.
function syncDefault() {
  const T = window.ArsenalTunnels, M = window.ArsenalMetrics;
  if (!T || !M || !T.defaultId) { setTimeout(syncDefault, 60); return; }
  if (currentId != null) return;              // a pick already happened
  const id = T.defaultId();
  if (id == null) { setTimeout(syncDefault, 60); return; }   // tunnels index not loaded yet
  currentId = id;
  if (T.has(id)) T.select(id);
  if (M.has(id)) M.select(id);
}
syncDefault();

// Deep-link: index.html#metrics opens the Metrics tab. metrics.js/app.js boot
// async, so defer the initial switch until their bridges are exposed.
if (location.hash === '#metrics') {
  const tryOpen = () => window.ArsenalMetrics ? showTab('metrics') : setTimeout(tryOpen, 60);
  tryOpen();
}
