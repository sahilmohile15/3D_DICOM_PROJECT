"""Backend tests for DICOM viewer."""
from unittest.mock import patch
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase

from diacom_app.models import Series, Slice, Study
from diacom_app.utils import parse_nifti_file, validate_file_type


class TestFileValidation(TestCase):
    """Validate file type detection behavior for supported extensions."""

    def test_nifti_gz_extension(self):
        self.assertEqual(validate_file_type('test.nii.gz'), 'NIFTI')

    def test_nifti_extension(self):
        self.assertEqual(validate_file_type('test.nii'), 'NIFTI')

    def test_dicom_extension(self):
        self.assertEqual(validate_file_type('test.dcm'), 'DICOM')


class TestNIfTIProcessing(TestCase):
    """Cover failure-path handling for NIfTI metadata parsing."""

    def test_parse_nifti_with_missing_file_returns_none(self):
        metadata = parse_nifti_file('does_not_exist.nii.gz')
        self.assertIsNone(metadata)


class BaseAPITestCase(TestCase):
    """Provide reusable fixtures for API endpoint tests."""

    def setUp(self):
        """Create baseline study, series, and slice records used by API tests."""
        self.client = Client()
        self.study = Study.objects.create(study_uid='study-1', patient_id='P001')
        self.series_nifti = Series.objects.create(
            series_uid='series-nifti-1',
            study=self.study,
            modality='MR',
            source_format='NIFTI',
            num_slices=3,
            metadata={
                'file_path': '/fake/path/volume.nii.gz',
                'dimensions': [3, 4, 5],
                'spacing': [1.0, 1.0, 1.0],
            },
        )
        self.series_dicom = Series.objects.create(
            series_uid='series-dicom-1',
            study=self.study,
            modality='CT',
            source_format='DICOM',
            num_slices=2,
            metadata={
                'pixel_spacing': [1.0, 1.0],
                'slice_thickness': 1.0,
                'image_orientation': [1, 0, 0, 0, 1, 0],
            },
        )
        Slice.objects.create(
            series=self.series_dicom,
            instance_uid='slice-1',
            file_path='/fake/path/slice1.dcm',
            slice_location=0.0,
            image_position=[0.0, 0.0, 0.0],
            metadata={
                'rescale_intercept': 0.0,
                'rescale_slope': 1.0,
            },
        )


class TestUploadView(BaseAPITestCase):
    """Test upload endpoint validation and supported upload flows."""

    def test_upload_no_files(self):
        response = self.client.post('/api/upload/', {})
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

    @patch('diacom_app.views.UploadView._process_nifti', return_value=('study-new', 'series-new'))
    @patch('diacom_app.views.validate_file_type', return_value='NIFTI')
    def test_upload_success_nifti(self, _, __):
        upload = SimpleUploadedFile('sample.nii.gz', b'fake-nifti-content')
        response = self.client.post('/api/upload/', {'files': [upload]})
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertIn('studies', payload)
        self.assertIn('series', payload)
        self.assertIn('study-new', payload['studies'])
        self.assertIn('series-new', payload['series'])

    @patch('diacom_app.views.validate_file_type', return_value='UNKNOWN')
    def test_upload_unsupported_file(self, _):
        upload = SimpleUploadedFile('file.xyz', b'unknown-content')
        response = self.client.post('/api/upload/', {'files': [upload]})
        self.assertEqual(response.status_code, 400)
        self.assertIn('Unsupported file type', response.json()['error'])


