import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// ── Constants (match export_pitch_data.py) ──────────────────────────
const Y_PLATE = 17 / 12;          // ft, front of plate
const TUNNEL_Y = 35;              // ft from plate = commit point
const N_SAMPLES = 150;
const FADE_N = 10;       // trail fades in from the field color over ~3.5 ft so no hard dot sits on the release point
const GROUND = 0;
const TRAIL_BG = new THREE.Color(0x11331f);   // field color the trail fades from
const BALL_R = 0.19;     // ball marker radius (ft). True baseball ≈0.12; exaggerated ~1.6x for visibility.

// Statcast (x=side, y=dist from plate, z=height) -> three.js (x, up=y, z=dist).
// Negate x: Statcast x is catcher's-perspective (RHP release is negative x). Flipping
// makes the default behind-the-mound (center-field cam) view read with correct
// handedness — a LHP shows on the correct side.
const toScene = (sx, height, ydist) => new THREE.Vector3(-sx, height, ydist);

// ── DOM ─────────────────────────────────────────────────────────────
const holder = document.getElementById('canvas-holder');
const $ = (id) => document.getElementById(id);

// ── Renderer / scene / camera ───────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x0a0e14, 1);
holder.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3;
controls.maxDistance = 120;

// ── Lights ──────────────────────────────────────────────────────────
scene.add(new THREE.HemisphereLight(0xbcd3ff, 0x0a1018, 1.15));
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(-8, 30, 20);
scene.add(key);

// ── Field ───────────────────────────────────────────────────────────
buildField();

function buildField() {
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 160),
    new THREE.MeshStandardMaterial({ color: 0x11331f, roughness: 1 })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.z = 26;
  scene.add(grass);

  // dirt mound area
  const dirt = new THREE.Mesh(
    new THREE.CircleGeometry(9, 48),
    new THREE.MeshStandardMaterial({ color: 0x5a3d29, roughness: 1 })
  );
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.set(0, 0.01, 59);          // mound center: 59 ft from the plate apex (18" in front of rubber)
  scene.add(dirt);

  // pitching rubber — 24" wide, 60'6" from the back tip of home plate
  const rubber = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.08, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xf2f2f2 })
  );
  rubber.position.set(0, 0.05, 60.5);
  scene.add(rubber);

  // home-plate dirt circle
  const bd = new THREE.Mesh(
    new THREE.CircleGeometry(10, 48),
    new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 })
  );
  bd.rotation.x = -Math.PI / 2;
  bd.position.set(0, 0.008, 1);
  scene.add(bd);

  // home plate
  const plateShape = new THREE.Shape();
  const w = 0.708;   // half of the 17" front edge
  // Exact 17"×17" plate: 17" front edge, 8.5" straight sides, then two 12" edges to
  // the tip. Front edge (local y=0) faces the pitcher; the tip (local y=2w) maps to
  // world -z (catcher side) under the -90° rotation. Apex lands at world z=0.
  plateShape.moveTo(-w, 0); plateShape.lineTo(w, 0);
  plateShape.lineTo(w, w); plateShape.lineTo(0, 2 * w);
  plateShape.lineTo(-w, w); plateShape.lineTo(-w, 0);
  const plate = new THREE.Mesh(
    new THREE.ShapeGeometry(plateShape),
    new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.set(0, 0.02, Y_PLATE);   // front edge at the plate line
  scene.add(plate);

  // depth reference lines (every 10 ft)
  const refMat = new THREE.LineBasicMaterial({ color: 0x1d2a3a });
  for (let y = 10; y <= 55; y += 10) {
    const g = new THREE.BufferGeometry().setFromPoints([
      toScene(-4, 0.02, y), toScene(4, 0.02, y),
    ]);
    scene.add(new THREE.Line(g, refMat));
  }

  buildReferences();
}

