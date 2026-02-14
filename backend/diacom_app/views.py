"""REST API views for upload, study browsing, and volume retrieval."""
import json
import os
import tempfile
from pathlib import Path
from django.conf import settings
from django.http import HttpResponse
from django.db import transaction
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from datetime import datetime

from .models import Study, Series, Slice
from .serializers import StudySerializer, SeriesSerializer, SeriesDetailSerializer, SliceSerializer
from .utils import (
    validate_file_type, 
    parse_dicom_file, 
    parse_nifti_file,
    stack_volume_from_dicom,
    stack_volume_from_nifti
)


class UploadView(APIView):
    """Handle DICOM and NIfTI uploads and persist normalized study data."""
    parser_classes = [MultiPartParser, FormParser]
    
    def post(self, request):
        """Persist uploaded files and return created study and series identifiers."""
        files = request.FILES.getlist('files')
        
        if not files:
            return Response(
                {'error': 'No files provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        uploaded_studies = []
        uploaded_series = []
        
        with transaction.atomic():
            for uploaded_file in files:
                temp_dir = tempfile.mkdtemp()
                temp_path = os.path.join(temp_dir, uploaded_file.name)
                
                with open(temp_path, 'wb+') as destination:
                    for chunk in uploaded_file.chunks():
                        destination.write(chunk)
                
                file_type = validate_file_type(temp_path)
                
                if file_type == 'DICOM':
                    result = self._process_dicom(temp_path, uploaded_file.name)
                elif file_type == 'NIFTI':
                    result = self._process_nifti(temp_path, uploaded_file.name)
                else:
                    os.remove(temp_path)
                    os.rmdir(temp_dir)
                    return Response(
                        {'error': f'Unsupported file type: {uploaded_file.name}'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                if result:
                    study_uid, series_uid = result
                    if study_uid not in uploaded_studies:
                        uploaded_studies.append(study_uid)
                    if series_uid not in uploaded_series:
                        uploaded_series.append(series_uid)
                
                try:
                    os.remove(temp_path)
                    os.rmdir(temp_dir)
                except OSError:
                    pass
        
        return Response({
            'message': f'Successfully uploaded {len(files)} file(s)',
            'studies': uploaded_studies,
            'series': uploaded_series,
        }, status=status.HTTP_201_CREATED)
    
    def _process_dicom(self, file_path, filename):
        """Create or update records for one uploaded DICOM object."""
        metadata = parse_dicom_file(file_path)
        
        if not metadata:
            return None
        
        study, _ = Study.objects.get_or_create(
            study_uid=metadata['study_uid'],
            defaults={
                'patient_id': metadata['patient_id'],
                'study_date': self._parse_dicom_date(metadata['study_date']),
            }
        )
        
        series, _ = Series.objects.get_or_create(
            series_uid=metadata['series_uid'],
            defaults={
                'study': study,
                'modality': metadata['modality'],
                'source_format': 'DICOM',
                'metadata': {
                    'pixel_spacing': metadata['pixel_spacing'],
                    'slice_thickness': metadata['slice_thickness'],
                    'image_orientation': metadata['image_orientation'],
                }
            }
        )
        
        storage_dir = Path(settings.MEDIA_ROOT) / 'dicoms' / study.study_uid / series.series_uid
        storage_dir.mkdir(parents=True, exist_ok=True)
        
        dest_path = storage_dir / filename
        import shutil
        shutil.copy2(file_path, dest_path)
        
        Slice.objects.create(
            series=series,
            instance_uid=metadata['instance_uid'],
            file_path=str(dest_path),
            slice_location=metadata['slice_location'],
            image_position=metadata['image_position'],
            metadata={
                'rescale_intercept': metadata['rescale_intercept'],
                'rescale_slope': metadata['rescale_slope'],
                'window_center': metadata['window_center'],
                'window_width': metadata['window_width'],
            }
        )
        
        series.num_slices = series.slices.count()
        series.save()
        
        return (study.study_uid, series.series_uid)
    
    def _process_nifti(self, file_path, filename):
        """Create or update records for one uploaded NIfTI volume."""
        metadata = parse_nifti_file(file_path)
        
        if not metadata:
            return None
        
        study, _ = Study.objects.get_or_create(
            study_uid=metadata['study_uid'],
            defaults={
                'patient_id': metadata['patient_id'],
                'study_date': None,
            }
        )
        
        series, _ = Series.objects.get_or_create(
            series_uid=metadata['series_uid'],
            defaults={
                'study': study,
                'modality': metadata['modality'],
                'source_format': 'NIFTI',
                'num_slices': metadata['depth'],
                'metadata': {
                    'dimensions': metadata['dimensions'],
                    'spacing': metadata['spacing'],
                    'pixel_spacing': metadata['pixel_spacing'],
                    'slice_thickness': metadata['slice_thickness'],
                    'image_orientation': metadata['image_orientation'],
                    'affine': metadata['affine'],
                    'coordinate_system': metadata['coordinate_system'],
                }
            }
        )
        
        storage_dir = Path(settings.MEDIA_ROOT) / 'nifti' / study.study_uid
        storage_dir.mkdir(parents=True, exist_ok=True)
        
        dest_path = storage_dir / filename
        import shutil
        shutil.copy2(file_path, dest_path)
        
        series.metadata['file_path'] = str(dest_path)
        series.save()
        
        return (study.study_uid, series.series_uid)
    
    def _parse_dicom_date(self, date_str):
        """Convert DICOM date text in YYYYMMDD format to a date value."""
        if not date_str:
            return None
        try:
            return datetime.strptime(str(date_str), '%Y%m%d').date()
        except ValueError:
            return None


class StudyListView(generics.ListAPIView):
    """Return all studies ordered by creation time."""
    queryset = Study.objects.all()
    serializer_class = StudySerializer


class SeriesListView(APIView):
    """Return all series associated with a given study UID."""
    def get(self, request, study_uid):
        """Retrieve all series rows for the supplied study UID."""
        try:
            study = Study.objects.get(study_uid=study_uid)
        except Study.DoesNotExist:
            return Response(
                {'error': 'Study not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        series = study.series.all()
        serializer = SeriesSerializer(series, many=True)
        return Response(serializer.data)


class SeriesDetailView(generics.RetrieveAPIView):
    """Return detailed series information including slice records."""
    queryset = Series.objects.all()
    serializer_class = SeriesDetailSerializer
    lookup_field = 'series_uid'


class VolumeDataView(APIView):
    """Return binary volume bytes and metadata headers for a series."""
    def get(self, request, series_uid):
        """Build and return volume bytes for the selected series UID."""
        try:
            series = Series.objects.get(series_uid=series_uid)
        except Series.DoesNotExist:
            return Response(
                {'error': 'Series not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            if series.source_format == 'DICOM':
                volume_bytes, metadata = self._get_dicom_volume(series)
            elif series.source_format == 'NIFTI':
                volume_bytes, metadata = self._get_nifti_volume(series)
            else:
                return Response(
                    {'error': 'Unsupported format'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            response = HttpResponse(volume_bytes, content_type='application/octet-stream')
            response['X-Volume-Metadata'] = json.dumps(metadata)
            response['Access-Control-Expose-Headers'] = 'X-Volume-Metadata'
            
            return response
            
        except Exception as e:
            return Response(
                {'error': f'Failed to generate volume: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def _get_dicom_volume(self, series):
        """Build a volume payload from stored DICOM slices."""
        slices = series.slices.all().order_by('slice_location')
        
        if not slices.exists():
            raise ValueError("No slices found for series")
        
        slices_data = [(s.file_path, s.metadata) for s in slices]
        
        for i, s in enumerate(slices):
            slices_data[i] = (
                s.file_path,
                {
                    **s.metadata,
                    'slice_location': s.slice_location,
                    'image_position': s.image_position,
                    'pixel_spacing': series.metadata.get('pixel_spacing', [1.0, 1.0]),
                    'slice_thickness': series.metadata.get('slice_thickness', 1.0),
                    'image_orientation': series.metadata.get('image_orientation', [1, 0, 0, 0, 1, 0]),
                }
            )
        
        return stack_volume_from_dicom(slices_data)
    
    def _get_nifti_volume(self, series):
        """Build a volume payload from a stored NIfTI file."""
        file_path = series.metadata.get('file_path')
        
        if not file_path or not os.path.exists(file_path):
            raise ValueError("NIfTI file not found")
        
        return stack_volume_from_nifti(file_path)


class SliceListView(APIView):
    """Return ordered slice records for a series."""
    def get(self, request, series_uid):
        """Retrieve all slices sorted by slice location for one series."""
        try:
            series = Series.objects.get(series_uid=series_uid)
        except Series.DoesNotExist:
            return Response(
                {'error': 'Series not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        slices = series.slices.all().order_by('slice_location')
        serializer = SliceSerializer(slices, many=True)
        return Response(serializer.data)


class VolumeMetadataView(APIView):
    """Return metadata for a series without transferring voxel bytes."""
    def get(self, request, series_uid):
        """Retrieve metadata-only payload for one series UID."""
        try:
            series = Series.objects.get(series_uid=series_uid)
        except Series.DoesNotExist:
            return Response(
                {'error': 'Series not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        return Response({
            'series_uid': series.series_uid,
            'modality': series.modality,
            'source_format': series.source_format,
            'num_slices': series.num_slices,
            'metadata': series.metadata,
        })

