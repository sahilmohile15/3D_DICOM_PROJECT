3D DICOM Viewer – Interview Challenge (Django + WebGL)
Goal

Build a minimal web app that:

lets a user upload a DICOM study (series of axial slices),

reconstructs a 3D volume in the browser, and

provides basic 3D viewing controls (rotate/zoom/pan) plus a couple of medical imaging interactions (window/level, MPR or volume rendering).

Target stack: Django (backend) + WebGL in the browser (preferred: VTK.js or Cornerstone3D; Three.js acceptable if they implement the volume shader path).

Deliverables (what they must submit)

Git repo with Django project + front-end.

README with:

How to run locally (one command or very few).

Notes on architecture & tradeoffs.

What works, known limitations.

Short demo video (2–5 min) walking through:

Upload → view study → interact in 3D.

Sample data: Include a link or instructions to fetch a small public CT series (not committed to repo), and any conversion steps if needed.

Basic tests: at least one backend unit test and one front-end sanity check (can be simple).

Must-Have Scope (MVP)

Upload & ingest

Upload a folder of DICOM files (multiple slices from one series).

Server stores files per study and indexes basic tags: PatientID, StudyInstanceUID, SeriesInstanceUID, slice ImagePositionPatient, ImageOrientationPatient, PixelSpacing, SliceThickness, RescaleIntercept, RescaleSlope.

Data API

Endpoint to list studies and series.

Endpoint to fetch either:

a) stacked volume bytes (e.g., raw Int16 array) plus metadata, or

b) per-slice DICOM blobs/frames the client can assemble.

3D View (browser)

One layout with a 3D viewport.

Basic interactions: rotate, zoom, pan.

Window/Level controls (W/L sliders).

Either of:

MPR (multi-planar reformat) with 3 reslice planes (axial, sagittal, coronal), or

Direct Volume Rendering (DVR) with at least a preset transfer function (e.g., “Bone”).

Performance

Should render a small CT (say 100–300 slices of 512×512) smoothly on a typical laptop browser.

Use Web Workers or WASM where appropriate (e.g., decoding).

Create a Region of Interest(ROI) in the Axial,Coronal or Sagittal view, the ROI part should highlighted in the 3D view
Draw a box to create ROI in the Axial,Coronal or Sagittal view.
By doing ROI in the Axial,Coronal or Sagittal view, the VOI(Volume of Interest) should be shown in the 3D view