// Accurate chalk reference markings (world coords; symmetric, so no lefty-mirror).
function buildReferences() {
  const chalk = new THREE.LineBasicMaterial({ color: 0xd8e0ea, transparent: true, opacity: 0.4 });
  const gy = 0.03;
  // Batter's boxes: 4 ft wide × 6 ft long, inner edge 6" (0.5 ft) off the plate's
  // side, the 6-ft length centered on the plate center (apex at z=0, front edge at
  // Y_PLATE) → 3 ft toward the pitcher and 3 ft toward the catcher.
  const zc = Y_PLATE / 2;
  const zF = zc + 3, zB = zc - 3;
  const xi = 0.708 + 0.5;
  const xo = xi + 4;
  for (const s of [1, -1]) {
    const box = [
      new THREE.Vector3(s * xi, gy, zB), new THREE.Vector3(s * xo, gy, zB),
      new THREE.Vector3(s * xo, gy, zF), new THREE.Vector3(s * xi, gy, zF),
      new THREE.Vector3(s * xi, gy, zB),
    ];
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(box), chalk));
  }
  // Foul lines: coincide with the plate's 12" edges (45° toward 1B/3B). Drawn from
  // the front edge of the batter's box outward, so the line doesn't cross into the
  // box — on a real field the box interrupts the line near home.
  const zStart = zF;                 // box front edge, on the foul line (x = z here)
  const dEnd = 80 * Math.SQRT1_2;
  for (const s of [1, -1]) {
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(
      [new THREE.Vector3(s * zStart, gy, zStart), new THREE.Vector3(s * dEnd, gy, dEnd)]), chalk));
  }
}

// Strike zone (rebuilt per pitcher for sz height; default here)
let zoneGroup = new THREE.Group();
scene.add(zoneGroup);
function buildZone(top = 3.4, bot = 1.6) {
  zoneGroup.clear();
  const hw = 0.83;
  const mat = new THREE.LineBasicMaterial({ color: 0xdfe8f2, transparent: true, opacity: 0.75 });
  const pts = [
    toScene(-hw, bot, Y_PLATE), toScene(hw, bot, Y_PLATE),
    toScene(hw, top, Y_PLATE), toScene(-hw, top, Y_PLATE), toScene(-hw, bot, Y_PLATE),
  ];
  zoneGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  // thirds
  const thin = new THREE.LineBasicMaterial({ color: 0x33465c, transparent: true, opacity: 0.6 });
  for (let i = 1; i < 3; i++) {
    const x = -hw + (2 * hw) * i / 3;
    zoneGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(
      [toScene(x, bot, Y_PLATE), toScene(x, top, Y_PLATE)]), thin));
    const zz = bot + (top - bot) * i / 3;
    zoneGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(
      [toScene(-hw, zz, Y_PLATE), toScene(hw, zz, Y_PLATE)]), thin));
  }
}

buildZone();

// ── Per-pitcher dynamic objects ─────────────────────────────────────
let pitchObjs = [];        // {cat,color,path[],ball,trail,mat,tunnelMark,visible}
let releaseGroup = new THREE.Group(); scene.add(releaseGroup);
let current = null;

function solveT(relY, vy0, ay, targetY) {
  const a = 0.5 * ay, b = vy0, c = relY - targetY;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a + 1e-12), t2 = (-b + sq) / (2 * a + 1e-12);
  const cand = [t1, t2].filter((t) => t > 0);
  return cand.length ? Math.min(...cand) : null;
}

function clearPitcher() {
  for (const o of pitchObjs) {
    scene.remove(o.ball); scene.remove(o.trail);
    scene.remove(o.tunnelMark);
    o.mat.dispose(); o.trail.geometry.dispose(); o.ball.geometry.dispose();
  }
  pitchObjs = [];
  releaseGroup.clear();
  clearCatchFx();
}

