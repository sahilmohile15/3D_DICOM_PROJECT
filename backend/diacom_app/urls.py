"""API route mappings for diacom_app."""
from django.urls import path
from .views import (
    UploadView,
    StudyListView,
    SeriesListView,
    SeriesDetailView,
    VolumeDataView,
    SliceListView,
    VolumeMetadataView,
)

app_name = 'diacom_app'

urlpatterns = [
    path('upload/', UploadView.as_view(), name='upload'),

    path('studies/', StudyListView.as_view(), name='study-list'),

    path('studies/<str:study_uid>/series/', SeriesListView.as_view(), name='series-list'),
    path('series/<str:series_uid>/', SeriesDetailView.as_view(), name='series-detail'),
    path('series/<str:series_uid>/slices/', SliceListView.as_view(), name='slice-list'),

    path('series/<str:series_uid>/volume/', VolumeDataView.as_view(), name='volume-data'),
    path('series/<str:series_uid>/metadata/', VolumeMetadataView.as_view(), name='volume-metadata'),
]
