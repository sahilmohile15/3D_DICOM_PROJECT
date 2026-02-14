import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

/**
 * Uploads DICOM or NIfTI files.
 * @param {FileList | File[]} files
 * @returns {Promise<{message: string, studies: string[], series: string[]}>}
 */
export const uploadFiles = async (files) => {
  const formData = new FormData();
  
  Array.from(files).forEach(file => {
    formData.append('files', file);
  });
  
  const response = await apiClient.post('/upload/', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  
  return response.data;
};

/**
 * Fetches all studies.
 * @returns {Promise<object[]>}
 */
export const fetchStudies = async () => {
  const response = await apiClient.get('/studies/');
  return response.data;
};

/**
 * Fetches series records for a study.
 * @param {string} studyUid
 * @returns {Promise<object[]>}
 */
export const fetchSeries = async (studyUid) => {
  const response = await apiClient.get(`/studies/${studyUid}/series/`);
  return response.data;
};

/**
 * Fetches detailed series payload including slices.
 * @param {string} seriesUid
 * @returns {Promise<object>}
 */
export const fetchSeriesDetail = async (seriesUid) => {
  const response = await apiClient.get(`/series/${seriesUid}/`);
  return response.data;
};

/**
 * Fetches binary volume data and response metadata for a series.
 * @param {string} seriesUid
 * @returns {Promise<{buffer: ArrayBuffer, metadata: object}>}
 */
export const fetchVolumeData = async (seriesUid) => {
  const response = await apiClient.get(`/series/${seriesUid}/volume/`, {
    responseType: 'arraybuffer',
  });
  
  const metadataHeader = response.headers['x-volume-metadata'];
  const metadata = metadataHeader ? JSON.parse(metadataHeader) : {};
  
  return {
    buffer: response.data,
    metadata,
  };
};

/**
 * Fetches volume metadata without binary payload.
 * @param {string} seriesUid
 * @returns {Promise<object>}
 */
export const fetchVolumeMetadata = async (seriesUid) => {
  const response = await apiClient.get(`/series/${seriesUid}/metadata/`);
  return response.data;
};

/**
 * Fetches all slices for a series.
 * @param {string} seriesUid
 * @returns {Promise<object[]>}
 */
export const fetchSlices = async (seriesUid) => {
  const response = await apiClient.get(`/series/${seriesUid}/slices/`);
  return response.data;
};

export default apiClient;