function buildPitcher(data) {
  clearPitcher();
  current = data;

  // strike zone height: use plate z extents loosely
  buildZone();

  const yStart = Math.max(...data.pitches.map((p) => p.rel[1]));
  current._yStart = yStart;
  current._commitFrac = (yStart - TUNNEL_Y) / (yStart - Y_PLATE);
  // Real flight duration represented by a full 0->1 scrub (avg pitch, seconds).
  current._refFlight = data.pitches.reduce((s, p) => s + p.t_plate, 0) / data.pitches.length;

  for (const p of data.pitches) {
    const [rx, ry, rz] = p.rel, [vx, vy, vz] = p.v, [ax, ay, az] = p.a;
    // sample path by shared distance-from-plate
    const path = [];
    for (let i = 0; i < N_SAMPLES; i++) {
      const s = i / (N_SAMPLES - 1);
      // Shared distance wavefront: all pitches sampled at the same dist-from-plate.
      const yT = yStart + (Y_PLATE - yStart) * s;
      let t = solveT(ry, vy, ay, yT);
      if (t === null || yT >= ry) t = 0;
      t = Math.min(Math.max(t, 0), p.t_plate);
      const x = rx + vx * t + 0.5 * ax * t * t;
      const h = rz + vz * t + 0.5 * az * t * t;
      const yd = ry + vy * t + 0.5 * ay * t * t;
      path.push(toScene(x, h, yd));
    }

    const color = new THREE.Color(p.color);
    // Per-vertex colors that fade from the field color at the release into the
    // pitch color, so the trail emerges from the hand without leaving a dot.
    const colorsFull = new Float32Array(path.length * 3);
    for (let i = 0; i < path.length; i++) {
      const c = TRAIL_BG.clone().lerp(color, Math.min(i / FADE_N, 1));
      colorsFull[i * 3] = c.r; colorsFull[i * 3 + 1] = c.g; colorsFull[i * 3 + 2] = c.b;
    }
    const geom = new LineGeometry();
    geom.setPositions(flatten(path));
    geom.setColors(Array.from(colorsFull));
    const mat = new LineMaterial({
      vertexColors: true, linewidth: 3.2, transparent: true, opacity: 0.95, dashed: false,
    });
    mat.resolution.set(holder.clientWidth, holder.clientHeight);
    const trail = new Line2(geom, mat);
    trail.computeLineDistances();
    scene.add(trail);

    // ball
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 20, 20),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.4 })
    );
    scene.add(ball);

    // tunnel + plate ring markers
    const tunnelMark = ring(color, 0.11); tunnelMark.position.copy(toScene(p.tunnel[0], p.tunnel[1], TUNNEL_Y));
    scene.add(tunnelMark);

    pitchObjs.push({ ...p, path, colorsFull, ball, trail, mat, tunnelMark, visible: true });
  }

  buildReleaseMarker(data);
  buildLegend(data);
  updateMetrics(data);
  setScrub(0);
}

function ring(color, r) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(r * 0.72, r, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  // RingGeometry lies in the x-y plane (normal along z) = perpendicular to flight,
  // which is exactly the "gate" orientation we want. No rotation needed.
  return m;
}

function buildReleaseMarker(data) {
  releaseGroup.clear();
  const [rx, ry, rz] = data.release;
  const pos = toScene(rx, rz, ry);
  // glowing release point
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 20, 20),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.7 })
  );
  dot.position.copy(pos);
  releaseGroup.add(dot);
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.3, 28),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  halo.position.copy(pos);
  releaseGroup.add(halo);

  // arm-slot line (hand -> shoulder), oriented at the Statcast arm angle
  if (data.arm_angle != null) {
    const deg = data.arm_angle, rad = deg * Math.PI / 180;
    const toBody = -Math.sign(rx || (data.throws === 'L' ? 1 : -1)); // inward toward center
    const L = 2.0;
    const shoulder = toScene(
      rx + toBody * L * Math.cos(rad),
      rz - L * Math.sin(rad),
      ry
    );
    const arm = new Line2(
      new LineGeometry().setPositions(flatten([pos, shoulder])),
      new LineMaterial({ color: 0xffffff, linewidth: 2.4, transparent: true, opacity: 0.55 })
    );
    arm.material.resolution.set(holder.clientWidth, holder.clientHeight);
    releaseGroup.add(arm);
    // shoulder nub
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0x8ea0b5 }));
    sh.position.copy(shoulder); releaseGroup.add(sh);
  }
}

function flatten(pts) {
  const a = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) { a[i*3]=pts[i].x; a[i*3+1]=pts[i].y; a[i*3+2]=pts[i].z; }
  return a;
}

