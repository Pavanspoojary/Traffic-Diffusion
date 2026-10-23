# Traffic-Diffusion

**Predictive Traffic Intelligence & Intervention Planning Platform**

---

## 1. Executive Overview

Urban traffic management centers traditionally operate reactively: operators detect congestion only after queues have formed, gridlock has cascaded across adjacent junctions, and transit corridors are paralyzed.

**Traffic-Diffusion** transforms urban traffic operations from reactive monitoring to **predictive traffic intelligence and automated intervention planning**. Designed for municipal traffic operations analysts and control-room dispatchers, the platform models how a localized road incident propagates across an arterial network over multi-step temporal horizons (T+15m, T+30m, T+60m), quantifies network-wide risk through an explainable multi-factor index, simulates alternative mitigation strategies under what-if scenarios, and ranks actionable intervention plans by total vehicle-hours of delay saved.

### The Dual Dashboard Architecture

Traffic-Diffusion provides two complementary interfaces designed for distinct user roles:

1. **Dashboard 1: Public Citizen Navigator & Incident Reporter (`/driver` & `/public`)**
   - **Target User**: General driving public and daily commuters.
   - **Purpose**: Google Maps-style mobile web app with street-level road-following geometry (OSRM), turn-by-turn maneuvers, speed limits, and a one-tap citizen incident reporting module.
   - **Citizen Ingestion**: Commuters report road hazards, collisions, stalled vehicles, or waterlogging directly into the municipal control room queue.

2. **Dashboard 2: Tactical Command & Urban Planning Center (`/`)**
   - **Target Users**:
     - **Traffic Police and Control-Room Operators**: Review incoming citizen reports, run multi-horizon congestion spread forecasts (15m, 30m, 60m), prioritize risky junctions, evaluate what-if intervention plans, and **dispatch traffic police officers, heavy tow units, and patrol interceptors** to critical bottlenecks.
     - **City Traffic Planners and Road Authorities**: Mine historical incident records to identify recurring chokepoints, analyze macro traffic patterns (morning peak vs. evening peak), evaluate municipal infrastructure proposals (e.g., Nanthoor Flyover, Bunts Hostel slip lanes), and simulate what-if infrastructure upgrades (+1 lane capacity, grade separation).

---

### The Core Operational Workflow

```
[ Incident Ingestion / Detection ]
               |
               v
[ Spatiotemporal Propagation Engine ]  -->  Forecasts Network Impact (T+15m, T+30m, T+60m)
               |
               v
[ Multi-Factor Risk Assessment ]       -->  Prioritizes At-Risk Corridors & Saturated Junctions
               |
               v
[ What-If Intervention Simulator ]     -->  Models Diversions, Tow Dispatch & Shoulder Clearing
               |
               v
[ Side-by-Side Scenario Evaluator ]    -->  Compares Net Delay Saved & Spillback Reduction
               |
               v
[ Recommended Action Plan ]            -->  Operator Dispatches Coordinated Strategy
```

---

## 2. Core Capabilities

### A. Predictive Incident Impact Engine
- **Spatiotemporal Propagation**: Projects localized flow restrictions into multi-horizon queue accumulation, upstream feeder spillback, downstream starved bottlenecks, and diversion bypass loading across 15, 30, and 60-minute windows.
- **BPR Delay Formulation**: Uses Bureau of Public Roads (BPR) volume-over-capacity functions to calculate realistic congestion delays as volume nears and exceeds capacity ($t = t_0 \cdot [1 + \alpha (V/C)^\beta]$).
- **Multi-Horizon Network Snapshots**: Provides discrete network state forecasts (T+15m, T+30m, T+60m) with segment-by-segment speed degradation, queue length estimation, volume-over-capacity ratios, and upstream feeder flags.
- **Critical Junction Saturation**: Computes junction-level volume load ratios and flags intersections entering critical saturation (saturation index $\ge 0.70$).

### B. Explainable Multi-Factor Risk Prioritization
Calculates a transparent 0-100 composite risk score for every road segment and junction, decomposed into four explainable components:
1. **Disruption Severity (Max 25 pts)**: Incident classification and lane closure ratio.
2. **Volume-to-Capacity Load (Max 25 pts)**: Congestion stress and queue density relative to baseline flow.
3. **Network Centrality & Dependency (Max 25 pts)**: Graph betweenness centrality and arterial criticality.
4. **Diversion Deficit (Max 25 pts)**: Lack of immediate high-capacity alternate bypass routes.

