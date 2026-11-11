// Generic procedural knee that flexes. A teaching model built from primitives:
// not derived from the images, not patient-specific, not a simulation of any injury.
//
// Scene axes (roughly centimetres): +y up, +z front of the knee, +x lateral side of a left knee.
// The femur is fixed; the tibia group rotates about the x axis through the condyle centres.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { loadFindings } from './data.js';

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const MAX = 140;
const ROLLBACK = 0.8; // how far the femoral contact moves back on the tibia at full flexion

const COL = { bone: 0xd8d2c4, soft: 0x7e868d, fat: 0x8a836c, hi: 0xe3a548 };

// Patella rides a circle around this centre; its lower pole stays one tendon length from the tibia.
const PAT_C = new THREE.Vector3(0, 0.3, 0);
const PAT_R = 3.1;
const PAT_HALF = 1.2;
const POLE_R = Math.hypot(PAT_R, PAT_HALF);
const POLE_OFF = Math.atan2(PAT_HALF, PAT_R);
const PAT_PHI0 = 20 * DEG;

const ATTACH = {
  aclF: new THREE.Vector3(0.62, 0.5, -0.85), aclT: new THREE.Vector3(-0.1, -2.15, 0.9),
  pclF: new THREE.Vector3(-0.6, -0.5, 0.5), pclT: new THREE.Vector3(0.1, -2.5, -2.1),
  mclF: new THREE.Vector3(-4.3, 0.3, -0.1), mclT: new THREE.Vector3(-3.1, -6.6, 0.3),
  lclF: new THREE.Vector3(4.3, 0.3, -0.3), lclT: new THREE.Vector3(3.9, -4.3, -1.5),
  tuber: new THREE.Vector3(0, -5.0, 2.2),
  quad: new THREE.Vector3(0, 12, 1.9),
};

let renderer, scene, camera, controls;
let tibia, tibiaInner, patella, meniscusM, meniscusL;
let bands = {}, quadTube, patTube, tendonLen;
let hoffaPad, fluidPouch, insertionRing;
let highlighted = null;
let groups = {}, boneMat;
let angle = 20, playing = false, playT = 0, lastTime = 0;
let active = false, running = false, dirty = true, failed = false;

export function init() {
  const canvas = $('motion-canvas');
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (err) {
    failed = true;
    const msg = $('motion-msg');
    msg.hidden = false;
    msg.textContent = `The 3D model needs WebGL, which is not available here (${err.message}).`;
    return;
  }
  renderer.setClearColor(0x050505);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.5, 200);
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 16;
  controls.maxDistance = 80;
  controls.addEventListener('change', () => { dirty = true; });

  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x2a2d32, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(12, 16, 18);
  scene.add(key);

  build();
  setCamera('side');
  setAngle(angle);
  bind();
  new ResizeObserver(resize).observe($('motion-stage'));

  // Chips for what the written report mentions. The model itself stays generic.
  loadFindings().then((f) => {
    const box = $('flex-report-chips');
    for (const x of f.findings) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.h = x.model.key;
      b.textContent = x.model.label;
      box.append(b);
    }
    $('flex-report-normal').textContent = f.modelNormal;
    $('flex-report').hidden = false;
    setHighlight(highlighted);
  }).catch((err) => console.warn(err));
}

/** Highlight a group by key (used when arriving from the Findings view). */
export function highlight(key) {
  if (failed || !renderer) return;
  setHighlight(key);
}

export function setActive(on) {
  active = on;
  if (!on) setPlaying(false);
  if (on && renderer && !failed) {
    resize();
    dirty = true;
    if (!running) { running = true; lastTime = 0; requestAnimationFrame(tick); }
  }
}

// ---- Model ----

function mat(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0 });
}

function part(geo, material, pos, scale) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(...pos);
  if (scale) m.scale.set(...scale);
  return m;
}

