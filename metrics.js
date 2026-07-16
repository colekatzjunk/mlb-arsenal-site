// Metrics tab: cascade+ pitcher profile (grouped percentile sliders), per season.
// Data: data/metrics_index.json (roster + per-year P+) and data/metrics/{id}.json
// (nested by year). The active season is driven globally by the shell's masthead.

const $ = (id) => document.getElementById(id);

let INDEX = null;          // { years, headline, count, pitchers:[{id,name,throws,years:{YYYY:{role,pplus}}}] }
let current = null;        // loaded pitcher metrics object (full, nested by year)
let currentYear = 2026;
let roleFilter = 'SP';
let RANK = {};
const cache = {};          // id -> full nested pitcher file

const LABELS = { csplus: 'CalledStrike+', barrel95plus: 'Scorched+', whiffplus: 'SwStr+', missplus: 'Whiff+' };
const labelOf = (m) => LABELS[m.key] || m.label;

// Sortable leaderboard metrics (all "higher is better" -> default high→low).
const SORTS = [
  { key: 'pplus', label: 'Pitching+', col: 'P+' },
  { key: 'stuffplus', label: 'Stuff+', col: 'Stf' },
  { key: 'kplus', label: 'K+', col: 'K+' },
  { key: 'bbplus', label: 'BB+', col: 'BB+' },
  { key: 'whiffplus', label: 'SwStr+', col: 'SwS' },
  { key: 'missplus', label: 'Whiff+', col: 'Whf' },
  { key: 'csplus', label: 'CalledStrike+', col: 'CS+' },
  { key: 'hardhitplus', label: 'HardHit+', col: 'HH+' },
  { key: 'barrel95plus', label: 'Scorched+', col: 'Scr' },
  { key: 'softplus', label: 'Soft+', col: 'Sft' },
  { key: 'weakplus', label: 'Weak+', col: 'Wk+' },
  { key: 'gbplus', label: 'GB+', col: 'GB+' },
];
let sortKey = 'pplus';
let sortDir = -1;
const sortCfg = () => SORTS.find((s) => s.key === sortKey) || SORTS[0];

// Group-header display overrides (data still uses the original names).
const GROUP_LABELS = {
  'Strikeout & Discipline': 'Strikeout and Walk Ability',
  'Contact Quality (EV+)': 'Induced Contact Quality Ability',
};

// Hover descriptions (pitcher's perspective, all model-projected, not raw results).
const DESC = {
  pplus: "A pitcher's overall pitch quality, where 100 is average.",
  stuffplus: "The raw quality of a pitcher's pitches, regardless of location.",
  kplus: "A pitcher's ability to generate strikeouts.",
  bbplus: "A pitcher's ability to prevent walks. A higher BB+ indicates better walk prevention.",
  whiffplus: "A pitcher's ability to generate swings and misses.",
  missplus: "A pitcher's ability to make hitters miss when they swing.",
  csplus: "A pitcher's ability to earn called strikes on pitches the hitter takes.",
  hardhitplus: "A pitcher's ability to suppress hard contact (95+ mph exit velocity).",
  barrel95plus: "A pitcher's ability to suppress scorched contact (105+ mph exit velocity).",
  softplus: "A pitcher's ability to induce soft contact (80 mph or less exit velocity).",
  weakplus: "A pitcher's ability to induce weak contact (75 mph or less exit velocity).",
  gbplus: "A pitcher's ability to induce ground balls (launch angle below 10 degrees).",
};

const HIDE = new Set([
  'hbpplus',
  'ldplus', 'fbplus', 'puplus',
  'epullplus', 'pullplus', 'centerplus', 'oppoplus', 'eoppoplus',
  'hrplus', 'bipplus',
  'veryhardhitplus',   // dropped: redundant with HardHit+ (95+) and Scorched+ (105+)
]);

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Sidebar leaderboard (current season) ────────────────────────────
function sortedRoster() {
  const y = String(currentYear);
  let items = INDEX.pitchers
    .filter((p) => p.years[y] && p.years[y][sortKey] != null)
    .map((p) => ({ id: p.id, name: p.name, throws: p.throws,
                   role: p.years[y].role, val: p.years[y][sortKey] }));
  if (roleFilter !== 'all') items = items.filter((p) => p.role === roleFilter);
  items.sort((a, b) => (a.val - b.val) * sortDir);
  return items;
}