### C. What-If Intervention Planning & Optimization
Simulates and evaluates operational responses against an unmitigated Baseline:
- **Baseline (No Action)**: Natural propagation of queue buildup and cascading congestion.
- **Scenario A (Upstream VMS Diversion)**: Dynamic Variable Message Sign (VMS) advisory diverting 25% of incoming demand away from the affected corridor.
- **Scenario B (Rapid Tow Clearance)**: Dispatch of heavy tow units with a modeled 7-minute response latency, clearing obstructions early.
- **Scenario C (Emergency Shoulder Lane Opening)**: Dynamic shoulder utilization restoring 50% of lost lane capacity.
- **Scenario D (Coordinated Action Plan)**: Integrated multi-agency protocol combining upstream diversion, rapid tow dispatch, and adaptive green signal priority.

Outputs a side-by-side comparison matrix with net vehicle-hours saved, peak queue reduction, spillback suppression, implementation feasibility, and an automated optimal strategy recommendation.

### D. Historical Pattern & Recurrence Analytics
- Mines historical incident records to detect chronic congestion corridors and high-probability incident clusters.
- Analyzes peak-hour distributions, day-of-week recurrence patterns, and Mean Time to Clear (MTTC) by incident type (rollover, breakdown, waterlogging, collision).
- Correlates historical patterns against real-time forecasts to surface early warnings for known chronic bottlenecks.

### E. Integrated Supporting Capabilities
- **Field Ambulance Navigation (`/driver`)**: Turn-by-turn emergency navigation Progressive Web App (PWA) with live road-snapped OSRM geometry, preemption status, and hospital trauma bay readiness.
- **CCTV Video Sensing (`/operations`)**: Computer vision pipeline powered by YOLOv8 and multi-frame centroid tracking for vehicle classification, queue duration measurement, and incident verification.

---

## 3. System Architecture

```
                              Traffic-Diffusion Platform
+---------------------------------------------------------------------------------------+
|                                  Presentation Layer                                   |
|   - Predictive Intelligence Workspace (/)       : Horizon Tabs, Risk Rankings,        |
|                                                   Intervention Matrix, Analytics      |
|   - Ambulance Field Navigator (/driver)         : Mobile Turn-by-Turn OSRM PWA        |
|   - Operations Command Center (/operations)     : CCTV Ingestion & Verification       |
+-------------------------------------------+-------------------------------------------+
                                            |
                                            v
+---------------------------------------------------------------------------------------+
|                               FastAPI Service Gateway                                 |
|   - /api/v1/intelligence/*  : Incidents, Forecasts, Risk, Interventions, Historical   |
|   - /api/v1/navigation/*    : Network Graph, Dynamic Corridors, OSRM Snap             |
|   - /api/v1/cv/*            : CCTV Video Processing, Centroid Tracking, Telemetry     |
+-------------------------------------------+-------------------------------------------+
                                            |
         +----------------------------------+----------------------------------+
         |                                  |                                  |
         v                                  v                                  v
+-----------------------+      +-----------------------+      +-----------------------+
| Prediction Engine     |      | Risk Analysis Service |      | Intervention Planner  |
| - Spatiotemporal Queue|      | - Severity Index (25) |      | - Scenario Simulator  |
| - Upstream Spillback  |      | - V/C Ratio Score (25)|      | - Delay Saved Metric  |
| - Downstream Starve   |      | - Betweenness Central |      | - Spillback Avoidance |
| - Diversion Loading   |      | - Diversion Deficit   |      | - Optimal Action Rank |
+-----------------------+      +-----------------------+      +-----------------------+
         |                                  |                                  |
         +----------------------------------+----------------------------------+
                                            |
                                            v
                               +-------------------------+
                               | Historical & Graph Core |
                               | - NetworkX Mangaluru    |
                               | - 20+ Calibrated Events |
                               | - Recurring Hotspot Miner|
                               +-------------------------+
```

---

## 4. API Reference

### Predictive Intelligence Endpoints (`/api/v1/intelligence`)

| Method | Endpoint | Description |
|:---|:---|:---|
| `POST` | `/incidents` | Register or update an active traffic incident with lane blockage details. |
| `GET` | `/incidents` | Retrieve all registered incidents and their operational statuses. |
| `GET` | `/incidents/{incident_id}` | Retrieve details for a specific incident. |
| `POST` | `/forecast` | Generate multi-horizon impact forecast (15m, 30m, 60m) for an incident. |
| `GET` | `/risk-assessment` | Retrieve prioritized risk ranking of road corridors and saturated junctions. |
| `POST` | `/interventions/evaluate` | Simulate and evaluate What-If intervention scenarios (A, B, C, D vs. Baseline). |
| `GET` | `/historical/analytics` | Retrieve historical hotspot analysis, peak hour distributions, and MTTC. |
| `POST` | `/historical/import` | Ingest historical incident records into the analytical database. |
| `POST` | `/demo-scenario` | Load pre-configured incident scenarios (Nanthoor Rollover, Bunts Waterlogging, etc.). |
| `GET` | `/citizen-reports` | List incoming citizen road incident reports submitted via the public app. |
| `POST` | `/citizen-reports` | Submit a citizen incident report (hazard, breakdown, collision, flood). |
| `POST` | `/citizen-reports/{id}/verify` | Control room operator action to verify report and auto-spawn active incident. |
| `GET` | `/dispatches` | List active resource dispatch orders (police officers, tow units, patrol cars). |
| `POST` | `/dispatches` | Dispatch tactical traffic officers or equipment to specific junctions. |
| `PATCH` | `/dispatches/{id}` | Update status of active dispatch order (DISPATCHED -> EN_ROUTE -> ON_SCENE). |
| `GET` | `/planner/infrastructure-recommendations` | Get structural municipal road recommendations (flyovers, slip lanes). |
| `GET` | `/planner/traffic-patterns` | Macro traffic pattern analysis (Morning Peak vs. Mid-Day vs. Evening Peak). |
| `POST` | `/planner/simulate-infrastructure` | What-If Infrastructure simulator (+1 lane, grade-separated overpass). |

