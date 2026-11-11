// Findings view: a plain-language paraphrase of the written report (data/findings.json),
// with a small preview that shows the same approximate region markers as the slice viewer.
// Nothing here is read from the images; all statements come from the report paraphrase.

import { loadFindings, markersOn, sliceUrl } from './data.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

let manifest, api, data;
let selected = null; // finding id
let markerIndex = 0; // which of the selected finding's markers the preview shows

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  el.append(...kids.filter((x) => x != null));
  return el;
}

function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

const button = (cls, iconName, label, onclick) =>
  h('button', { type: 'button', class: cls, onclick }, icon(iconName), label);

const imageLabel = (m) => {
  const s = manifest.byId.get(m.series);
  return s ? `${s.label}, image ${m.slice + 1} of ${s.n}` : '';
};

export async function init(m, appApi) {
  manifest = m;
  api = appApi;
  data = await loadFindings();
  const root = document.getElementById('findings-root');
  root.innerHTML = '';
  root.append(study(), impression(), detail(), compartments(), unremarkable(), closing());
  select(data.findings[0].id);
}

export function setActive() {}

// ---- Sections ----

function study() {
  const s = data.study;
  return h('section', { class: 'f-block f-study' },
    h('h3', { class: 'eyebrow', text: 'Study' }),
    h('p', { text: `${s.summary} ${s.history}` }),
    h('p', { class: 'f-muted', text: `Sequences: ${s.sequences}` }),
  );
}

function impression() {
  const ol = h('ol', { class: 'impression' });
  for (const point of data.impression) {
    const links = h('span', { class: 'imp-links' });
    for (const id of point.findings) {
      const f = data.byId.get(id);
      links.append(h('button', {
        type: 'button', class: 'imp-link', 'data-f': id, text: f.title,
        onclick: () => select(id, true),
      }));
    }
    ol.append(h('li', {}, h('p', { text: point.text }), links));
  }
  return h('section', { class: 'f-block' },
    h('h3', { class: 'f-title', text: 'Impression' }),
    h('p', { class: 'f-muted', text: 'The report\'s own three-point summary, paraphrased. Select a term to read what it means.' }),
    ol,
  );
}

function card(f) {
  const el = h('article', { class: 'finding', id: `finding-${f.id}`, 'data-f': f.id, tabindex: '-1' });
  el.addEventListener('click', (e) => { if (!e.target.closest('button')) select(f.id); });

  const head = h('header', {},
    h('h4', { text: f.title }),
    h('span', { class: 'grade', text: f.grade }),
  );
  const sub = h('p', { class: 'f-muted', text: `${f.german} · ${f.compartment}` });

  const open = h('div', { class: 'finding-actions' });
  for (const m of f.markers) {
    open.append(button('text-btn text-btn-accent', 'target', `Open ${imageLabel(m)}, with marker`,
      () => api.openInViewer(m.series, m.slice, f.id)));
  }
  const more = h('div', { class: 'finding-actions' },
    button('text-btn', 'joint', 'Show in the schematic', () => api.showStructure(f.schematic)),
    button('text-btn', 'flex', 'Show on the generic model', () => api.showOnModel(f.model.key)),
  );

  el.append(head, sub,
    h('h5', { class: 'eyebrow', text: 'What the report says' }), h('p', { text: f.report }),
    h('h5', { class: 'eyebrow', text: 'What the term means' }), h('p', { text: f.means }),
    h('h5', { class: 'eyebrow', text: 'Where to look' }), h('p', { text: f.where }),
    open, more,
  );
  return el;
}

function detail() {
  const cards = h('div', { class: 'finding-list' }, ...data.findings.map(card));
  const preview = h('aside', { class: 'finding-preview', 'aria-label': 'Preview image with approximate region marker' },
    h('h4', { id: 'pv-title' }),
    h('div', { class: 'seg', id: 'pv-tabs', role: 'group', 'aria-label': 'Preview image' }),
    h('div', { class: 'pv-frame', id: 'pv-frame' }, h('img', { id: 'pv-img', alt: '' })),
    h('p', { class: 'marker-caption is-on', text: data.markerNote }),
    h('div', { id: 'pv-open' }),
  );
  const overlay = document.createElementNS(SVG_NS, 'svg');
  overlay.setAttribute('viewBox', '0 0 1000 1000');
  overlay.setAttribute('preserveAspectRatio', 'none');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.id = 'pv-overlay';
  preview.querySelector('#pv-frame').append(overlay);
  preview.querySelector('#pv-img').addEventListener('error', () => { preview.querySelector('#pv-frame').classList.add('is-missing'); });

  return h('section', { class: 'f-block' },
    h('h3', { class: 'f-title', text: 'What the report mentions' }),
    h('p', { class: 'f-muted', text: 'Five items, in the order of the impression. Each explanation is general: it says what the word means, not what it means for this knee.' }),
    h('div', { class: 'finding-grid' }, cards, preview),
  );
}

