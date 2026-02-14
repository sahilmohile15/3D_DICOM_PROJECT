# 3D DICOM Viewer

A browser-based 3D DICOM viewer built with Django (backend) and VTK.js (frontend). This application allows users to upload DICOM studies, reconstructs a 3D volume, and provides interactive visualization tools including MPR (Multi-Planar Reconstruction) and 3D rendering.

## Quick Start

### Prerequisites
- Python 3.12.7
- Node.js 22.14.0
- Django 6.0.2 (inside virtual environment)
- PostgreSQL (or SQLite for local dev)

### Running Locally

1.  **Backend Setup**:
    ```bash
    cd backend
    pip install -r requirements.txt
    python manage.py migrate
    python manage.py runserver
    ```

2.  **Frontend Setup**:
    ```bash
    cd frontend
    npm install
    npm run dev
    ```

3.  Access the application at `http://localhost:5173` (or relevant frontend port).

## Architecture

-   **Backend**: Django + Django REST Framework. Handles DICOM file uploads, parsing (pydicom), metadata extraction, and volume generation.
-   **Frontend**: React (presumed) + VTK.js. Fetches volume data/slices and renders 3D views.
-   **Data Storage**:
    -   DICOM files stored on filesystem (`media/dicoms/`).
    -   Metadata stored in PostgreSQL/SQLite.

## Features (MVP)

-   Upload DICOM study (folder of slices).
-   3D Volume Rendering.
-   MPR Views (Axial, Sagittal, Coronal).
-   Window/Level adjustment.

## Known Limitations

-   Currently supports a single timepoint per series.
-   Large datasets (>500 slices) may require increased browser memory.

## Testing

-   Backend: `pytest`
-   Frontend: `npm test`