// ── Scrub / animation state ─────────────────────────────────────────
let scrub = 0;        // 0..1
let playing = false;
let speedMult = 0.1;  // default 0.1× (slow-mo)
let showTunnel = true;    // ring dots at the 35 ft tunnel point
let showTrails = true;    // pitch tracking lines (trails) — on by default
let currentView = 'tv';

function applyLayers() { setScrub(scrub); }   // setScrub owns all per-object visibility

function setScrub(s) {
  scrub = Math.min(Math.max(s, 0), 1);
  $('scrub').value = Math.round(scrub * 1000);
  const k = Math.round(scrub * (N_SAMPLES - 1));
  for (const o of pitchObjs) {
    const show = o.visible;
    o.ball.visible = show;
    o.tunnelMark.visible = show && showTunnel;
    if (show) o.ball.position.copy(o.path[k]);
    // Trail geometry + fade colors are built once (full path) in buildPitcher.
    // Here we only reveal the first k segments (release -> ball) by capping the
    // instanced draw count, so the line grows with the ball and regenerates on
    // replay — no per-frame geometry rebuild (which Line2 doesn't redraw reliably).
    o.trail.geometry.instanceCount = show ? k : 0;
    o.trail.visible = show && showTrails && k >= 1;
  }
}

// "Glove pop": a quick white shockwave ring at each pitch's catch point, so the
// end of the pitch reads clearly (especially in slow-mo).
let catchFx = [];
function triggerCatch() {
  for (const o of pitchObjs) {
    if (!o.visible) continue;
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.095, 0.115, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2,
        side: THREE.DoubleSide, depthWrite: false })
    );
    m.position.copy(o.ball.position);
    scene.add(m);
    catchFx.push({ mesh: m, t0: null, dur: 0.3 });
  }
}
function clearCatchFx() {
  for (const fx of catchFx) { scene.remove(fx.mesh); fx.mesh.geometry.dispose(); fx.mesh.material.dispose(); }
  catchFx = [];
}

let lastT = null;
function animate(now) {
  requestAnimationFrame(animate);
  if (playing && current) {
    if (lastT == null) lastT = now;
    const dt = Math.min((now - lastT) / 1000, 0.1);   // seconds, clamp tab-switch gaps
    lastT = now;
    let ns = scrub + (dt / current._refFlight) * speedMult;
    const done = ns >= 1;
    if (done) ns = 1;
    setScrub(ns);                         // move balls to the plate FIRST
    if (done) { playing = false; $('play').textContent = '▶'; triggerCatch(); }
  } else {
    lastT = null;
  }
  // animate catch pops (expand + fade), billboarded to face the camera
  for (let i = catchFx.length - 1; i >= 0; i--) {
    const fx = catchFx[i];
    if (fx.t0 == null) fx.t0 = now;
    const p = (now - fx.t0) / (fx.dur * 1000);
    if (p >= 1) { scene.remove(fx.mesh); fx.mesh.geometry.dispose(); fx.mesh.material.dispose(); catchFx.splice(i, 1); continue; }
    // Scale by distance × FOV so the pop is a consistent on-screen size in every
    // view (otherwise it's invisibly small at the plate from the far TV camera).
    const dist = camera.position.distanceTo(fx.mesh.position);
    const view = dist * Math.tan((camera.fov * Math.PI / 180) / 2) / 7;
    const s = (1 + p * 1.1) * view;
    fx.mesh.scale.set(s, s, s);
    fx.mesh.material.opacity = 0.2 * (1 - p);
    fx.mesh.quaternion.copy(camera.quaternion);   // billboard toward camera
  }
  controls.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

// ── UI wiring ───────────────────────────────────────────────────────
$('play').onclick = () => {
  if (scrub >= 1) setScrub(0);
  playing = !playing;
  $('play').textContent = playing ? '❚❚' : '▶';
};
$('commit').onclick = () => {
  playing = false; $('play').textContent = '▶';
  if (current) setScrub(current._commitFrac);
};
$('scrub').oninput = (e) => { playing = false; $('play').textContent = '▶'; setScrub(+e.target.value / 1000); };
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
});

