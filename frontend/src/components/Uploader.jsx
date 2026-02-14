/**
 * File upload component with drag-and-drop support
 */
import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadFiles, fetchStudies, fetchSeries } from '../api';
import './Uploader.css';

/**
 * Upload and study/series selection panel.
 * @param {{ onSeriesSelected: (series: object) => void }} props
 * @returns {JSX.Element}
 */
const Uploader = ({ onSeriesSelected }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [studies, setStudies] = useState([]);
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [seriesList, setSeriesList] = useState([]);
  const [error, setError] = useState(null);

  const loadStudies = useCallback(async () => {
    try {
      const data = await fetchStudies();
      setStudies(data);
    } catch (err) {
      console.error('Failed to load studies:', err);
    }
  }, []);

  const loadSeriesForStudy = useCallback(async (studyUid) => {
    try {
      const data = await fetchSeries(studyUid);
      setSeriesList(data);
    } catch (err) {
      console.error('Failed to load series:', err);
      setError('Failed to load series');
    }
  }, []);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) {
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const result = await uploadFiles(acceptedFiles);
      
      setUploadProgress(100);
      
      await loadStudies();
      
      if (result.series && result.series.length > 0) {
        const studyUid = result.studies[0];
        setSelectedStudy(studyUid);
        await loadSeriesForStudy(studyUid);
      }
      
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 500);
      
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || 'Failed to upload files');
      setUploading(false);
      setUploadProgress(0);
    }
  }, [loadStudies, loadSeriesForStudy]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/dicom': ['.dcm', '.dicom'],
      'application/x-nifti': ['.nii', '.nii.gz'],
    },
    multiple: true,
  });

  const handleStudyClick = useCallback(async (studyUid) => {
    setSelectedStudy(studyUid);
    await loadSeriesForStudy(studyUid);
  }, [loadSeriesForStudy]);

  const handleSeriesClick = useCallback((series) => {
    onSeriesSelected(series);
  }, [onSeriesSelected]);

  useEffect(() => {
    const initializeStudies = async () => {
      try {
        const data = await fetchStudies();
        setStudies(data);
      } catch (err) {
        console.error('Failed to load studies:', err);
      }
    };

    initializeStudies();
  }, []);

  return (
    <div className="uploader-container">
      <div className="upload-section">
        <div
          {...getRootProps()}
          className={`dropzone ${isDragActive ? 'active' : ''} ${uploading ? 'uploading' : ''}`}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <div className="upload-progress">
              <div className="spinner"></div>
              <p>Uploading... {uploadProgress}%</p>
            </div>
          ) : (
            <div className="dropzone-content">
              <div className="upload-icon">📁</div>
              <p>
                {isDragActive
                  ? 'Drop files here...'
                  : 'Drag & drop DICOM or NIfTI files here, or click to select'}
              </p>
              <p className="file-types">Supported: .dcm, .nii, .nii.gz</p>
            </div>
          )}
        </div>

        {error && (
          <div className="error-message">
            <span>⚠️</span> {error}
          </div>
        )}
      </div>

      <div className="studies-section">
        <h3>Studies</h3>
        {studies.length === 0 ? (
          <p className="empty-message">No studies uploaded yet</p>
        ) : (
          <div className="studies-list">
            {studies.map((study) => (
              <div
                key={study.id}
                className={`study-item ${selectedStudy === study.study_uid ? 'selected' : ''}`}
                onClick={() => handleStudyClick(study.study_uid)}
              >
                <div className="study-info">
                  <div className="study-patient">Patient: {study.patient_id}</div>
                  <div className="study-date">
                    {study.study_date || 'No date'}
                  </div>
                  <div className="study-series-count">
                    {study.series_count} series
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {seriesList.length > 0 && (
        <div className="series-section">
          <h3>Series</h3>
          <div className="series-list">
            {seriesList.map((series) => (
              <div
                key={series.id}
                className="series-item"
                onClick={() => handleSeriesClick(series)}
              >
                <div className="series-info">
                  <div className="series-modality">{series.modality}</div>
                  <div className="series-format">{series.source_format}</div>
                  <div className="series-slices">{series.num_slices} slices</div>
                </div>
                <button className="view-button">View 3D</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Uploader;
