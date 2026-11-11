// Anatomy explainer: generic schematics, plain-language notes, jump to a relevant series.
// Everything here describes a generic knee. Nothing is derived from, or marked on, the images.

const SVG_NS = 'http://www.w3.org/2000/svg';

// `frac` picks a slice as a fraction of the stack; the choice is only a sensible starting point.
const STRUCTURES = [
  {
    id: 'acl', name: 'Anterior cruciate ligament', short: 'ACL (VKB)',
    aka: 'ACL. In German: vorderes Kreuzband, VKB.',
    does: 'A strong band running diagonally through the middle of the knee, from the back of the femur to the front of the tibia. It keeps the tibia from sliding forward under the femur and steadies the knee during twisting and sudden stops.',
    mri: 'Dense ligament fibres give very little signal, so a ligament normally appears as a dark band. Radiologists follow it along its whole length, which is why one series in this study is angled along the ligament.',
    look: 'The series labelled VKB is planned along this ligament. Scroll through it slowly; the mid-sagittal images show the same region from the side.',
    series: 'pi-t2-tse-vkb', frac: 0.5,
  },
  {
    id: 'pcl', name: 'Posterior cruciate ligament', short: 'PCL',
    aka: 'PCL. In German: hinteres Kreuzband, HKB.',
    does: 'The thicker partner of the ACL. It runs from the front of the femoral notch to the back of the tibia, crossing the ACL, and keeps the tibia from sliding backward.',
    mri: 'Like other ligaments it is normally dark. On side-view images it is usually seen as a curved band toward the back of the joint, often on one or two neighbouring slices.',
    look: 'Sagittal images near the middle of the stack.',
    series: 'pi-pd-fs-sag', frac: 0.5,
  },
  {
    id: 'meniscus-medial', name: 'Medial meniscus', short: 'Medial meniscus',
    aka: 'Innenmeniskus. The inner of the two menisci.',
    does: 'A C-shaped pad of tough fibrocartilage between femur and tibia on the inner side. It spreads load over a larger area, absorbs shock and helps the round femur sit steadily on the flat tibia.',
    mri: 'Menisci are normally dark and, cut across, look like small wedges or triangles between the bones. MRI is the standard way to see their shape and inner structure without surgery.',
    look: 'Coronal images near the middle show both menisci as wedges at the edges of the joint line; the inner side of a left knee is on the left of the image.',
    series: 'pi-pd-fs-cor', frac: 0.5,
  },
  {
    id: 'meniscus-lateral', name: 'Lateral meniscus', short: 'Lateral meniscus',
    aka: 'Außenmeniskus. The outer of the two menisci.',
    does: 'The outer C-shaped pad. It is more circular and more mobile than the medial meniscus, and moves further as the knee bends.',
    mri: 'Assessed the same way as the medial meniscus: shape, position and internal signal on several planes.',
    look: 'Coronal images near the middle; the outer side of a left knee is on the right of the image.',
    series: 'pi-pd-fs-cor', frac: 0.5,
  },
  {
    id: 'cartilage', name: 'Articular cartilage', short: 'Cartilage',
    aka: 'Gelenkknorpel. The smooth lining on the bone ends.',
    does: 'A few millimetres of smooth, slippery tissue covering the ends of the femur and tibia and the back of the patella, so that the surfaces glide with very little friction.',
    mri: 'On proton-density fat-saturated images cartilage typically shows as a band of intermediate brightness between the dark bone surface and the bright joint fluid, which makes its thickness and surface visible.',
    look: 'Any of the PD fat-sat series; the coronal stack shows the layers on femur and tibia facing each other.',
    series: 'pi-pd-fs-cor', frac: 0.5,
  },
  {
    id: 'patella', name: 'Patella', short: 'Patella',
    aka: 'Kneecap, Kniescheibe.',
    does: 'A bone embedded in the tendon at the front of the knee. It slides in a groove on the femur and acts as a pulley, giving the thigh muscle better leverage to straighten the leg.',
    mri: 'MRI shows the bone, the thick cartilage on its back surface and how it sits in the groove.',
    look: 'Axial images in the upper part of the stack look down onto the patella and its groove; mid-sagittal images show it from the side.',
    series: 'pi-pd-fs-tra', frac: 0.75,
  },
  {
    id: 'quad-tendon', name: 'Quadriceps tendon', short: 'Quadriceps tendon',
    aka: 'Quadrizepssehne.',
    does: 'Joins the large muscle at the front of the thigh to the top of the patella. It transmits the force that straightens the knee.',
    mri: 'Tendons, like ligaments, are normally dark bands. Side-view images show the tendon along its length.',
    look: 'Mid-sagittal T1 images, above the patella.',
    series: 't1-sag', frac: 0.5,
  },
  {
    id: 'patellar-tendon', name: 'Patellar tendon', short: 'Patellar tendon',
    aka: 'Patellarsehne, also called the patellar ligament.',
    does: 'Continues from the lower tip of the patella to the bump at the front of the tibia. Together with the quadriceps tendon and the patella it forms the extensor mechanism.',
    mri: 'Seen as a dark band at the front of the knee on side-view images, with a fat pad behind it.',
    look: 'Mid-sagittal T1 images, below the patella.',
    series: 't1-sag', frac: 0.5,
  },
  {
    id: 'mcl', name: 'Medial collateral ligament', short: 'MCL',
    aka: 'MCL. Innenband.',
    does: 'A broad, flat band along the inner side of the knee, from femur to tibia. It resists the knee buckling inward.',
    mri: 'Front-view images show it as a thin dark stripe hugging the inner side of the joint.',
    look: 'Coronal images near the middle, along the inner (left) edge of the joint.',
    series: 'pi-pd-fs-cor', frac: 0.5,
  },
  {
    id: 'lcl', name: 'Lateral collateral ligament', short: 'LCL',
    aka: 'LCL. Außenband.',
    does: 'A cord-like ligament on the outer side, from the femur down to the head of the fibula. It resists the knee buckling outward.',
    mri: 'It runs obliquely, so it usually appears across a few neighbouring front-view slices toward the back of the knee rather than on one image.',
    look: 'Coronal images a little behind the middle, along the outer (right) edge of the joint.',
    series: 'pi-pd-fs-cor', frac: 0.62,
  },
  {
    id: 'femur', name: 'Femur', short: 'Femur',
    aka: 'Thigh bone, Oberschenkelknochen.',
    does: 'Its lower end widens into two rounded condyles that rest on the tibia, with a notch between them for the cruciate ligaments and a groove in front for the patella.',
    mri: 'On T1 images the fatty marrow inside the bone is bright and the hard outer shell is a thin dark line. On fat-saturated images the marrow turns dark, so fluid stands out.',
    look: 'Compare the same position in the T1 and PD fat-sat sagittal series to see how the two contrasts differ.',
    series: 't1-sag', frac: 0.5,
  },
  {
    id: 'tibia', name: 'Tibia', short: 'Tibia',
    aka: 'Shin bone, Schienbein.',
    does: 'Its flat top, the tibial plateau, carries the femur. The menisci sit on it and the cruciate ligaments attach in its centre.',
    mri: 'Seen like the femur: bright marrow on T1, dark on fat-saturated images.',
    look: 'Mid-sagittal T1 images, below the joint line.',
    series: 't1-sag', frac: 0.5,
  },
  {
    id: 'fibula', name: 'Fibula', short: 'Fibula',
    aka: 'Calf bone, Wadenbein.',
    does: 'The slim bone on the outer side of the lower leg. It does not carry the femur, but its head is where the LCL and a thigh tendon attach.',
    mri: 'Appears below and behind the outer side of the joint; useful as a landmark for which side is lateral.',
    look: 'Coronal images toward the back of the knee, on the right of the image.',
    series: 'pi-pd-fs-cor', frac: 0.7,
  },
];

