# 3D DICOM Viewer - System Architecture Plan

## Executive Summary

A web-based DICOM viewer with Django backend and WebGL frontend (VTK.js) enabling 3D medical image visualization with MPR capabilities.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Browser                        │
├──────────────────┬──────────────────┬──────────────────────┤
│   Upload UI      │   MPR Views      │   3D Viewport        │
│   (Form)         │   (Axial/Cor/Sag)│   (VTK.js/WebGL)     │
│                  │   + ROI Drawing  │   + VOI Highlight    │
└────────┬─────────┴─────────┬────────┴──────────┬───────────┘
         │                   │                    │
         │ DICOM files       │ REST API calls     │ ROI coords
         ▼                   ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                      Django Backend                          │
├──────────────────┬──────────────────┬──────────────────────┤
│  Upload Handler  │   DICOM Parser   │    REST API          │
│  (FileUpload)    │   (pydicom)      │   (DRF/views)        │
│                  │                  │   + VOI stats (opt)  │
└────────┬─────────┴─────────┬────────┴──────────┬───────────┘
         │                   │                    │
         ▼                   ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                     Data Layer                               │
├──────────────────┬──────────────────────────────────────────┤
│   PostgreSQL     │          File Storage                     │
│   (Metadata)     │   /media/dicoms/<study_uid>/<series_uid>/ │
└──────────────────┴──────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. Backend (Django)

#### 1.1 Models
```python
Study
  - study_uid (CharField, unique)
  - patient_id (CharField)
  - study_date (DateField, nullable)
  - created_at (DateTimeField)

Series
  - series_uid (CharField, unique)
  - study (ForeignKey → Study)
  - modality (CharField)
  - num_slices (IntegerField)
  - metadata (JSONField)  # Store spacing, orientation, etc.

Slice
  - series (ForeignKey → Series)
  - instance_uid (CharField)
  - file_path (CharField)
  - slice_location (FloatField)
  - image_position (JSONField)  # [x, y, z]
  - metadata (JSONField)  # RescaleIntercept, Slope, etc.
```

#### 1.2 Key Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/upload/` | Upload DICOM files |
| GET | `/api/studies/` | List all studies |
| GET | `/api/studies/<uid>/series/` | List series in study |
| GET | `/api/series/<uid>/volume/` | Get volume data + metadata |
| GET | `/api/series/<uid>/slices/` | Get individual slice metadata |

#### 1.3 Upload Processing Flow
```
1. Receive multipart/form-data with DICOM files
2. Create temporary directory
3. For each file:
   a. Parse with pydicom
   b. Extract StudyUID, SeriesUID, InstanceUID
   c. Validate DICOM headers
   d. Store file in /media/dicoms/<study>/<series>/
4. Bulk insert metadata to DB
5. Return study/series UIDs
```

#### 1.4 Volume Data Endpoint Logic
```python
def get_volume_data(series_uid):
    1. Query all slices ordered by ImagePositionPatient[2] (z-axis)
    2. Read pixel data from each DICOM file
    3. Apply RescaleIntercept/Slope: HU = pixel * slope + intercept
    4. Stack into 3D numpy array (depth × height × width)
    5. Convert to Int16 bytes
    6. Return:
       - Binary volume data
       - Dimensions [depth, height, width]
       - Spacing [z, y, x]
       - Orientation matrix (6 values from ImageOrientation)
```

---

### 2. Frontend (VTK.js)

#### 2.1 Technology Stack
- **Rendering**: VTK.js (WebGL-based medical imaging library)
- **State Management**: Vanilla JS or minimal React
- **UI Controls**: HTML5 range sliders + buttons
- **Worker**: Web Worker for DICOM decoding (if needed)

#### 2.2 Core Components

**Upload Component**
- Drag-and-drop zone or file input
- Progress indicator
- Displays uploaded study metadata

**3D Viewer Component**
```javascript
VTK.js Setup:
  - vtkFullScreenRenderWindow
  - vtkVolume + vtkVolumeMapper (for DVR)
  - vtkImageData (holds the 3D volume)
  - vtkColorTransferFunction (for window/level)
  - vtkPiecewiseFunction (for opacity)
```

