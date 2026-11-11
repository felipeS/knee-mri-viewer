// Entry point: loads the manifest, routes between views, lazy-loads the heavier ones.

import { loadManifest } from './data.js';
import * as viewer from './viewer.js';

const VIEWS = ['slices', 'mpr', 'anatomy', 'motion'];
const loaders = {
  mpr: () => import('./mpr.js'),
  anatomy: () => import('./anatomy.js'),
  motion: () => import('./flexion.js'),
};
const modules = { slices: viewer };
const pending = {};
let manifest = null;
let current = null;

const api = {
  openInViewer(seriesId, index) {
    viewer.openSeries(seriesId, index);
    location.hash = '#slices';
    window.scrollTo({ top: 0 });
  },
};

function fatal(text) {
  const el = document.getElementById('fatal');
  el.hidden = false;
  el.textContent = text;
}

async function show(view) {
  if (!VIEWS.includes(view)) view = 'slices';
  if (view === current) return;
  current = view;
  for (const v of VIEWS) {
    document.getElementById(`view-${v}`).hidden = v !== view;
    modules[v]?.setActive?.(v === view);
  }
  document.querySelectorAll('.nav a').forEach((a) => {
    if (a.dataset.view === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  if (!modules[view] && loaders[view]) {
    const section = document.getElementById(`view-${view}`);
    try {
      pending[view] ??= loaders[view]();
      const mod = await pending[view];
      if (!modules[view]) {
        mod.init(manifest, api);
        modules[view] = mod;
      }
      mod.setActive?.(current === view);
    } catch (err) {
      console.error(err);
      delete pending[view];
      const p = document.createElement('p');
      p.className = 'fatal';
      p.textContent = `This view could not be started (${err.message}). The other views still work.`;
      section.prepend(p);
    }
  }
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
