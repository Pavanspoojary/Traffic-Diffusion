from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.app.config import settings
from backend.app.api.routes_intelligence import router as intelligence_router
from backend.app.api.routes_cv import router as cv_router
from backend.app.api.routes_navigation import router as navigation_router

app = FastAPI(
    title="Traffic Diffusion — Predictive Traffic Intelligence & Intervention Planning Platform",
    version="3.0.0",
    description="Intelligent Urban Mobility Platform: Spatiotemporal Incident Impact Forecasting, Cascading Congestion Analysis, Prioritized Risk Assessment, and What-If Intervention Planning.",
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
app.include_router(intelligence_router)
app.include_router(navigation_router)
app.include_router(cv_router)

@app.get("/health")
async def health_check():
    """System health check endpoint."""
    return {
        "status": "healthy",
        "service": "Traffic Diffusion - Predictive Traffic Intelligence",
        "version": "3.0.0",
        "platform_purpose": "Predictive Incident Impact Forecasting & What-If Intervention Planning",
    }

@app.api_route("/driver", methods=["GET", "HEAD"])
async def driver_page():
    """Secondary supporting view: Field EMS Ambulance Navigator."""
    return FileResponse(settings.base_dir / "frontend" / "driver.html")

@app.api_route("/operations", methods=["GET", "HEAD"])
async def operations_page():
    """Secondary supporting view: CCTV & Legacy Operations Console."""
    return FileResponse(settings.base_dir / "frontend" / "operations.html")

@app.api_route("/login", methods=["GET", "HEAD"])
async def login_page():
    """Citizen portal login view."""
    return FileResponse(settings.base_dir / "frontend" / "login.html")

@app.api_route("/public", methods=["GET", "HEAD"])
async def public_page():
    """Public live map with emergency incident reporting."""
    return FileResponse(settings.base_dir / "frontend" / "public.html")


# Mount static frontend files
frontend_dir = settings.base_dir / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
