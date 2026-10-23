# Traffic-Diffusion

**Predictive Traffic Intelligence, Incident Ingestion & Intervention Planning Platform**

---

## 1. Executive Overview

Urban traffic management centers traditionally operate reactively: operators detect congestion only after queues have formed, gridlock has cascaded across adjacent junctions, and transit corridors are paralyzed.

**Traffic-Diffusion** transforms urban traffic operations from reactive monitoring to **predictive traffic intelligence, citizen incident ingestion, and automated intervention planning**. Designed for municipal traffic operations analysts, control-room dispatchers, and city planners, the platform bridges the gap between public road observers and tactical traffic command.

The platform coordinates two dedicated, role-specific products backed by an analytical graph and spatiotemporal modeling engine for the **Mangaluru Metropolitan Sector (NH-66 / NH-73)**:

1. **Public Citizen Navigation & Incident Reporting App (`/public` & `/login`)**: A map-driven web application where commuters view live corridor statuses and submit geo-tagged incident reports with live camera evidence.
2. **Traffic Police & Control Room Operators Command Center (`/`)**: A pure operational dashboard (no map view needed) designed for high data density, spatiotemporal queue spread forecasting (T+15m, T+30m, T+60m), 4-component risk prioritization, what-if intervention modeling, tactical unit dispatching, and strategic municipal planning.

---

## 2. Product Architecture & User Personas

### Product 1: Public Citizen Navigation & Road Incident Reporting App (`/public` & `/login`)

- **Primary Persona**: Daily commuters, commercial drivers, and citizens navigating Mangaluru.
- **Entry Points**:
  - Citizen Access Portal: `http://127.0.0.1:8000/login`
  - Citizen Live Map & Reporting: `http://127.0.0.1:8000/public`
- **Capabilities**:
  - **Live City Corridor Status Map**: Interactive Leaflet interface displaying Mangaluru arterials classified by real-time flow (`Blocked / Heavy`, `Moderate Flow`, `Nominal Traffic`, `Emergency Green Corridor`).
  - **Citizen Profile Integration**: Personalized access tracking user identity and locality.
  - **Prominent Emergency Floating Action Button (FAB `+`)**: One-tap access to report road emergencies, collisions, waterlogging, or stalled vehicles.
  - **Incident Reporting Modal**:
    - Automatic GPS geolocation detection.
    - Incident category classification: `ACCIDENT`, `BREAKDOWN`, `WATERLOGGING`, `ROAD_HAZARD`, `EMERGENCY_VEHICLE_OBSTACLE`, `OTHER` (with custom subject input).
    - Camera-only live photo capture for visual verification.
    - Lane impact selector and descriptive notes.
  - **Real-Time Control Room Pipeline**: Submits directly to the backend (`POST /api/v1/intelligence/citizen-reports`), instantly streaming into the Traffic Police Command Center queue for verification.

---

### Product 2: Traffic Police & Control Room Operators Command Center (`/`)

- **Primary Personas**:
  - **Traffic Police Dispatchers & Control Room Operators**: Active incident handling, verification, queue prediction, and tactical resource deployment.
  - **City Traffic Planners & Municipal Road Authorities**: Long-term bottleneck mining, diurnal peak analysis, and infrastructure investment simulation.
