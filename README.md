# Left knee MRI viewer

Static, client-side viewer for an anonymized left-knee MRI study. No patient identifiers.

**This is not a diagnosis. Wait for the radiologist's report (Befund) and talk to your doctor.**

## Run locally

The site is static and needs a local HTTP server (fetch of `.gz` volumes will not work from `file://`):

```bash
python3 -m http.server 8080
```

Then open http://127.0.0.1:8080/

Do not publish this repository unless the owner explicitly approves it. There is no remote.
