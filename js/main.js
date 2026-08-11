/**
 * main.js — LUMASHAPE: state, 4D rotation, UI, flower demo, frame loop.
 */

import { Renderer } from './renderer.js';
import { drawFlowers } from './flower.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');

// the six rotation planes of the receptor tesseract: three stay inside
// the human cube (l/m/s), three rotate color INTO the UV axis
const PLANES = ['LM', 'LS', 'MS', 'LU', 'MU', 'SU'];
const PLANE_AXES = { LM: [0, 1], LS: [0, 2], MS: [1, 2], LU: [0, 3], MU: [1, 3], SU: [2, 3] };

const state = {
  angles: Object.fromEntries(PLANES.map((p) => [p, 0])),
  velocities: { LM: 0, LS: 0, MS: 0, LU: 0.26, MU: 0.10, SU: 0.17 },
  spinning: true,
  cam: { yaw: 0.6, pitch: 0.32, dist: 5.0 },
  collapse: 1,
  birdVision: 0,
  fibersOn: false,
  density: 8,
  pointSize: 3.4,
};

let renderer;
try {
  renderer = new Renderer(canvas);
} catch {
  $('gl-error').classList.add('show');
  throw new Error('WebGL2 unavailable');
}
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  $('gl-error').classList.add('show');
});

// ── geometry: the receptor lattice and its metamer fibers ──

function rebuild() {
  const n = state.density;
  const pts = new Float32Array(n * n * n * n * 4);
  let i = 0;
  for (let l = 0; l < n; l++) for (let m = 0; m < n; m++) {
    for (let s = 0; s < n; s++) for (let u = 0; u < n; u++) {
      pts[i++] = l / (n - 1); pts[i++] = m / (n - 1);
      pts[i++] = s / (n - 1); pts[i++] = u / (n - 1);
    }
  }
  renderer.setPoints(pts);

  // one fiber per (l,m,s) on a coarser grid: the line of bird-colors
  // that a human files under a single color
  const k = 5;
  const fib = new Float32Array(k * k * k * 8);
  i = 0;
  for (let l = 0; l < k; l++) for (let m = 0; m < k; m++) for (let s = 0; s < k; s++) {
    fib[i++] = l / (k - 1); fib[i++] = m / (k - 1); fib[i++] = s / (k - 1); fib[i++] = 0;
    fib[i++] = l / (k - 1); fib[i++] = m / (k - 1); fib[i++] = s / (k - 1); fib[i++] = 1;
  }
  renderer.setFibers(fib);
  $('stat-points').textContent = (n ** 4).toLocaleString();
}

// ── 4D + 3D math ──

function mat4Identity() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

function planeRotation(plane, theta) {
  const [a, b] = PLANE_AXES[plane];
  const m = mat4Identity();
  const c = Math.cos(theta), s = Math.sin(theta);
  m[a * 4 + a] = c; m[b * 4 + a] = -s;
  m[a * 4 + b] = s; m[b * 4 + b] = c;
  return m;
}

function mul(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let x = 0;
    for (let k = 0; k < 4; k++) x += a[k * 4 + r] * b[c * 4 + k];
    out[c * 4 + r] = x;
  }
  return out;
}

function rot4() {
  let m = mat4Identity();
  for (const p of PLANES) {
    if (Math.abs(state.angles[p]) > 1e-9) m = mul(planeRotation(p, state.angles[p]), m);
  }
  return m;
}

function perspective(fovyDeg, aspect) {
  const f = 1 / Math.tan((fovyDeg * Math.PI) / 360);
  const m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f;
  m[10] = -1.002; m[11] = -1; m[14] = -0.2002;
  return m;
}

