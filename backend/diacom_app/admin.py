"""Admin registrations for study, series, and slice models."""

from django.contrib import admin
from .models import Study, Series, Slice


@admin.register(Study)
class StudyAdmin(admin.ModelAdmin):
    """Admin customization for study records."""
    list_display = ['study_uid', 'patient_id', 'study_date', 'created_at']
    search_fields = ['study_uid', 'patient_id']
    list_filter = ['created_at', 'study_date']
    readonly_fields = ['created_at']


@admin.register(Series)
class SeriesAdmin(admin.ModelAdmin):
    """Admin customization for series records."""
    list_display = ['series_uid', 'study', 'modality', 'source_format', 'num_slices']
    search_fields = ['series_uid', 'study__study_uid']
    list_filter = ['modality', 'source_format']
    readonly_fields = ['metadata']


@admin.register(Slice)
class SliceAdmin(admin.ModelAdmin):
    """Admin customization for slice records."""
    list_display = ['instance_uid', 'series', 'slice_location']
    search_fields = ['instance_uid', 'series__series_uid']
    list_filter = ['series']
    readonly_fields = ['metadata', 'image_position']