**Control Panel**
- Window/Level sliders (adjust color transfer function)
- MPR toggle buttons (Axial/Sagittal/Coronal)
- Zoom/Pan/Rotate (handled by VTK interactor)
- Preset buttons (e.g., "Bone", "Soft Tissue", "Lung")
- **ROI Tools**:
  - Draw ROI button (activates rectangle drawing)
  - Clear ROI button
  - VOI statistics display (mean HU, volume)
  - ROI dimensions indicator

#### 2.3 Data Flow
```
1. User uploads → POST /api/upload/
2. Fetch series list → GET /api/studies/<uid>/series/
3. User selects series
4. Fetch volume → GET /api/series/<uid>/volume/
   - Receives: ArrayBuffer + JSON metadata
5. Parse response:
   - Create Int16Array from buffer
   - Build vtkImageData with dimensions/spacing
6. Configure volume mapper:
   - Set color/opacity transfer functions
   - Apply initial W/L (e.g., -500 to 500 for soft tissue)
7. Render to canvas
```

#### 2.4 MPR Implementation
```javascript
Three vtkImageSlice actors (one per plane):
  - Axial: slice normal = [0, 0, 1]
  - Sagittal: slice normal = [1, 0, 0]
  - Coronal: slice normal = [0, 1, 0]

Each slice samples the same vtkImageData volume
User can drag a slider to move slice position
```

---

## Technology Decisions & Tradeoffs

### Backend Choices

| Decision | Rationale | Alternative |
|----------|-----------|-------------|
| **Django** | Required by challenge; batteries-included | Flask (lighter) |
| **pydicom** | De facto standard for DICOM in Python | dcmtk (C++, faster) |
| **PostgreSQL** | Better JSON support, production-ready | SQLite (simpler setup) |
| **File storage** | Direct filesystem (simple, no processing) | Store in DB (slower), S3 (overkill for MVP) |

### Frontend Choices

| Decision | Rationale | Alternative |
|----------|-----------|-------------|
| **VTK.js** | Purpose-built for medical imaging, MPR out-of-box | Three.js (need custom shaders) |
| **Direct volume rendering** | Simpler than MPR for MVP | MPR (more clinical utility) |
| **ArrayBuffer transfer** | Efficient binary data transfer | Base64 (40% overhead) |
| **Server-side stacking** | Simplifies client, works with VTK.js | Client-side assembly (slower initial load) |

---

## Data Processing Pipeline

### DICOM to Volume Conversion

```python
# Pseudocode for volume endpoint
import numpy as np
import pydicom

def create_volume(series):
    slices = series.slices.order_by('slice_location')
    
    # Read first slice for dimensions
    first_dcm = pydicom.dcmread(slices[0].file_path)
    height, width = first_dcm.pixel_array.shape
    depth = slices.count()
    
    # Initialize 3D array
    volume = np.zeros((depth, height, width), dtype=np.int16)
    
    # Stack slices
    for i, slice_obj in enumerate(slices):
        dcm = pydicom.dcmread(slice_obj.file_path)
        pixels = dcm.pixel_array
        
        # Apply rescale
        intercept = float(dcm.RescaleIntercept)
        slope = float(dcm.RescaleSlope)
        volume[i] = (pixels * slope + intercept).astype(np.int16)
    
    return volume.tobytes(), {
        'dimensions': [depth, height, width],
        'spacing': [
            float(first_dcm.SliceThickness),
            float(first_dcm.PixelSpacing[0]),
            float(first_dcm.PixelSpacing[1])
        ],
        'orientation': list(first_dcm.ImageOrientationPatient)
    }
```

---

## Performance Optimizations

### Backend
1. **Caching**: Cache volume bytes in Redis/memcached (optional for MVP)
2. **Compression**: Gzip HTTP response (built-in Django middleware)
3. **Async processing**: Celery task for upload processing (optional)
4. **Pagination**: Limit series list queries

### Frontend
1. **Progressive loading**: Show low-res preview, then full resolution
2. **Web Workers**: Offload ArrayBuffer parsing (if slow)
3. **WebGL optimizations**:
   - Use 8-bit textures for preview mode
   - Limit volume dimensions to 512³ max for smooth rotation
4. **Debounce**: Throttle W/L slider updates to 60fps

---

## File Structure