function lookAt(eye) {
  const zl = Math.hypot(...eye) || 1;
  const z = eye.map((v) => v / zl);
  const x = [z[2], 0, -z[0]];
  const xl = Math.hypot(...x) || 1;
  x[0] /= xl; x[2] /= xl;
  const y = [z[1] * x[2], z[2] * x[0] - z[0] * x[2], -z[1] * x[0]];
  const m = mat4Identity();
  m[0] = x[0]; m[4] = x[1]; m[8] = x[2];
  m[1] = y[0]; m[5] = y[1]; m[9] = y[2];
  m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
  m[12] = -(x[0] * eye[0] + x[2] * eye[2]);
  m[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
  m[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
  m[15] = 1;
  return m;
}

// ── controls ──

const velSliders = {};
for (const p of PLANES) {
  const host = $(p.includes('U') ? 'planes-uv' : 'planes-human');
  const row = document.createElement('div');
  row.className = 'plane';
  row.innerHTML = `<span>${p[0]}·${p[1] === 'U' ? 'UV' : p[1]}</span><input type="range" min="-0.7" max="0.7" step="0.01" value="${state.velocities[p]}">`;
  row.querySelector('input').addEventListener('input', (e) => {
    state.velocities[p] = parseFloat(e.target.value);
  });
  velSliders[p] = row.querySelector('input');
  host.append(row);
}

function bindRange(id, key, fn) {
  $(id).addEventListener('input', (e) => {
    state[key] = parseFloat(e.target.value);
    fn?.();
  });
}
bindRange('ctl-collapse', 'collapse');
bindRange('ctl-size', 'pointSize');
$('ctl-bird').addEventListener('change', (e) => {
  state.birdVision = e.target.checked ? 1 : 0;
  document.body.classList.toggle('bird', e.target.checked);
  drawFlowers($('flower-canvas'), e.target.checked);
});
$('ctl-fibers').addEventListener('change', (e) => { state.fibersOn = e.target.checked; });
$('ctl-spin').addEventListener('change', (e) => { state.spinning = e.target.checked; });
$('ctl-density').addEventListener('change', (e) => {
  state.density = parseInt(e.target.value, 10);
  rebuild();
});
$('btn-still').addEventListener('click', () => {
  for (const p of PLANES) { state.velocities[p] = 0; velSliders[p].value = 0; }
});
$('btn-shot').addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = 'lumashape.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
});

// ── input: drag = 3D orbit · right-drag = rotate into UV ──

let dragging = 0, lx = 0, ly = 0;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  dragging = e.button === 2 ? 2 : 1;
  lx = e.clientX; ly = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lx, dy = e.clientY - ly;
  lx = e.clientX; ly = e.clientY;
  if (dragging === 2 || e.metaKey || e.ctrlKey) {
    state.angles.LU += dx * 0.006;
    state.angles.MU -= dy * 0.006;
  } else {
    state.cam.yaw -= dx * 0.008;
    state.cam.pitch = Math.min(1.5, Math.max(-1.5, state.cam.pitch + dy * 0.008));
  }
});
canvas.addEventListener('pointerup', () => { dragging = 0; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  state.cam.dist = Math.min(14, Math.max(2.2, state.cam.dist * (e.deltaY > 0 ? 1.07 : 0.935)));
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'b' || e.key === 'B') { $('ctl-bird').checked = !$('ctl-bird').checked; $('ctl-bird').dispatchEvent(new Event('change')); }
  if (e.key === 'f' || e.key === 'F') { $('ctl-fibers').checked = !$('ctl-fibers').checked; $('ctl-fibers').dispatchEvent(new Event('change')); }
  if (e.key === ' ') { e.preventDefault(); state.spinning = !state.spinning; $('ctl-spin').checked = state.spinning; }
  if (e.key === 's' || e.key === 'S') $('btn-shot').click();
});

// ── loop ──

rebuild();
drawFlowers($('flower-canvas'), false);

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (state.spinning && !dragging) {
    for (const p of PLANES) state.angles[p] += state.velocities[p] * dt;
  }
  const { yaw, pitch, dist } = state.cam;
  const eye = [
    dist * Math.cos(pitch) * Math.sin(yaw),
    dist * Math.sin(pitch),
    dist * Math.cos(pitch) * Math.cos(yaw),
  ];
  renderer.render({
    rot4: rot4(),
    view: lookAt(eye),
    proj: perspective(46, canvas.clientWidth / Math.max(canvas.clientHeight, 1)),
    collapse: state.collapse,
    birdVision: state.birdVision,
    fibersOn: state.fibersOn,
    pointSize: state.pointSize,
    time: now / 1000,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