// view presets
const VIEWS = {
  // TV center-field cam: far back (see the mound) but telephoto so the plate isn't tiny.
  tv:  { pos: [0, 8, 78], tgt: [0, 2.9, 13], fov: 16 },
  // Umpire: behind the plate looking up the middle at the pitcher, zone close in
  // the foreground.
  ump: { pos: [0, 5.2, -9], tgt: [0, 3.0, 40], fov: 54 },
  // Side: off the third-base line looking across the flight path — shows vertical
  // break and how the pitches split up/down from the tunnel point to the plate.
  side: { pos: [-56, 4, 25], tgt: [0, 3.6, 24], fov: 34 },
};
// Vertical fov that keeps ~34 ft of flight in frame on each side of the target, so the
// full release→plate path fits on any aspect ratio (crucial on narrow phone screens).
const sideFov = (aspect) => 2 * Math.atan((34 / 56) / aspect) * 180 / Math.PI;

function setView(name) {
  const v = VIEWS[name]; if (!v) return;
  currentView = name;
  camera.position.set(...v.pos);
  controls.target.set(...v.tgt);
  camera.fov = name === 'side' ? sideFov(camera.aspect) : (v.fov || 42);
  camera.updateProjectionMatrix();
  controls.update();
  document.querySelectorAll('#views button').forEach((b) =>
    b.classList.toggle('on', b.dataset.view === name));
  // Side view wants the full width — auto-hide the card and collapse the leaderboard (desktop).
  if (window.innerWidth > 820) { setCard(name === 'side'); setSidebar(name === 'side'); }
}
document.querySelectorAll('#views button').forEach((b) => {
  b.onclick = () => setView(b.dataset.view);
});

// Deception card show/hide + leaderboard collapse (desktop panels).
function setCard(hidden) {
  $('metrics').classList.toggle('hidden', hidden);
  $('card-show').classList.toggle('on', hidden);
}
function setSidebar(collapsed) {
  document.getElementById('tab-tunnels').classList.toggle('no-sidebar', collapsed);
  $('sb-toggle').textContent = collapsed ? '»' : '«';
  requestAnimationFrame(resize);
}
$('card-hide').onclick = () => setCard(true);
$('card-show').onclick = () => setCard(false);
$('sb-toggle').onclick = () =>
  setSidebar(!document.getElementById('tab-tunnels').classList.contains('no-sidebar'));

// Camera lock — default LOCKED so a stray drag/touch doesn't disturb the fixed
// TV/Umpire views (and on phones lets a swipe scroll the page instead of rotating).
const lockBtn = document.getElementById('lockview');
function setLock(locked) {
  controls.enabled = !locked;
  lockBtn.classList.toggle('locked', locked);
  lockBtn.textContent = locked ? '🔒 View locked' : '🔓 View free';
}
lockBtn.onclick = () => setLock(controls.enabled);   // enabled(free) -> lock; locked -> free
setLock(true);

// speed buttons
document.querySelectorAll('#speeds button').forEach((b) => {
  b.onclick = () => {
    speedMult = +b.dataset.speed / 100;
    document.querySelectorAll('#speeds button').forEach((x) => x.classList.toggle('on', x === b));
  };
});

// layer toggles (tunnel/plate dots, release point)
document.querySelectorAll('#layers button').forEach((b) => {
  b.onclick = () => {
    const on = b.classList.toggle('on');
    if (b.dataset.layer === 'tunnel') showTunnel = on;
    else if (b.dataset.layer === 'trails') showTrails = on;
    applyLayers();
  };
});

