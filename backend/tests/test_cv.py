from pathlib import Path
import pytest
from backend.app.services.cv_service import ComputerVisionService
from backend.app.config import settings

def test_cv_video_processing():
    service = ComputerVisionService()
    sample_video = settings.base_dir / "data" / "samples" / "cctv_sample_heavy.mp4"
    assert sample_video.exists(), "Sample video file must exist"

    result = service.analyze_cctv_video(str(sample_video), corridor_id="corridor_cctv_03")

    assert result.corridor_id == "corridor_cctv_03"
    assert result.frames_analyzed > 0
    assert result.duration_seconds > 0
    assert result.vehicle_counts.total >= 0
    assert 0.0 <= result.density_score <= 1.0

def test_cv_freeflow_processing():
    service = ComputerVisionService()
    sample_video = settings.base_dir / "data" / "samples" / "cctv_sample_freeflow.mp4"
    assert sample_video.exists(), "Freeflow sample video must exist"

    result = service.analyze_cctv_video(str(sample_video), corridor_id="corridor_cctv_01")
    assert result.corridor_id == "corridor_cctv_01"
    assert result.density_score <= 0.65
