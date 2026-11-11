// Three-pane cross-referenced view of the separately acquired PD fat-sat stacks.

import { getSlice, preloadSeries, geometry, V, clamp } from './data.js';

const PANES = [
  { id: 'pi-pd-fs-sag', key: 'SAG', name: 'Sagittal', dash: [] },
  { id: 'pi-pd-fs-cor', key: 'COR', name: 'Coronal', dash: [7, 4] },
  { id: 'pi-pd-fs-tra', key: 'TRA', name: 'Axial', dash: [2, 4] },
];
const ACCENT = '#e3a548';

let panes = [];
let cursor = null; // linked cursor in patient coordinates (mm)
let active = false;
let frame = 0;
let vol3d = null;

export function init(manifest) {
  const grid = document.getElementById('mpr-grid');
  for (const def of PANES) {
    const s = manifest.byId.get(def.id);
    if (!s) continue;
    const el = document.createElement('figure');
    el.className = 'pane';
    el.innerHTML = `
      <figcaption>
        <svg class="pane-swatch" viewBox="0 0 26 6" aria-hidden="true"><path d="M1 3h24" stroke-dasharray="${def.dash.join(' ')}"/></svg>
        <strong>${def.name}</strong><span class="pane-label"></span>
        <output class="mono"></output>
      </figcaption>
      <div class="pane-canvas"><canvas></canvas><div class="stage-msg" hidden></div></div>
      <input type="range" min="1" max="${s.n}" step="1" aria-label="${def.name} slice">`;
    el.querySelector('.pane-label').textContent = s.label;
    grid.append(el);
    const pane = {
      ...def, s, g: geometry(s), el,
      canvas: el.querySelector('canvas'),
      box: el.querySelector('.pane-canvas'),
      msg: el.querySelector('.stage-msg'),
      out: el.querySelector('output'),
      range: el.querySelector('input'),
      i: Math.floor(s.n / 2),
    };
    panes.push(pane);
    bindPane(pane);
    new ResizeObserver(() => schedule()).observe(pane.box);
  }

  // Start the cursor at the centre of the middle axial image (or whichever pane exists).
  const ref = panes.find((p) => p.key === 'TRA') ?? panes[0];
  if (ref) moveCursor(ref.g.toPatient(ref.i, ref.s.cols / 2, ref.s.rows / 2), ref);

  import('./vol3d.js').then(
    (m) => { vol3d = m; m.init(manifest); m.setActive(active); },
    (err) => {
      const msg = document.getElementById('vol-msg');
      msg.hidden = false;
      msg.textContent = `The 3D view could not start (${err.message}).`;
    },
  );
}

export function setActive(on) {
  active = on;
  if (on) {
    panes.forEach((p) => preloadSeries(p.s, p.i));
    schedule();
  }
  vol3d?.setActive(on);
}

/** Put the cursor at P and bring every pane except `from` to its nearest slice. */
function moveCursor(P, from) {
  cursor = P;
  for (const p of panes) {
    if (p === from) continue;
    p.i = clamp(Math.round(p.g.fromPatient(P).k), 0, p.s.n - 1);
  }
  schedule();
}

function setPaneSlice(p, i) {
  const n = clamp(Math.round(i), 0, p.s.n - 1);
  if (n === p.i) return;
  // Carry the cursor along the slice normal so the other panes' markers follow.
  if (cursor) cursor = V.add(cursor, V.mul(p.g.N, (n - p.i) * p.g.spacing));
  p.i = n;
  schedule();
}

function fitRect(p) {
  const W = p.box.clientWidth, H = p.box.clientHeight;
  const scale = Math.min(W / p.s.cols, H / p.s.rows);
  return { W, H, scale, x: (W - p.s.cols * scale) / 2, y: (H - p.s.rows * scale) / 2 };
}

