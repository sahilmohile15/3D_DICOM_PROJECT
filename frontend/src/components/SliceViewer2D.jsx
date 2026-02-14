/**
 * 2D Slice Viewer for Axial, Sagittal, and Coronal views
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import roiManager from '../utils/ROIManager';
import './SliceViewer2D.css';

/**
 * 2D MPR slice viewer with slice navigation and ROI drawing.
 * @param {{
 *  imageData: object | null,
 *  metadata: {dimensions:number[], spacing:number[]} | null,
 *  viewType: 'axial' | 'sagittal' | 'coronal',
 *  windowLevel: {window:number, level:number},
 *  sliceIndex?: number | null,
 *  roiDrawingEnabled?: boolean
 * }} props
 * @returns {JSX.Element}
 */
const SliceViewer2D = ({
  imageData,
  metadata,
  viewType,
  windowLevel,
  sliceIndex = null,
  roiDrawingEnabled = false,
}) => {
  const canvasRef = useRef(null);

  const maxSliceIndex = useMemo(() => {
    if (!metadata) return 0;

    const dims = metadata.dimensions;
    
    switch (viewType) {
      case 'axial':
        return dims[0] - 1; // Z axis (depth)
      case 'sagittal':
        return dims[2] - 1; // X axis (width)
      case 'coronal':
        return dims[1] - 1; // Y axis (height)
      default:
        return 0;
    }
  }, [metadata, viewType]);

  const [currentSlice, setCurrentSlice] = useState(() => {
    if (sliceIndex !== null && maxSliceIndex) {
      return Math.min(sliceIndex, maxSliceIndex);
    }
    return Math.floor(maxSliceIndex / 2);
  });
  const [isDrawingRoi, setIsDrawingRoi] = useState(false);
  const [roiStart, setRoiStart] = useState(null);
  const [roiCurrent, setRoiCurrent] = useState(null);
  const [localRoiBounds, setLocalRoiBounds] = useState(null);

  const planeSize = useMemo(() => {
    if (!metadata?.dimensions) {
      return { width: 1, height: 1 };
    }

    const dims = metadata.dimensions;

    switch (viewType) {
      case 'axial':
        return { width: dims[2], height: dims[1] };
      case 'sagittal':
        return { width: dims[1], height: dims[0] };
      case 'coronal':
        return { width: dims[2], height: dims[0] };
      default:
        return { width: 1, height: 1 };
    }
  }, [metadata, viewType]);

  /**
   * Extracts an axial plane for the current z index.
   */
  const extractAxialSlice = useCallback((data, dims, sliceIdx) => {
    const [, height, width] = dims;
    const sliceSize = width * height;
    const offset = sliceIdx * sliceSize;
    return data.slice(offset, offset + sliceSize);
  }, []);

  /**
   * Extracts a sagittal plane for the current x index.
   */
  const extractSagittalSlice = useCallback((data, dims, sliceIdx) => {
    const [depth, height, width] = dims;
    const sliceData = new Int16Array(height * depth);
    
    for (let z = 0; z < depth; z++) {
      for (let y = 0; y < height; y++) {
        const sourceIdx = z * height * width + y * width + sliceIdx;
        const targetIdx = y + z * height;
        sliceData[targetIdx] = data[sourceIdx];
      }
    }
    
    return sliceData;
  }, []);

  /**
   * Extracts a coronal plane for the current y index.
   */
  const extractCoronalSlice = useCallback((data, dims, sliceIdx) => {
    const [depth, height, width] = dims;
    const sliceData = new Int16Array(width * depth);
    
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        const sourceIdx = z * height * width + sliceIdx * width + x;
        const targetIdx = x + z * width;
        sliceData[targetIdx] = data[sourceIdx];
      }
    }
    
    return sliceData;
  }, []);

  /**
   * Paints the selected slice to the canvas with the current window/level.
   */
  const renderSlice = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageData || !metadata) return;

    const ctx = canvas.getContext('2d');
    const dims = metadata.dimensions;
    const scalars = imageData.getPointData().getScalars();
    const data = scalars.getData();

    let width, height, sliceData;

    switch (viewType) {
      case 'axial':
        width = dims[2];
        height = dims[1];
        sliceData = extractAxialSlice(data, dims, currentSlice);
        break;
      case 'sagittal':
        width = dims[1];
        height = dims[0];
        sliceData = extractSagittalSlice(data, dims, currentSlice);
        break;
      case 'coronal':
        width = dims[2];
        height = dims[0];
        sliceData = extractCoronalSlice(data, dims, currentSlice);
        break;
      default:
        return;
    }

    canvas.width = width;
    canvas.height = height;

    const imageData2D = ctx.createImageData(width, height);
    const { window: windowWidth, level: windowLevelValue } = windowLevel || { window: 400, level: 40 };

    const lower = windowLevelValue - windowWidth / 2;
    const upper = windowLevelValue + windowWidth / 2;

    for (let i = 0; i < sliceData.length; i++) {
      let value = sliceData[i];
      
      if (value <= lower) {
        value = 0;
      } else if (value >= upper) {
        value = 255;
      } else {
        value = ((value - lower) / windowWidth) * 255;
      }

      const pixelIndex = i * 4;
      imageData2D.data[pixelIndex] = value;
      imageData2D.data[pixelIndex + 1] = value;
      imageData2D.data[pixelIndex + 2] = value;
      imageData2D.data[pixelIndex + 3] = 255;
    }

    ctx.putImageData(imageData2D, 0, 0);
  }, [imageData, metadata, currentSlice, windowLevel, viewType, extractAxialSlice, extractSagittalSlice, extractCoronalSlice]);

  useEffect(() => {
    if (!imageData || !metadata || !canvasRef.current) {
      return;
    }

    renderSlice();
  }, [imageData, metadata, currentSlice, windowLevel, viewType, renderSlice]);

  useEffect(() => {
    const unsubscribe = roiManager.subscribe((roiState) => {
      if (!roiState || !roiState.active || roiState.sourceView !== viewType) {
        setLocalRoiBounds(null);
        return;
      }

      let mappedBounds;

      if (viewType === 'axial') {
        mappedBounds = {
          xMin: roiState.bounds.xMin,
          xMax: roiState.bounds.xMax,
          yMin: roiState.bounds.yMin,
          yMax: roiState.bounds.yMax,
        };
      } else if (viewType === 'coronal') {
        mappedBounds = {
          xMin: roiState.bounds.xMin,
          xMax: roiState.bounds.xMax,
          yMin: roiState.bounds.zMin,
          yMax: roiState.bounds.zMax,
        };
      } else {
        mappedBounds = {
          xMin: roiState.bounds.yMin,
          xMax: roiState.bounds.yMax,
          yMin: roiState.bounds.zMin,
          yMax: roiState.bounds.zMax,
        };
      }

      setLocalRoiBounds({
        xMin: Math.max(0, Math.min(mappedBounds.xMin, planeSize.width - 1)),
        xMax: Math.max(0, Math.min(mappedBounds.xMax, planeSize.width - 1)),
        yMin: Math.max(0, Math.min(mappedBounds.yMin, planeSize.height - 1)),
        yMax: Math.max(0, Math.min(mappedBounds.yMax, planeSize.height - 1)),
      });
    });

    return unsubscribe;
  }, [viewType, planeSize]);

  const handleSliceChange = (e) => {
    setCurrentSlice(parseInt(e.target.value, 10));
  };

  const handleWheel = (e) => {
    if (e.deltaY === 0) {
      return;
    }
    const delta = e.deltaY > 0 ? 1 : -1;
    setCurrentSlice(prev => Math.max(0, Math.min(maxSliceIndex, prev + delta)));
  };

  /**
   * Converts pointer position to voxel coordinates in current slice plane.
   */
  const getCanvasVoxelPoint = (event) => {
    const canvas = canvasRef.current;
    if (!canvas || !metadata) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

    if (Number.isNaN(x) || Number.isNaN(y)) {
      return null;
    }

    const clampedX = Math.max(0, Math.min(canvas.width - 1, x));
    const clampedY = Math.max(0, Math.min(canvas.height - 1, y));

    return {
      x: Math.round(clampedX),
      y: Math.round(clampedY),
    };
  };

  /**
   * Builds normalized rectangular bounds from two points.
   */
  const buildRoiBoundsFromPoints = (pointA, pointB) => {
    if (!pointA || !pointB) {
      return null;
    }

    return {
      xMin: Math.min(pointA.x, pointB.x),
      xMax: Math.max(pointA.x, pointB.x),
      yMin: Math.min(pointA.y, pointB.y),
      yMax: Math.max(pointA.y, pointB.y),
    };
  };

  const handlePointerDown = (event) => {
    if (!metadata || !roiDrawingEnabled) {
      return;
    }

    const point = getCanvasVoxelPoint(event);
    if (!point) {
      return;
    }

    setIsDrawingRoi(true);
    setRoiStart(point);
    setRoiCurrent(point);
  };

  const handlePointerMove = (event) => {
    if (!isDrawingRoi || !roiDrawingEnabled) {
      return;
    }

    const point = getCanvasVoxelPoint(event);
    if (!point) {
      return;
    }

    setRoiCurrent(point);
  };

  const handlePointerUp = (event) => {
    if (!isDrawingRoi || !metadata || !roiDrawingEnabled) {
      return;
    }

    const point = getCanvasVoxelPoint(event) || roiCurrent;
    const bounds2D = buildRoiBoundsFromPoints(roiStart, point);

    setIsDrawingRoi(false);

    if (!bounds2D) {
      setRoiStart(null);
      setRoiCurrent(null);
      return;
    }

    const width = bounds2D.xMax - bounds2D.xMin;
    const height = bounds2D.yMax - bounds2D.yMin;

    if (width < 2 || height < 2) {
      setRoiStart(null);
      setRoiCurrent(null);
      return;
    }

    setLocalRoiBounds(bounds2D);
    roiManager.setROI(bounds2D, viewType, metadata.dimensions, metadata.spacing);

    setRoiStart(null);
    setRoiCurrent(null);
  };

  const handlePointerLeave = () => {
    if (!isDrawingRoi || !roiDrawingEnabled) {
      return;
    }

    setIsDrawingRoi(false);
    setRoiStart(null);
    setRoiCurrent(null);
  };

  const activeRoiBounds = roiDrawingEnabled && isDrawingRoi
    ? buildRoiBoundsFromPoints(roiStart, roiCurrent)
    : localRoiBounds;

  const getViewLabel = () => {
    switch (viewType) {
      case 'axial':
        return 'Axial';
      case 'sagittal':
        return 'Sagittal';
      case 'coronal':
        return 'Coronal';
      default:
        return 'Unknown';
    }
  };

  const getOrientationLabels = () => {
    switch (viewType) {
      case 'axial':
        return { top: 'A', bottom: 'P', left: 'R', right: 'L' };
      case 'sagittal':
        return { top: 'S', bottom: 'I', left: 'A', right: 'P' };
      case 'coronal':
        return { top: 'S', bottom: 'I', left: 'R', right: 'L' };
      default:
        return { top: '', bottom: '', left: '', right: '' };
    }
  };

  const labels = getOrientationLabels();

  return (
    <div className="slice-viewer-container">
      <div className="slice-viewer-header">
        <span className="view-label">{getViewLabel()}</span>
        <span className="slice-info">
          {currentSlice + 1} / {maxSliceIndex + 1}
        </span>
      </div>
      <div
        className={`slice-canvas-wrapper ${roiDrawingEnabled ? 'roi-enabled' : 'roi-disabled'}`}
        onWheel={handleWheel}
      >
        <div
          className="slice-image-layer"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        >
          <canvas ref={canvasRef} className="slice-canvas" />
          {activeRoiBounds && (
            <div
              className={`roi-rectangle ${isDrawingRoi ? 'drawing' : ''}`}
              style={{
                left: `${(activeRoiBounds.xMin / planeSize.width) * 100}%`,
                top: `${(activeRoiBounds.yMin / planeSize.height) * 100}%`,
                width: `${((activeRoiBounds.xMax - activeRoiBounds.xMin) / planeSize.width) * 100}%`,
                height: `${((activeRoiBounds.yMax - activeRoiBounds.yMin) / planeSize.height) * 100}%`,
              }}
            />
          )}
        </div>
        <div className="orientation-labels">
          <span className="label-top">{labels.top}</span>
          <span className="label-bottom">{labels.bottom}</span>
          <span className="label-left">{labels.left}</span>
          <span className="label-right">{labels.right}</span>
        </div>
      </div>
      <div className="slice-controls">
        <input
          type="range"
          min="0"
          max={maxSliceIndex}
          value={currentSlice}
          onChange={handleSliceChange}
          className="slice-slider"
        />
      </div>
    </div>
  );
};

export default SliceViewer2D;