// Label text, text anchor point, and the point on the drawing the leader ends at.
const LABELS = {
  'svg-sag': [
    { s: 'quad-tendon', t: 'Quadriceps tendon', x: 8, y: 64, to: [153, 60] },
    { s: 'patella', t: 'Patella', x: 8, y: 204, to: [119, 200] },
    { s: 'patellar-tendon', t: 'Patellar tendon', x: 8, y: 322, to: [150, 318] },
    { s: 'femur', t: 'Femur', x: 452, y: 64, to: [277, 60], end: true },
    { s: 'cartilage', t: 'Cartilage', x: 452, y: 214, to: [322, 222], end: true },
    { s: 'acl', t: 'ACL (VKB)', x: 452, y: 252, to: [284, 250], end: true },
    { s: 'pcl', t: 'PCL', x: 452, y: 292, to: [294, 290], end: true },
    { s: 'meniscus-medial', t: 'Meniscus', x: 452, y: 322, to: [312, 312], end: true },
    { s: 'fibula', t: 'Fibula', x: 452, y: 388, to: [326, 384], end: true },
    { s: 'tibia', t: 'Tibia', x: 452, y: 478, to: [290, 474], end: true },
  ],
  'svg-cor': [
    { s: 'femur', t: 'Femur', x: 8, y: 64, to: [188, 60] },
    { s: 'patella', t: 'Patella (in front)', x: 8, y: 176, to: [198, 190] },
    { s: 'mcl', t: 'MCL', x: 8, y: 254, to: [128, 250] },
    { s: 'pcl', t: 'PCL', x: 8, y: 288, to: [219, 280] },
    { s: 'meniscus-medial', t: 'Medial meniscus', x: 8, y: 318, to: [128, 312] },
    { s: 'cartilage', t: 'Cartilage', x: 8, y: 356, to: [190, 326] },
    { s: 'lcl', t: 'LCL', x: 452, y: 254, to: [336, 250], end: true },
    { s: 'acl', t: 'ACL (VKB)', x: 452, y: 288, to: [241, 278], end: true },
    { s: 'meniscus-lateral', t: 'Lateral meniscus', x: 452, y: 318, to: [332, 312], end: true },
    { s: 'fibula', t: 'Fibula', x: 452, y: 424, to: [348, 420], end: true },
    { s: 'tibia', t: 'Tibia', x: 452, y: 484, to: [286, 480], end: true },
  ],
};

