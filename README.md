# Traffic-Diffusion

**Predictive Traffic Intelligence & Intervention Planning Platform**

---

## 1. Overview & Problem Statement

Urban traffic management centers face critical operational challenges when arterial roads are blocked by collisions, breakdowns, or emergency roadworks:
- **Corridor Identification**: Exactly which road segment and directed travel lanes are obstructed?
- **Displaced Flow Quantification**: How much vehicle volume can no longer traverse the corridor?
- **Graph Alternative Discovery**: Which alternative routes physically exist in the connected road network without violating one-way directionality or confirmed closures?
- **Network Loading & Ripple Effect**: How much extra traffic would diversion routes receive? Will split traffic merge into a shared downstream bottleneck?
- **Multi-Plan Comparison**: Which candidate intervention (Fastest Detour, Capacity-Aware Split, Rapid Clearance, or Combined Action Plan) minimizes system-wide network delay?
- **Transparent Assumptions**: What mathematical formulas, physical storage limits, and demand assumptions ground the recommendation?

**Traffic-Diffusion** is a decision-support and simulation platform designed for **traffic-control operators, municipal planners, and dispatchers**. It integrates a transparent numerical traffic-analysis brain directly into an interactive 3D and Leaflet map application:

```
[ Select or Create Road Incident on Map ]
                   |
                   v
[ Calculate Capacity Reduction & Displaced Demand (BPR + IRC Standards) ]
                   |
                   v
[ Discover Feasible Graph Detours (NetworkX DiGraph) ]
                   |
                   v
[ Discrete 1-Min Step Queue & Spillback Simulation (Physical Storage Bound) ]
                   |
                   v
[ Multi-Horizon Forecast (15m / 30m / 60m) & Ranked Risk Corridors ]
                   |
                   v
[ Compare 4 What-If Scenarios vs Baseline (Delay, V/C, Bottlenecks, Queues) ]
                   |
                   v
[ Formulate Transparent Recommendation with Trade-Offs & Assumptions ]
```

---

## 2. Road Network Representation & Mathematical Foundations

### Network Topology
The system models the **Mangaluru Metropolitan Sector (NH-66 / NH-73)** as a directed graph $G = (V, E)$ containing:
- **17 Junction Nodes ($V$)**: Strategic intersections including Nanthoor Junction, Bunts Hostel, Mallikatte, Jyothi Circle, Kuntikan, Lalbagh, Hampankatta, and Pumpwell.
- **38 Directed Arterial Edges ($E$)**: Direction-aware road segments derived from `data/seed_network.json` with real OSRM road-snapped geometries and explicit physical parameters:
  - `edge_id` and endpoint node IDs (`source`, `target`).
  - Directed travel direction and permitted turns.
  - Length in meters (`length_meters`) and kilometers (`length_km`).
  - Free-flow travel time (`free_flow_travel_time_min`) and base speed in km/h (`base_speed_kmh`).
  - Lane count (`lanes`), nominal saturation capacity (`nominal_capacity_veh_hr`), and baseline volume (`estimated_baseline_volume_veh_hr`).
  - Physical queue storage limit in Passenger Car Units (`queue_storage_limit_pcu`).
  - Effective travel time (`effective_travel_time_min`) and closure flag (`is_closed`).

### Physical Road Attributes & IRC Standards
- **Nominal Capacity ($C_{\text{nominal}}$)**: Arterial capacity calibrated at 900 PCU per hour per lane (Indian Roads Congress standard):
  $$C_{\text{nominal}} = \text{lanes} \times 900.0\text{ PCU/hr}$$
- **Nominal Baseline Demand ($V_{\text{nominal}}$)**: Derived from calibrated baseline arterial density:
  $$V_{\text{nominal}} = \text{lanes} \times 650.0 \times [0.3 + 0.7 \times \text{density\_score}]\text{ PCU/hr}$$
- **Physical Queue Storage Limit ($S_{\text{queue}}$)**: Bounded by segment length and vehicle spacing (7.5 meters per PCU):
  $$S_{\text{queue}} = \frac{\text{length\_meters} \times \text{lanes}}{7.5\text{ m/PCU}}$$
- **Free-Flow Travel Time ($t_0$)**:
  $$t_0 = \left(\frac{L}{\max(15.0, s_0)}\right) \times 60.0\text{ minutes}$$

### Incident Capacity Reduction & Displaced Demand
When an incident occurs with capacity reduction fraction $\beta \in [0.0, 1.0]$:
- **Effective Capacity ($C_{\text{eff}}$)**:
  $$C_{\text{eff}} = \max(0.0, C_{\text{nominal}} \times [1.0 - \beta])$$