function build() {
  boneMat = mat(COL.bone);
  boneMat.transparent = true;
  const softMat = () => mat(COL.soft);
  const reg = (name, ...meshes) => {
    groups[name] = (groups[name] ?? []).concat(meshes);
    for (const m of meshes) m.userData.base ??= m.material.color.getHex();
    return meshes[0];
  };

  // Femur: two condyles, a block bridging them at the front, a flare and a shaft.
  const femur = new THREE.Group();
  const ball = new THREE.SphereGeometry(2, 40, 28);
  femur.add(
    part(ball, boneMat, [-2.45, 0, 0], [1.05, 1, 1]),
    part(ball, boneMat, [2.45, 0, 0], [1.05, 1, 1]),
    part(new THREE.SphereGeometry(2.1, 40, 28), boneMat, [0, 1.5, 0.3], [2, 1, 1]),
    part(new THREE.CylinderGeometry(1.45, 3.3, 4.5, 40), boneMat, [0, 3.8, 0], [1, 1, 0.7]),
    part(new THREE.CylinderGeometry(1.4, 1.45, 10, 32), boneMat, [0, 11, 0], [1, 1, 0.85]),
  );
  scene.add(femur);

  // Tibia and fibula, in a frame whose origin is the flexion axis.
  tibia = new THREE.Group();
  tibiaInner = new THREE.Group();
  tibia.add(tibiaInner);
  tibiaInner.add(
    part(new THREE.CylinderGeometry(3.9, 3.3, 1.6, 48), boneMat, [0, -2.95, 0], [1, 1, 0.72]),
    part(new THREE.CylinderGeometry(2.7, 1.2, 3.6, 40), boneMat, [0, -5.5, 0], [1, 1, 0.8]),
    part(new THREE.CylinderGeometry(1.2, 1.05, 9, 32), boneMat, [0, -11.8, 0], [1, 1, 0.9]),
    part(new THREE.SphereGeometry(0.7, 24, 16), boneMat, [0, -5.0, 1.75], [1, 1.5, 0.7]),
    part(new THREE.SphereGeometry(0.75, 24, 16), boneMat, [3.6, -4.5, -1.5], [1, 1.2, 1]),
    part(new THREE.CylinderGeometry(0.42, 0.36, 11.4, 20), boneMat, [3.5, -10.6, -1.45]),
  );
  scene.add(tibia);

  // Menisci: flattened C-shaped rings, open toward the centre of the joint.
  const ring = new THREE.TorusGeometry(1.45, 0.34, 14, 48, 300 * DEG);
  const meniscus = (x, open, name) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(ring, softMat());
    m.rotation.set(Math.PI / 2, 0, open);
    g.add(m);
    g.scale.set(1, 0.55, 1.15);
    g.position.set(x, -2.0, 0);
    tibiaInner.add(g);
    reg('menisci', m);
    reg(name, m);
    return g;
  };
  meniscusM = meniscus(-2.45, 30 * DEG, 'meniscus-medial');
  meniscusL = meniscus(2.45, 210 * DEG, 'meniscus-lateral');

  // Ligament bands: unit cylinders stretched between two points every frame.
  const band = (name, group, radius, flat) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 14), softMat());
    m.userData.flat = flat;
    scene.add(m);
    bands[name] = m;
    reg(group, m);
  };
  band('acl', 'acl', 0.36, 1);
  band('pcl', 'pcl', 0.42, 1);
  band('mcl', 'collaterals', 0.5, 0.35);
  band('lcl', 'collaterals', 0.26, 1);

  patella = part(new THREE.SphereGeometry(1, 32, 20), boneMat.clone(), null, [1.25, PAT_HALF, 0.5]);
  patella.material.transparent = false;
  scene.add(patella);
  quadTube = new THREE.Mesh(new THREE.BufferGeometry(), softMat());
  patTube = new THREE.Mesh(new THREE.BufferGeometry(), softMat());
  quadTube.scale.x = patTube.scale.x = 2.6; // widen the round tubes into straps
  scene.add(quadTube, patTube);
  reg('patella', patella, quadTube, patTube);

  // Generic stand-ins for the soft-tissue places a report can name. Positions are schematic.
  // The fat pad sits behind the patellar tendon and is always drawn; the fluid pouch and the
  // ring around the tendon's upper end only appear while they are highlighted.
  hoffaPad = part(new THREE.SphereGeometry(0.62, 24, 16), mat(COL.fat), null, [1.25, 0.85, 0.6]);
  fluidPouch = part(new THREE.SphereGeometry(1, 28, 18), mat(COL.soft), [0, 4.3, 2.05], [1.7, 1.7, 0.32]);
  fluidPouch.material.transparent = true;
  fluidPouch.material.opacity = 0.6;
  fluidPouch.material.depthWrite = false;
  insertionRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 10, 36), mat(COL.soft));
  fluidPouch.userData.onlyHi = insertionRing.userData.onlyHi = true;
  fluidPouch.visible = insertionRing.visible = false;
  scene.add(hoffaPad, fluidPouch, insertionRing);
  reg('hoffa', hoffaPad);
  reg('joint-fluid', fluidPouch);
  reg('patellar-tendon', patTube, insertionRing);

  tendonLen = polePoint(PAT_PHI0 - POLE_OFF).distanceTo(ATTACH.tuber);
}

