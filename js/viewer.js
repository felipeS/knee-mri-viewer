// Slice viewer: series picker, slice scroll, zoom/pan, window/level from the 16-bit volume.

import { getSlice, preloadSeries, loadVolume, loadFindings, markersOn, geometry, directionLetter, clamp } from './data.js';

const $ = (id) => document.getElementById(id);

const st = {
  manifest: null,
  s: null,
  i: 0,
  zoom: 1,
  panX: 0,
  panY: 0,
  wc: 0,
  ww: 1,
  vol: null,
  volState: 'idle', // idle | loading | ready | error
  volError: '',
  tool: 'pan',
  active: false,
  findings: null, // data/findings.json once loaded
  showMarkers: true,
  focus: null, // finding id whose marker is emphasised
};
const remembered = new Map(); // per-series slice index and window
let canvas, ctx, stage;
let frame = 0;

// Offscreen canvas holding the current slice re-windowed from the volume.
const volCanvas = document.createElement('canvas');
let volImage = null;
let volKey = '';
const lut = new Uint8Array(65536);
let lutKey = '';

export function initViewer(manifest) {
  st.manifest = manifest;
  canvas = $('slice-canvas');
  ctx = canvas.getContext('2d');
  stage = $('stage');
  st.tool = matchMedia('(pointer: coarse)').matches ? 'scroll' : 'pan';

  buildSeriesList();
  bindControls();
  bindPointer();
  new ResizeObserver(resize).observe(stage);
  openSeries(manifest.series.find((s) => s.id === 'pi-pd-fs-sag')?.id ?? manifest.series[0].id);

  // Region markers are optional: without findings.json the viewer works as before.
  loadFindings().then((f) => {
    st.findings = f;
    $('marker-group').hidden = false;
    syncUi();
    schedule();
  }).catch((err) => console.warn(err));
}

/** Emphasise one finding's region marker (and make sure markers are shown); null clears it. */
export function focusFinding(id) {
  st.focus = id;
  if (id) st.showMarkers = true;
  if (st.s) { syncUi(); schedule(); }
}

export function setActive(on) {
  st.active = on;
  if (on) { resize(); }
}

/** Switch series; index defaults to the remembered position or the middle of the stack. */
export function openSeries(id, index) {
  const s = st.manifest.byId.get(id);
  if (!s) return;
  if (st.s) remembered.set(st.s.id, { i: st.i, wc: st.wc, ww: st.ww });
  const mem = remembered.get(id);
  st.s = s;
  st.i = clamp(index ?? mem?.i ?? Math.floor(s.n / 2), 0, s.n - 1);
  st.wc = mem?.wc ?? s.defaultWindowCenter;
  st.ww = mem?.ww ?? s.defaultWindowWidth;
  st.zoom = 1; st.panX = 0; st.panY = 0;
  st.vol = null; st.volState = 'loading'; st.volError = ''; volKey = '';

  document.querySelectorAll('#series-list button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.id === id));
  });
  const range = $('slice-range');
  range.max = s.n;

  const span = s.volumeMax - s.volumeMin;
  Object.assign($('wc-range'), { min: Math.floor(s.volumeMin), max: Math.ceil(s.volumeMax) });
  Object.assign($('ww-range'), { min: 1, max: Math.ceil(span) });

  preloadSeries(s, st.i);
  loadVolume(s).then(
    (v) => { if (st.s === s) { st.vol = v; st.volState = 'ready'; syncUi(); schedule(); } },
    (err) => { if (st.s === s) { st.volState = 'error'; st.volError = err.message; syncUi(); schedule(); } },
  );
  syncUi();
  schedule();
}

function buildSeriesList() {
  const ul = $('series-list');
  for (const s of st.manifest.series) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = s.id;
    const img = document.createElement('img');
    img.src = s.thumb;
    img.alt = '';
    img.width = 56; img.height = 56;
    img.onerror = () => { img.style.visibility = 'hidden'; };
    const txt = document.createElement('span');
    txt.className = 'series-txt';
    const name = document.createElement('strong');
    name.textContent = s.label;
    const sub = document.createElement('span');
    sub.textContent = `${s.plane === 'multi' ? '3 planes' : s.plane} · ${s.n} images`;
    txt.append(name, sub);
    b.append(img, txt);
    b.addEventListener('click', () => openSeries(s.id));
    li.append(b);
    ul.append(li);
  }
}

