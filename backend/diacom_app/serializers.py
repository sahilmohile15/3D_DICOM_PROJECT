"""DRF serializers for study, series, and slice resources."""
from rest_framework import serializers
from .models import Study, Series, Slice


class StudySerializer(serializers.ModelSerializer):
    """Serialize study summaries."""
    series_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Study
        fields = ['id', 'study_uid', 'patient_id', 'study_date', 'created_at', 'series_count']
        read_only_fields = ['created_at']
    
    def get_series_count(self, obj):
        """Return the number of series linked to this study."""
        return obj.series.count()


class SliceSerializer(serializers.ModelSerializer):
    """Serialize persisted slice records."""
    
    class Meta:
        model = Slice
        fields = ['id', 'instance_uid', 'file_path', 'slice_location', 'image_position', 'metadata']


class SeriesSerializer(serializers.ModelSerializer):
    """Serialize series list items."""
    study_uid = serializers.CharField(source='study.study_uid', read_only=True)
    slices_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Series
        fields = [
            'id', 'series_uid', 'study_uid', 'modality', 'source_format',
            'num_slices', 'slices_count', 'metadata'
        ]
    
    def get_slices_count(self, obj):
        """Return the number of stored slices for this series."""
        return obj.slices.count()


class SeriesDetailSerializer(serializers.ModelSerializer):
    """Serialize series detail payloads including nested slices."""
    study_uid = serializers.CharField(source='study.study_uid', read_only=True)
    slices = SliceSerializer(many=True, read_only=True)
    
    class Meta:
        model = Series
        fields = [
            'id', 'series_uid', 'study_uid', 'modality', 'source_format',
            'num_slices', 'metadata', 'slices'
        ]
