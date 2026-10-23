from pathlib import Path
import pytest
from backend.app.services.cv_service import ComputerVisionService
from backend.app.models.schemas import CongestionLevel, IncidentStatus, DataStatus
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
    assert result.data_status == DataStatus.LIVE
    assert result.tracking_summary is not None
    assert result.tracking_summary.tracked_unique_vehicles >= 0

def test_cv_freeflow_processing():
    service = ComputerVisionService()
    sample_video = settings.base_dir / "data" / "samples" / "cctv_sample_freeflow.mp4"
    assert sample_video.exists(), "Freeflow sample video must exist"

    result = service.analyze_cctv_video(str(sample_video), corridor_id="corridor_cctv_01")
    assert result.corridor_id == "corridor_cctv_01"
    assert result.density_score <= 0.65
    assert result.data_status == DataStatus.LIVE

def test_cv_rejects_missing_or_corrupt_stream():
    service = ComputerVisionService()
    # Missing file raises FileNotFoundError
    with pytest.raises(FileNotFoundError):
        service.analyze_cctv_video("non_existent_stream.mp4", corridor_id="corridor_01")

def test_operator_incident_verification_lifecycle():
    service = ComputerVisionService()
    inc_id = "INC-TEST-001"
    from backend.app.models.schemas import IncidentRecord
    service.incidents_registry[inc_id] = IncidentRecord(
        incident_id=inc_id,
        corridor_id="corridor_cctv_07",
        status=IncidentStatus.SUSPECTED,
        description="Suspected vehicle overturn blocking junction",
        confidence_score=0.88,
        detected_at="2026-10-23T10:00:00Z",
    )

    # 1. Operator confirms incident
    confirmed = service.verify_incident(inc_id, action="CONFIRM", notes="Verified by CCTV camera operator")
    assert confirmed is not None
    assert confirmed.status == IncidentStatus.CONFIRMED
    assert confirmed.verified_by == "DISPATCH_OP_01"

    # 2. Operator clears incident
    cleared = service.verify_incident(inc_id, action="CLEAR", notes="Wreckage towed, road clear")
    assert cleared is not None
    assert cleared.status == IncidentStatus.CLEARED