// ---- State changes ----

function setSlice(i) {
  const n = clamp(Math.round(i), 0, st.s.n - 1);
  if (n === st.i) return;
  st.i = n;
  syncUi();
  schedule();
}

function setWindow(wc, ww) {
  const s = st.s;
  st.wc = Math.round(clamp(wc, s.volumeMin, s.volumeMax));
  st.ww = Math.round(clamp(ww, 1, s.volumeMax - s.volumeMin));
  syncUi();
  schedule();
}

function resetWindow() { setWindow(st.s.defaultWindowCenter, st.s.defaultWindowWidth); }

/** Zoom keeping the image point under (px, py) fixed; px/py are relative to the stage centre. */
function zoomAt(factor, px = 0, py = 0) {
  const z = clamp(st.zoom * factor, 0.5, 16);
  const k = z / st.zoom;
  st.panX = px - (px - st.panX) * k;
  st.panY = py - (py - st.panY) * k;
  st.zoom = z;
  syncUi();
  schedule();
}

function fit() { st.zoom = 1; st.panX = 0; st.panY = 0; syncUi(); schedule(); }

const atDefaultWindow = () => st.wc === st.s.defaultWindowCenter && st.ww === st.s.defaultWindowWidth;

// ---- Rendering ----

function schedule() {
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); });
}

function resize() {
  const r = stage.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  schedule();
}

function renderVolumeSlice() {
  const { data, rows, cols } = st.vol;
  const s = st.s;
  const key = `${s.id}/${st.i}/${st.wc}/${st.ww}`;
  if (key === volKey) return volCanvas;
  const lk = `${s.id}/${st.wc}/${st.ww}`;
  if (lk !== lutKey) {
    // stored u -> intensity = min + u/65535*(max-min); then window lo..hi -> 0..255
    const lo = st.wc - st.ww / 2;
    const a = (s.volumeMax - s.volumeMin) / 65535;
    const scale = 255 / st.ww;
    for (let u = 0; u < 65536; u++) {
      const g = (s.volumeMin + u * a - lo) * scale;
      lut[u] = g <= 0 ? 0 : g >= 255 ? 255 : g;
    }
    lutKey = lk;
  }
  if (volCanvas.width !== cols || volCanvas.height !== rows || !volImage) {
    volCanvas.width = cols; volCanvas.height = rows;
    volImage = new ImageData(cols, rows);
  }
  const out = new Uint32Array(volImage.data.buffer);
  const off = st.i * rows * cols;
  for (let p = 0, n = rows * cols; p < n; p++) {
    const g = lut[data[off + p]];
    out[p] = 0xff000000 | (g << 16) | (g << 8) | g;
  }
  volCanvas.getContext('2d').putImageData(volImage, 0, 0);
  volKey = key;
  return volCanvas;
}

/** Full-res WebP at the default window; the re-windowed volume once W/L is changed. */
function currentSource() {
  const e = getSlice(st.s, st.i, schedule);
  const imgOk = e.status === 'ok';
  if (imgOk && atDefaultWindow()) return { src: e.img, kind: 'webp' };
  if (st.vol) return { src: renderVolumeSlice(), kind: 'vol' };
  if (imgOk) return { src: e.img, kind: 'webp' };
  return { src: null, kind: e.status };
}

function layout() {
  const W = stage.clientWidth, H = stage.clientHeight;
  const g = geometry(st.s);
  const wmm = st.s.cols * g.psCol, hmm = st.s.rows * g.psRow;
  const pxPerMm = Math.min(W / wmm, H / hmm) * st.zoom;
  const dw = wmm * pxPerMm, dh = hmm * pxPerMm;
  return { W, H, pxPerMm, dw, dh, x: W / 2 + st.panX - dw / 2, y: H / 2 + st.panY - dh / 2 };
}

function draw() {
  if (!st.s || !canvas.width) return;
  const dpr = canvas.width / stage.clientWidth;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const L = layout();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, L.W, L.H);

  const { src, kind } = currentSource();
  const msg = $('stage-msg');
  if (src) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, L.x, L.y, L.dw, L.dh);
    msg.hidden = true;
  } else {
    msg.hidden = false;
    msg.textContent = kind === 'error'
      ? `Image ${st.i + 1} of this series could not be loaded${st.volState === 'loading' ? '; waiting for the volume…' : '.'}`
      : 'Loading image…';
  }
  if (src) drawMarkers(L);
  drawHud(L, kind);
}

