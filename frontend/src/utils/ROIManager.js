class ROIManager {
  /**
   * Creates a ROI manager instance.
   */
  constructor() {
    this.roiState = null;
    this.subscribers = [];
  }

  /**
   * Sets ROI state from 2D rectangle coordinates.
   * @param {{xMin:number,xMax:number,yMin:number,yMax:number}} bounds2D
   * @param {'axial'|'coronal'|'sagittal'} viewType
   * @param {[number, number, number]} volumeDimensions [depth, height, width]
   * @param {[number, number, number]} spacing [z, y, x]
   * @returns {void}
   */
  setROI(bounds2D, viewType, volumeDimensions, spacing) {
    const bounds3D = this._transform2DTo3D(bounds2D, viewType, volumeDimensions);
    
    this.roiState = {
      active: true,
      sourceView: viewType,
      bounds: bounds3D,
      indexBounds: this._worldToIndex(bounds3D),
      dimensions: volumeDimensions,
      spacing: spacing,
    };
    
    this.notifySubscribers();
  }

  /**
    * Converts 2D ROI bounds to 3D volume bounds.
    * @private
    * @param {{xMin:number,xMax:number,yMin:number,yMax:number}} bounds2D
    * @param {'axial'|'coronal'|'sagittal'} viewType
    * @param {[number, number, number]} volumeDimensions
    * @returns {{xMin:number,xMax:number,yMin:number,yMax:number,zMin:number,zMax:number}}
   */
  _transform2DTo3D(bounds2D, viewType, volumeDimensions) {
    const [depth, height, width] = volumeDimensions;
    
    let bounds3D;
    
    switch (viewType) {
      case 'axial':
        bounds3D = {
          xMin: bounds2D.xMin,
          xMax: bounds2D.xMax,
          yMin: bounds2D.yMin,
          yMax: bounds2D.yMax,
          zMin: 0,
          zMax: depth - 1,
        };
        break;
        
      case 'coronal':
        bounds3D = {
          xMin: bounds2D.xMin,
          xMax: bounds2D.xMax,
          yMin: 0,
          yMax: height - 1,
          zMin: bounds2D.yMin,
          zMax: bounds2D.yMax,
        };
        break;
        
      case 'sagittal':
        bounds3D = {
          xMin: 0,
          xMax: width - 1,
          yMin: bounds2D.xMin,
          yMax: bounds2D.xMax,
          zMin: bounds2D.yMin,
          zMax: bounds2D.yMax,
        };
        break;
        
      default:
        throw new Error(`Unknown view type: ${viewType}`);
    }
    
    return bounds3D;
  }

  /**
    * Converts bounds to integer index ranges.
    * @private
    * @param {{xMin:number,xMax:number,yMin:number,yMax:number,zMin:number,zMax:number}} bounds
    * @returns {{i:[number,number],j:[number,number],k:[number,number]}}
   */
  _worldToIndex(bounds) {
    return {
      i: [
        Math.floor(bounds.xMin),
        Math.ceil(bounds.xMax)
      ],
      j: [
        Math.floor(bounds.yMin),
        Math.ceil(bounds.yMax)
      ],
      k: [
        Math.floor(bounds.zMin),
        Math.ceil(bounds.zMax)
      ],
    };
  }

  /**
    * Clears current ROI state.
    * @returns {void}
   */
  clearROI() {
    this.roiState = null;
    this.notifySubscribers();
  }

  /**
    * Returns current ROI state.
    * @returns {object | null}
   */
  getROIState() {
    return this.roiState;
  }

  /**
   * Subscribes to ROI state changes.
   * @param {(roiState: object | null) => void} callback
   * @returns {() => void}
   */
  subscribe(callback) {
    this.subscribers.push(callback);

    return () => {
      const index = this.subscribers.indexOf(callback);
      if (index > -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  /**
    * Notifies all subscribers of a state change.
   * @private
    * @returns {void}
   */
  notifySubscribers() {
    this.subscribers.forEach(callback => {
      try {
        callback(this.roiState);
      } catch (error) {
        console.error('Error in ROI subscriber:', error);
      }
    });
  }

  /**
    * Calculates VOI statistics from image data and active ROI bounds.
    * @param {object} imageData
    * @returns {{
    *   meanHU: string,
    *   stdHU: string,
    *   minHU: number,
    *   maxHU: number,
    *   voxelCount: number,
    *   volumeMm3: string,
    *   volumeCm3: string
    * } | null}
   */
  calculateVOIStatistics(imageData) {
    if (!this.roiState) {
      return null;
    }

    const scalars = imageData.getPointData().getScalars();
    const dims = imageData.getDimensions();
    const spacing = imageData.getSpacing();
    const data = scalars.getData();

    const { i, j, k } = this.roiState.indexBounds;

    let sum = 0;
    let sumSquares = 0;
    let count = 0;
    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;

    for (let z = k[0]; z <= k[1] && z < dims[2]; z++) {
      for (let y = j[0]; y <= j[1] && y < dims[1]; y++) {
        for (let x = i[0]; x <= i[1] && x < dims[0]; x++) {
          const idx = x + y * dims[0] + z * dims[0] * dims[1];
          const value = data[idx];
          sum += value;
          sumSquares += value * value;
          if (value < minValue) {
            minValue = value;
          }
          if (value > maxValue) {
            maxValue = value;
          }
          count++;
        }
      }
    }

    if (count === 0) {
      return null;
    }

    const mean = sum / count;
    const variance = (sumSquares / count) - (mean * mean);
    const std = Math.sqrt(Math.max(0, variance));

    const volumeMm3 = count * spacing[0] * spacing[1] * spacing[2];

    return {
      meanHU: mean.toFixed(2),
      stdHU: std.toFixed(2),
      minHU: minValue,
      maxHU: maxValue,
      voxelCount: count,
      volumeMm3: volumeMm3.toFixed(2),
      volumeCm3: (volumeMm3 / 1000).toFixed(2),
    };
  }
}

const roiManager = new ROIManager();

export default roiManager;
