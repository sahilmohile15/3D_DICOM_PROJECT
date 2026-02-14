"""Utility helpers for validating, parsing, and stacking medical image volumes."""
import os
import uuid
import numpy as np
import pydicom
import nibabel as nib
from pathlib import Path
from typing import Dict, Tuple, Optional, Any


def validate_file_type(file_path: str) -> str:
    """Return DICOM, NIFTI, or UNKNOWN for a given file path."""
    file_path_lower = file_path.lower()
    
    if file_path_lower.endswith('.nii') or file_path_lower.endswith('.nii.gz'):
        return 'NIFTI'
    
    if file_path_lower.endswith('.dcm') or file_path_lower.endswith('.dicom'):
        return 'DICOM'
    
    try:
        pydicom.dcmread(file_path, stop_before_pixels=True)
        return 'DICOM'
    except Exception:
        pass
    
    try:
        nib.load(file_path)
        return 'NIFTI'
    except Exception:
        pass
    
    return 'UNKNOWN'


def parse_dicom_file(file_path: str) -> Optional[Dict[str, Any]]:
    """Parse one DICOM file and return extracted metadata, or None on failure."""
    try:
        dcm = pydicom.dcmread(file_path)

        metadata = {
            'study_uid': str(dcm.get('StudyInstanceUID', '')),
            'series_uid': str(dcm.get('SeriesInstanceUID', '')),
            'instance_uid': str(dcm.get('SOPInstanceUID', '')),
            'patient_id': str(dcm.get('PatientID', 'UNKNOWN')),
            'study_date': dcm.get('StudyDate', None),
            'modality': str(dcm.get('Modality', 'OT')),
            'rows': int(dcm.get('Rows', 512)),
            'columns': int(dcm.get('Columns', 512)),
        }
        
        image_position = dcm.get('ImagePositionPatient', None)
        if image_position:
            metadata['image_position'] = [float(x) for x in image_position]
            metadata['slice_location'] = float(image_position[2])
        else:
            metadata['image_position'] = [0.0, 0.0, 0.0]
            metadata['slice_location'] = float(dcm.get('SliceLocation', 0.0))

        image_orientation = dcm.get('ImageOrientationPatient', None)
        if image_orientation:
            metadata['image_orientation'] = [float(x) for x in image_orientation]
        else:
            metadata['image_orientation'] = [1, 0, 0, 0, 1, 0]

        pixel_spacing = dcm.get('PixelSpacing', None)
        if pixel_spacing:
            metadata['pixel_spacing'] = [float(x) for x in pixel_spacing]
        else:
            metadata['pixel_spacing'] = [1.0, 1.0]

        metadata['slice_thickness'] = float(dcm.get('SliceThickness', 1.0))

        metadata['rescale_intercept'] = float(dcm.get('RescaleIntercept', 0.0))
        metadata['rescale_slope'] = float(dcm.get('RescaleSlope', 1.0))

        metadata['window_center'] = float(dcm.get('WindowCenter', 40))
        metadata['window_width'] = float(dcm.get('WindowWidth', 400))

        return metadata

    except Exception as e:
        print(f"Error parsing DICOM file {file_path}: {str(e)}")
        return None