// ---- Approximate region markers (data/findings.json) ----
// Orientation aids only: a dashed ring over a region, never a tracing of a finding.

const here = () => (st.findings && st.showMarkers ? markersOn(st.findings, st.s.id, st.i) : []);

function drawMarkers(L) {
  const TAU = Math.PI * 2;
  for (const m of here()) {
    const strong = !st.focus || st.focus === m.finding;
    const cx = L.x + m.x * L.dw, cy = L.y + m.y * L.dh;
    const rx = m.rx * L.dw, ry = (m.ry ?? m.rx) * L.dh;
    ctx.save();
    ctx.globalAlpha = strong ? 1 : 0.45;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    if (strong) { ctx.fillStyle = 'rgba(227, 165, 72, 0.07)'; ctx.fill(); }
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)'; ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#e3a548'; ctx.stroke();
    ctx.setLineDash([]);
    if (strong) {
      const text = `approx. ${m.label}`;
      ctx.font = '11.5px ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';
      const w = ctx.measureText(text).width;
      const gap = 10;
      let tx = cx - w / 2, ty = cy;
      if (m.side === 'left') tx = cx - rx - gap - w;
      else if (m.side === 'top') ty = cy - ry - gap - 8;
      else if (m.side === 'bottom') ty = cy + ry + gap + 8;
      else tx = cx + rx + gap;
      tx = clamp(tx, 10, Math.max(10, L.W - w - 10));
      ty = clamp(ty, 14, L.H - 14);
      ctx.fillStyle = 'rgba(10, 11, 12, 0.8)';
      ctx.fillRect(tx - 5, ty - 9, w + 10, 18);
      ctx.strokeStyle = 'rgba(227, 165, 72, 0.5)'; ctx.lineWidth = 1;
      ctx.strokeRect(tx - 4.5, ty - 8.5, w + 9, 17);
      ctx.fillStyle = '#e3a548';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, tx, ty + 0.5);
    }
    ctx.restore();
  }
}

let jumpKey = '';

function syncMarkers() {
  const f = st.findings;
  if (!f) return;
  $('marker-toggle').checked = st.showMarkers;
  const inSeries = f.markers.filter((m) => m.series === st.s.id);
  const slices = [...new Set(inSeries.map((m) => m.slice))].sort((a, b) => a - b);

  // Caption strip under the image: always says what the rings are, or where to find them.
  const cap = $('marker-caption');
  cap.hidden = !st.showMarkers;
  const marked = here().length > 0;
  cap.classList.toggle('is-on', marked);
  cap.textContent = marked
    ? f.markerNote
    : slices.length
      ? `No region markers on this image. Marked in this series: image ${slices.map((i) => i + 1).join(', ')}.`
      : 'No region markers in this series.';

  const key = `${st.s.id}/${st.focus}/${st.showMarkers}`;
  if (key === jumpKey) return;
  jumpKey = key;
  const box = $('marker-jumps');
  box.innerHTML = '';
  if (!st.showMarkers) return;
  if (!inSeries.length) {
    const p = document.createElement('p');
    p.className = 'fineprint';
    p.textContent = 'No region markers in this series. They are on PI PD FS sag, PI PD FS COR and T1 sag.';
    box.append(p);
    return;
  }
  for (const m of inSeries) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'marker-jump';
    b.setAttribute('aria-pressed', String(st.focus === m.finding));
    const im = document.createElement('span');
    im.className = 'mono';
    im.textContent = `Im ${m.slice + 1}`;
    b.append(im, f.byId.get(m.finding).title);
    b.addEventListener('click', () => {
      const same = st.focus === m.finding && st.i === m.slice;
      st.focus = same ? null : m.finding;
      st.i = m.slice;
      syncUi();
      schedule();
    });
    box.append(b);
  }
}

function subPlane() {
  const s = st.s;
  return s.slicePlanes ? s.slicePlanes[st.i] : s.plane;
}

