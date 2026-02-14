import { useCallback, useState } from 'react';
import Uploader from './components/Uploader';
import Viewer3D from './components/Viewer3D';
import SliceViewer2D from './components/SliceViewer2D';
import Controls from './components/Controls';
import { fetchVolumeData } from './api';
import './App.css';

/**
 * Main application shell for upload, MPR, 3D rendering, and controls.
 * @returns {JSX.Element}
 */
function App() {
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [volumeData, setVolumeData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [windowLevel, setWindowLevel] = useState({ window: 400, level: 40 });
  const [imageData, setImageData] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [roiDrawingEnabled, setRoiDrawingEnabled] = useState(false);

  const handleSeriesSelected = useCallback(async (series) => {
    setSelectedSeries(series);
    setImageData(null);
    setMetadata(null);
    setLoading(true);

    try {
      const data = await fetchVolumeData(series.series_uid);
      setVolumeData(data);
      setMetadata(data?.metadata || null);
    } catch (error) {
      console.error('Failed to load volume:', error);
      alert('Failed to load volume data');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Computes an automatic window/level pair from sampled voxel percentiles.
   * @param {import('@kitware/vtk.js/Common/DataModel/ImageData').default} imgData
   * @returns {{window: number, level: number}}
   */
  const calculateAutoWindowLevel = useCallback((imgData) => {
    try {
      const scalars = imgData?.getPointData?.().getScalars?.();
      const values = scalars?.getData?.();

      if (!values || values.length === 0) {
        return { window: 400, level: 40 };
      }

      const sampleStep = Math.max(1, Math.floor(values.length / 50000));
      const sample = [];

      for (let index = 0; index < values.length; index += sampleStep) {
        sample.push(values[index]);
      }

      sample.sort((a, b) => a - b);

      const p05 = sample[Math.floor(sample.length * 0.05)] ?? sample[0];
      const p95 = sample[Math.floor(sample.length * 0.95)] ?? sample[sample.length - 1];

      const window = Math.max(1, Math.round(p95 - p05));
      const level = Math.round((p95 + p05) / 2);

      return { window, level };
    } catch (error) {
      console.warn('Failed to auto-calculate window/level, using defaults:', error);
      return { window: 400, level: 40 };
    }
  }, []);

  const handleVolumeLoaded = useCallback((imgData, meta) => {
    setImageData(imgData);
    setMetadata(meta);

    const autoWl = calculateAutoWindowLevel(imgData);
    setWindowLevel(autoWl);
  }, [calculateAutoWindowLevel]);

  const handleWindowLevelChange = useCallback((wl) => {
    setWindowLevel(wl);
  }, []);

  const handleRoiDrawingToggle = useCallback((enabled) => {
    setRoiDrawingEnabled(enabled);
  }, []);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-main">
          <h1>🏥 3D DICOM Viewer</h1>
          <p className="app-subtitle">Medical Image Visualization with MPR & ROI</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className={`roi-toggle-btn ${roiDrawingEnabled ? 'on' : 'off'}`}
            onClick={() => setRoiDrawingEnabled((previousState) => !previousState)}
          >
            {roiDrawingEnabled ? 'ROI: ON' : 'ROI: OFF'}
          </button>
        </div>
      </header>

      <div className="app-content">
        <aside className="sidebar left">
          <Uploader onSeriesSelected={handleSeriesSelected} />
          <div className="controls-panel">
            <Controls
              onWindowLevelChange={handleWindowLevelChange}
              imageData={imageData}
              windowLevel={windowLevel}
              roiDrawingEnabled={roiDrawingEnabled}
              onRoiDrawingToggle={handleRoiDrawingToggle}
            />
          </div>
        </aside>

        <main className="main-viewer-grid">
          {loading && (
            <div className="loading-overlay">
              <div className="spinner"></div>
              <p>Loading volume data...</p>
            </div>
          )}
          
          {!selectedSeries && !loading && (
            <div className="empty-state">
              <div className="empty-icon">📁</div>
              <h2>No Volume Loaded</h2>
              <p>Upload DICOM or NIfTI files to get started</p>
            </div>
          )}

          {selectedSeries && volumeData && (
            <>
              <div className="viewer-quad top-left">
                {imageData && metadata ? (
                  <SliceViewer2D
                    imageData={imageData}
                    metadata={metadata}
                    viewType="axial"
                    windowLevel={windowLevel}
                    roiDrawingEnabled={roiDrawingEnabled}
                  />
                ) : (
                  <div className="viewer-placeholder">Initializing Axial...</div>
                )}
              </div>
              <div className="viewer-quad top-right">
                <Viewer3D
                  volumeData={volumeData}
                  windowLevel={windowLevel}
                  onVolumeLoaded={handleVolumeLoaded}
                />
              </div>
              <div className="viewer-quad bottom-left">
                {imageData && metadata ? (
                  <SliceViewer2D
                    imageData={imageData}
                    metadata={metadata}
                    viewType="sagittal"
                    windowLevel={windowLevel}
                    roiDrawingEnabled={roiDrawingEnabled}
                  />
                ) : (
                  <div className="viewer-placeholder">Initializing Sagittal...</div>
                )}
              </div>
              <div className="viewer-quad bottom-right">
                {imageData && metadata ? (
                  <SliceViewer2D
                    imageData={imageData}
                    metadata={metadata}
                    viewType="coronal"
                    windowLevel={windowLevel}
                    roiDrawingEnabled={roiDrawingEnabled}
                  />
                ) : (
                  <div className="viewer-placeholder">Initializing Coronal...</div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      <footer className="app-footer">
        <div className="footer-info">
          {selectedSeries && (
            <>
              <span>Series: {selectedSeries.series_uid.substring(0, 20)}...</span>
              <span>|</span>
              <span>Modality: {selectedSeries.modality}</span>
              <span>|</span>
              <span>Format: {selectedSeries.source_format}</span>
              <span>|</span>
              <span>Slices: {selectedSeries.num_slices}</span>
            </>
          )}
          {metadata && (
            <>
              <span>|</span>
              <span>Dimensions: {metadata.dimensions.join(' × ')}</span>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

export default App;