function bindPane(p) {
  p.range.addEventListener('input', () => setPaneSlice(p, p.range.value - 1));

  let wheelAcc = 0;
  p.box.addEventListener('wheel', (e) => {
    e.preventDefault();
    wheelAcc += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    if (Math.abs(wheelAcc) >= 50) { setPaneSlice(p, p.i + Math.sign(wheelAcc)); wheelAcc = 0; }
  }, { passive: false });

  const pick = (e) => {
    const r = p.box.getBoundingClientRect();
    const f = fitRect(p);
    const col = clamp((e.clientX - r.left - f.x) / f.scale, 0, p.s.cols);
    const row = clamp((e.clientY - r.top - f.y) / f.scale, 0, p.s.rows);
    moveCursor(p.g.toPatient(p.i, col, row), p);
  };
  let down = false;
  p.box.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    down = true;
    if (e.pointerType === 'mouse') p.box.setPointerCapture(e.pointerId);
    pick(e);
  });
  p.box.addEventListener('pointermove', (e) => { if (down) pick(e); });
  const up = () => { down = false; };
  p.box.addEventListener('pointerup', up);
  p.box.addEventListener('pointercancel', up);
}

function schedule() {
  if (active && !frame) frame = requestAnimationFrame(() => { frame = 0; panes.forEach(draw); });
}

/** Where pane `other`'s current slice plane cuts pane `p`'s image, as two points in pixel coords. */
function intersection(p, other) {
  const Oa = p.g.origin(p.i);
  const Ob = other.g.origin(other.i);
  const Nb = other.g.N;
  // Nb . (Oa + U*col*ps + V*row*ps - Ob) = 0  ->  a*col + b*row = c
  const a = V.dot(Nb, p.g.U) * p.g.psCol;
  const b = V.dot(Nb, p.g.V) * p.g.psRow;
  const c = V.dot(Nb, V.sub(Ob, Oa));
  const { cols, rows } = p.s;
  const pts = [];
  const eps = 1e-6;
  if (Math.abs(b) > eps) {
    for (const col of [0, cols]) {
      const row = (c - a * col) / b;
      if (row >= 0 && row <= rows) pts.push([col, row]);
    }
  }
  if (Math.abs(a) > eps) {
    for (const row of [0, rows]) {
      const col = (c - b * row) / a;
      if (col > 0 && col < cols) pts.push([col, row]);
    }
  }
  return pts.length >= 2 ? [pts[0], pts[1]] : null;
}

function draw(p) {
  const f = fitRect(p);
  if (!f.W || !f.H) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cw = Math.round(f.W * dpr), ch = Math.round(f.H * dpr);
  if (p.canvas.width !== cw || p.canvas.height !== ch) { p.canvas.width = cw; p.canvas.height = ch; }
  const ctx = p.canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, f.W, f.H);

  p.range.value = p.i + 1;
  p.out.textContent = `${p.i + 1} / ${p.s.n}`;

  const e = getSlice(p.s, p.i, schedule);
  p.msg.hidden = e.status === 'ok';
  if (e.status === 'ok') {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(e.img, f.x, f.y, p.s.cols * f.scale, p.s.rows * f.scale);
  } else {
    p.msg.textContent = e.status === 'error' ? `Image ${p.i + 1} could not be loaded.` : 'Loading…';
  }

  const toView = ([col, row]) => [f.x + col * f.scale, f.y + row * f.scale];
  ctx.lineWidth = 1;
  ctx.strokeStyle = ACCENT;
  ctx.fillStyle = ACCENT;
  ctx.font = '10px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  for (const other of panes) {
    if (other === p) continue;
    const seg = intersection(p, other);
    if (!seg) continue;
    const [a, b] = seg.map(toView);
    ctx.setLineDash(other.dash);
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    // Label near the first end, nudged inside the image.
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    const horizontal = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
    const start = horizontal ? (a[0] < b[0] ? a : b) : (a[1] < b[1] ? a : b);
    ctx.fillText(other.key, start[0] + 5, start[1] + (horizontal ? -5 : 13));
  }
  ctx.setLineDash([]);
  if (cursor) {
    const c = p.g.fromPatient(cursor);
    const [x, y] = toView([c.col, c.row]);
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
  }
}
