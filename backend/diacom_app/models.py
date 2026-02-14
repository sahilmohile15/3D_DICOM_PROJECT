"""Database models representing studies, series, and DICOM slices."""

from django.db import models


class Study(models.Model):
    """Store a logical imaging study."""
    study_uid = models.CharField(max_length=255, unique=True, db_index=True)
    patient_id = models.CharField(max_length=255, blank=True)
    study_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name_plural = "Studies"
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Study {self.study_uid} - Patient {self.patient_id}"


class Series(models.Model):
    """Store one DICOM series or NIfTI-derived volume."""
    SOURCE_FORMAT_CHOICES = [
        ('DICOM', 'DICOM'),
        ('NIFTI', 'NIfTI'),
    ]
    
    series_uid = models.CharField(max_length=255, unique=True, db_index=True)
    study = models.ForeignKey(Study, on_delete=models.CASCADE, related_name='series')
    modality = models.CharField(max_length=16, blank=True)
    source_format = models.CharField(max_length=10, choices=SOURCE_FORMAT_CHOICES, default='DICOM')
    num_slices = models.IntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)
    
    class Meta:
        verbose_name_plural = "Series"
        ordering = ['study', 'series_uid']
    
    def __str__(self):
        return f"Series {self.series_uid} ({self.modality}) - {self.num_slices} slices"


class Slice(models.Model):
    """Store one source slice belonging to a series."""
    series = models.ForeignKey(Series, on_delete=models.CASCADE, related_name='slices')
    instance_uid = models.CharField(max_length=255, db_index=True)
    file_path = models.CharField(max_length=512)
    slice_location = models.FloatField(default=0.0)
    image_position = models.JSONField(default=list, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    
    class Meta:
        ordering = ['series', 'slice_location']
        unique_together = ['series', 'instance_uid']
    
    def __str__(self):
        return f"Slice {self.instance_uid} at {self.slice_location}"