- **Displaced Traffic Flow ($V_{\text{displaced}}$)**:
  $$\text{If } \beta \ge 0.95 \text{ or } \text{is\_full\_closure} \implies V_{\text{displaced}} = V_{\text{nominal}}\text{ (Full Closure)}$$
  $$\text{Otherwise } \implies V_{\text{displaced}} = \max(0.0, V_{\text{nominal}} - C_{\text{eff}})$$
- **Remaining Flow on Blocked Segment**:
  $$V_{\text{remaining}} = \min(V_{\text{nominal}}, C_{\text{eff}})$$

### Bureau of Public Roads (BPR) Volume-Delay Model
For any road segment carrying assigned volume $V$ under effective capacity $C$:
$$V/C = \frac{V}{\max(1.0, C)}$$
$$t = t_0 \times \left[1.0 + 0.15 \times \min\left(8.0, (V/C)^4\right)\right]$$
$$\text{Segment Delay} = \max(0.0, t - t_0)\text{ minutes}$$
$$\text{Flow-Weighted Delay} = \frac{V \times (t - t_0)}{60.0}\text{ vehicle-hours}$$

### Discrete 1-Minute Step Queue Accumulation & Spillback Model
Queue growth is evaluated step-by-step:
$$\text{Queue}_{t+1} = \max\left(0.0, \text{Queue}_t + \text{Arrivals}_t - \text{Departures}_t\right)$$
- Departures are bounded by effective service rate: $\text{Departures}_t \le C_{\text{eff}} / 60.0$.
- Physical queue cannot exceed storage capacity: $\text{Queue}_{t+1} = \min(\text{Queue}_{t+1}, S_{\text{queue}})$.
- When $\text{Queue} \ge 0.85 \times S_{\text{queue}}$, an explicit **Spillback Warning** is flagged for upstream junctions.

### Demand Assignment Model ("10 Vehicles, Same Destination")
The engine implements `/api/analysis/demand-simulation` to evaluate tactical micro-demand problems:
- Evaluates whether the fastest route possesses sufficient reserve capacity to absorb the extra vehicles without exceeding capacity.
- Evaluates longer alternative bypasses with spare capacity.
- Detects shared downstream merges where candidate detours reconverge into a common bottleneck segment.
- Explicitly flags uncertainty when background arterial demand is unmeasured.

---

## 3. Intervention Decision Engine & What-If Scenarios

All candidate plans are evaluated under **identical initial conditions, baseline volumes, and forecast horizons**:

1. **Baseline (Unmitigated)**: Incident is active with no coordinated routing intervention. Displaced flow accumulates at the upstream bottleneck, establishing the reference travel time and network delay.
2. **Alternative A (Single Fastest Detour)**: 100% of displaced demand is directed along the lowest-travel-time alternative route $P_1$. Relieves the incident corridor, but risks saturating secondary roads if capacity is limited.
3. **Alternative B (Capacity-Aware Multi-Corridor Split)**: Displaced flow is distributed across parallel viable paths proportionally to their bottleneck reserve capacities ($R(P_i) = \min_{e \in P_i} [C(e) - V(e)]$). Balances network load and prevents any single corridor from reaching critical saturation ($V/C \ge 1.0$).
4. **Alternative C (Rapid Tow Clearance / Delayed Capacity Restoration)**: Models rapid emergency clearance (tow truck dispatch with clearance delay). Restores corridor capacity after an operational response delay.
5. **Alternative D (Combined Action Plan)**: Combines capacity-aware traffic diversion with expedited clearance dispatch, computing true joint network benefits rather than adding isolated advantages.

### Objective Optimization & Tie-Breaking
Strategies are evaluated against net network delay savings (in vehicle-hours), peak $V/C$ ratio, and new downstream bottlenecks. If top scenarios deliver virtually identical delay savings (within 0.05 veh-hrs), the engine reports the outcome as **inconclusive** rather than declaring an arbitrary winner.

---

## 4. Analytical UI & Map Controls

The Control Room console (`/`) features an analytical workspace around the road map:
- **Map View Mode Toggle**:
  - `Baseline View`: Displays clean nominal corridors without incident coloring or detour overlays.
  - `Forecast / Scenario`: Renders the active incident in high-visibility red, candidate detour paths in cyan and purple, and downstream bottlenecks in amber.
- **Forecast Horizon Selector**: Dedicated buttons for **15 min**, **30 min**, and **60 min** horizons that query `/api/analysis/impact`.
- **Action Buttons**:
  - `Run Impact Analysis`: Computes multi-horizon queuing and generates the prioritized risk ranking.
  - `Compare Interventions (What-If)`: Executes multi-scenario evaluation and populates the comparison matrix.
  - `Reset Demo`: Calls `POST /api/demo/reset` to restore the deterministic Nanthoor Rollover 80% fixture.
