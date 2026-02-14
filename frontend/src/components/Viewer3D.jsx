/**
 * 3D Volumefull Rendering Viewer using VTK.js
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkCubeSource from '@kitware/vtk.js/Filters/Sources/CubeSource';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import roiManager from '../utils/ROIManager';
import './Viewer3D.css';

/**
 * 3D volume renderer with VOI overlay support.
 * @param {{
 *  volumeData: {buffer: ArrayBuffer, metadata: {dimensions:number[], spacing:number[]}} | null,
 *  windowLevel: {window:number, level:number},
 *  onVolumeLoaded?: (imageData: object, metadata: object) => void
 * }} props
 * @returns {JSX.Element}
 */
const Viewer3D = ({ volumeData, windowLevel, onVolumeLoaded }) => {
  const containerRef = useRef(null);
  const vtkContextRef = useRef(null);
  const voiActorRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rendererReady, setRendererReady] = useState(false);

  /**
   * Creates and renders the VTK volume from binary data.
   * @param {{buffer: ArrayBuffer, metadata: {dimensions:number[], spacing:number[]}}} data
   */
  const loadVolume = useCallback(async (data) => {
    setLoading(true);
    setError(null);

    try {
      const { buffer, metadata } = data;

      const imageData = vtkImageData.newInstance();
      const dims = metadata.dimensions;
      const spacing = metadata.spacing;

      imageData.setDimensions([dims[2], dims[1], dims[0]]);
      imageData.setSpacing([spacing[2], spacing[1], spacing[0]]);
      imageData.setOrigin([0, 0, 0]);

      const typedArray = new Int16Array(buffer);
      const dataArray = vtkDataArray.newInstance({
        name: 'Pixels',
        values: typedArray,
        numberOfComponents: 1,
      });

      imageData.getPointData().setScalars(dataArray);

      if (onVolumeLoaded) {
        onVolumeLoaded(imageData, metadata);
      }

      const volume = vtkVolume.newInstance();
      const mapper = vtkVolumeMapper.newInstance();
      mapper.setInputData(imageData);

      const ctfun = vtkColorTransferFunction.newInstance();
      ctfun.addRGBPoint(-1024, 0.0, 0.0, 0.0);
      ctfun.addRGBPoint(-500, 0.5, 0.25, 0.0);
      ctfun.addRGBPoint(0, 0.8, 0.8, 0.8);
      ctfun.addRGBPoint(500, 1.0, 1.0, 1.0);
      ctfun.addRGBPoint(3071, 1.0, 1.0, 1.0);

      const ofun = vtkPiecewiseFunction.newInstance();
      ofun.addPoint(-1024, 0.0);
      ofun.addPoint(-500, 0.0);
      ofun.addPoint(0, 0.1);
      ofun.addPoint(500, 0.3);
      ofun.addPoint(1000, 0.5);
      ofun.addPoint(3071, 0.9);

      volume.setMapper(mapper);
      volume.getProperty().setRGBTransferFunction(0, ctfun);
      volume.getProperty().setScalarOpacity(0, ofun);
      volume.getProperty().setInterpolationTypeToLinear();
      volume.getProperty().setShade(true);
      volume.getProperty().setAmbient(0.3);
      volume.getProperty().setDiffuse(0.6);
      volume.getProperty().setSpecular(0.3);
      volume.getProperty().setSpecularPower(20.0);

      if (!vtkContextRef.current?.renderer || !vtkContextRef.current?.renderWindow) {
        throw new Error('VTK context not initialized');
      }

      const { renderer, renderWindow } = vtkContextRef.current;
      renderer.addVolume(volume);
      renderer.resetCamera();
      renderWindow.render();

      vtkContextRef.current.volume = volume;
      vtkContextRef.current.imageData = imageData;
      vtkContextRef.current.mapper = mapper;
      vtkContextRef.current.ctfun = ctfun;
      vtkContextRef.current.ofun = ofun;

      setLoading(false);

    } catch (err) {
      console.error('Failed to load volume:', err);
      setError('Failed to load volume data');
      setLoading(false);
    }
  }, [onVolumeLoaded]);

  /**
   * Updates transfer function based on current window/level values.
   * @param {number} windowWidth
   * @param {number} windowLevel
   */
  const updateWindowLevel = (windowWidth, windowLevel) => {
    if (!vtkContextRef.current?.ctfun || !vtkContextRef.current?.renderWindow) {
      return;
    }

    try {
      const { ctfun, renderWindow } = vtkContextRef.current;

      const lower = windowLevel - windowWidth / 2;
      const upper = windowLevel + windowWidth / 2;

      ctfun.removeAllPoints();
      ctfun.addRGBPoint(lower, 0.0, 0.0, 0.0);
      ctfun.addRGBPoint(windowLevel - windowWidth / 4, 0.5, 0.25, 0.0);
      ctfun.addRGBPoint(windowLevel, 0.8, 0.8, 0.8);
      ctfun.addRGBPoint(windowLevel + windowWidth / 4, 1.0, 1.0, 1.0);
      ctfun.addRGBPoint(upper, 1.0, 1.0, 1.0);

      renderWindow.render();
    } catch (err) {
      console.warn('Error updating window/level:', err);
    }
  };

  /**
   * Renders or clears VOI actor in the 3D view.
   * @param {object | null} roiState
   */
  const updateVOIVisualization = (roiState) => {
    if (!vtkContextRef.current?.renderer || !vtkContextRef.current?.renderWindow) {
      return;
    }

    try {
      const { renderer, renderWindow } = vtkContextRef.current;

      if (voiActorRef.current) {
        renderer.removeActor(voiActorRef.current);
        voiActorRef.current = null;
      }

      if (roiState && roiState.active) {
        const bounds = roiState.bounds;
        const spacing = roiState.spacing;

        const xMin = bounds.xMin * spacing[2];
        const xMax = (bounds.xMax + 1) * spacing[2];
        const yMin = bounds.yMin * spacing[1];
        const yMax = (bounds.yMax + 1) * spacing[1];
        const zMin = bounds.zMin * spacing[0];
        const zMax = (bounds.zMax + 1) * spacing[0];

        const xLength = xMax - xMin;
        const yLength = yMax - yMin;
        const zLength = zMax - zMin;

        const centerX = (xMin + xMax) / 2;
        const centerY = (yMin + yMax) / 2;
        const centerZ = (zMin + zMax) / 2;

        const cubeSource = vtkCubeSource.newInstance({
          xLength,
          yLength,
          zLength,
          center: [centerX, centerY, centerZ],
        });

        const mapper = vtkMapper.newInstance();
        mapper.setInputConnection(cubeSource.getOutputPort());

        const actor = vtkActor.newInstance();
        actor.setMapper(mapper);
        actor.getProperty().setRepresentationToSurface();
        actor.getProperty().setOpacity(0.45);
        actor.getProperty().setColor(1.0, 0.0, 0.0);
        actor.getProperty().setEdgeVisibility(true);
        actor.getProperty().setEdgeColor(1.0, 0.0, 0.0);
        actor.getProperty().setLineWidth(4);

        renderer.addActor(actor);
        voiActorRef.current = actor;
      }

      renderWindow.render();
    } catch (err) {
      console.warn('Error updating VOI visualization:', err);
    }
  };

  useEffect(() => {
    if (!containerRef.current || vtkContextRef.current) {
      return;
    }

    const timeoutId = setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        console.warn('Container has no dimensions yet, skipping VTK initialization');
        return;
      }

      try {
        const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
          container: container,
          background: [0.1, 0.1, 0.1],
        });

        const renderer = fullScreenRenderer.getRenderer();
        const renderWindow = fullScreenRenderer.getRenderWindow();

        vtkContextRef.current = {
          fullScreenRenderer,
          renderer,
          renderWindow,
          volume: null,
          imageData: null,
        };
        setRendererReady(true);

      } catch (err) {
        console.error('Failed to initialize VTK.js:', err);
        setError('Failed to initialize 3D viewer');
      }
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if (vtkContextRef.current) {
        try {
          vtkContextRef.current.fullScreenRenderer.delete();
        } catch (error) {
          console.warn('Error during VTK cleanup:', error);
        }
        vtkContextRef.current = null;
        setRendererReady(false);
      }
    };
  }, []);

  useEffect(() => {
    if (!volumeData || !vtkContextRef.current || !rendererReady) {
      return;
    }

    loadVolume(volumeData);
  }, [volumeData, rendererReady, loadVolume]);

  useEffect(() => {
    if (!vtkContextRef.current?.volume || !windowLevel) {
      return;
    }

    updateWindowLevel(windowLevel.window, windowLevel.level);
  }, [windowLevel]);

  useEffect(() => {
    const unsubscribe = roiManager.subscribe((roiState) => {
      updateVOIVisualization(roiState);
    });

    return unsubscribe;
  }, []);

  return (
    <div className="viewer3d-container">
      <div className="viewer3d-header">
        <span className="view-label">3D Volume</span>
      </div>
      {loading && (
        <div className="viewer3d-loading">
          <div className="spinner"></div>
          <p>Loading volume...</p>
        </div>
      )}
      {error && (
        <div className="viewer3d-error">
          <span>⚠️</span> {error}
        </div>
      )}
      <div
        ref={containerRef}
        className="viewer3d-canvas"
        style={{ width: '100%', height: '100%' }}
      >
        <div className="orientation-labels-3d">
          <span className="label-3d label-P">P</span>
          <span className="label-3d label-A">A</span>
          <span className="label-3d label-S">S</span>
          <span className="label-3d label-I">I</span>
          <span className="label-3d label-L">L</span>
          <span className="label-3d label-R">R</span>
        </div>
      </div>
    </div>
  );
};

export default Viewer3D;