```
dicom-viewer/
├── backend/
│   ├── manage.py
│   ├── config/
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── dicom_app/
│   │   ├── models.py          # Study, Series, Slice models
│   │   ├── serializers.py     # DRF serializers
│   │   ├── views.py           # API endpoints
│   │   ├── utils.py           # DICOM parsing helpers
│   │   └── tests.py
│   ├── media/dicoms/          # Uploaded DICOM files
│   └── requirements.txt
│
├── frontend/
│   ├── index.html
│   ├── src/
│   │   ├── main.js            # App entry point
│   │   ├── uploader.js        # Upload component
│   │   ├── viewer.js          # VTK.js 3D viewer
│   │   ├── mpr-view.js        # MPR slice viewers
│   │   ├── roi-manager.js     # ROI/VOI state & sync
│   │   ├── roi-drawing.js     # 2D ROI drawing tools
│   │   ├── voi-renderer.js    # 3D VOI visualization
│   │   ├── controls.js        # W/L, MPR, ROI controls
│   │   └── api.js             # Fetch helpers
│   ├── styles/
│   │   └── main.css
│   └── package.json
│
├── docker-compose.yml         # PostgreSQL + Django services
├── Dockerfile
├── README.md
└── sample_data/               # Link to public dataset
```

---

## ROI/VOI Feature (Region/Volume of Interest)

### 3.1 Feature Overview

**Requirement**: User can draw a 2D rectangular ROI in any MPR view (Axial/Coronal/Sagittal), which automatically creates a 3D VOI (Volume of Interest) highlighted in the 3D rendering view.

**User Flow**:
```
1. User selects ROI tool from toolbar
2. User draws rectangle on any 2D MPR slice
3. System extrudes rectangle through entire volume depth
4. 3D view highlights the VOI with:
   - Bounding box outline
   - Semi-transparent region
   - Cropped volume rendering (optional)
```

**Visual Workflow**:
```
Step 1: User activates ROI tool
┌───────────────┐
│ [📐 Draw ROI] │ ← User clicks
└───────────────┘

Step 2: User draws rectangle in Axial view
┌─────────────────┐
│   Axial View    │
│                 │
│   ┌─────────┐   │
│   │ ◼◼◼◼◼  │   │  ← User drags to create rectangle
│   │ ◼◼◼◼◼  │   │
│   └─────────┘   │
└─────────────────┘

Step 3: System extrudes to 3D (Z-axis for Axial)
     2D Rectangle         →         3D Volume
     (X-Y plane)                    (X-Y-Z cube)
    ┌─────────┐                    ╔═════════╗
    │ ◼◼◼◼◼  │                    ║ ◼◼◼◼◼  ║
    │ ◼◼◼◼◼  │         →          ║ ◼◼◼◼◼  ║  (extruded through Z)
    └─────────┘                    ╚═════════╝

Step 4: 3D view shows VOI bounding box
┌─────────────────┐
│   3D View       │
│      ╔═══╗      │
│     ╔╝   ╚╗     │  ← Yellow bounding box
│    ╔╝ 🧠 ╚╗    │     highlights VOI
│    ╚═══════╝    │
└─────────────────┘
```

### 3.2 Architecture Extension

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Components                       │
├──────────────┬──────────────┬─────────────┬─────────────────┤
│  2D MPR View │  2D MPR View │ 2D MPR View │   3D Volume     │
│  (Axial)     │  (Coronal)   │ (Sagittal)  │   Renderer      │
│              │              │             │                 │
│  ┌────────┐  │  ┌────────┐  │ ┌────────┐  │  ┌───────────┐ │
│  │  ROI   │  │  │  ROI   │  │ │  ROI   │  │  │ VOI Box   │ │
│  │Drawing │  │  │Drawing │  │ │Drawing │  │  │ Highlight │ │
│  │ Tool   │  │  │ Tool   │  │ │ Tool   │  │  │           │ │
│  └────────┘  │  └────────┘  │ └────────┘  │  └───────────┘ │
└──────┬───────┴──────┬───────┴──────┬──────┴────────┬────────┘
       │              │              │               │
       └──────────────┴──────────────┴───────────────┘
                      │
                      ▼
            ┌─────────────────────┐
            │  ROI State Manager  │
            │  (Global Store)     │
            │  - bounds [x,y,z]   │
            │  - active view      │
            │  - coordinates      │
            └─────────────────────┘
