# 3D DICOM Viewer

A browser-based 3D DICOM viewer built with Django (backend) and VTK.js (frontend). This application allows users to upload DICOM studies, reconstructs a 3D volume, and provides interactive visualization tools including MPR (Multi-Planar Reconstruction) and 3D rendering.

## Quick Start

### Prerequisites

- Python 3.12.7
- Node.js 22.14.0
- PostgreSQL (or SQLite for local dev)

### Running Locally

#### Method 1: Single Command Setup (Recommended)

1. **Install everything with one script (backend + frontend + migrations)**:

   ```bash
   chmod +x setup_project.sh
   ./setup_project.sh
   ```

2. **Start backend**:

   ```bash
   cd backend
   .venv/bin/python manage.py runserver
   ```

3. **Start frontend**:

   ```bash
   cd frontend
   npm run dev
   ```

4. Access the application at `http://localhost:5173`.

#### Method 2: Traditional Manual Setup

1. **Backend setup**:

   ```bash
   cd backend
   python -m venv .venv
   .venv/bin/python -m pip install --upgrade pip
   .venv/bin/python -m pip install -r requirements.txt
   .venv/bin/python manage.py migrate
   .venv/bin/python manage.py runserver
   ```

   On Windows (PowerShell), use:

   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\python -m pip install --upgrade pip
   .\.venv\Scripts\python -m pip install -r requirements.txt
   .\.venv\Scripts\python manage.py migrate
   .\.venv\Scripts\python manage.py runserver
   ```

2. **Frontend setup**:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. Access the application at `http://localhost:5173`.

## Architecture

- **Backend**: Django + Django REST Framework. Handles DICOM file uploads, parsing (pydicom), metadata extraction, and volume generation.
- **Frontend**: React (presumed) + VTK.js. Fetches volume data/slices and renders 3D views.
- **Data Storage**: DICOM files are stored on filesystem (`media/dicoms/`) and metadata is stored in PostgreSQL/SQLite.

## Features (MVP)

- Upload DICOM study (folder of slices).
- 3D Volume Rendering.
- MPR Views (Axial, Sagittal, Coronal).
- Window/Level adjustment.

## Known Limitations

- Currently supports a single timepoint per series.
- Large datasets (>500 slices) may require increased browser memory.

## Testing

- Backend: `pytest`
- Frontend: `npm test`
