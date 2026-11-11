# Left knee MRI viewer

Static, client-side viewer for an anonymized left-knee MRI study. No patient identifiers.

**This is not a diagnosis. Wait for the radiologist's report (Befund) and talk to your doctor.**

## Open the site

- Live page: https://felipes.github.io/knee-mri-viewer/
- Or run locally (needed if you want to work offline; `file://` cannot fetch the `.gz` volumes):

```bash
python3 -m http.server 8080
```

Then open http://127.0.0.1:8080/

## Views

- **Slices** (`#slices`): all six series, slice scroll, zoom/pan, window/level from the 16-bit volumes. Optional findings markers (toggle in the panel, or `M`): dashed rings that are approximate region markers placed for orientation, not annotations by the radiologist and not a tracing of the finding.
- **Findings** (`#findings`): a plain-language paraphrase of the written radiology report (impression, findings by compartment, what the terms mean, and what was reported as unremarkable). Not the report itself, not medical advice; its interpretation belongs to the treating doctor. Each mentioned finding links to a slice with an approximate region marker.
- **MPR / 3D** (`#mpr`): the three PD fat-sat stacks with cross-reference lines (approximate; separate acquisitions) and a ray-marched MIP / summed projection of one stack.
- **Anatomy** (`#anatomy`): original SVG schematics of a generic knee. Schematic, not a reading of this scan. Structures the report mentions get an outline; that cue repeats the report's text.
- **Flexion** (`#motion`): a generic procedural knee model. Not this patient's knee, not a simulation of any injury. Chips highlight where the structures named in the report sit on the generic model.

## Layout

- `index.html`, `css/style.css`
- `js/app.js` (routing), `js/data.js` (manifest, slice cache, volume decode, geometry), `js/viewer.js`, `js/mpr.js`, `js/vol3d.js`, `js/findings.js`, `js/anatomy.js`, `js/flexion.js`
- `vendor/` Three.js r160 module build and OrbitControls (MIT, see `vendor/THREE-LICENSE.txt`)
- `data/` anonymized derived assets, see `ASSETS.md`
- `data/findings.json` report paraphrase and marker coordinates (no identifiers, no dates), see `ASSETS.md`

No build step, no external requests at runtime, relative paths only.