### Supporting Endpoints

- `GET /api/v1/navigation/network`: Retrieves the complete Mangaluru road network topology, active incidents, and telemetry.
- `POST /api/v1/navigation/route`: Calculates emergency green corridors with OSRM street-following geometry.
- `POST /api/v1/cv/upload`: Processes uploaded CCTV footage using YOLOv8 and multi-frame centroid tracking.

---

## 5. Quickstart & Verification

### Prerequisites
- Python 3.11+
- Git

### Installation & Execution

```bash
# 1. Clone repository
git clone https://github.com/Pavanspoojary/Traffic-Diffusion.git
cd Traffic-Diffusion

# 2. Set up virtual environment and install dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 3. Run automated test suite (26 tests)
pytest

# 4. Start the application
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Accessing the Interfaces
- **Predictive Traffic Intelligence Workspace**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- **Field Ambulance Navigator PWA**: [http://127.0.0.1:8000/driver](http://127.0.0.1:8000/driver)
- **Operations & CCTV Command Center**: [http://127.0.0.1:8000/operations](http://127.0.0.1:8000/operations)
- **Interactive OpenAPI Documentation**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## 6. End-to-End Demo Walkthrough

1. Open the **Predictive Traffic Intelligence Workspace** at `http://127.0.0.1:8000/`.
2. Click **Nanthoor Freight Rollover** under **Quick Demo Scenarios**.
   - Notice the incident automatically populates the form (Freight Vehicle Rollover on Nanthoor - Kadri Arterial, 2 lanes closed, critical severity).
3. The platform executes the **Incident Impact Forecast**:
   - The interactive Leaflet map renders the direct disruption corridor (red dashed), upstream spillback feeder corridors (amber/orange), and diversion-loaded bypass corridors (cyan).
   - Toggle through the temporal horizon tabs: **T+15m**, **T+30m**, and **T+60m**. Observe how the estimated queue expands from 480 meters to 1,920 meters, and upstream spillback cascades through adjacent junctions.
4. Review the **Prioritized Risk Assessment**:
   - Inspect the ranked corridors. Examine the four-component breakdown bars: Severity, V/C Load, Network Centrality, and Diversion Deficit.
   - Saturated junctions entering critical loads ($\ge 70\%$) are highlighted with pulsing badges on the map and listed with their saturation ratios.
5. Review the **What-If Intervention Comparison**:
   - Compare the **Baseline (No Action)** against **Scenario A (VMS Diversion)**, **Scenario B (Rapid Tow Clearance)**, **Scenario C (Shoulder Lane Opening)**, and **Scenario D (Coordinated Action Plan)**.
   - Observe the highlighted **Recommended Action Plan** banner showing net vehicle-hours saved and spillback reduction percentage.
6. Explore **Historical Recurring Hotspots**:
   - Review chronic bottleneck clusters (e.g., Circuit House - Nanthoor Road, Kankanady Bypass) with average clearance times and historical recurrence frequencies.

---

## 7. Data Transparency, Modeling Assumptions & Limitations

- **Simulated vs. Observed Data**: Traffic-Diffusion explicitly demarcates all analytical outputs. Real-time vision-derived inputs are labeled `[OBSERVED]`, while projected network states and what-if scenarios are clearly flagged `[SIMULATION_BASED_ESTIMATE]`.
- **Road Network Representation**: The Mangaluru sector network is modeled as a strongly connected directed multigraph ($G = (V, E)$) comprising 17 key junctions and 38 arterial edges with calibrated baseline speeds and capacities.
- **Traffic Propagation Model**: Queue accumulation and spillback calculations utilize empirical macroscopic flow models and BPR volume-delay relationships. They do not simulate microscopic car-following behavior (such as in SUMO or VISSIM).
- **Physical Signal Integration**: Signal preemption and traffic light adapters use a simulated controller interface labeled `[SIMULATED_ADAPTER]` for demonstration purposes, ready for NTCIP 1202 or SCATS protocol integration in live deployments.