function drawHud(L, kind) {
  const s = st.s;
  let plane = s.plane;
  if (s.slicePlanes) {
    const p = subPlane();
    const [a, b] = s.planeGroups?.[p] ?? [0, s.n - 1];
    plane = `multi-plane · now ${p} (images ${a + 1}–${b + 1})`;
  }
  $('hud-tl').innerHTML = '';
  $('hud-tl').append(line(s.label, 'hud-strong'), line(plane), line('Left knee · MR'));
  $('hud-tr').innerHTML = '';
  $('hud-tr').append(line(`Im ${st.i + 1} / ${s.n}`, 'hud-strong'), line(`${s.sliceThicknessMm} mm slices`));

  const source = kind === 'vol'
    ? `16-bit volume, ${st.vol.cols}×${st.vol.rows}`
    : atDefaultWindow() ? `8-bit preview, ${s.cols}×${s.rows}` : '8-bit preview (window not applied yet)';
  $('hud-bl').innerHTML = '';
  $('hud-bl').append(line(`C ${st.wc}  W ${st.ww}`, 'hud-strong'), line(`Zoom ${Math.round(st.zoom * 100)}%`), line(source));

  // Scale bar: the longest "nice" length that fits in about a quarter of the stage.
  const bar = $('scalebar');
  const show = $('scale-toggle').checked;
  bar.hidden = !show;
  if (show) {
    const nice = [1, 2, 5, 10, 20, 50, 100];
    const mm = nice.filter((v) => v * L.pxPerMm <= Math.max(60, L.W * 0.28)).pop() ?? 1;
    bar.querySelector('i').style.width = `${mm * L.pxPerMm}px`;
    bar.querySelector('span').textContent = mm >= 10 ? `${mm / 10} cm` : `${mm} mm`;
  }

  // Orientation letters come from the series' direction cosines. The survey mixes
  // three planes under one stored orientation, so it gets none.
  const showOrient = $('orient-toggle').checked && !s.slicePlanes;
  const g = geometry(s);
  const neg = (v) => v.map((x) => -x);
  const set = (id, v) => { $(id).textContent = showOrient ? directionLetter(v) : ''; };
  set('orient-r', g.U); set('orient-l', neg(g.U)); set('orient-b', g.V); set('orient-t', neg(g.V));
}

function line(text, cls) {
  const d = document.createElement('div');
  d.textContent = text;
  if (cls) d.className = cls;
  return d;
}

function syncUi() {
  const s = st.s;
  $('slice-range').value = st.i + 1;
  $('slice-out').textContent = `${st.i + 1} / ${s.n}`;
  $('stage').setAttribute('aria-label',
    `Left knee, ${s.label}, ${subPlane()}, image ${st.i + 1} of ${s.n}. Scroll to change slice.`);
  $('zoom-val').textContent = `${Math.round(st.zoom * 100)}%`;
  $('wc-range').value = st.wc; $('ww-range').value = st.ww;
  if (document.activeElement !== $('wc-num')) $('wc-num').value = st.wc;
  if (document.activeElement !== $('ww-num')) $('ww-num').value = st.ww;
  $('wl-reset').disabled = atDefaultWindow();
  document.querySelectorAll('#tool-seg button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.tool === st.tool));
  });
  stage.dataset.tool = st.tool;

  const status = $('vol-status');
  const failed = st.volState === 'error';
  status.classList.toggle('is-error', failed);
  status.textContent = {
    idle: '',
    loading: 'Loading 16-bit volume… window changes apply once it arrives.',
    ready: atDefaultWindow()
      ? 'Default window: showing full-resolution images.'
      : 'Custom window: drawn from the compact 16-bit volume (lower resolution).',
    error: `Volume unavailable (${st.volError}). Images stay at the default window.`,
  }[st.volState];
  for (const id of ['wc-range', 'ww-range', 'wc-num', 'ww-num']) $(id).disabled = failed;
  syncMarkers();
}

// ---- Controls ----

