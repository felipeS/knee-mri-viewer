# Left knee MRI viewer

Static, client-side viewer for an anonymized left-knee MRI study. No patient identifiers.

**This is not a diagnosis. Wait for the radiologist's report (Befund) and talk to your doctor.**

## Run locally

The site is static and needs a local HTTP server (fetch of `.gz` volumes will not work from `file://`):

```bash
python3 -m http.server 8080
```

Then open http://127.0.0.1:8080/

## Views

- **Slices** (`#slices`): all six series, slice scroll, zoom/pan, window/level from the 16-bit volumes.
- **MPR / 3D** (`#mpr`): the three PD fat-sat stacks with cross-reference lines (approximate; separate acquisitions) and a ray-marched MIP / summed projection of one stack.
- **Anatomy** (`#anatomy`): original SVG schematics of a generic knee. Schematic, not a reading of this scan.
- **Flexion** (`#motion`): a generic procedural knee model. Not this patient's knee, not a simulation of any injury.

## Layout

- `index.html`, `css/style.css`
- `js/app.js` (routing), `js/data.js` (manifest, slice cache, volume decode, geometry), `js/viewer.js`, `js/mpr.js`, `js/vol3d.js`, `js/anatomy.js`, `js/flexion.js`
- `vendor/` Three.js r160 module build and OrbitControls (MIT, see `vendor/THREE-LICENSE.txt`)
- `data/` anonymized derived assets, see `ASSETS.md`

No build step, no external requests at runtime, relative paths only.

Do not publish this repository unless the owner explicitly approves it. There is no remote.
