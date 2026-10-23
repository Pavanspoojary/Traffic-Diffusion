# Traffic Diffusion

**Emergency Green Corridor Orchestrator & Traffic Intelligence System (Mangaluru Sector)**

---

## 1. Executive Summary

Traffic Diffusion is an intelligent urban emergency mobility platform connecting camera-derived road intelligence, emergency ambulance routing, signal preemption coordination, and hospital readiness telemetry. Rather than competing with general consumer navigation maps, Traffic Diffusion provides the operational workflow and infrastructure coordination required to guide an emergency vehicle swiftly through a congested city.

The system distinguishes between:
- Detected and verified incidents.
- Estimated and measured traffic flow.
- Primary and alternative corridor candidates.
- Requested and acknowledged signal preemption.
- Live vision feeds and explicitly simulated controller adapters.

---

## 2. Key Capabilities

### A. Road Intelligence (CCTV Computer Vision)
- **Vehicle Detection & Classification**: Powered by YOLOv8 nano (cars, trucks, buses, motorcycles) with edge contour fallbacks.
- **Centroid Tracking Across Frames**: Tracks individual vehicles over time to estimate movement status (moving vs. stopped), queue buildup, and stationary duration.
- **Decoupled Congestion & Incident Classification**: Congestion index (`FREE_FLOW`, `MODERATE`, `HEAVY`, `BLOCKED`, `STALE`, `UNKNOWN`) is decoupled from incident status (`SUSPECTED`, `VERIFICATION_PENDING`, `CONFIRMED`, `CLEARED`). A crowded frame is never treated as a blockage unless multi-vehicle stationary queuing is detected.
- **No Fabricated Live Data**: Corrupted streams return structured unavailable errors rather than synthetic vehicle counts. Explicit demo simulations are clearly flagged `[SIMULATED]`.

### B. Emergency Routing Engine
- **Impassable Road Avoidance**: Confirmed closures are strictly excluded from candidate paths using filtered NetworkX subgraphs. If a route is severed, the system returns an explicit `NO_VIABLE_ROUTE` escalation rather than silently routing an ambulance through an accident.
- **Alternative Corridor Candidates**: Calculates both the Primary Green Corridor and secondary viable alternatives with comparative ETAs, distance, and recommendation rationale.
- **Fair Baseline Comparison**: Time-saved metrics are calculated against a fair baseline route under nominal commuter conditions on the same passable network.
- **Rerouting Hysteresis & Audit History**: Suppresses minor ETA jitter (< 15%) while immediately rerouting upon confirmed upstream road blockages.

### C. Green Corridor Orchestrator
- **Junction-Level Request Lifecycle**: Progressively coordinates signals along the corridor:
  `NOT_REQUESTED` -> `REQUESTED` -> `ACKNOWLEDGED` -> `APPROVED` -> `ACTIVE` -> `COMPLETED` / `CANCELLED`.
- **Corridor Coordination State**: Aggregates overall clearance status (`PLANNED`, `COORDINATION_PENDING`, `PARTIALLY_COORDINATED`, `COORDINATED`, `DEGRADED`).
- **Simulated Controller Adapter**: Explicitly labeled `[SIMULATED_ADAPTER]` with operator manual override controls to force an active green wave.
- **Destination Hospital Readiness**: Tracks trauma bay readiness (`READY`, `PREPARING`, `STANDBY`), triage tier (`Level 1 Critical Trauma`), and available specialties.

### D. Dual Mobile & Operations Interfaces
- **Ambulance Driver PWA (`/`)**: High-fidelity Google Maps-style mobile view with turn-by-turn maneuvers, speed limit, road-snapped OSRM geometry, clearance status, and hospital intake telemetry. Free OpenStreetMap tiles with zero API keys or watermarks.
- **Operations Command Center (`/operations`)**: Incident evidence review console, CCTV telemetry, junction coordination table, manual signal overrides, and route option switcher.

---

## 3. Architecture

```
                             Traffic Diffusion Platform
    +-----------------------------------------------------------------------------------+
    |                                 Presentation Layer                                |
    |      - Ambulance Driver PWA: Google Maps Mobile Turn-by-Turn Engine (/)           |
    |      - Operations Command Center: Incident Review, Signals & Readiness (/ops)     |
    +------------------------------------------+----------------------------------------+
                                               |
                                               v
    +-----------------------------------------------------------------------------------+
    |                              FastAPI Service Gateway                              |
    |      - REST Endpoints: /api/v1/cv/* and /api/v1/navigation/*                      |
    +------------------------------------------+----------------------------------------+
                                               |
         +-------------------------------------+-----------------------------------+
         |                                     |                                   |
         v                                     v                                   v
+-------------------------------+ +-------------------------------+ +-------------------------------+
|    Computer Vision Engine     | |   Emergency Routing Engine    | |   Green Corridor Coordinator  |
| - YOLOv8 Vehicle Detection    | | - NetworkX Bidirectional Graph| | - Junction Request Lifecycle  |
| - Frame-to-Frame Centroid Trk | | - Impassable Closure Filter   | | - Dynamic Clearance Waves     |
| - Movement & Queue Estimation | | - Yen's Alternative Corridors | | - Simulated Controller Adapter|
| - Operator Incident Registry  | | - Fair Baseline Calculation   | | - Hospital Bay Readiness      |
+-------------------------------+ +-------------------------------+ +-------------------------------+
```

---

## 4. API Reference

### Computer Vision & Traffic Sensing (`/api/v1/cv`)
- `POST /upload`: Uploads CCTV video clip, runs YOLOv8 + Centroid Tracking, returns density and movement telemetry.
- `POST /analyze-sample`: Analyzes pre-packaged heavy or freeflow traffic sample.
- `GET /incidents`: Lists active road incidents in sector.
- `POST /incidents/{incident_id}/verify`: Operator action to `CONFIRM`, `DISMISS`, or `CLEAR` a suspected blockage.
- `GET /preview/{filename}`: Returns annotated detection snapshot image.

### Navigation & Corridor Coordination (`/api/v1/navigation`)
- `GET /network`: Returns Mangaluru road network, nodes, edges, active incidents, and telemetry.
- `POST /route`: Calculates Primary Green Corridor, viable alternatives, baseline time, and junction preemption wave.
- `GET /corridor/{route_id}`: Returns junction-by-junction clearance states and ETAs.
- `POST /corridor/override`: Operator manual preemption command to force an active green wave on a specific junction.
- `POST /simulate-incident`: Injects or clears a road blockage on an edge.
- `POST /reset`: Resets network state back to clean seed values.

---

## 5. Quickstart & Verification

```bash
# 1. Activate environment
source .venv/bin/activate

# 2. Run automated test suite (16 tests)
pytest

# 3. Start development server
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

- Ambulance Driver Navigation PWA: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- Operations Command Center: [http://127.0.0.1:8000/operations](http://127.0.0.1:8000/operations)
- Interactive API Documentation: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
