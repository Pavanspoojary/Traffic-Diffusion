import os
from pathlib import Path
from pydantic import BaseModel

class AppSettings(BaseModel):
    app_name: str = "Traffic Diffusion Emergency Intelligence"
    version: str = "1.0.0"
    debug: bool = False
    
    # Path resolution
    base_dir: Path = Path(__file__).resolve().parent.parent.parent
    upload_dir: Path = base_dir / "data" / "uploads"
    processed_dir: Path = base_dir / "data" / "processed"
    seed_network_path: Path = base_dir / "data" / "seed_network.json"
    
    # Computer Vision parameters
    yolo_model_name: str = "yolov8n.pt"
    detection_confidence: float = 0.35
    target_fps_sample: int = 5  # Sample rate for CCTV video frame analysis
    
    # Traffic Congestion Thresholds (0.0 to 1.0 density)
    density_moderate_threshold: float = 0.35
    density_heavy_threshold: float = 0.70
    density_blocked_threshold: float = 0.88
    
    # Emergency routing penalty for blocked road segments
    blocked_penalty_weight: float = 1e6

settings = AppSettings()

# Ensure data directories exist
settings.upload_dir.mkdir(parents=True, exist_ok=True)
settings.processed_dir.mkdir(parents=True, exist_ok=True)