function bindControls() {
  $('slice-range').addEventListener('input', (e) => setSlice(e.target.value - 1));
  $('slice-prev').addEventListener('click', () => setSlice(st.i - 1));
  $('slice-next').addEventListener('click', () => setSlice(st.i + 1));

  $('tool-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { st.tool = b.dataset.tool; syncUi(); }
  });

  $('zoom-in').addEventListener('click', () => zoomAt(1.25));
  $('zoom-out').addEventListener('click', () => zoomAt(0.8));
  $('zoom-fit').addEventListener('click', fit);

  $('wc-range').addEventListener('input', (e) => setWindow(+e.target.value, st.ww));
  $('ww-range').addEventListener('input', (e) => setWindow(st.wc, +e.target.value));
  const num = (id, fn) => {
    $(id).addEventListener('change', (e) => {
      const v = parseFloat(e.target.value);
      if (Number.isFinite(v)) fn(v);
      e.target.value = id === 'wc-num' ? st.wc : st.ww;
    });
  };
  num('wc-num', (v) => setWindow(v, st.ww));
  num('ww-num', (v) => setWindow(st.wc, v));
  $('wl-reset').addEventListener('click', resetWindow);
  $('scale-toggle').addEventListener('change', schedule);
  $('orient-toggle').addEventListener('change', schedule);
  $('marker-toggle').addEventListener('change', (e) => {
    st.showMarkers = e.target.checked;
    if (!st.showMarkers) st.focus = null;
    syncUi();
    schedule();
  });

  document.addEventListener('keydown', (e) => {
    if (!st.active || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
    const n = st.s.n;
    const actions = {
      ArrowUp: () => setSlice(st.i - 1), ArrowLeft: () => setSlice(st.i - 1),
      ArrowDown: () => setSlice(st.i + 1), ArrowRight: () => setSlice(st.i + 1),
      PageUp: () => setSlice(st.i - 5), PageDown: () => setSlice(st.i + 5),
      Home: () => setSlice(0), End: () => setSlice(n - 1),
      '+': () => zoomAt(1.25), '=': () => zoomAt(1.25), '-': () => zoomAt(0.8), '0': fit,
      r: resetWindow, R: resetWindow,
      m: () => $('marker-toggle').click(), M: () => $('marker-toggle').click(),
    };
    const fn = actions[e.key];
    if (fn) { e.preventDefault(); fn(); }
  });
}

function bindPointer() {
  const pts = new Map();
  let mode = null;
  let last = null;
  let scrollAcc = 0;
  let pinch = null;
  let wheelAcc = 0;

  const rel = (e) => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };
  const pinchState = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, rel(e));
    if (pts.size === 2) {
      mode = 'pinch';
      pinch = pinchState();
    } else if (pts.size === 1) {
      if (e.button === 2 || (e.button === 0 && e.ctrlKey)) mode = 'wl';
      else if (e.button === 1) mode = 'pan';
      else mode = st.tool;
      last = rel(e);
      scrollAcc = 0;
      if (e.button === 1) e.preventDefault();
    }
    stage.classList.add('is-dragging');
  });

  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const p = rel(e);
    pts.set(e.pointerId, p);
    if (mode === 'pinch' && pts.size === 2) {
      const now = pinchState();
      st.panX += now.mx - pinch.mx;
      st.panY += now.my - pinch.my;
      zoomAt(now.d / pinch.d, now.mx, now.my);
      pinch = now;
      return;
    }
    if (!last || pts.size !== 1) return;
    const dx = p.x - last.x, dy = p.y - last.y;
    last = p;
    if (mode === 'pan') {
      st.panX += dx; st.panY += dy; schedule();
    } else if (mode === 'wl') {
      // PACS mapping: sideways = width, vertical = center (drag up brightens).
      const k = (st.s.volumeMax - st.s.volumeMin) / 700;
      setWindow(st.wc + dy * k, st.ww + dx * k);
    } else if (mode === 'scroll') {
      const stepPx = clamp(stage.clientHeight / (st.s.n * 1.3), 6, 26);
      scrollAcc += dy;
      const steps = Math.trunc(scrollAcc / stepPx);
      if (steps) { scrollAcc -= steps * stepPx; setSlice(st.i + steps); }
    }
  });

  const end = (e) => {
    pts.delete(e.pointerId);
    // After a pinch, ignore the remaining finger until everything is lifted.
    if (pts.size === 0) { mode = null; last = null; stage.classList.remove('is-dragging'); }
    else if (mode === 'pinch') { mode = 'idle'; last = null; }
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
      // Shift+wheel arrives as horizontal delta in some browsers.
      const d = dy || (e.deltaMode === 1 ? e.deltaX * 33 : e.deltaX);
      const p = rel(e);
      zoomAt(Math.exp(-clamp(d, -200, 200) * 0.002), p.x, p.y);
      return;
    }
    wheelAcc += dy;
    if (Math.abs(wheelAcc) >= 50) {
      setSlice(st.i + Math.sign(wheelAcc));
      wheelAcc = 0;
    }
  }, { passive: false });
}
