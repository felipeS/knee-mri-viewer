// GPU ray-marched projection (MIP or summed) of one compact volume.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { loadVolume, geometry, V } from './data.js';

const $ = (id) => document.getElementById(id);
const DEFAULTS = { mip: { lo: 6, hi: 82 }, avg: { lo: 3, hi: 30 } };

let manifest, renderer, scene, camera, controls, mesh, material;
let active = false, dirty = true, running = false, failed = false;
let mode = 'mip';
let loadToken = 0;

const vertexShader = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

// Rays are marched in the box's local space, where the volume is the unit cube.
const fragmentShader = /* glsl */ `
  precision highp float;
  precision highp sampler3D;
  uniform sampler3D uVol;
  uniform vec3 uCam;
  uniform float uLo;
  uniform float uHi;
  uniform int uMode;
  varying vec3 vPos;
  const int STEPS = 160;
  void main() {
    vec3 rd = normalize(vPos - uCam);
    vec3 inv = 1.0 / rd;
    vec3 t0 = (vec3(-0.5) - uCam) * inv;
    vec3 t1 = (vec3(0.5) - uCam) * inv;
    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);
    float tn = max(max(max(tmin.x, tmin.y), tmin.z), 0.0);
    float tf = min(min(tmax.x, tmax.y), tmax.z);
    if (tf <= tn) discard;
    float dt = (tf - tn) / float(STEPS);
    // Per-pixel jitter hides the banding of a fixed step count.
    float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float peak = 0.0;
    float sum = 0.0;
    for (int i = 0; i < STEPS; i++) {
      vec3 p = uCam + rd * (tn + (float(i) + j) * dt) + 0.5;
      float v = texture(uVol, p).r;
      peak = max(peak, v);
      sum += v;
    }
    float val = uMode == 0 ? peak : sum * dt;
    float g = clamp((val - uLo) / max(uHi - uLo, 0.001), 0.0, 1.0);
    gl_FragColor = vec4(vec3(g) * vec3(1.0, 0.985, 0.95), 1.0);
  }`;

export function init(m) {
  manifest = m;
  const canvas = $('vol-canvas');
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    if (!renderer.capabilities.isWebGL2) throw new Error('WebGL 2 is not available');
  } catch (err) {
    fail(`The 3D view needs WebGL 2 (${err.message}).`);
    return;
  }
  renderer.setClearColor(0x000000);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 1.5;
  controls.maxDistance = 8;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;
  controls.addEventListener('change', () => { dirty = true; });
  resetView();

  material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    side: THREE.BackSide,
    uniforms: {
      uVol: { value: null },
      uCam: { value: new THREE.Vector3() },
      uLo: { value: 0 }, uHi: { value: 1 }, uMode: { value: 0 },
    },
  });
  mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  scene.add(mesh);

  $('vol-series').addEventListener('change', (e) => load(e.target.value));
  $('vol-mode').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setMode(b.dataset.mode);
  });
  $('vol-lo').addEventListener('input', syncWindow);
  $('vol-hi').addEventListener('input', syncWindow);
  $('vol-spin').addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    $('vol-spin').setAttribute('aria-pressed', String(controls.autoRotate));
  });
  $('vol-reset').addEventListener('click', resetView);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fail('The graphics context was lost. Reload the page to restore the 3D view.'); });
  new ResizeObserver(resize).observe($('vol-stage'));

  setMode('mip');
  load($('vol-series').value);
}

export function setActive(on) {
  active = on;
  if (on && renderer && !failed) { resize(); dirty = true; if (!running) { running = true; requestAnimationFrame(tick); } }
}

function fail(text) {
  failed = true;
  const msg = $('vol-msg');
  msg.hidden = false;
  msg.textContent = text;
}

function resetView() {
  // Start in front of the knee, slightly above and to the side.
  camera.position.set(1.3, 0.7, 3.4);
  controls.target.set(0, 0, 0);
  controls.update();
  dirty = true;
}

function setMode(m) {
  mode = m;
  material.uniforms.uMode.value = m === 'mip' ? 0 : 1;
  document.querySelectorAll('#vol-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  $('vol-lo').value = DEFAULTS[m].lo;
  $('vol-hi').value = DEFAULTS[m].hi;
  syncWindow();
}

function syncWindow() {
  const lo = +$('vol-lo').value;
  const hi = Math.max(+$('vol-hi').value, lo + 1);
  $('vol-lo-out').textContent = `${lo}%`;
  $('vol-hi-out').textContent = `${hi}%`;
  material.uniforms.uLo.value = lo / 100;
  material.uniforms.uHi.value = hi / 100;
  dirty = true;
}

async function load(id) {
  const s = manifest.byId.get(id);
  const token = ++loadToken;
  const msg = $('vol-msg');
  const hud = $('vol-hud');
  if (!s) return;
  msg.hidden = false;
  msg.textContent = 'Loading volume…';
  mesh.visible = false;
  dirty = true;
  let vol;
  try {
    vol = await loadVolume(s);
  } catch (err) {
    if (token === loadToken) msg.textContent = `This volume could not be loaded (${err.message}).`;
    return;
  }
  if (token !== loadToken) return;

  // 8 bits are plenty for a projection and keep the texture small.
  const u8 = new Uint8Array(vol.data.length);
  for (let k = 0; k < u8.length; k++) u8[k] = vol.data[k] >> 8;
  const tex = new THREE.Data3DTexture(u8, vol.cols, vol.rows, vol.n);
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  material.uniforms.uVol.value?.dispose();
  material.uniforms.uVol.value = tex;

  // Box axes = column, row and stacking directions in millimetres, taken from the
  // series geometry, then mapped from patient space (x left, y back, z up) to
  // the scene (x right, y up, z toward the viewer): the knee starts seen from the front.
  const g = geometry(s);
  const toScene = (v) => new THREE.Vector3(v[0], v[2], -v[1]);
  const ex = toScene(V.mul(g.U, s.cols * g.psCol));
  const ey = toScene(V.mul(g.V, s.rows * g.psRow));
  const ez = toScene(V.mul(g.N, s.n * g.spacing));
  const k = 1.7 / Math.max(ex.length(), ey.length(), ez.length());
  mesh.matrix.makeBasis(ex.multiplyScalar(k), ey.multiplyScalar(k), ez.multiplyScalar(k));
  mesh.matrixWorldNeedsUpdate = true;
  mesh.visible = true;

  hud.innerHTML = '';
  for (const t of [s.label, `${vol.cols}×${vol.rows}×${vol.n} voxels`, 'Projection, not diagnostic']) {
    const d = document.createElement('div');
    d.textContent = t;
    hud.append(d);
  }
  hud.firstChild.className = 'hud-strong';
  msg.hidden = true;
  dirty = true;
}

function resize() {
  const el = $('vol-stage');
  const w = el.clientWidth, h = el.clientHeight;
  if (!w || !h || !renderer) return;
  // The ray march costs per pixel, so keep the backing store modest on dense screens.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dirty = true;
}

const inv = new THREE.Matrix4();

function tick() {
  if (!active || failed) { running = false; return; }
  requestAnimationFrame(tick);
  controls.update();
  if (!dirty) return;
  dirty = false;
  mesh.updateMatrixWorld();
  camera.updateMatrixWorld();
  material.uniforms.uCam.value.copy(camera.position).applyMatrix4(inv.copy(mesh.matrixWorld).invert());
  renderer.render(scene, camera);
}