// ── Legend / metrics ────────────────────────────────────────────────
function buildLegend(data) {
  const el = $('legend'); el.innerHTML = '';
  data.pitches.forEach((p, i) => {
    const c = document.createElement('div');
    c.className = 'lg';
    c.innerHTML = `<span class="sw" style="background:${p.color}"></span>` +
      `<span class="nm">${p.label}</span>` +
      `<small>${p.velo ? p.velo + ' · ' : ''}${Math.round(p.usage * 100)}%</small>`;
    c.onclick = () => {
      pitchObjs[i].visible = !pitchObjs[i].visible;
      c.classList.toggle('off', !pitchObjs[i].visible);
      applyLayers();
    };
    el.appendChild(c);
  });
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Percentile of `val` for metric `key` among same role + season (0..100).
function poolPct(key, val, role, yr) {
  const pool = INDEX.pitchers
    .filter((p) => p.years[yr] && p.years[yr].role === role && p.years[yr][key] != null)
    .map((p) => p.years[yr][key]);
  if (pool.length < 2) return 50;
  const below = pool.filter((v) => v <= val).length;
  return Math.min(100, Math.max(0, Math.round((below - 1) / (pool.length - 1) * 100)));
}

function updateMetrics(data) {
  const m = data.metrics;
  $('m-decep').textContent = m.deception_ratio.toFixed(1) + '×';
  $('m-tunnel').textContent = m.tunnel_spread.toFixed(2) + ' ft';
  $('m-plate').textContent = m.plate_spread.toFixed(2) + ' ft';
  $('m-entropy').textContent = m.entropy.toFixed(2);

  // Deception percentiles within the SHOWN year + role — Statcast-style bars.
  // Tunnel spread is inverted (tighter = better disguise -> higher on the bar).
  const role = data.role || 'RP';
  const yr = String(data._year);
  if (INDEX) {
    $('m-pctbar').innerHTML = pctBar(poolPct('deception_ratio', m.deception_ratio, role, yr));
    $('m-tunnelbar').innerHTML = pctBar(100 - poolPct('tunnel_spread', m.tunnel_spread, role, yr));
    $('m-platebar').innerHTML = pctBar(poolPct('plate_spread', m.plate_spread, role, yr));
    $('m-entbar').innerHTML = pctBar(poolPct('entropy', m.entropy, role, yr));
    $('m-pctcap').textContent = `Percentile rank · ${role === 'SP' ? 'Starters' : 'Bullpen'} · ${yr}`;
  }

  $('p-name').textContent = data.name;
  const slot = data.arm_slot ? ` · ${data.arm_slot} (${data.arm_angle}°)` : '';
  const roleLabel = role === 'SP' ? 'Starter' : 'Reliever';
  $('p-sub').textContent = `${yr} · ${data.throws}HP · ${roleLabel}${slot} · ${data.pitches.length} pitch types · ${data.n.toLocaleString()} thrown`;
  pYearNote((currentYear && +yr !== +currentYear) ? `No ${currentYear} data — showing ${yr}` : '');
}

// Year-fallback toast: show, then auto-fade after 5s.
let pNoteTimer;
function pYearNote(msg) {
  const el = $('p-note');
  clearTimeout(pNoteTimer);
  el.textContent = msg || '';
  if (msg) { el.classList.add('on'); pNoteTimer = setTimeout(() => el.classList.remove('on'), 5000); }
  else el.classList.remove('on');
}

// ── Load index + per-year rendering ─────────────────────────────────
let INDEX = null;
let currentYear = 2026;
let YEAR_ROWS = [];        // pitchers active in currentYear: {id,name,throws,role,deception_ratio}
const pitcherCache = {};   // id -> full nested pitcher file (all years)

let RANK_ALL = {};    // id -> deception rank (current year, all)
let RANK_ROLE = {};   // id -> deception rank within own role (current year)
let roleFilter = 'SP';   // default view: starting pitchers

// Sortable leaderboard metrics. dir: -1 = high→low (best-first default), +1 = low→high.
const SORTS = [
  { key: 'deception_ratio', label: 'Deception ratio',  col: 'Dec', dir: -1, fmt: (v) => `<b>${v.toFixed(1)}</b><i>×</i>` },
  { key: 'tunnel_spread',   label: 'Tunnel spread',    col: 'Tun', dir: +1, fmt: (v) => `<b>${v.toFixed(2)}</b>` },
  { key: 'plate_spread',    label: 'Plate spread',     col: 'Plt', dir: -1, fmt: (v) => `<b>${v.toFixed(2)}</b>` },
  { key: 'entropy',         label: 'Arsenal entropy',  col: 'Ent', dir: -1, fmt: (v) => `<b>${v.toFixed(2)}</b>` },
];
let sortKey = 'deception_ratio';
let sortDir = -1;
const sortCfg = () => SORTS.find((s) => s.key === sortKey) || SORTS[0];

function computeYear(year) {
  currentYear = year;
  YEAR_ROWS = INDEX.pitchers
    .filter((p) => p.years[year])
    .map((p) => ({ id: p.id, name: p.name, throws: p.throws, ...p.years[year] }));
  resort();
}

function resort() {
  YEAR_ROWS.sort((a, b) => ((a[sortKey] ?? -Infinity) - (b[sortKey] ?? -Infinity)) * sortDir);
  RANK_ALL = {}; RANK_ROLE = {};
  YEAR_ROWS.forEach((p, i) => { RANK_ALL[p.id] = i + 1; });
  ['SP', 'RP'].forEach((role) =>
    YEAR_ROWS.filter((p) => p.role === role).forEach((p, i) => { RANK_ROLE[p.id] = i + 1; }));
}

// Baseball Savant-aligned pitch colors, mapped by pitch type (overrides the
// colors baked into the data so a type is always the conventional color).
const PITCH_COLORS = {
  four_seam: '#d22d49',   // red
  sinker:    '#fe9d00',   // orange
  cutter:    '#b5654d',   // brown/tan
  slider:    '#eee716',   // yellow
  sweeper:   '#ddb33a',   // gold
  curveball: '#12c2e9',   // cyan/blue
  changeup:  '#1dbe3a',   // green
  splitter:  '#3bacac',   // teal
};

async function loadPitcher(id) {
  if (!pitcherCache[id]) {
    const pd = await (await fetch(`data/pitchers/${id}.json`, { cache: 'no-cache' })).json();
    for (const y in pd.years)
      for (const p of pd.years[y].pitches) p.color = PITCH_COLORS[p.cat] || p.color;
    pitcherCache[id] = pd;
  }
  renderPitcherYear(id);
}

function renderPitcherYear(id) {
  const pdata = pitcherCache[id];
  if (!pdata) return;
  let year = currentYear;
  if (!pdata.years[year]) {   // didn't qualify in the selected year -> show his most recent
    const avail = Object.keys(pdata.years).map(Number).sort((a, b) => a - b);
    year = avail[avail.length - 1];
  }
  buildPitcher({ id: pdata.id, name: pdata.name, throws: pdata.throws,
                 tunnel_y: pdata.tunnel_y, _year: year, ...pdata.years[year] });
  document.querySelectorAll('#list li').forEach((li) => li.classList.toggle('sel', +li.dataset.id === id));
  // Keep whatever camera view is active — don't snap back to TV on pitcher switch.
}

// Diverging heat, matched to the Model Grades scale: top of the board (most
// deceptive) = red, bottom = blue. Colors the leaderboard like a Savant table.
function heatColor(pct) {
  const blue = [59, 111, 181], gray = [128, 138, 154], red = [212, 46, 57];
  const p = Math.min(100, Math.max(0, pct));
  let c;
  if (p <= 50) { const t = p / 50; c = blue.map((b, i) => Math.round(b + (gray[i] - b) * t)); }
  else { const t = (p - 50) / 50; c = gray.map((g, i) => Math.round(g + (red[i] - g) * t)); }
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// Savant-style diverging percentile bar — same look as the Model Grades tab.
function pctBar(pct) {
  const p = Math.min(100, Math.max(0, pct)), col = heatColor(p);
  return `<div class="m-bar">` +
    `<div class="m-fill" style="width:${p}%;background:${col}"></div>` +
    `<div class="m-dot" style="left:${p}%;background:${col}">${p}</div>` +
    `</div>`;
}

function renderList(items) {
  const useRole = roleFilter !== 'all';
  const rk = useRole ? RANK_ROLE : RANK_ALL;
  const total = useRole ? YEAR_ROWS.filter((p) => p.role === roleFilter).length : YEAR_ROWS.length;
  const cfg = sortCfg();
  $('lh-metric').textContent = cfg.col;
  const ul = $('list'); ul.innerHTML = '';
  for (const p of items) {
    const rank = rk[p.id] || total;
    const heat = total > 1 ? 100 * (1 - (rank - 1) / (total - 1)) : 100;
    const col = heatColor(heat);
    const li = document.createElement('li');
    li.dataset.id = p.id;
    li.innerHTML =
      `<span class="rk${rank <= 3 ? ' top' : ''}">${rk[p.id] || ''}</span>` +
      `<span class="nm">${p.name} <span class="thr">${p.throws}</span></span>` +
      `<span class="dc" style="color:${col}">${cfg.fmt(p[cfg.key])}</span>`;
    li.onclick = () => {
      loadPitcher(p.id);
      window.dispatchEvent(new CustomEvent('arsenal:picked', { detail: { id: p.id } }));
    };
    ul.appendChild(li);
  }
}

function applyFilters() {
  const q = $('search').value.toLowerCase().trim();
  let items = YEAR_ROWS;
  if (roleFilter !== 'all') items = items.filter((p) => p.role === roleFilter);
  if (q) items = items.filter((p) => p.name.toLowerCase().includes(q));
  $('count').textContent = items.length;
  renderList(items);
  // keep current pitcher highlighted if present
  if (current) document.querySelectorAll('#list li').forEach((li) =>
    li.classList.toggle('sel', +li.dataset.id === current.id));
}

async function boot() {
  INDEX = await (await fetch('data/index.json', { cache: 'no-cache' })).json();
  currentYear = window.__arsenalYear || INDEX.years[INDEX.years.length - 1];
  computeYear(currentYear);

  document.querySelectorAll('#rolefilter button').forEach((b) => {
    b.onclick = () => {
      roleFilter = b.dataset.role;
      document.querySelectorAll('#rolefilter button').forEach((x) => x.classList.toggle('on', x === b));
      applyFilters();
    };
  });

  $('search').oninput = () => applyFilters();

  // Sort dropdown + direction toggle
  const sel = $('sortsel');
  sel.innerHTML = SORTS.map((s) => `<option value="${s.key}">${s.label}</option>`).join('');
  sel.value = sortKey;
  sel.onchange = () => {
    sortKey = sel.value; sortDir = sortCfg().dir;
    $('sortdir').textContent = sortDir < 0 ? '▼' : '▲';
    resort(); applyFilters();
  };
  $('sortdir').onclick = () => {
    sortDir = -sortDir;
    $('sortdir').textContent = sortDir < 0 ? '▼' : '▲';
    resort(); applyFilters();
  };

  applyFilters();
  loadPitcher(INDEX.featured[0]);   // Skenes as the default
  setView('tv');                    // initial camera (kept across pitcher switches)
}

function setYear(year) {   // driven by the shell's masthead Season control
  computeYear(year);
  applyFilters();
  if (current) loadPitcher(current.id);   // re-render current pitcher for the new season (cached)
}

// ── Resize ──────────────────────────────────────────────────────────
function resize() {
  const w = holder.clientWidth, h = holder.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  if (currentView === 'side') camera.fov = sideFov(camera.aspect);   // refit flight on any aspect
  camera.updateProjectionMatrix();
  for (const o of pitchObjs) o.mat.resolution.set(w, h);
}
window.addEventListener('resize', resize);
resize();

// Cross-tab bridge (see shell.js): let the Metrics tab drive/sync the tunnel view.
window.ArsenalTunnels = {
  select: (id) => loadPitcher(+id),
  has: (id) => !!INDEX && INDEX.pitchers.some((p) => p.id === +id),
  setYear: (year) => { if (INDEX) setYear(+year); },
  defaultId: () => (INDEX ? INDEX.featured[0] : null),   // canonical default for both tabs
  resize,   // the WebGL canvas is 0-sized while hidden; re-fit when this tab reveals
};

boot();
