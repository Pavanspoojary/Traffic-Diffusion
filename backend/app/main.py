from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.app.config import settings
from backend.app.api.routes_cv import router as cv_router
from backend.app.api.routes_navigation import router as navigation_router

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="Intelligent Emergency Mobility Platform: CCTV Video Sensing, Dynamic Congestion Analytics, and Green Corridor Ambulance Routing",
)

# Cross-Origin Resource Sharing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routers
app.include_router(cv_router)
app.include_router(navigation_router)

@app.get("/health")
async def health_check():
    """System health check endpoint."""
    return {
        "status": "healthy",
        "service": settings.app_name,
        "version": settings.version,
    }

# Mount static frontend
frontend_dir = settings.base_dir / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