```

### 3.3 Data Structures

```javascript
// ROI State (Client-side)
const roiState = {
  active: true,
  sourceView: 'axial',  // 'axial' | 'coronal' | 'sagittal'
  bounds: {
    // In world coordinates
    xMin: 100, xMax: 200,
    yMin: 150, yMax: 250,
    zMin: 50,  zMax: 150
  },
  // In voxel indices
  indexBounds: {
    i: [50, 100],
    j: [75, 125],
    k: [25, 75]
  }
}
```

### 3.4 Implementation Details

#### 3.4.1 2D ROI Drawing (MPR Views)

**VTK.js Approach**:
```javascript
// Use vtkRectangleWidget for interactive drawing
import vtkRectangleWidget from '@kitware/vtk.js/Widgets/Widgets3D/RectangleWidget';
import vtkWidgetManager from '@kitware/vtk.js/Widgets/Core/WidgetManager';

// For each MPR view
const widgetManager = vtkWidgetManager.newInstance();
widgetManager.setRenderer(renderer);

const rectangleWidget = vtkRectangleWidget.newInstance();
const rectangleHandle = widgetManager.addWidget(rectangleWidget);

// Listen for ROI changes
rectangleHandle.onModified(() => {
  const corners = rectangleHandle.getCorners();
  updateVOI(corners, currentSliceIndex);
});
```

**Coordinate Transformation**:
```javascript
function transform2DROIto3DVOI(roi2D, viewType, sliceRange) {
  // roi2D: { xMin, xMax, yMin, yMax } in screen coords
  // viewType: 'axial' | 'coronal' | 'sagittal'
  
  let bounds3D;
  
  switch(viewType) {
    case 'axial':
      // Rectangle in XY plane, extend through Z
      bounds3D = {
        xMin: roi2D.xMin,
        xMax: roi2D.xMax,
        yMin: roi2D.yMin,
        yMax: roi2D.yMax,
        zMin: sliceRange.min,  // Full volume depth
        zMax: sliceRange.max
      };
      break;
      
    case 'coronal':
      // Rectangle in XZ plane, extend through Y
      bounds3D = {
        xMin: roi2D.xMin,
        xMax: roi2D.xMax,
        yMin: sliceRange.min,
        yMax: sliceRange.max,
        zMin: roi2D.yMin,
        zMax: roi2D.yMax
      };
      break;
      
    case 'sagittal':
      // Rectangle in YZ plane, extend through X
      bounds3D = {
        xMin: sliceRange.min,
        xMax: sliceRange.max,
        yMin: roi2D.xMin,
        yMax: roi2D.xMax,
        zMin: roi2D.yMin,
        zMax: roi2D.yMax
      };
      break;
  }
  
  return bounds3D;
}
```

#### 3.4.2 3D VOI Visualization

**Option 1: Bounding Box Outline (Simplest)**
```javascript
import vtkCubeSource from '@kitware/vtk.js/Filters/Sources/CubeSource';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';

function createVOIBoundingBox(bounds) {
  const cubeSource = vtkCubeSource.newInstance({
    xLength: bounds.xMax - bounds.xMin,
    yLength: bounds.yMax - bounds.yMin,
    zLength: bounds.zMax - bounds.zMin,
    center: [
      (bounds.xMin + bounds.xMax) / 2,
      (bounds.yMin + bounds.yMax) / 2,
      (bounds.zMin + bounds.zMax) / 2
    ]
  });
  
  const mapper = vtkMapper.newInstance();
  mapper.setInputConnection(cubeSource.getOutputPort());
  
  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  actor.getProperty().setRepresentationToWireframe();
  actor.getProperty().setColor(1.0, 0.0, 0.0);  // Red
  actor.getProperty().setLineWidth(3);
  
  renderer.addActor(actor);
  return actor;
}
```

**Option 2: Volume Cropping (More Advanced)**
```javascript
import vtkImageCroppingWidget from '@kitware/vtk.js/Widgets/Widgets3D/ImageCroppingWidget';