- **Entry Point**: `http://127.0.0.1:8000/`
- **Key Modules**:
  1. **Inbound Citizen Reports Queue**:
     - Displays live incident submissions from the public app.
     - Single-click **[Verify & Forecast]** action: Confirms the citizen report, registers an active incident, and immediately triggers the network-wide spread model.
  2. **Disruption Event Controller**:
     - Instant demo presets: `Nanthoor Rollover`, `Bunts Flood`, `MG Road Bus` with active pill indicators.
     - Parameter customization: Affected corridor, incident category, severity, capacity reduction percentage, and estimated clearance duration.
  3. **Congestion Spread Forecast Engine**:
     - Multi-horizon temporal projections across **T+15 min**, **T+30 min**, and **T+60 min**.
     - Calculates queue length accumulation (meters), excess volume backlog (PCU), upstream feeder spillback, and diversion-loaded bypass arterials.
     - **In-Cell Load Meters**: Impacted Corridors Table features color-coded micro-meter bars for Volume-to-Capacity (V/C) ratios (`1.85 [████████░░]`).
     - **Critical Saturated Junctions Monitor**: Real-time capacity overload meters highlighting intersections exceeding $\ge 70\%$ capacity.
  4. **Prioritized Chokepoint Risk Ranking (0 - 100 Index)**:
     - Decomposed horizontal component bars: Severity (25 pts), V/C Load (25 pts), Centrality & Dependency (25 pts), and Diversion Deficit (25 pts).
     - Color-coded micro-legends and actionable tactical directives.
  5. **What-If Intervention Optimization Matrix**:
     - Simulates candidate operational responses under identical initial conditions:
       - **Baseline**: Unmitigated queue propagation and cascading gridlock.
       - **Scenario A**: Upstream Variable Message Sign (VMS) diversion.
       - **Scenario B**: Rapid heavy recovery tow clearance.
       - **Scenario C**: Emergency shoulder lane opening.
       - **Scenario D (Optimal)**: Integrated multi-agency protocol (diversion + tow dispatch + adaptive green signal priority).
     - Highlights the **Recommended Action Plan** with net travel time savings and delay reduction percentage.
     - **1-Click "Apply & Pre-fill Deployment"**: Automatically populates the tactical dispatch console with the optimal mitigation strategy.
  6. **Traffic Police & Tactical Resource Deployment Console**:
     - Deploy Traffic Police Officers, Heavy Tow Recovery Cranes, Patrol Interceptors, or Rapid Response Teams (QRT).
     - Quick-action directive chips (`Signal Override`, `NH-66 Diversion`, `Crane Extraction`, `Transit Clearing`).
     - **Interactive Status Progression**: Advance active units through operational lifecycles (`DISPATCHED` &rarr; `EN_ROUTE` &rarr; `ON_SCENE` &rarr; `RESOLVED`) via live REST PATCH calls.
  7. **City Traffic Planners & Authority Console (Header Tab)**:
     - **Diurnal Traffic Variation Report**: Speed degradation and volume loading across Morning Peak (`24.5 km/h`, V/C `1.28`), Mid-Day Off-Peak (`41.2 km/h`, V/C `0.62`), and Evening Peak (`21.8 km/h`, V/C `1.42`).
     - **Capital Infrastructure Proposals**: Data-driven structural proposals (Nanthoor 4-Lane Grade-Separated Flyover, Bunts Hostel Adaptive Signal Phase & Slip Lane, K.S. Rao Bus Bay Indentation, Pumpwell Flood Culvert Expansion).
     - **What-If Infrastructure ROI Simulator**: Evaluates network delay reductions for structural additions (+1 lane capacity, flyover construction).

---

### Supporting Views

- **Field Ambulance Turn-by-Turn Navigator (`/driver`)**: Mobile-first navigation PWA with road-following geometry (OSRM), hospital trauma bay readiness, and signal preemption status.
- **Operations & CCTV Vision Ingestion (`/operations`)**: Computer vision pipeline powered by YOLOv8 and multi-frame centroid tracking for vehicle classification, queue duration measurement, and video verification.

---

## 3. End-to-End Operational Workflow

```
[ Citizen Commuter on Road (/public) ]
               |
               v (Submits GPS hazard with photo evidence)
[ Inbound Citizen Reports Queue ]
               |
               v (Operator clicks [Verify & Forecast])
[ Spatiotemporal Congestion Engine ]  -->  Forecasts Network Spread (T+15m, T+30m, T+60m)
               |
               v
[ 4-Component Risk Prioritization ]   -->  Ranks Chokepoints (Sev 25, V/C 25, Net 25, Div 25)
               |
               v
[ What-If Intervention Evaluator ]    -->  Compares Scenarios A, B, C, D vs. Baseline
               |
               v (Operator clicks [Apply Recommended Action])
[ Tactical Police Deployment Console ] -->  Dispatches Units (DISPATCHED -> EN_ROUTE -> ON_SCENE)
```

---

## 4. API Reference

### Predictive Intelligence & Operations Endpoints (`/api/v1/intelligence`)

| Method | Endpoint | Description |
|:---|:---|:---|
| `GET` | `/citizen-reports` | List incoming citizen road incident reports submitted via `/public`. |
| `POST` | `/citizen-reports` | Submit a citizen incident report (hazard, breakdown, collision, flood). |
| `POST` | `/citizen-reports/{id}/verify` | Control room operator action to verify report and auto-spawn active incident. |
| `POST` | `/incidents` | Register or update an active traffic incident with lane blockage details. |
| `GET` | `/incidents` | Retrieve all registered incidents and their operational statuses. |
| `GET` | `/incidents/{incident_id}` | Retrieve details for a specific incident. |
| `POST` | `/forecast` | Generate multi-horizon impact forecast (15m, 30m, 60m) for an incident. |
| `GET` | `/risk-assessment` | Retrieve prioritized risk ranking of road corridors and saturated junctions. |
| `POST` | `/interventions/evaluate` | Simulate and evaluate What-If intervention scenarios (A, B, C, D vs. Baseline). |
| `GET` | `/dispatches` | List active resource dispatch orders (police officers, tow units, patrol cars). |
| `POST` | `/dispatches` | Dispatch tactical traffic officers or equipment to specific junctions. |
| `PATCH` | `/dispatches/{id}` | Update status of active dispatch order (DISPATCHED &rarr; EN_ROUTE &rarr; ON_SCENE &rarr; RESOLVED). |
| `GET` | `/planner/infrastructure-recommendations` | Get structural municipal road recommendations (flyovers, slip lanes). |
| `GET` | `/planner/traffic-patterns` | Macro traffic pattern analysis (Morning Peak vs. Mid-Day vs. Evening Peak). |
| `POST` | `/planner/simulate-infrastructure` | What-If Infrastructure simulator (+1 lane, grade-separated overpass). |
| `POST` | `/demo-scenario` | Load pre-configured incident scenarios (Nanthoor Rollover, Bunts Flood, MG Road Bus). |
| `GET` | `/historical/analytics` | Retrieve historical hotspot analysis, peak hour distributions, and MTTC. |