def parse_nifti_file(file_path: str) -> Optional[Dict[str, Any]]:
    """Parse one NIfTI file and return DICOM-compatible metadata."""
    try:
        img = nib.load(file_path)
        data = img.get_fdata()
        header = img.header
        affine = img.affine
        
        study_uid = f"NIFTI.{uuid.uuid4()}"
        series_uid = f"NIFTI.{uuid.uuid4()}"

        shape = data.shape
        if len(shape) == 4:
            shape = shape[:3]
            data = data[:, :, :, 0]

        zooms = header.get_zooms()
        pixel_spacing = [float(zooms[0]), float(zooms[1])]
        slice_thickness = float(zooms[2]) if len(zooms) > 2 else 1.0

        metadata = {
            'study_uid': study_uid,
            'series_uid': series_uid,
            'instance_uid': series_uid,
            'patient_id': Path(file_path).stem,
            'study_date': None,
            'modality': 'MR',
            'rows': int(shape[1]),
            'columns': int(shape[0]),
            'depth': int(shape[2]),
            'dimensions': [int(x) for x in shape],
            'pixel_spacing': pixel_spacing,
            'slice_thickness': slice_thickness,
            'spacing': [slice_thickness, pixel_spacing[1], pixel_spacing[0]],
            'image_orientation': [1, 0, 0, 0, 1, 0],
            'affine': affine.tolist(),
            'coordinate_system': 'RAS',
            'rescale_intercept': 0.0,
            'rescale_slope': 1.0,
            'window_center': float(np.mean(data)),
            'window_width': float(np.std(data) * 4),
        }

        return metadata

    except Exception as e:
        print(f"Error parsing NIfTI file {file_path}: {str(e)}")
        return None


def stack_volume_from_dicom(slices_data: list) -> Tuple[bytes, Dict[str, Any]]:
    """Stack ordered DICOM slices into a contiguous int16 volume payload."""
    slices_data = sorted(slices_data, key=lambda x: x[1]['slice_location'])

    first_dcm = pydicom.dcmread(slices_data[0][0])
    height, width = first_dcm.pixel_array.shape
    depth = len(slices_data)

    volume = np.zeros((depth, height, width), dtype=np.int16)

    for i, (file_path, metadata) in enumerate(slices_data):
        dcm = pydicom.dcmread(file_path)
        pixels = dcm.pixel_array.astype(np.float32)

        intercept = metadata.get('rescale_intercept', 0.0)
        slope = metadata.get('rescale_slope', 1.0)
        hu_values = (pixels * slope + intercept).astype(np.int16)

        volume[i] = hu_values

    if depth > 1:
        first_pos = slices_data[0][1]['slice_location']
        last_pos = slices_data[-1][1]['slice_location']
        actual_spacing_z = abs(last_pos - first_pos) / (depth - 1)
    else:
        actual_spacing_z = slices_data[0][1]['slice_thickness']

    first_meta = slices_data[0][1]
    volume_metadata = {
        'dimensions': [depth, height, width],
        'spacing': [
            actual_spacing_z,
            first_meta['pixel_spacing'][1],
            first_meta['pixel_spacing'][0]
        ],
        'orientation': first_meta['image_orientation'],
        'origin': first_meta['image_position'],
        'data_type': 'int16',
        'coordinate_system': 'LPS',
    }
    
    return volume.tobytes(), volume_metadata


def stack_volume_from_nifti(file_path: str) -> Tuple[bytes, Dict[str, Any]]:
    """Load a NIfTI file and return volume bytes converted to LPS coordinates."""
    img = nib.load(file_path)
    data = img.get_fdata()

    if len(data.shape) == 4:
        data = data[:, :, :, 0]

    lps_data = np.flip(data, axis=(0, 1))

    if lps_data.dtype != np.int16:
        if np.issubdtype(lps_data.dtype, np.floating):
            data_min = np.min(lps_data)
            data_max = np.max(lps_data)
            if data_max > data_min:
                lps_data = ((lps_data - data_min) / (data_max - data_min) * 4095 - 1024).astype(np.int16)
            else:
                lps_data = lps_data.astype(np.int16)
        else:
            lps_data = lps_data.astype(np.int16)

    metadata_dict = parse_nifti_file(file_path)

    lps_data = np.transpose(lps_data, (2, 1, 0))

    volume_metadata = {
        'dimensions': list(lps_data.shape),
        'spacing': metadata_dict['spacing'],
        'orientation': metadata_dict['image_orientation'],
        'origin': [0, 0, 0],
        'data_type': 'int16',
        'coordinate_system': 'LPS',
        'converted_from': 'RAS',
    }
    
    return lps_data.tobytes(), volume_metadata