const onCircle = (r, phi) => new THREE.Vector3(0, PAT_C.y + r * Math.sin(phi), PAT_C.z + r * Math.cos(phi));
const polePoint = (phi) => onCircle(POLE_R, phi);

function stretch(mesh, a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  mesh.scale.set(1, len, mesh.userData.flat);
}

function tube(mesh, pts, radius) {
  mesh.geometry.dispose();
  mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, radius, 8, false);
}

function setAngle(deg) {
  angle = Math.min(MAX, Math.max(0, deg));
  const t = angle / MAX;
  tibia.rotation.x = angle * DEG;
  // Rollback: the tibia shifts forward in its own frame, so the femoral contact
  // moves backward on the plateau. The menisci follow, the lateral one further.
  tibiaInner.position.z = ROLLBACK * t;
  meniscusM.position.z = -ROLLBACK * t * 0.5;
  meniscusL.position.z = -ROLLBACK * t;
  tibia.updateMatrixWorld(true);
  const world = (v) => tibiaInner.localToWorld(v.clone());

  stretch(bands.acl, ATTACH.aclF, world(ATTACH.aclT));
  stretch(bands.pcl, ATTACH.pclF, world(ATTACH.pclT));
  stretch(bands.mcl, ATTACH.mclF, world(ATTACH.mclT));
  stretch(bands.lcl, ATTACH.lclF, world(ATTACH.lclT));

  // Patella: find where on its circle the lower pole is exactly one tendon length
  // from the tibial tuberosity. Distance grows monotonically moving away from the
  // tuberosity's own direction, so bisect over that half-turn.
  const T = world(ATTACH.tuber);
  const phiT = Math.atan2(T.y - PAT_C.y, T.z - PAT_C.z);
  let lo = 0, hi = Math.PI;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    if (polePoint(phiT + mid).distanceTo(T) < tendonLen) lo = mid; else hi = mid;
  }
  const polePhi = phiT + lo;
  const phi = polePhi + POLE_OFF;
  patella.position.copy(onCircle(PAT_R, phi));
  patella.rotation.x = -phi;

  const pole = polePoint(polePhi);
  tube(patTube, [pole, T], 0.26);
  // Fat pad: behind the upper half of the tendon, pulled toward the front edge of the tibia.
  hoffaPad.position.lerpVectors(pole, T, 0.4).lerp(world(new THREE.Vector3(0, -2.3, 1.4)), 0.45);
  const along = new THREE.Vector3().subVectors(T, pole).normalize();
  insertionRing.position.copy(pole).addScaledVector(along, 0.35);
  insertionRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), along);
  insertionRing.scale.set(1.9, 1, 1);
  // Quadriceps tendon wraps over the front of the femur before heading up the thigh.
  const top = phi + POLE_OFF;
  const wrapEnd = 40 * DEG;
  const pts = [polePoint(top)];
  // Normalised to (-pi, pi]; near extension the pole is already above the wrap end and nothing is added.
  const a = Math.atan2(Math.sin(top), Math.cos(top));
  for (let p = a + 14 * DEG; p < wrapEnd; p += 14 * DEG) pts.push(onCircle(POLE_R, p));
  pts.push(new THREE.Vector3(0, 5.2, 2.35), ATTACH.quad);
  tube(quadTube, pts, 0.28);

  $('flex-range').value = Math.round(angle);
  $('flex-out').textContent = `${Math.round(angle)}°`;
  $('flex-phase').textContent = angle < 12
    ? 'Extended. In this model the leg is straight and the patella sits high on the front of the femur.'
    : angle < 75
      ? 'Bending. The tibia swings back under the femur while the contact point rolls and glides backward; the patella slides down into its groove.'
      : 'Deep flexion. The menisci have shifted toward the back of the plateau and the patella has moved down toward the notch between the condyles.';
  $('motion-hud').textContent = `Generic model · flexion ${Math.round(angle)}°`;
  dirty = true;
}

