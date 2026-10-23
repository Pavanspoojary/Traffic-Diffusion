import shutil
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, File, UploadFile, Form, HTTPException, status
from fastapi.responses import FileResponse

from backend.app.config import settings
from backend.app.models.schemas import VideoAnalysisResult
from backend.app.services.cv_service import cv_service
from backend.app.services.routing_service import routing_service

router = APIRouter(prefix="/api/v1/cv", tags=["Computer Vision & Traffic Sensing"])

ALLOWED_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}

@router.post("/upload", response_model=VideoAnalysisResult)
async def upload_and_analyze_cctv(
    corridor_id: str = Form(..., description="ID of the road corridor monitored by this CCTV camera"),
    video_file: UploadFile = File(..., description="CCTV footage video clip")
):
    """
    Receives an uploaded CCTV video clip, analyzes vehicle volume and density via Computer Vision,
    and dynamically feeds the updated congestion state into the emergency routing network.
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

    # Run computer vision detection pipeline
    try:
        analysis_result = cv_service.analyze_cctv_video(str(target_path), corridor_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process video: {str(e)}"
        )

    # Propagate computed congestion status to the road routing graph
    routing_service.update_edge_by_corridor(
        corridor_id=corridor_id,
        density_score=analysis_result.density_score,
        congestion_level=analysis_result.congestion_level,
        has_incident=analysis_result.is_incident_detected,
        incident_description=analysis_result.incident_reason,
    )

    return analysis_result

@router.post("/analyze-sample", response_model=VideoAnalysisResult)
async def analyze_sample_video(
    sample_type: str = "heavy",
    corridor_id: str = "corridor_cctv_04"
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

    analysis_result = cv_service.analyze_cctv_video(str(sample_path), corridor_id)

    routing_service.update_edge_by_corridor(
        corridor_id=corridor_id,
        density_score=analysis_result.density_score,
        congestion_level=analysis_result.congestion_level,
        has_incident=analysis_result.is_incident_detected,
        incident_description=analysis_result.incident_reason,
    )

    return analysis_result

@router.get("/preview/{filename}")
async def get_processed_preview(filename: str):
    """Returns an annotated preview snapshot showing detected vehicle bounding boxes."""
    file_path = settings.processed_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Preview frame not found")
    return FileResponse(path=file_path, media_type="image/jpeg")