function renderList() {
  const q = $('m-search').value.toLowerCase().trim();
  const ranked = sortedRoster();   // display order (follows the sort toggle)
  // Rank number + heat color follow the metric's canonical good direction, so a
  // good grade stays rank 1 / red regardless of which way the list is sorted.
  const dir = sortCfg().dir || -1;
  RANK = {};
  [...ranked].sort((a, b) => (a.val - b.val) * dir).forEach((p, i) => { RANK[p.id] = i + 1; });
  const items = q ? ranked.filter((p) => p.name.toLowerCase().includes(q)) : ranked;
  $('m-count').textContent = items.length;
  const total = ranked.length;
  $('mlh-metric').textContent = sortCfg().col;

  const ul = $('m-list'); ul.innerHTML = '';
  for (const p of items) {
    const rank = RANK[p.id];
    const heat = total > 1 ? 100 * (1 - (rank - 1) / (total - 1)) : 100;
    const col = pctColor(heat);
    const li = document.createElement('li');
    li.dataset.id = p.id;
    if (current && current.id === p.id) li.className = 'sel';
    li.innerHTML =
      `<span class="rk${rank <= 3 ? ' top' : ''}">${rank}</span>` +
      `<span class="nm">${p.name} <span class="thr">${p.throws || ''}</span></span>` +
      `<span class="dc" style="color:${col}">${Math.round(p.val)}</span>`;
    li.onclick = () => {
      loadPitcher(p.id);
      window.dispatchEvent(new CustomEvent('arsenal:picked', { detail: { id: p.id } }));
    };
    ul.appendChild(li);
  }
}

// ── Card ────────────────────────────────────────────────────────────
// Diverging percentile color (Savant): 0 = blue (poor), 50 = gray, 100 = red (great).
function pctColor(p) {
  const blue = [59, 111, 181], gray = [128, 138, 154], red = [212, 46, 57];
  let c;
  if (p <= 50) { const t = p / 50; c = blue.map((b, i) => Math.round(b + (gray[i] - b) * t)); }
  else { const t = (p - 50) / 50; c = gray.map((g, i) => Math.round(g + (red[i] - g) * t)); }
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function bar(pct) {
  if (pct == null) return '<div class="m-bar dim"></div>';
  const p = Math.min(100, Math.max(0, pct)), col = pctColor(p);
  return `<div class="m-bar">` +
    `<div class="m-fill" style="width:${p}%;background:${col}"></div>` +
    `<div class="m-dot" style="left:${p}%;background:${col}">${pct}</div>` +
    `</div>`;
}

// ── Hover tooltips ──────────────────────────────────────────────────
let _tip = null;
function getTip() {
  if (!_tip) { _tip = document.createElement('div'); _tip.id = 'm-tip'; document.body.appendChild(_tip); }
  return _tip;
}
function attachTips() {
  const tip = getTip();
  $('m-card').querySelectorAll('[data-desc]').forEach((el) => {
    if (!el.dataset.desc) return;
    el.addEventListener('mouseenter', () => {
      tip.textContent = el.dataset.desc;
      const r = el.getBoundingClientRect();
      tip.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 320)) + 'px';
      tip.style.top = (r.bottom + 6) + 'px';
      tip.classList.add('on');
    });
    el.addEventListener('mouseleave', () => tip.classList.remove('on'));
  });
}

function shownYear(d) {
  if (d.years[String(currentYear)]) return String(currentYear);
  const avail = Object.keys(d.years).map(Number).sort((a, b) => a - b);
  return String(avail[avail.length - 1]);   // fall back to his most recent season
}

function headlinePct(yr) {
  for (const g of yr.groups)
    for (const m of g.metrics)
      if (m.key === INDEX.headline || m.label === 'Pitching+') return m.pct;
  return null;
}

// Year-fallback toast: show, then auto-fade after 5s.
let mNoteTimer;
function mYearNote(msg) {
  const el = $('m-note');
  clearTimeout(mNoteTimer);
  el.textContent = msg || '';
  if (msg) { el.classList.add('on'); mNoteTimer = setTimeout(() => el.classList.remove('on'), 5000); }
  else el.classList.remove('on');
}