let api, manifest, selected = null;
const byId = new Map(STRUCTURES.map((s) => [s.id, s]));

export function init(m, appApi) {
  manifest = m;
  api = appApi;

  for (const [svgId, labels] of Object.entries(LABELS)) {
    const g = document.querySelector(`#${svgId} .labels`);
    for (const l of labels) {
      // Leader starts just past the text; width is estimated since the view may be hidden.
      const w = l.t.length * 6.4 + 6;
      const x0 = l.end ? l.x - w : l.x + w;
      const lead = document.createElementNS(SVG_NS, 'path');
      lead.setAttribute('d', `M${x0},${l.y - 4} L${l.to[0]},${l.to[1]}`);
      lead.setAttribute('class', 'leader');
      lead.dataset.s = l.s;
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', l.to[0]); dot.setAttribute('cy', l.to[1]); dot.setAttribute('r', 2.2);
      dot.setAttribute('class', 'leader-dot');
      dot.dataset.s = l.s;
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', l.x); text.setAttribute('y', l.y);
      if (l.end) text.setAttribute('text-anchor', 'end');
      text.setAttribute('class', 'label');
      text.dataset.s = l.s;
      text.textContent = l.t;
      g.append(lead, dot, text);
    }
  }

  document.querySelectorAll('.schema svg').forEach((svg) => {
    svg.addEventListener('click', (e) => {
      const el = e.target.closest('[data-s]');
      if (el) select(el.dataset.s.split(' ')[0]);
    });
  });

  const list = document.getElementById('struct-list');
  for (const s of STRUCTURES) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.s = s.id;
    b.textContent = s.short;
    b.addEventListener('click', () => select(s.id));
    li.append(b);
    list.append(li);
  }

  const mid = (id) => {
    const s = manifest.byId.get(id);
    return s ? s.slicePattern.replace('{index}', String(Math.floor(s.n / 2)).padStart(3, '0')) : '';
  };
  for (const [imgId, seriesId] of [['orient-sag', 'pi-pd-fs-sag'], ['orient-cor', 'pi-pd-fs-cor']]) {
    const img = document.getElementById(imgId);
    img.onerror = () => { img.closest('figure').hidden = true; };
    img.src = mid(seriesId);
  }

  select('acl');
}

export function setActive() {}

function select(id) {
  const s = byId.get(id);
  if (!s) return;
  selected = id;
  document.querySelectorAll('.view-anatomy [data-s]').forEach((el) => {
    el.classList.toggle('is-on', el.dataset.s.split(' ').includes(id));
  });
  document.querySelectorAll('#struct-list button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.s === id));
  });

  const card = document.getElementById('anat-info');
  card.innerHTML = '';
  const add = (tag, text, cls) => {
    const el = document.createElement(tag);
    el.textContent = text;
    if (cls) el.className = cls;
    card.append(el);
    return el;
  };
  add('h3', s.name);
  add('p', s.aka, 'aka');
  add('h4', 'What it does', 'eyebrow');
  add('p', s.does);
  add('h4', 'Why MRI looks at it', 'eyebrow');
  add('p', s.mri);
  add('h4', 'Where to look', 'eyebrow');
  add('p', s.look);

  const series = manifest.byId.get(s.series);
  if (series) {
    const index = Math.min(series.n - 1, Math.round((series.n - 1) * s.frac));
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'text-btn text-btn-accent';
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-open"/></svg>';
    b.append(`Open ${series.label}, image ${index + 1} of ${series.n}`);
    b.addEventListener('click', () => api.openInViewer(series.id, index));
    card.append(b);
  }
  add('p', 'General anatomy only. This says nothing about what these images show; that is for the radiologist’s report.', 'fineprint');
}