// ---- Controls ----

function setCamera(view) {
  const pos = { side: [40, 3, 14], front: [5, 3, 43], back: [-7, 4, -42] }[view];
  camera.position.set(...pos);
  controls.target.set(0, -1.5, -1.5);
  controls.update();
  dirty = true;
}

function setHighlight(name) {
  highlighted = name;
  const on = new Set(groups[name] ?? []);
  for (const m of new Set(Object.values(groups).flat())) {
    m.material.color.setHex(on.has(m) ? COL.hi : m.userData.base);
    if (m.userData.onlyHi) m.visible = on.has(m);
  }
  document.querySelectorAll('.motion-side [data-h]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.h === name)));
  dirty = true;
}

function setGhost(on) {
  boneMat.opacity = on ? 0.5 : 1;
  boneMat.depthWrite = !on;
  dirty = true;
}

function setPlaying(on) {
  playing = on;
  // Resume the sweep from wherever the slider is.
  playT = Math.acos(1 - 2 * (angle / MAX));
  const btn = $('flex-play');
  if (!btn) return;
  btn.setAttribute('aria-label', on ? 'Pause' : 'Play');
  btn.setAttribute('aria-pressed', String(on));
  $('flex-play-icon').setAttribute('href', on ? '#i-pause' : '#i-play');
}

function bind() {
  $('flex-range').addEventListener('input', (e) => { setPlaying(false); setAngle(+e.target.value); });
  $('flex-play').addEventListener('click', () => setPlaying(!playing));
  for (const id of ['flex-chips', 'flex-report-chips']) {
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) setHighlight(b.getAttribute('aria-pressed') === 'true' ? null : b.dataset.h);
    });
  }
  document.querySelectorAll('[data-cam]').forEach((b) => b.addEventListener('click', () => setCamera(b.dataset.cam)));
  $('flex-ghost').addEventListener('change', (e) => setGhost(e.target.checked));
  setGhost($('flex-ghost').checked);
  setHighlight('acl');
}

function resize() {
  const el = $('motion-stage');
  const w = el.clientWidth, h = el.clientHeight;
  if (!w || !h || !renderer) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dirty = true;
}

function tick(time) {
  if (!active || failed) { running = false; return; }
  requestAnimationFrame(tick);
  const dt = lastTime ? Math.min(0.05, (time - lastTime) / 1000) : 0;
  lastTime = time;
  if (playing) {
    playT += dt * 0.9;
    setAngle(MAX * (1 - Math.cos(playT)) / 2);
  }
  controls.update();
  if (!dirty) return;
  dirty = false;
  renderer.render(scene, camera);
}