function renderCard() {
  const d = current;
  if (!d) return;
  const y = shownYear(d);
  const yr = d.years[y];
  $('mp-name').textContent = d.name;
  const roleLabel = yr.role === 'SP' ? 'Starter' : 'Reliever';
  $('mp-sub').textContent = `${y} · ${d.throws}HP · ${roleLabel} · last ${yr.role === 'SP' ? 'start' : 'appearance'} ${yr.date || '-'}`;
  mYearNote((currentYear && +y !== +currentYear) ? `No ${currentYear} data, showing ${y}` : '');

  const hv = yr.headline;
  const hpct = headlinePct(yr);

  const hcol = hpct != null ? pctColor(hpct) : null;
  let html = '';
  html += `<div class="m-hero" data-desc="${DESC.pplus}">` +
    `<span class="hn"${hcol ? ` style="color:${hcol}"` : ''}>${hv != null ? Math.round(hv) : '-'}</span>` +
    `<div class="hmeta">` +
      `<span class="hlab">Pitching+ · ${y}</span>` +
      (hpct != null
        ? `<span class="hpct"><b style="color:${hcol}">${ordinal(hpct)}</b> percentile among ${yr.role === 'SP' ? 'starters' : 'relievers'}</span>`
        : '') +
    `</div></div>`;

  // POOR / AVERAGE / GREAT reference legend
  html += `<div class="m-legend"><span></span>` +
    `<div class="leg"><span class="poor">POOR</span><span class="avg">AVERAGE</span><span class="great">GREAT</span></div>` +
    `<span></span></div>`;

  for (const g of yr.groups) {
    const rows = g.metrics.filter((m) => !HIDE.has(m.key));
    if (!rows.length) continue;
    html += `<div class="m-group"><h3>${GROUP_LABELS[g.name] || g.name}</h3>`;
    for (const m of rows) {
      const v = m.v, pct = m.pct;
      const dim = v == null ? ' dim' : '';
      html += `<div class="m-row${dim}" data-desc="${DESC[m.key] || ''}">` +
        `<span class="lab">${labelOf(m)}</span>` +
        bar(pct) +
        `<span class="val">${v != null ? v.toFixed(1) : '-'}</span>` +
        `</div>`;
    }
    html += `</div>`;
  }
  $('m-card').innerHTML = html;
  attachTips();
}

async function loadPitcher(id) {
  if (!cache[id]) {
    cache[id] = await (await fetch(`data/metrics/${id}.json`, { cache: 'no-cache' })).json();
  }
  current = cache[id];
  renderCard();
  document.querySelectorAll('#m-list li').forEach((li) =>
    li.classList.toggle('sel', +li.dataset.id === id));
}

// ── Cross-tab bridge ────────────────────────────────────────────────
window.ArsenalMetrics = {
  select: (id) => { if (INDEX) loadPitcher(+id); },
  has: (id) => !!INDEX && INDEX.pitchers.some((p) => p.id === +id),
  setYear: (year) => {
    if (!INDEX) return;
    currentYear = +year;
    renderList();
    if (current) renderCard();
  },
};

// ── Boot ────────────────────────────────────────────────────────────
async function boot() {
  INDEX = await (await fetch('data/metrics_index.json', { cache: 'no-cache' })).json();
  currentYear = window.__arsenalYear || INDEX.years[INDEX.years.length - 1];

  document.querySelectorAll('#m-rolefilter button').forEach((b) => {
    b.onclick = () => {
      roleFilter = b.dataset.role;
      document.querySelectorAll('#m-rolefilter button').forEach((x) => x.classList.toggle('on', x === b));
      renderList();
    };
  });
  $('m-search').oninput = () => renderList();

  const sel = $('m-sortsel');
  sel.innerHTML = SORTS.map((s) => `<option value="${s.key}">${s.label}</option>`).join('');
  sel.value = sortKey;
  sel.onchange = () => {
    sortKey = sel.value; sortDir = sortCfg().dir || -1;
    $('m-sortdir').textContent = sortDir < 0 ? '▼' : '▲';
    renderList();
  };
  $('m-sortdir').onclick = () => {
    sortDir = -sortDir;
    $('m-sortdir').textContent = sortDir < 0 ? '▼' : '▲';
    renderList();
  };

  renderList();
  const top = sortedRoster()[0];
  if (top) loadPitcher(top.id);
}

boot();