function compartments() {
  const grid = h('div', { class: 'comp-grid' });
  for (const c of data.compartments) {
    const ul = h('ul', { class: 'comp-items' });
    for (const it of c.items) {
      const li = h('li', { class: `is-${it.status}` },
        icon(it.status === 'mentioned' ? 'target' : 'check'),
        h('span', {}, h('strong', { text: it.name }), `: ${it.text}`),
      );
      if (it.finding) {
        li.append(h('button', { type: 'button', class: 'imp-link', text: 'Explain', onclick: () => select(it.finding, true) }));
      }
      ul.append(li);
    }
    grid.append(h('div', { class: 'comp' },
      h('h4', { text: c.name }),
      c.hint ? h('p', { class: 'f-muted', text: c.hint }) : null,
      ul,
    ));
  }
  return h('section', { class: 'f-block' },
    h('h3', { class: 'f-title', text: 'Findings by compartment' }),
    h('p', { class: 'f-muted', text: 'The report goes through the knee region by region. Ring: mentioned in the report. Check mark: reported as unremarkable, intact or normal.' }),
    grid,
  );
}

function unremarkable() {
  const ul = h('ul', { class: 'ok-list' });
  for (const t of data.unremarkable) ul.append(h('li', {}, icon('check'), h('span', { text: t })));
  return h('section', { class: 'f-block' },
    h('h3', { class: 'f-title', text: 'Reported as unremarkable, intact or normal' }),
    h('p', { class: 'f-muted', text: 'These are the report\'s statements, listed here so they are not lost next to the items above. This site has not re-read the images.' }),
    ul,
  );
}

function closing() {
  return h('section', { class: 'f-block f-closing' },
    h('h3', { class: 'eyebrow', text: 'What this page does not do' }),
    h('p', { text: 'It does not say what these findings mean for this knee, how they relate to any symptoms, how they compare with the previous examination, or whether anything needs to be done about them. Those are questions for the treating doctor, with the original report in hand.' }),
  );
}

// ---- Selection and preview ----

export function select(id, reveal = false) {
  const f = data?.byId.get(id);
  if (!f) return;
  if (id !== selected) markerIndex = 0;
  selected = id;
  document.querySelectorAll('.view-findings [data-f]').forEach((el) => {
    const on = el.dataset.f === id;
    if (el.tagName === 'BUTTON') el.setAttribute('aria-pressed', String(on));
    else el.classList.toggle('is-on', on);
  });
  renderPreview();
  if (reveal) {
    const el = document.getElementById(`finding-${id}`);
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
  }
}

function renderPreview() {
  const f = data.byId.get(selected);
  const m = f.markers[markerIndex] ?? f.markers[0];
  const s = manifest.byId.get(m.series);
  document.getElementById('pv-title').textContent = f.title;

  const tabs = document.getElementById('pv-tabs');
  tabs.innerHTML = '';
  tabs.hidden = f.markers.length < 2;
  f.markers.forEach((mk, k) => {
    const ser = manifest.byId.get(mk.series);
    tabs.append(h('button', {
      type: 'button', 'aria-pressed': String(k === markerIndex),
      text: `${ser?.label ?? mk.series} · ${mk.slice + 1}`,
      onclick: () => { markerIndex = k; renderPreview(); },
    }));
  });

  const img = document.getElementById('pv-img');
  document.getElementById('pv-frame').classList.remove('is-missing');
  if (s) img.src = sliceUrl(s, m.slice);
  img.alt = `Left knee, ${imageLabel(m)}, with an approximate region marker for orientation.`;

  // Same markers as the slice viewer draws on this image; the selected finding's is emphasised.
  const svg = document.getElementById('pv-overlay');
  svg.innerHTML = '';
  for (const mk of markersOn(data, m.series, m.slice)) {
    const strong = mk.finding === selected;
    const ring = document.createElementNS(SVG_NS, 'ellipse');
    ring.setAttribute('cx', mk.x * 1000); ring.setAttribute('cy', mk.y * 1000);
    ring.setAttribute('rx', mk.rx * 1000); ring.setAttribute('ry', (mk.ry ?? mk.rx) * 1000);
    ring.setAttribute('class', strong ? 'pv-ring is-on' : 'pv-ring');
    svg.append(ring);
    if (!strong) continue;
    const text = `approx. ${mk.label}`;
    const fs = 28, w = text.length * fs * 0.6;
    let x = mk.x * 1000, y = mk.y * 1000 + fs * 0.35;
    if (mk.side === 'left') x -= mk.rx * 1000 + 24 + w / 2;
    else if (mk.side === 'top') y -= (mk.ry ?? mk.rx) * 1000 + 40;
    else if (mk.side === 'bottom') y += (mk.ry ?? mk.rx) * 1000 + 40;
    else x += mk.rx * 1000 + 24 + w / 2;
    x = Math.min(1000 - w / 2 - 12, Math.max(w / 2 + 12, x));
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', x - w / 2 - 10); bg.setAttribute('y', y - fs);
    bg.setAttribute('width', w + 20); bg.setAttribute('height', fs * 1.5);
    bg.setAttribute('class', 'pv-label-bg');
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', fs);
    t.setAttribute('class', 'pv-label');
    t.textContent = text;
    svg.append(bg, t);
  }

  const open = document.getElementById('pv-open');
  open.innerHTML = '';
  open.append(button('text-btn text-btn-accent', 'target', `Open ${imageLabel(m)}, with marker`,
    () => api.openInViewer(m.series, m.slice, f.id)));
}
