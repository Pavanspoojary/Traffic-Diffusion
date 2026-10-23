import shutil
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, File, UploadFile, Form, HTTPException, status
from fastapi.responses import FileResponse

from backend.app.config import settings
from backend.app.models.schemas import (
    VideoAnalysisResult,
    IncidentRecord,
    IncidentVerificationRequest,
    IncidentStatus,
    CongestionLevel,
)
from backend.app.services.cv_service import cv_service
from backend.app.services.routing_service import routing_service

router = APIRouter(prefix="/api/v1/cv", tags=["Computer Vision & Traffic Sensing"])

ALLOWED_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}

@router.post("/upload", response_model=VideoAnalysisResult)
async def upload_and_analyze_cctv(
    corridor_id: str = Form(..., description="ID of the road corridor monitored by this CCTV camera"),
    video_file: UploadFile = File(..., description="CCTV footage video clip"),
    is_simulation_mode: bool = Form(False, description="Flag indicating if this is an explicitly simulated demo upload")
):
    """
    Receives an uploaded CCTV video clip, analyzes vehicle volume and movement via Computer Vision,
    and dynamically feeds the verified congestion state into the emergency routing network.
    """
    suffix = Path(video_file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported video format: '{suffix}'. Allowed formats: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Save uploaded file
    target_filename = f"{corridor_id}_{int(Path(video_file.filename).stat().st_mtime if hasattr(video_file.filename, 'stat') else 0)}_{Path(video_file.filename).name}"
    target_path = settings.upload_dir / target_filename

    with open(target_path, "wb") as buffer:
        shutil.copyfileobj(video_file.file, buffer)

    # Run computer vision detection & tracking pipeline
    try:
        analysis_result = cv_service.analyze_cctv_video(
            video_path=str(target_path),
            corridor_id=corridor_id,
            is_simulation_mode=is_simulation_mode
        )
    except FileNotFoundError as fe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(fe))
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(ve))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process video: {str(e)}"
        )

    # Propagate computed road state into the routing graph
    routing_service.update_edge_by_corridor(
        corridor_id=corridor_id,
        density_score=analysis_result.density_score,
        congestion_level=analysis_result.congestion_level,
        has_incident=analysis_result.is_incident_detected,
        incident_description=analysis_result.incident_reason,
        incident_status=analysis_result.incident_status,
        is_simulated=is_simulation_mode,
    )

    return analysis_result

@router.post("/analyze-sample", response_model=VideoAnalysisResult)
async def analyze_sample_video(
    sample_type: str = "heavy",
    corridor_id: str = "corridor_cctv_04",
    is_simulation_mode: bool = False
):
    """
    Analyzes pre-packaged sample CCTV traffic footage ('heavy' or 'freeflow')
    to allow immediate testing without manual video upload.
    """
    filename = "cctv_sample_heavy.mp4" if sample_type == "heavy" else "cctv_sample_freeflow.mp4"
    sample_path = settings.base_dir / "data" / "samples" / filename
    if not sample_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sample video file '{filename}' not found on server"
        )

    try:
        analysis_result = cv_service.analyze_cctv_video(
            video_path=str(sample_path),
            corridor_id=corridor_id,
            is_simulation_mode=is_simulation_mode
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error analyzing sample footage: {str(e)}"
        )

    routing_service.update_edge_by_corridor(
        corridor_id=corridor_id,
        density_score=analysis_result.density_score,
        congestion_level=analysis_result.congestion_level,
        has_incident=analysis_result.is_incident_detected,
        incident_description=analysis_result.incident_reason,
        incident_status=analysis_result.incident_status,
        is_simulated=is_simulation_mode,
    )

    return analysis_result

@router.get("/incidents", response_model=List[IncidentRecord])
async def list_active_incidents():
    """Returns active road incidents detected by cameras or operators awaiting review or clearance."""
    return cv_service.list_active_incidents()

@router.post("/incidents/{incident_id}/verify", response_model=IncidentRecord)
async def verify_incident(incident_id: str, request: IncidentVerificationRequest):
    """
    Operator workflow action to CONFIRM, DISMISS, or CLEAR a suspected incident.
    Updates the incident registry and reflects the confirmed/cleared status into the road network.
    """
    updated_record = cv_service.verify_incident(
        incident_id=incident_id,
        action=request.action,
        notes=request.notes,
        operator_id=request.operator_id or "DISPATCH_OP_01",
    )
    if not updated_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident '{incident_id}' not found in active registry"
        )

    # Synchronize confirmed/cleared status with the routing network
    is_confirmed = (updated_record.status == IncidentStatus.CONFIRMED)
    target_congestion = CongestionLevel.BLOCKED if is_confirmed else CongestionLevel.FREE_FLOW
    routing_service.update_edge_by_corridor(
        corridor_id=updated_record.corridor_id,
        density_score=0.95 if is_confirmed else 0.25,
        congestion_level=target_congestion,
        has_incident=is_confirmed,
        incident_description=updated_record.description if is_confirmed else None,
        incident_status=updated_record.status,
    )

    return updated_record

@router.get("/preview/{filename}")
async def get_processed_preview(filename: str):
    """Returns an annotated preview snapshot showing detected vehicle bounding boxes."""
    file_path = settings.processed_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Preview frame not found")
    return FileResponse(path=file_path, media_type="image/jpeg")