### Supporting Endpoints

- `GET /api/v1/navigation/network`: Retrieves the complete Mangaluru road network topology, active incidents, and telemetry.
- `POST /api/v1/navigation/route`: Calculates emergency green corridors with OSRM street-following geometry.
- `POST /api/v1/navigation/reset`: Resets road network conditions to nominal baseline.
- `POST /api/v1/cv/upload`: Processes uploaded CCTV footage using YOLOv8 and multi-frame centroid tracking.

---

## 5. Quickstart & Installation

### Prerequisites
- Python 3.11+
- Git

### Installation

```bash
# 1. Clone repository
git clone https://github.com/Pavanspoojary/Traffic-Diffusion.git
cd Traffic-Diffusion

# 2. Set up virtual environment and install dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 3. Run automated verification test suite (26 tests)
pytest

# 4. Start the application server
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Accessing the Web Portals
- **Traffic Police & Control Room Command Center**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- **Public Citizen Live Map & Incident Reporter**: [http://127.0.0.1:8000/public](http://127.0.0.1:8000/public)
- **Citizen Access Portal (Login)**: [http://127.0.0.1:8000/login](http://127.0.0.1:8000/login)
- **Field Ambulance Turn-by-Turn Navigator**: [http://127.0.0.1:8000/driver](http://127.0.0.1:8000/driver)
- **CCTV Video Sensing & Operations Console**: [http://127.0.0.1:8000/operations](http://127.0.0.1:8000/operations)
- **Interactive OpenAPI Specification**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## 6. Demonstration Script

1. **Citizen Incident Reporting**:
   - Navigate to [http://127.0.0.1:8000/public](http://127.0.0.1:8000/public).
   - Click the red floating action button (`+`) in the bottom-right corner.
   - Select incident category (e.g. `COLLISION`), enter description, capture/attach live photo, and click **Submit Incident Report**.
2. **Control Room Ingestion & Verification**:
   - Open the **Traffic Police Command Center** at [http://127.0.0.1:8000/](http://127.0.0.1:8000/).
   - In the **Citizen Incident Reports Queue**, notice the new incoming report.
   - Click **Verify & Forecast**. The system confirms the report, spawns an active disruption on the road corridor, and calculates the network impact.
3. **Multi-Horizon Spread Analysis**:
   - Switch between **T+15m**, **T+30m**, and **T+60m** horizons.
   - Observe the expanding queue length accumulation, PCU backlog, and corridor V/C ratio bars in the **Network Corridors Impact Progression Table**.
   - Review critical intersection saturation ratios ($\ge 70\%$) in the **Critical Junction Saturation Monitor**.
4. **Intervention Comparison & Dispatch**:
   - In the **What-If Intervention Optimization Matrix**, compare Baseline against Scenarios A, B, C, and D.
   - Under the green **Recommended Action Plan** banner, click **Apply & Pre-fill Deployment Console**.
   - Review the pre-populated target junction and operational directive in the **Field Resource Deployment Console**.
   - Click **Dispatch Tactical Unit to Scene**.
   - In the **Active Field Dispatches Ledger**, observe the new unit and use the interactive lifecycle button to advance status: `DISPATCHED` &rarr; `EN_ROUTE` &rarr; `ON_SCENE` &rarr; `RESOLVED`.
5. **City Traffic Planning & Infrastructure**:
   - In the top header navigation, click **City Traffic Planners & Authority**.
   - Review diurnal peak speed variations and the four data-driven capital infrastructure proposals.
   - Use the **What-If Infrastructure Modeling Simulator** to test adding a lane or constructing a flyover at Nanthoor Junction and inspect projected vehicle-hours saved.

---

## 7. Modeling Assumptions, Transparency & Limitations

- **Simulated vs. Observed Data**: Traffic-Diffusion strictly flags all analytical outputs. Vision-derived inputs and confirmed field reports are labeled `[OBSERVED]`, while projected network states and what-if scenarios are labeled `[SIMULATION_BASED_ESTIMATE]`.
- **Road Network Topology**: The Mangaluru sector network is modeled as a strongly connected directed multigraph ($G = (V, E)$) comprising 17 key junctions and 38 arterial edges with calibrated baseline speeds and capacities.
- **Traffic Propagation Model**: Queue accumulation and spillback calculations utilize empirical macroscopic flow models and Bureau of Public Roads (BPR) volume-delay relationships ($t = t_0 \cdot [1 + \alpha (V/C)^\beta]$).
- **Zero Emojis Policy**: All user interfaces, consoles, badges, and documentation strictly utilize semantic SVG iconography and crisp typography in accordance with enterprise ITMS standards.