- **Incident Detail Panel**: Displays incident category, verification state, forecast duration, simulation method, and explicit modeling limitations.
- **Enforce Complete Road Closure Switch**: Toggles 100% capacity loss and completely closes the corridor to routing.
- **Ranked Risk Corridors Inspector**: Click any prioritized risk segment in Step 2 to fly and zoom to that road on the map.
- **Create Incident Modal (`+ Create Incident`)**: Dialog supporting category, target edge selection from all 38 graph edges, blockage percentage, lane counts, verification state, provenance, and source notes.

---

## 5. API Reference

### Semantic Traffic Brain Endpoints (`/api`)

| Method | Endpoint | Description |
|:---|:---|:---|
| `GET` | `/api/network` | Retrieves the transparent road network model (17 nodes, 38 edges, capacities, storage limits). |
| `GET` | `/api/incidents` | Lists active, verified, and unconfirmed traffic disruptions. |
| `POST` | `/api/incidents` | Creates a new road incident with full validation, severity, and verification state. |
| `GET` | `/api/incidents/{incident_id}` | Retrieves specific incident attributes, provenance, and limitations. |
| `POST` | `/api/analysis/impact` | Executes multi-horizon (15m/30m/60m) spatiotemporal impact and queue accumulation analysis. |
| `POST` | `/api/analysis/compare-interventions` | Evaluates Baseline against 4 candidate what-if intervention plans under identical initial conditions. |
| `GET` | `/api/analysis/risk-segments` | Returns explainable risk ranking for road segments and junctions with contributing factors. |
| `POST` | `/api/analysis/demand-simulation` | Solves the "10 vehicles, same destination" micro-demand assignment problem. |
| `POST` | `/api/demo/reset` | Resets the road network and establishes the deterministic Nanthoor Rollover 80% fixture. |

### Backwards-Compatible Operational Endpoints (`/api/v1`)
- `/api/v1/navigation/network`: Network topology.
- `/api/v1/intelligence/interventions/evaluate`: Diversion evaluation.
- `/api/v1/intelligence/citizen-reports`: Public incident ingestion and verification.

---

## 6. Honest Disclosures & Data Provenance

- **Data Provenance**: All displayed scenarios are explicitly labeled `[SIMULATED SCENARIO]` or `[BPR MODEL]`. No live real-world sensor streams or calibrated probabilities are claimed without verified field calibration.
- **Macroscopic Model**: Calculations represent macroscopic arterial flow and capacity-delay curves, not microscopic multi-agent vehicle physics.
- **Deterministic Demo**: The demo reset endpoint (`/api/demo/reset`) reliably produces repeatable metrics across consecutive runs.
- **Unconfirmed Reports**: Citizen reports remain flagged as `UNVERIFIED` until operator confirmation and do not forcibly sever network corridors.

---

## 7. Installation, Testing & Running

### Prerequisites
- Python 3.11+
- Git

### Setup
```bash
# 1. Clone repository
git clone https://github.com/Pavanspoojary/Traffic-Diffusion.git
cd Traffic-Diffusion

# 2. Activate virtual environment and install dependencies
.\.venv\Scripts\activate
pip install -r requirements.txt

# 3. Execute the automated test suite (58 tests)
.\.venv\Scripts\pytest -v

# 4. Launch FastAPI Application
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Access URLs
- **Control Room Console**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- **Citizen Reporting App**: [http://127.0.0.1:8000/public](http://127.0.0.1:8000/public)
- **FastAPI OpenAPI Documentation**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## 8. Automated Test Suite (58 Tests Passing)

The project includes 58 automated tests across 6 test modules:
- `backend/tests/test_traffic_brain.py` (16 tests): Graph directionality, full closure avoidance, partial blockage travel costs, queue storage bounds, 10-vehicle demand assignment, downstream bottleneck detection, capacity-aware superiority, deterministic repeatability, and API endpoints.
- `backend/tests/test_diversion_simulation.py` (8 tests): Complete closure demand displacement, partial capacity reduction, multi-route split conservation, and bottleneck identification.
- `backend/tests/test_predictive_intelligence.py` (11 tests): Multi-horizon forecasting, citizen reports, operator verification, and risk assessment.
- `backend/tests/test_routing.py` (7 tests): Shortest path Dijkstra routing, emergency corridors, dynamic rerouting around blockages.
- `backend/tests/test_api_integration.py` (8 tests): API routes, incident simulation, and corridor overrides.
- `backend/tests/test_cv.py` (8 tests): Incident lifecycle and camera corridor tracking.

Run the test suite at any time with:
```bash
.\.venv\Scripts\pytest -q
# Output: 58 passed, 154 warnings in 5.44s
```
