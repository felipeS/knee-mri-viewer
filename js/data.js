// Shared data access: manifest, slice image cache, volume decoding, series geometry.

export const pad3 = (i) => String(i).padStart(3, '0');
export const sliceUrl = (s, i) => s.slicePattern.replace('{index}', pad3(i));
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export async function loadManifest() {
  const res = await fetch('data/manifest.json');
  if (!res.ok) throw new Error(`manifest.json: HTTP ${res.status}`);
  const m = await res.json();
  m.byId = new Map(m.series.map((s) => [s.id, s]));
  return m;
}

// ---- Report paraphrase and approximate region markers ----

let findingsPromise = null;

/** Promise of data/findings.json with `byId` and a flat `markers` list added. Cached, failures too. */
export function loadFindings() {
  findingsPromise ??= (async () => {
    const res = await fetch('data/findings.json');
    if (!res.ok) throw new Error(`findings.json: HTTP ${res.status}`);
    const f = await res.json();
    f.byId = new Map(f.findings.map((x) => [x.id, x]));
    f.markers = f.findings.flatMap((x) => x.markers.map((m) => ({ ...m, finding: x.id })));
    return f;
  })();
  return findingsPromise;
}

/** Markers placed on one image of one series. */
export const markersOn = (f, seriesId, slice) =>
  f.markers.filter((m) => m.series === seriesId && m.slice === slice);

// ---- Slice images (8-bit WebP at the scanner default window) ----

const images = new Map();

/** Returns {img, status: 'loading'|'ok'|'error'}; onChange fires once when it settles. */
export function getSlice(s, i, onChange) {
  const key = `${s.id}/${i}`;
  let e = images.get(key);
  if (!e) {
    e = { img: new Image(), status: 'loading', waiters: [] };
    images.set(key, e);
    e.img.decoding = 'async';
    const settle = (status) => {
      e.status = status;
      const w = e.waiters;
      e.waiters = [];
      w.forEach((fn) => fn(e));
    };
    e.img.onload = () => settle('ok');
    e.img.onerror = () => settle('error');
    e.img.src = sliceUrl(s, i);
  }
  if (e.status === 'loading' && onChange && !e.waiters.includes(onChange)) e.waiters.push(onChange);
  return e;
}

export function preloadSeries(s, around = 0) {
  // Nearest slices first so scrolling from the current position is smooth.
  const order = Array.from({ length: s.n }, (_, i) => i).sort((a, b) => Math.abs(a - around) - Math.abs(b - around));
  order.forEach((i) => getSlice(s, i));
}

// ---- Compact 16-bit volumes ----

const volumes = new Map();

async function gunzip(buf) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser has no DecompressionStream support');
  }
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

/** Promise of {data: Uint16Array, n, rows, cols}. Cached per series; a failure is cached too. */
export function loadVolume(s) {
  let p = volumes.get(s.id);
  if (!p) {
    p = (async () => {
      const res = await fetch(s.volumePath);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let buf = await res.arrayBuffer();
      // Some servers send .gz with Content-Encoding and the browser inflates it for us;
      // only decompress when the gzip magic is still there.
      const head = new Uint8Array(buf, 0, 2);
      if (head[0] === 0x1f && head[1] === 0x8b) buf = await gunzip(buf);
      const [n, rows, cols] = s.volumeShape;
      if (buf.byteLength !== n * rows * cols * 2) {
        throw new Error(`unexpected size ${buf.byteLength}, wanted ${n * rows * cols * 2}`);
      }
      let data;
      if (new Uint8Array(new Uint16Array([1]).buffer)[0] === 1) {
        data = new Uint16Array(buf);
      } else {
        const dv = new DataView(buf);
        data = new Uint16Array(n * rows * cols);
        for (let k = 0; k < data.length; k++) data[k] = dv.getUint16(k * 2, true);
      }
      return { data, n, rows, cols };
    })();
    volumes.set(s.id, p);
  }
  return p;
}

// ---- Geometry (DICOM patient coordinates: +x left, +y posterior, +z head) ----

export const V = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
};

const geoms = new Map();

export function geometry(s) {
  let g = geoms.get(s.id);
  if (g) return g;
  const o = s.imageOrientationPatient;
  const U = o.slice(0, 3); // direction of increasing column
  const Vd = o.slice(3, 6); // direction of increasing row
  const span = V.sub(s.lastImagePositionPatient, s.firstImagePositionPatient);
  const spacing = s.n > 1 ? V.len(span) / (s.n - 1) : s.spacingBetweenSlicesMm;
  const N = V.len(span) > 0 ? V.mul(span, 1 / V.len(span)) : [0, 0, 1];
  const psRow = s.pixelSpacingMm[0];
  const psCol = s.pixelSpacingMm[1];
  g = {
    U, V: Vd, N, spacing, psRow, psCol,
    p0: s.firstImagePositionPatient,
    origin: (i) => V.add(s.firstImagePositionPatient, V.mul(N, spacing * i)),
    toPatient: (i, col, row) =>
      V.add(g.origin(i), V.add(V.mul(U, col * psCol), V.mul(Vd, row * psRow))),
    /** Fractional slice index and in-plane pixel coordinates of a patient-space point. */
    fromPatient: (P) => {
      const d = V.sub(P, g.p0);
      return { k: V.dot(d, N) / spacing, col: V.dot(d, U) / psCol, row: V.dot(d, Vd) / psRow };
    },
  };
  geoms.set(s.id, g);
  return g;
}

const AXIS_LETTERS = [['L', 'R'], ['P', 'A'], ['H', 'F']];

/** Letter for the anatomical direction a vector mostly points toward (L/R, A/P, H/F). */
export function directionLetter(v) {
  let a = 0;
  for (let k = 1; k < 3; k++) if (Math.abs(v[k]) > Math.abs(v[a])) a = k;
  return AXIS_LETTERS[a][v[a] >= 0 ? 0 : 1];
}