class TestStudyAndSeriesViews(BaseAPITestCase):
    """Test study, series, and slice listing and detail endpoints."""

    def test_studies_list(self):
        response = self.client.get('/api/studies/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsInstance(data, list)
        self.assertGreaterEqual(len(data), 1)
        self.assertEqual(data[0]['study_uid'], 'study-1')

    def test_series_list_for_study(self):
        response = self.client.get('/api/studies/study-1/series/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)

    def test_series_list_study_not_found(self):
        response = self.client.get('/api/studies/missing-study/series/')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error'], 'Study not found')

    def test_series_detail(self):
        response = self.client.get('/api/series/series-dicom-1/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['series_uid'], 'series-dicom-1')
        self.assertIn('slices', data)
        self.assertEqual(len(data['slices']), 1)

    def test_series_detail_not_found(self):
        response = self.client.get('/api/series/missing-series/')
        self.assertEqual(response.status_code, 404)

    def test_slice_list(self):
        response = self.client.get('/api/series/series-dicom-1/slices/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['instance_uid'], 'slice-1')

    def test_slice_list_not_found(self):
        response = self.client.get('/api/series/missing-series/slices/')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error'], 'Series not found')


class TestVolumeViews(BaseAPITestCase):
    """Test volume metadata and binary volume retrieval endpoints."""

    def test_volume_metadata(self):
        response = self.client.get('/api/series/series-nifti-1/metadata/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['series_uid'], 'series-nifti-1')
        self.assertEqual(data['source_format'], 'NIFTI')
        self.assertIn('metadata', data)

    def test_volume_metadata_not_found(self):
        response = self.client.get('/api/series/missing-series/metadata/')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error'], 'Series not found')

    @patch('diacom_app.views.stack_volume_from_nifti', return_value=(b'\x01\x02', {'dimensions': [3, 4, 5]}))
    @patch('diacom_app.views.os.path.exists', return_value=True)
    def test_volume_data_nifti_success(self, _, __):
        response = self.client.get('/api/series/series-nifti-1/volume/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b'\x01\x02')
        self.assertIn('X-Volume-Metadata', response.headers)

    @patch('diacom_app.views.os.path.exists', return_value=False)
    def test_volume_data_nifti_file_missing(self, _):
        response = self.client.get('/api/series/series-nifti-1/volume/')
        self.assertEqual(response.status_code, 500)
        self.assertIn('Failed to generate volume', response.json()['error'])

    @patch('diacom_app.views.stack_volume_from_dicom', return_value=(b'\x10\x11', {'dimensions': [1, 2, 3]}))
    def test_volume_data_dicom_success(self, _):
        response = self.client.get('/api/series/series-dicom-1/volume/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b'\x10\x11')
        self.assertIn('X-Volume-Metadata', response.headers)

    def test_volume_data_nonexistent_series(self):
        response = self.client.get('/api/series/nonexistent/volume/')
        self.assertEqual(response.status_code, 404)

    def test_volume_data_unsupported_format(self):
        unsupported_series = Series.objects.create(
            series_uid='series-unsupported',
            study=self.study,
            source_format='OTHER',
            modality='OT',
        )
        response = self.client.get(f'/api/series/{unsupported_series.series_uid}/volume/')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error'], 'Unsupported format')


class TestModels(TestCase):
    """Test model creation and key field persistence."""

    def test_study_creation(self):
        study = Study.objects.create(study_uid='1.2.3.4.5', patient_id='TEST123')
        self.assertEqual(study.patient_id, 'TEST123')
        self.assertIsNotNone(study.created_at)

    def test_series_creation(self):
        study = Study.objects.create(study_uid='1.2.3.4.5', patient_id='TEST123')
        series = Series.objects.create(
            series_uid='1.2.3.4.5.6',
            study=study,
            modality='MR',
            source_format='NIFTI',
            num_slices=100,
        )
        self.assertEqual(series.study, study)
        self.assertEqual(series.modality, 'MR')

    def test_slice_creation(self):
        study = Study.objects.create(study_uid='1.2.3.4.5', patient_id='TEST123')
        series = Series.objects.create(series_uid='1.2.3.4.5.6', study=study, modality='CT', source_format='DICOM')
        slice_obj = Slice.objects.create(
            series=series,
            instance_uid='1.2.3.4.5.6.7',
            file_path='/path/to/slice.dcm',
            slice_location=10.0,
            image_position=[0, 0, 10],
        )
        self.assertEqual(slice_obj.series, series)
        self.assertEqual(slice_obj.slice_location, 10.0)

