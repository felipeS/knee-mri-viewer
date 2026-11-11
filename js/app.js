// Entry point: loads the manifest, routes between views, lazy-loads the heavier ones.

import { loadManifest } from './data.js';
import * as viewer from './viewer.js';

const VIEWS = ['slices', 'findings', 'mpr', 'anatomy', 'motion'];
const loaders = {
  findings: () => import('./findings.js'),
  mpr: () => import('./mpr.js'),
  anatomy: () => import('./anatomy.js'),
  motion: () => import('./flexion.js'),
};
const modules = { slices: viewer };
const pending = {};
let manifest = null;
let current = null;

/** Navigate to a view and resolve with its module once it has started (null if it failed). */
function go(view) {
  if (location.hash !== `#${view}`) location.hash = `#${view}`;
  window.scrollTo({ top: 0 });
  return show(view);
}

const api = {
  /** Open a series at an image; with a finding id, also show and emphasise its region marker. */
  openInViewer(seriesId, index, findingId = null) {
    viewer.openSeries(seriesId, index);
    viewer.focusFinding(findingId);
    go('slices');
  },
  showFinding: (id) => go('findings').then((mod) => mod?.select(id, true)),
  showStructure: (id) => go('anatomy').then((mod) => mod?.select(id)),
  showOnModel: (key) => go('motion').then((mod) => mod?.highlight(key)),
};

function fatal(text) {
  const el = document.getElementById('fatal');
  el.hidden = false;
  el.textContent = text;
}

function start(view) {
  if (modules[view]) return Promise.resolve(modules[view]);
  if (!loaders[view]) return Promise.resolve(null);
  pending[view] ??= loaders[view]()
    .then(async (mod) => {
      await mod.init(manifest, api);
      modules[view] = mod;
      return mod;
    })
    .catch((err) => {
      console.error(err);
      delete pending[view];
      const p = document.createElement('p');
      p.className = 'fatal';
      p.textContent = `This view could not be started (${err.message}). The other views still work.`;
      document.getElementById(`view-${view}`).prepend(p);
      return null;
    });
  return pending[view];
}

async function show(view) {
  if (!VIEWS.includes(view)) view = 'slices';
  if (view !== current) {
    current = view;
    for (const v of VIEWS) {
      document.getElementById(`view-${v}`).hidden = v !== view;
      modules[v]?.setActive?.(v === view);
    }
    document.querySelectorAll('.nav a').forEach((a) => {
      if (a.dataset.view === view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }
  const mod = await start(view);
  mod?.setActive?.(current === view);
  return mod;
}

const route = () => show(location.hash.replace('#', '') || 'slices');

async function main() {
  try {
    manifest = await loadManifest();
  } catch (err) {
    fatal(`The image list (data/manifest.json) could not be loaded: ${err.message}. ` +
      'Open this page through a web server, for example "python3 -m http.server", not directly from the file system.');
    return;
  }
  try {
    viewer.initViewer(manifest);
  } catch (err) {
    console.error(err);
    fatal(`The slice viewer could not start: ${err.message}`);
  }
  window.addEventListener('hashchange', route);
  route();
}

main();