function enableVolumeCropping(volumeMapper, bounds) {
  // Use VTK.js cropping planes
  volumeMapper.setCroppingPlanes([
    bounds.xMin, bounds.xMax,
    bounds.yMin, bounds.yMax,
    bounds.zMin, bounds.zMax
  ]);
  volumeMapper.setCropping(true);
}
```

**Option 3: Highlight with Semi-transparent Box**
```javascript
function createVOIHighlight(bounds) {
  const cubeSource = vtkCubeSource.newInstance({
    xLength: bounds.xMax - bounds.xMin,
    yLength: bounds.yMax - bounds.yMin,
    zLength: bounds.zMax - bounds.zMin,
    center: [
      (bounds.xMin + bounds.xMax) / 2,
      (bounds.yMin + bounds.yMax) / 2,
      (bounds.zMin + bounds.zMax) / 2
    ]
  });
  
  const mapper = vtkMapper.newInstance();
  mapper.setInputConnection(cubeSource.getOutputPort());
  
  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  actor.getProperty().setColor(1.0, 1.0, 0.0);  // Yellow
  actor.getProperty().setOpacity(0.3);  // Semi-transparent
  
  renderer.addActor(actor);
  return actor;
}
```

#### 3.4.3 Synchronization Across Views

```javascript
class ROIManager {
  constructor() {
    this.roiState = null;
    this.voiActor = null;
    this.subscribers = [];  // MPR views + 3D view
  }
  
  setROI(bounds, sourceView) {
    this.roiState = { bounds, sourceView };
    this.notifySubscribers();
  }
  
  notifySubscribers() {
    this.subscribers.forEach(view => {
      if (view.type === '3D') {
        view.updateVOI(this.roiState.bounds);
      } else {
        view.updateROIOverlay(this.roiState, view.viewType);
      }
    });
  }
  
  clearROI() {
    if (this.voiActor) {
      renderer.removeActor(this.voiActor);
      this.voiActor = null;
    }
    this.roiState = null;
    this.notifySubscribers();
  }
  
  subscribe(view) {
    this.subscribers.push(view);
  }
}

// Global instance
const roiManager = new ROIManager();
```

### 3.5 UI Components

```html
<!-- ROI Toolbar -->
<div class="roi-toolbar">
  <button id="roi-tool-btn" class="tool-btn">
    <span>📐</span> Draw ROI
  </button>
  <button id="roi-clear-btn" class="tool-btn">
    <span>🗑️</span> Clear ROI
  </button>
  
  <div class="roi-info">
    <span>ROI: <span id="roi-dimensions">Not set</span></span>
  </div>
</div>

<!-- ROI Display Info -->
<div class="roi-stats" id="roi-stats" style="display: none;">
  <h4>Volume of Interest</h4>
  <p>Dimensions: <span id="voi-dims"></span> mm³</p>
  <p>Voxels: <span id="voi-voxels"></span></p>
  <p>Mean HU: <span id="voi-mean-hu"></span></p>
</div>
```

### 3.6 Enhanced Layout with ROI

```
┌─────────────────────────────────────────────────────────────┐
│                        Main View                             │
├──────────────────┬──────────────────┬────────────────────────┤
│                  │                  │                        │
│   Axial View     │  Coronal View    │    3D Volume View      │
│   (512x512)      │  (512x512)       │    (Full viewport)     │
│                  │                  │                        │
│  ┌────────────┐  │  ┌────────────┐  │   ┌──────────────┐    │
│  │ [Draw ROI] │  │  │ [Draw ROI] │  │   │  VOI Box     │    │
│  │            │  │  │            │  │   │  Highlight   │    │
│  │    🟥       │  │  │            │  │   │              │    │
│  │            │  │  │            │  │   │  🟨          │    │
│  └────────────┘  │  └────────────┘  │   └──────────────┘    │
│                  │                  │                        │
├──────────────────┴──────────────────┴────────────────────────┤
│  Sagittal View (optional) │    Controls Panel                │
│  ┌────────────┐            │  • W/L Sliders                   │
│  │ [Draw ROI] │            │  • ROI Tools                     │
│  │            │            │  • VOI Stats                     │
│  └────────────┘            │  • Clear/Export                  │
└────────────────────────────┴──────────────────────────────────┘
```

### 3.7 Optional: VOI Statistics Calculation

**Backend Endpoint** (optional for advanced functionality):
```python
# POST /api/series/<uid>/voi-stats/
# Body: { "bounds": { "xMin": 100, "xMax": 200, ... } }

def calculate_voi_statistics(series_uid, bounds):
    volume = load_volume(series_uid)  # 3D numpy array
    
    # Extract sub-volume
    voi = volume[
        bounds['zMin']:bounds['zMax'],
        bounds['yMin']:bounds['yMax'],
        bounds['xMin']:bounds['xMax']
    ]
    
    return {
        'mean_hu': float(np.mean(voi)),
        'std_hu': float(np.std(voi)),
        'min_hu': float(np.min(voi)),
        'max_hu': float(np.max(voi)),
        'voxel_count': int(voi.size),
        'volume_mm3': voi.size * spacing[0] * spacing[1] * spacing[2]
    }
