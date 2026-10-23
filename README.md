# Traffic Diffusion

**Smart Mobility and Traffic Intelligence Platform for Emergency Green Corridors**

---

## 1. Executive Summary

Traffic Diffusion is an intelligent urban mobility platform built for emergency response optimization during heavy traffic congestion and road incident blockages. Designed for rapid emergency transit, the system ingests CCTV traffic video feeds across critical city corridors, calculates dynamic vehicular density and lane blockage status using Computer Vision, and computes real-time Green Corridors for emergency medical services (EMS).

---

## 2. Key Capabilities

- **CCTV Video Sensing**: Supports automated vehicle detection (cars, trucks, buses, motorcycles) and flow density tracking from uploaded traffic surveillance footage.
- **Dynamic Congestion Scoring**: Continuous calculation of corridor congestion indices (`FREE_FLOW`, `MODERATE`, `HEAVY`, `BLOCKED`) based on weighted vehicle capacity.
- **Emergency Green Corridor Dispatch**: Graph-based shortest-path routing (Dijkstra / A*) that dynamically diverts ambulances around active collisions and heavy bottlenecks.
- **Signal Preemption Telemetry**: Quantifies traffic signals along the emergency corridor to coordinate priority signal green waves.
- **Interactive Command Dashboard**: Operations interface combining live road network mapping (Leaflet), video inspection, telemetry counters, and live incident simulation.

---

## 3. Architecture

```
                                  Traffic Diffusion Platform
    +-----------------------------------------------------------------------------------+
    |                                 Presentation Layer                                |
    |      - Interactive Operations Dashboard (Leaflet Dark Matter CartoDB)             |
    |      - CCTV Video Ingestion & Annotated Detection Frame Viewer                   |
    |      - Emergency Route Telemetry & Signal Preemption Metrics                      |
    +------------------------------------------+----------------------------------------+
                                               |
                                               v
    +-----------------------------------------------------------------------------------+
    |                              FastAPI Service Gateway                              |
    |      - REST Endpoints: /api/v1/cv/* and /api/v1/navigation/*                      |
    |      - Static Asset & Dashboard Hosting                                           |
    +------------------------------------------+----------------------------------------+
                                               |
                     +-------------------------+-------------------------+
                     |                                                   |
                     v                                                   v
    +----------------------------------+       +----------------------------------+
    |      Computer Vision Engine      |       |    Routing Intelligence Engine   |
    |  - YOLOv8 Vehicle Detection      |       |  - NetworkX Directed Graph       |
    |  - Sampled Frame Processing      |       |  - Dynamic Weight Penalty Matrix |
    |  - Capacity Density Estimator    |       |  - Emergency Dijkstra Optimizer  |
    |  - Bottleneck & Accident Flag    |       |  - Real-time Incident Avoidance  |
    +----------------------------------+       +----------------------------------+
```

---

## 4. Repository Structure

```
Traffic-Diffusion/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                     # FastAPI application entrypoint & static mount
│   │   ├── config.py                   # System configuration & thresholds
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── routes_cv.py            # Video upload, processing & preview endpoints
│   │   │   └── routes_navigation.py    # Road network, routing & incident simulation
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   └── schemas.py              # Pydantic schemas for telemetry and requests
│   │   └── services/
│   │       ├── __init__.py
│   │       ├── cv_service.py           # Computer vision video analysis & vehicle detection
│   │       └── routing_service.py      # NetworkX graph model & emergency green corridor
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_cv.py                  # Computer vision and density tests
│   │   ├── test_routing.py             # Dijkstra and dynamic rerouting unit tests
│   │   └── test_api_integration.py    # FastAPI endpoint integration tests
│   └── requirements.txt
├── data/
│   ├── seed_network.json               # Seed urban road network with EMS & hospitals
│   └── samples/
│       ├── generate_sample_video.py    # Synthetic CCTV traffic video generator
│       ├── cctv_sample_heavy.mp4       # Generated sample heavy traffic footage
│       └── cctv_sample_freeflow.mp4    # Generated sample free-flow traffic footage
├── frontend/
│   ├── index.html                      # Single-page operations dashboard
│   ├── css/
│   │   └── style.css                   # Enterprise control center styling
│   └── js/
│       ├── app.js                      # Application state and API integration
│       └── map.js                      # Leaflet map controller and corridor visualizer
├── .gitignore
├── pytest.ini
└── README.md
```

---

## 5. Team Collaboration & Git Hygiene Guide

This repository supports a 4-person engineering team working under accelerated hackathon timelines:

### Branch Governance
- `main`: Protected production branch, managed strictly by the repository leads. Direct pushes to `main` are restricted.
- Feature branches: All team members develop on dedicated feature branches:
  - `feat/cv-pipeline`: Video frame extraction, vehicle counting, model optimization.
  - `feat/routing-engine`: Graph modeling, signal coordination, multi-destination dispatch.
  - `feat/dashboard-ui`: Frontend enhancements, heatmaps, responsive layouts.
  - `feat/telemetry-api`: Real-time streaming, WebSocket events, export services.

### Synchronization Standard
Always sync before starting work or submitting pull requests:
```bash
git fetch origin
git checkout main
git pull origin main
git checkout -b feat/your-feature-name
```

### Commit Standard
Follow the Conventional Commits specification:
- `feat: add real-time vehicle speed estimation`
- `fix: resolve edge weight overflow in Dijkstra routing`
- `docs: update API documentation for corridor upload`
- `test: add unit test for multi-hospital triage`

---

## 6. Quickstart Guide

### Prerequisites
- Python 3.10 or 3.11
- Git

### 1. Clone & Set Up Environment
```bash
git clone https://github.com/Pavanspoojary/Traffic-Diffusion.git
cd Traffic-Diffusion

python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

### 2. Run the Platform
Start the unified application (FastAPI backend + integrated dashboard):
```bash
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```
Open your browser to:
- **Interactive Dashboard**: `http://localhost:8000`
- **Interactive API Documentation (Swagger)**: `http://localhost:8000/docs`

### 3. Run Test Suite
Verify all systems and integration tests:
```bash
pytest -v
```

---

## 7. Core API Specifications

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health status check |
| `GET` | `/api/v1/navigation/network` | Retrieves the complete road network state, nodes, and live edge conditions |
| `POST` | `/api/v1/navigation/route` | Computes dynamic Green Corridor ambulance route with incident avoidance |
| `POST` | `/api/v1/navigation/simulate-incident` | Injects or clears road blockages to test real-time rerouting |
| `POST` | `/api/v1/navigation/reset` | Resets all edge weights and incidents to seed baseline |
| `POST` | `/api/v1/cv/upload` | Ingests a CCTV video file, runs CV detection, and updates corridor congestion |
| `POST` | `/api/v1/cv/analyze-sample` | Evaluates packaged CCTV footage (`heavy` or `freeflow`) for instant testing |
| `GET` | `/api/v1/cv/preview/{filename}` | Serves annotated frame snapshot with vehicle bounding boxes |

---

## 8. License

Developed for the 2026 Smart Mobility & Traffic Intelligence Hackathon.
