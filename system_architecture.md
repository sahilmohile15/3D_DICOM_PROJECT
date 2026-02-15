# 3D DICOM Viewer - System Architecture

## 1. Purpose and Scope

This document describes the **implemented system architecture** of the 3D DICOM Viewer project.
It reflects what is currently running in the codebase:

- Django + Django REST Framework backend (`backend/`)
- React + VTK.js frontend (`frontend/`)
- Support for both **DICOM** and **NIfTI** upload flows
- 3D volume rendering, MPR slice views, and ROI/VOI statistics

---

## 2. High-Level Architecture

```text
Browser (React + VTK.js)
  ├─ Upload + Study/Series selection UI
  ├─ 3D Volume renderer (VTK.js)
  ├─ 2D MPR slice viewers (Axial/Sagittal/Coronal)
  └─ ROI/VOI controls + stats
          │
          │ HTTP (REST + binary volume payload)
          ▼
Django API (`/api/*`)
  ├─ Upload endpoint (DICOM/NIfTI detection)
  ├─ Study/Series/Slice listing endpoints
  ├─ Volume endpoint (application/octet-stream + metadata header)
  └─ Metadata-only endpoint
          │
          ├─ SQLite DB (Study, Series, Slice metadata)
          └─ Filesystem storage (`backend/media/dicoms`, `backend/media/nifti`)
```

---

## 3. Runtime Components

### 3.1 Frontend (React + Vite)

Primary modules:

- `src/App.jsx`
  - Orchestrates selected series, loading state, window/level state, and ROI draw toggle.
  - Loads volume bytes via `fetchVolumeData` and wires data to 3D + 2D viewers.
- `src/components/Uploader.jsx`
  - Drag-and-drop upload (`react-dropzone`) for `.dcm`, `.dicom`, `.nii`, `.nii.gz`.
  - Lists studies and series; selection triggers volume loading.
- `src/components/Viewer3D.jsx`
  - Creates VTK volume pipeline from `ArrayBuffer` + metadata.
  - Applies transfer functions and live window/level updates.
  - Subscribes to ROI state and renders a 3D VOI cube overlay.
- `src/components/SliceViewer2D.jsx`
  - Displays axial, sagittal, and coronal slices in HTML canvas.
  - Extracts slice planes from the loaded volume data and applies current window/level.
  - Allows rectangle ROI drawing when enabled.
- `src/components/Controls.jsx`
  - Window/level sliders and preset buttons.
  - ROI draw toggle, ROI clear action, VOI dimensions + statistics display.
- `src/utils/ROIManager.js`
  - Singleton state manager for ROI.
  - Converts 2D bounds to 3D index bounds and computes VOI stats from voxel data.

### 3.2 Backend (Django + DRF)

Primary modules:

- `diacom_app/views.py`
  - Upload processing for DICOM and NIfTI.
  - Study/series/slice retrieval endpoints.
  - Volume streaming endpoint for binary voxel payload.
- `diacom_app/utils.py`
  - File type detection.
  - DICOM metadata parsing.
  - NIfTI metadata parsing and RAS→LPS conversion handling.
  - Volume stacking for DICOM slices and NIfTI volumes.
- `diacom_app/models.py`
  - `Study`, `Series`, `Slice` persistence model.
- `diacom_app/serializers.py`
  - API serialization contracts for list/detail payloads.

---

## 4. Data Model

Implemented entities:

- **Study**
  - `study_uid` (unique), `patient_id`, `study_date`, `created_at`
- **Series**
  - `series_uid` (unique), FK to Study
  - `modality`, `source_format` (`DICOM` or `NIFTI`)
  - `num_slices`, `metadata` (JSON)
- **Slice**
  - FK to Series
  - `instance_uid`, `file_path`, `slice_location`, `image_position`, `metadata`

Storage strategy:

- Metadata and relationships in SQLite (default dev config)
- Raw files on disk:
  - DICOM: `backend/media/dicoms/<study_uid>/<series_uid>/...`
  - NIfTI: `backend/media/nifti/<study_uid>/...`

---

## 5. API Surface

Base URL: `http://localhost:8000/api`

Implemented routes:

- `POST /upload/`
  - Accepts multipart `files`
  - Detects DICOM vs NIfTI, persists files and metadata
- `GET /studies/`
  - Returns studies with `series_count`
- `GET /studies/{study_uid}/series/`
  - Returns all series for a study
- `GET /series/{series_uid}/`
  - Returns series detail including nested slices
- `GET /series/{series_uid}/slices/`
  - Returns ordered slices for a series
- `GET /series/{series_uid}/volume/`
  - Returns `application/octet-stream` binary voxel data
  - Includes JSON metadata in `X-Volume-Metadata` response header
- `GET /series/{series_uid}/metadata/`
  - Returns metadata only (no voxel bytes)

---

## 6. Core Processing Flows

### 6.1 Upload and Persist Flow

1. Frontend uploads one or more files to `POST /api/upload/`.
2. Backend writes each file to a temp path.
3. Backend identifies file type (`DICOM`, `NIFTI`, or `UNKNOWN`).
4. For DICOM:
   - Parse tags (UIDs, modality, spacing/orientation, rescale/window data).
   - Upsert `Study` and `Series`, create `Slice` record.
   - Copy file to `media/dicoms/...`.
5. For NIfTI:
   - Load header/data and derive normalized metadata.
   - Create/update `Study` and `Series` (`source_format='NIFTI'`).
   - Store file path in series metadata and copy to `media/nifti/...`.
6. API returns uploaded study/series identifiers.

### 6.2 Volume Retrieval Flow

1. Frontend requests `GET /api/series/{series_uid}/volume/`.
2. Backend branches by `series.source_format`:
   - **DICOM:** loads ordered slices, applies HU conversion, stacks to int16 volume.
   - **NIfTI:** loads volume, converts orientation to LPS-compatible form, converts/casts to int16.
3. Backend returns:
   - Raw bytes as `application/octet-stream`
   - Metadata (`dimensions`, `spacing`, `orientation`, etc.) via `X-Volume-Metadata`.
4. Frontend builds `Int16Array`, creates `vtkImageData`, and renders in 3D + 2D viewers.

### 6.3 ROI/VOI Flow

1. User enables ROI drawing and drags a rectangle in one 2D viewer.
2. `SliceViewer2D` sends bounds + view type to `ROIManager`.
3. `ROIManager` maps 2D bounds to 3D bounds and notifies subscribers.
4. `Viewer3D` renders a semi-transparent VOI cube overlay.
5. `Controls` computes/updates VOI statistics (mean, std, voxel count, volume).

---

## 7. Coordinate and Voxel Conventions

- Frontend and backend exchange volume dimensions as `[depth, height, width]`.
- Spacing is handled as `[z, y, x]` in metadata and converted appropriately for rendering setup.
- DICOM volume output is produced in LPS coordinate convention.
- NIfTI path applies orientation normalization so frontend rendering remains consistent with the same display pipeline.

---

## 8. Operational Configuration

- Backend framework: Django 6 + DRF
- Frontend framework: React + Vite + VTK.js
- CORS allows `http://localhost:5173` and `http://127.0.0.1:5173`
- Media serving in development via Django when `DEBUG=True`
- Default DB: SQLite (`backend/db.sqlite3`)

---

## 9. Current Constraints and Non-Goals

Current architecture intentionally favors local development and MVP clarity:

- No authentication/authorization layer on API endpoints yet
- No async job queue for heavy uploads/processing
- No server-side ROI stats endpoint (stats currently computed client-side)
- No distributed/object storage abstraction yet (filesystem storage only)

These are suitable future extension points but are outside the current implemented architecture.
