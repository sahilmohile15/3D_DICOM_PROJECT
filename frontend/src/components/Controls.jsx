/**
 * Control panel for viewer settings
 * Window/Level, ROI tools, presets, etc.
 */
import { useState, useEffect } from 'react';
import roiManager from '../utils/ROIManager';
import './Controls.css';

const PRESETS = {
  softTissue: { window: 400, level: 40, name: 'Soft Tissue' },
  bone: { window: 2000, level: 300, name: 'Bone' },
  lung: { window: 1500, level: -600, name: 'Lung' },
  brain: { window: 80, level: 40, name: 'Brain' },
};

/**
 * Viewer controls for window/level and ROI tooling.
 * @param {{
 *  onWindowLevelChange: (value: {window:number, level:number}) => void,
 *  imageData: object | null,
 *  windowLevel: {window:number, level:number},
 *  roiDrawingEnabled: boolean,
 *  onRoiDrawingToggle: (enabled:boolean) => void
 * }} props
 * @returns {JSX.Element}
 */
const Controls = ({
  onWindowLevelChange,
  imageData,
  windowLevel: externalWindowLevel,
  roiDrawingEnabled,
  onRoiDrawingToggle,
}) => {
  const [roiActive, setRoiActive] = useState(false);
  const [roiStats, setRoiStats] = useState(null);
  const [roiDimensions, setRoiDimensions] = useState(null);

  const windowWidth = externalWindowLevel?.window ?? 400;
  const windowLevel = externalWindowLevel?.level ?? 40;

  /**
   * Updates local ROI dimension summary.
   * @param {object | null} roiState
   */
  const updateROIInfo = (roiState) => {
    if (!roiState) return;

    const bounds = roiState.bounds;
    const spacing = roiState.spacing;

    const dimensions = {
      width: Math.abs(bounds.xMax - bounds.xMin) * spacing[2],
      height: Math.abs(bounds.yMax - bounds.yMin) * spacing[1],
      depth: Math.abs(bounds.zMax - bounds.zMin) * spacing[0],
    };

    setRoiDimensions(dimensions);
  };

  useEffect(() => {
    const unsubscribe = roiManager.subscribe((roiState) => {
      if (roiState && roiState.active) {
        setRoiActive(true);
        updateROIInfo(roiState);
        
        if (imageData) {
          const stats = roiManager.calculateVOIStatistics(imageData);
          setRoiStats(stats);
        }
      } else {
        setRoiActive(false);
        setRoiStats(null);
        setRoiDimensions(null);
      }
    });

    return unsubscribe;
  }, [imageData]);

  const handleWindowChange = (e) => {
    const value = Number(e.target.value);
    onWindowLevelChange({ window: value, level: windowLevel });
  };

  const handleLevelChange = (e) => {
    const value = Number(e.target.value);
    onWindowLevelChange({ window: windowWidth, level: value });
  };

  const applyPreset = (preset) => {
    onWindowLevelChange({ window: preset.window, level: preset.level });
  };

  const handleClearROI = () => {
    roiManager.clearROI();
  };

  const handleToggleRoiDrawing = () => {
    if (onRoiDrawingToggle) {
      onRoiDrawingToggle(!roiDrawingEnabled);
    }
  };

  return (
    <div className="controls-container">
      <div className="control-section">
        <h3>Window / Level</h3>
        
        <div className="control-group">
          <label>
            Window: <span className="value">{windowWidth}</span>
          </label>
          <input
            type="range"
            min="1"
            max="4000"
            value={windowWidth}
            onChange={handleWindowChange}
            className="slider"
          />
        </div>

        <div className="control-group">
          <label>
            Level: <span className="value">{windowLevel}</span>
          </label>
          <input
            type="range"
            min="-1024"
            max="3071"
            value={windowLevel}
            onChange={handleLevelChange}
            className="slider"
          />
        </div>

        <div className="presets">
          <label>Presets:</label>
          <div className="preset-buttons">
            {Object.values(PRESETS).map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                className="preset-button"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="control-section roi-section">
        <h3>ROI / VOI Tools</h3>
        
        <div className="roi-toolbar">
          <button 
            className={`tool-button toggle ${roiDrawingEnabled ? 'on' : 'off'}`}
            onClick={handleToggleRoiDrawing}
            title="Enable or disable ROI drawing in MPR panels"
          >
            <span>📐</span> {roiDrawingEnabled ? 'Disable ROI Draw' : 'Enable ROI Draw'}
          </button>
          <button 
            className="tool-button clear"
            onClick={handleClearROI}
            disabled={!roiActive}
          >
            <span>🗑️</span> Clear ROI
          </button>
        </div>

        {roiActive && roiDimensions && (
          <div className="roi-info">
            <h4>VOI Dimensions</h4>
            <div className="roi-dimensions">
              <div>Width: {roiDimensions.width.toFixed(2)} mm</div>
              <div>Height: {roiDimensions.height.toFixed(2)} mm</div>
              <div>Depth: {roiDimensions.depth.toFixed(2)} mm</div>
            </div>
          </div>
        )}

        {roiStats && (
          <div className="roi-stats">
            <h4>VOI Statistics</h4>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">Mean HU:</span>
                <span className="stat-value">{roiStats.meanHU}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Std Dev:</span>
                <span className="stat-value">{roiStats.stdHU}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Voxels:</span>
                <span className="stat-value">{roiStats.voxelCount.toLocaleString()}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Volume:</span>
                <span className="stat-value">{roiStats.volumeCm3} cm³</span>
              </div>
            </div>
          </div>
        )}

        {!roiActive && (
          <div className="roi-hint">
            <p>💡 {roiDrawingEnabled ? 'Drag on Axial/Sagittal/Coronal view to create ROI' : 'Enable ROI Draw to start drawing'}</p>
          </div>
        )}
      </div>

      <div className="control-section">
        <h3>Instructions</h3>
        <div className="instructions">
          <ul>
            <li><strong>Rotate:</strong> Left click + drag</li>
            <li><strong>Zoom:</strong> Mouse wheel</li>
            <li><strong>Pan:</strong> Right click + drag</li>
            <li><strong>Reset:</strong> Double click</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Controls;