```

**Client-side Calculation** (lighter approach):
```javascript
function calculateVOIStats(imageData, bounds) {
  const scalars = imageData.getPointData().getScalars();
  const dims = imageData.getDimensions();
  
  let sum = 0, count = 0;
  
  for (let k = bounds.kMin; k <= bounds.kMax; k++) {
    for (let j = bounds.jMin; j <= bounds.jMax; j++) {
      for (let i = bounds.iMin; i <= bounds.iMax; i++) {
        const idx = i + j * dims[0] + k * dims[0] * dims[1];
        sum += scalars.getData()[idx];
        count++;
      }
    }
  }
  
  return {
    meanHU: sum / count,
    voxelCount: count
  };
}
```

### 3.8 Implementation Complexity

| Component | Complexity | Estimated Hours |
|-----------|-----------|-----------------|
| 2D ROI drawing widget | Medium | 6-8 hours |
| Coordinate transformation | Medium | 4-6 hours |
| 3D VOI bounding box | Low | 2-3 hours |
| Cross-view synchronization | Medium | 4-5 hours |
| UI controls & state management | Low | 3-4 hours |
| VOI statistics (optional) | Low | 2-3 hours |
| **Total** | **Medium** | **21-29 hours** |

### 3.9 Testing Considerations

```javascript
// Frontend tests
test('ROI drawn in axial creates correct 3D bounds')
test('VOI bounding box renders in 3D view')
test('Clearing ROI removes all visualizations')
test('ROI coordinates transform correctly across views')

// Integration tests
test('Draw ROI in coronal, verify VOI in 3D')
test('Multiple ROI updates maintain sync')
```

---

## MVP Feature Checklist

### Must-Have (Week 1)
- [x] Django project setup with PostgreSQL
- [x] DICOM upload endpoint with pydicom parsing
- [x] Models: Study, Series, Slice
- [x] Volume data endpoint (stacked Int16 array)
- [x] Basic VTK.js viewer with rotation/zoom
- [x] Window/Level sliders
- [x] One unit test (backend) + one integration test (frontend)

### Must-Have (Week 2)
- [x] MPR with 3 orthogonal planes OR DVR with bone preset
- [x] **ROI/VOI Feature**:
  - [x] 2D ROI drawing in MPR views
  - [x] 3D VOI visualization (bounding box)
  - [x] Cross-view synchronization
  - [x] Clear ROI functionality
- [x] Study/series listing API
- [x] Demo video recording
- [x] README with setup instructions
- [x] Handle edge cases (missing tags, non-axial acquisitions)

### Nice-to-Have (Time Permitting)
- [ ] VOI statistics calculation (mean HU, volume)
- [ ] Volume cropping to show only VOI
- [ ] Export ROI coordinates as JSON
- [ ] Multiple ROIs support
- [ ] Multiple transfer function presets (Lung, Soft Tissue, etc.)
- [ ] Slice-by-slice navigation
- [ ] Screenshot/export feature
- [ ] Docker Compose one-command setup
- [ ] Progress bar for large uploads

---

## Testing Strategy

### Backend Tests (pytest + Django TestCase)
```python
test_upload_valid_dicom()
  - Upload sample CT series
  - Verify Study/Series/Slice creation
  - Check metadata extraction

test_volume_endpoint()
  - Mock series with 3 slices
  - Verify ArrayBuffer response
  - Validate dimensions/spacing in JSON

test_invalid_dicom()
  - Upload non-DICOM file
  - Expect 400 error
```

### Frontend Tests (Jest or Playwright)
```javascript
test('renders upload form')
test('fetches and displays study list')
test('VTK viewer initializes without errors')
test('W/L sliders update color transfer function')
```

---

## Sample Data

**Recommended Public Dataset**:
- **The Cancer Imaging Archive (TCIA)**
  - URL: https://www.cancerimagingarchive.net/
  - Use: TCGA-LUAD (lung CT scans)
  - Download: One small series (~100 slices, <50MB)

**Instructions**:
1. Download from TCIA NBIA Data Retriever
2. Select one CT series (axial acquisition)
3. Extract to `sample_data/` folder (not committed)
4. Document in README: "Download from [link], series UID: 1.2.3.4..."

---

## Setup Instructions (README Template)

```markdown
# 3D DICOM Viewer

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL 14+

### Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev  # Vite dev server on :5173
```

### Sample Data
Download CT series from TCIA: [link]
Upload via http://localhost:5173

## Architecture
- Django REST backend with pydicom
- VTK.js WebGL frontend
- Volume rendering with W/L controls
- MPR (axial/sagittal/coronal planes)

## Known Limitations
- Max volume size: 512³ (memory)
- Only axial CT/MR tested
- No DICOM compression support yet
```

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large file uploads (>500MB) | Timeout, memory | Stream uploads, limit to 100 slices for MVP |
| Non-standard DICOM tags | Parse failures | Graceful fallback, log errors |
| Browser WebGL limits | Crashes on old hardware | Detect GPU, show warning |
| Coordinate system confusion | Misaligned MPR | Use DICOM patient coordinate system (LPS) |

---

## Timeline Estimate (65-70 hours)

| Phase | Hours | Tasks |
|-------|-------|-------|
| Setup | 4 | Django project, DB, VTK.js boilerplate |
| Backend | 12 | Models, upload handler, volume endpoint, tests |
| Frontend - Core | 16 | Uploader UI, VTK viewer, W/L controls, MPR |
| Frontend - ROI/VOI | 22-25 | 2D ROI drawing, 3D VOI visualization, synchronization |
| Testing | 6 | Unit tests, integration tests, ROI tests, manual QA |
| Polish | 5-7 | README, demo video (with ROI feature), bug fixes |

---

## Success Criteria

1. ✅ Upload 100-slice CT series in <30 seconds
2. ✅ Render 3D volume with smooth 60fps rotation
3. ✅ W/L adjustment updates in <100ms
4. ✅ MPR planes aligned with anatomical axes
5. ✅ **ROI drawn in 2D MPR view creates VOI in 3D view**
6. ✅ **VOI bounding box visible and synchronized across all views**
7. ✅ **Clear ROI removes all ROI/VOI visualizations**
8. ✅ One-command local setup (docker-compose up)
9. ✅ Demo video shows end-to-end workflow including ROI feature
10. ✅ Code passes basic linting (black, eslint)

---

## ROI/VOI Quick Reference

### Key VTK.js Classes for ROI/VOI

| Class | Purpose |
|-------|---------|
| `vtkRectangleWidget` | Interactive 2D rectangle drawing in MPR views |
| `vtkWidgetManager` | Manages widgets in each render window |
| `vtkCubeSource` | Creates 3D bounding box geometry |
| `vtkImageCroppingWidget` | Optional: Interactive 3D cropping |
| `vtkImageMapper` | Maps cropped region for rendering |

### Coordinate System Mapping

| View Type | Rectangle Axes | Extrusion Axis | 3D Bounds |
|-----------|---------------|----------------|-----------|
| Axial | X, Y | Z (full depth) | [x₁, x₂, y₁, y₂, z_min, z_max] |
| Coronal | X, Z | Y (full depth) | [x₁, x₂, y_min, y_max, z₁, z₂] |
| Sagittal | Y, Z | X (full depth) | [x_min, x_max, y₁, y₂, z₁, z₂] |

### Implementation Checklist

- [ ] Add vtkRectangleWidget to each MPR view
- [ ] Implement coordinate transformation (2D → 3D)
- [ ] Create ROI state manager (singleton pattern)
- [ ] Render 3D bounding box in volume view
- [ ] Add ROI toolbar (Draw/Clear buttons)
- [ ] Synchronize ROI across all views
- [ ] Display VOI dimensions and statistics
- [ ] Handle edge cases (ROI outside volume bounds)
- [ ] Add keyboard shortcuts (ESC to cancel ROI)
- [ ] Write tests for coordinate transformations

---

## Next Steps

1. Initialize Django project with PostgreSQL
2. Set up VTK.js frontend scaffold
3. Implement upload + parsing (backend)
4. Build basic 3D viewer (frontend)
5. Add MPR views (3 orthogonal planes)
6. **Implement ROI drawing in MPR views**
7. **Add 3D VOI visualization**
8. **Implement cross-view synchronization**
9. Add W/L controls
10. Write tests (including ROI tests)
11. Record demo (showcase ROI → VOI workflow)
12. Polish README

---

*This architecture prioritizes simplicity and meeting core requirements. All choices favor "working software over comprehensive documentation" while maintaining production-quality patterns.*
