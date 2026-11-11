# Anonymized viewer assets

All imagery in `data/` is derived and stripped of identifiers. Do not add names, dates, IDs, or institution text anywhere in the site.

## Manifest

Read `data/manifest.json` first. It lists every series and the global disclaimer.

## Series

| id | label | n | matrix | plane | notes |
|---|---|---|---|---|---|
| survey-left | SURVEY_LEFT | 15 | 320×320 | multi | slices 0–4 axial, 5–9 coronal, 10–14 sagittal (see `slicePlanes`) |
| pi-pd-fs-sag | PI PD FS sag | 33 | 800×800 | sagittal | proton-density, fat-sat |
| pi-pd-fs-cor | PI PD FS COR | 35 | 640×640 | coronal | proton-density, fat-sat |
| pi-pd-fs-tra | PI PD FS Tra | 43 | 640×640 | axial | proton-density, fat-sat |
| t1-sag | T1 sag | 33 | 640×640 | sagittal | T1-weighted |
| pi-t2-tse-vkb | PI T2 TSE VKB | 13 | 660×660 | oblique-coronal | planned along the ACL (VKB) |

Laterality: left knee. Modality: MR.

Each series folder `data/<id>/` contains:

- `slice-000.webp` … `slice-<n-1>.webp` — 8-bit views at the scanner default window/level (full resolution). Use these for the 2D cine/slice scroller.
- `thumb.webp` — small preview
- `volume.u16.gz` — gzip-compressed little-endian uint16 volume, layout `zyx` (slice, row, col). Shape and value mapping are in `meta.json`: `volumeShape` is `[n, rows', cols']` (in-plane may be downsampled; `volumeInPlaneScale` is the scale factor vs the full-res slices). Map stored value `u` to intensity with `volumeMin + (u / 65535) * (volumeMax - volumeMin)`, then apply window/level: `lo = center - width/2`, `hi = center + width/2`.
- `meta.json` — geometry: `pixelSpacingMm` `[row, col]`, `sliceThicknessMm`, `spacingBetweenSlicesMm`, `imageOrientationPatient` (DICOM 6-vector), first/last `ImagePositionPatient`, `defaultWindowCenter`, `defaultWindowWidth`.

Do not ship or reference any DICOM files. Do not read anything outside this repository.

## Findings sidecar

`data/findings.json` holds a plain-language paraphrase of the written report and the approximate region markers. It is the single source for the Findings view, the marker overlay in the slice viewer, and the report cues in the schematic and the flexion model.

- `impression`, `findings`, `compartments`, `unremarkable`: paraphrased text only. Never paste report text verbatim, and never add names, dates (exam or comparison), IDs, or institution text.
- `findings[].markers[]`: `series` (id), `slice` (0-based index), `x`, `y` (centre, as column / cols and row / rows, 0 to 1 from the top left), `rx`, `ry` (half-axes as a fraction of image width / height), `label`, `side` (where the label sits).
- Markers are orientation aids placed by hand on the anonymized WebP slices. They are not annotations by the radiologist and not a tracing of any finding; keep that caption wherever they are drawn.
- `schematic` maps the anatomy drawing's structure ids to `mentioned` / `normal` / `none` with one line of paraphrase; `findings[].model.key` names the highlight group in the flexion model.

## Window/level

Start at `defaultWindowCenter` / `defaultWindowWidth`. Decode `volume.u16.gz` with `DecompressionStream("gzip")` (no extra library required) when the user adjusts W/L, and redraw the current slice from the compact volume (upscale to the view). Wheel or a slider changes slice index; typical PACS mapping is vertical drag for center and horizontal drag for width (or a modifier + drag). Also keep zoom (wheel+modifier or pinch) and pan.

## 3D / MPR

The three PD FS series (sagittal, coronal, axial) are separately acquired but roughly the same exam. Build a three-pane MPR-style view with those full-res WebP stacks and cross-reference lines. Optionally also render a simple 3D view (stack, MIP, or basic volume) from one compact `volume.u16.gz` (prefer `pi-pd-fs-tra` or `pi-pd-fs-sag`).

## Privacy

This folder must stay free of patient name, birth date, IDs, institution names, and study dates. If you generate comments or alt text, keep them generic (“left knee, sagittal PD fat-sat, slice 12 of 33”).
