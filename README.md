# Traffic-Diffusion

**Traffic Diversion Intelligence for Control Rooms**

---

## 1. Overview & Problem Statement

Urban traffic management centers face a recurring tactical challenge when collisions, vehicle breakdowns, or emergency roadworks block an arterial road:
- Which road segment is affected?
- How much traffic can no longer use that segment?
- Which alternative routes are actually available in the connected road network?
- How much additional traffic would each detour receive?
- Would a proposed diversion overload another road or create a secondary downstream bottleneck?
- Which candidate diversion is estimated to cause the least additional disruption?
- What data and assumptions support that recommendation?

**Traffic-Diffusion** is a focused decision-support platform designed for **traffic-control operators and control room dispatchers**. It automates the complete incident-to-diversion analytical workflow:

```
[ Select Incident / Disruption ]
               |
               v
[ Calculate Displaced Traffic Demand ]
               |
               v
[ Discover Viable Graph Detours (NetworkX) ]
               |
               v
[ Simulate Traffic Redistribution & BPR Delays ]
               |
               v
[ Compare Scenarios Side-by-Side (Alt A vs Alt B vs Capacity Split) ]
               |
               v
[ Formulate Explainable Recommendation & Bottleneck Alerts ]
```

---

## 2. Road Network Representation & Mathematical Foundations

### Network Topology
The system models the **Mangaluru Metropolitan Sector (NH-66 / NH-73)** as a directed multigraph $G = (V, E)$ containing:
- **17 Junction Nodes ($V$)**: Major intersections including Nanthoor Junction, Bunts Hostel, Mallikatte, Jyothi Circle, Kuntikan, Lalbagh, Hampankatta, and Pumpwell.
- **38 Directed Arterial Edges ($E$)**: Calibrated road segments with physical attributes including segment length ($L$), lane count, free-flow speed ($s_0$), baseline density score, and nominal saturation capacity.

### Macroscopic Traffic Flow Parameters
- **Nominal Capacity ($C_{\text{nominal}}$)**: Arterial capacity calibrated at 900 Passenger Car Units (PCU) per hour per lane:
  $$C_{\text{nominal}} = \text{lanes} \times 900.0\text{ PCU/hr}$$
- **Nominal Hourly Demand ($V_{\text{nominal}}$)**: Derived from calibrated baseline arterial density:
  $$V_{\text{nominal}} = \text{lanes} \times 650.0 \times [0.3 + 0.7 \times \text{density\_score}]\text{ PCU/hr}$$
- **Free-Flow Travel Time ($t_0$)**:
  $$t_0 = \left(\frac{L}{\max(15.0, s_0)}\right) \times 60.0\text{ minutes}$$

### Incident Capacity Reduction & Displaced Demand
When an incident occurs with blockage severity fraction $\beta \in [0.0, 1.0]$:
- **Effective Capacity ($C_{\text{eff}}$)**:
  $$C_{\text{eff}} = \max(0.0, C_{\text{nominal}} \times [1.0 - \beta])$$
- **Displaced Traffic Flow ($V_{\text{displaced}}$)**:
  $$\text{If } \beta \ge 0.95 \implies V_{\text{displaced}} = V_{\text{nominal}}\text{ (Full Corridor Closure)}$$
  $$\text{Otherwise } \implies V_{\text{displaced}} = \max(0.0, V_{\text{nominal}} - C_{\text{eff}})$$
- **Remaining Flow on Blocked Segment**:
  $$V_{\text{remaining}} = \min(V_{\text{nominal}}, C_{\text{eff}})$$

### Bureau of Public Roads (BPR) Volume-Delay Model
For any road segment carrying assigned volume $V$ under capacity $C$:
$$V/C = \frac{V}{\max(1.0, C)}$$
$$t = t_0 \times \left[1.0 + 0.15 \times \min\left(8.0, (V/C)^4\right)\right]$$
$$\text{Segment Delay} = \max(0.0, t - t_0)\text{ minutes}$$
$$\text{Flow-Weighted Delay} = \frac{V \times (t - t_0)}{60.0}\text{ vehicle-hours}$$

---

## 3. Diversion Scenarios & Capacity-Aware Assignment

Rather than relying on arbitrary percentage multipliers, Traffic-Diffusion evaluates candidate scenarios through isolated, reproducible graph assignments starting from identical initial conditions:

### Scenario 0: Baseline (Unmitigated)
- The blocked edge carries full demand $V_{\text{nominal}}$ over reduced capacity $C_{\text{eff}}$.
- Severe queuing occurs: excess demand ($V_{\text{displaced}}$) accumulates at the upstream junction.
- Alternative bypass corridors remain at their baseline demand.
- Establishes the unmitigated reference delay for fair comparison.

### Scenario 1: Alternative A (100% Demand Diverted to Detour 1)
- Identifies the shortest viable simple path $P_1$ in $G \setminus \{e_{\text{blocked}}\}$.
- Genuinely transfers 100% of $V_{\text{displaced}}$ onto every edge $k \in P_1$:
  $$V_{\text{new}}(k) = V_{\text{nominal}}(k) + V_{\text{displaced}}$$
- Recomputes link travel times, $V/C$ ratios, and downstream bottlenecks.
- Relieves the blocked corridor: $V(e_{\text{blocked}}) = V_{\text{remaining}}$.

### Scenario 2: Alternative B (100% Demand Diverted to Detour 2)
- Evaluates the second distinct simple path $P_2$ in the directed graph.
- Genuinely transfers 100% of $V_{\text{displaced}}$ onto every edge $k \in P_2$.
- Identifies whether Detour 2 offers lower route delay or avoids chokepoints present on Detour 1.

### Scenario 3: Capacity-Aware Multi-Corridor Split
- When two or more detours exist, calculates the bottleneck reserve capacity of each path:
  $$R(P_i) = \min_{e \in P_i} \max\left(10.0, C(e) - V_{\text{nominal}}(e)\right)$$
- Allocates displaced demand proportionally:
  $$w_i = \frac{R(P_i)}{\sum_j R(P_j)}, \quad V_i = V_{\text{displaced}} \times w_i$$
- Balances arterial loading across multiple parallel corridors, preventing any single alternative road from reaching critical saturation ($V/C \ge 1.0$).

### Multi-Criteria Recommendation Algorithm
Candidate strategies are scored by:
$$\text{Score} = \text{Delay Saved (veh-hrs)} - [8.0 \times \text{New Saturated Bottlenecks}] - [15.0 \times \max(0.0, \text{Max } V/C - 1.0)]$$
The strategy with the highest score is recommended, accompanied by an explicit trade-off summary (e.g. total delay savings versus load on secondary arterials).

---

## 4. Data Provenance & Model Limitations

### Provenance Classification
All metrics and data streams in Traffic-Diffusion are explicitly tagged:
- `OBSERVED`: Ground-truth measurements from confirmed CCTV vehicle tracking or verified field reports.
- `IMPORTED`: Static calibrated attributes from the road network baseline (`seed_network.json`).
- `ESTIMATED`: Macroscopic traffic flow and BPR volume-delay calculations derived from graph parameters.
- `SIMULATED`: Operator-controlled what-if parameters (blockage severity sliders, demand overrides).
- `UNKNOWN`: Unverified reports or unmonitored road segments.

### Model Transparency & Limitations
- **Macroscopic Flow Model**: Traffic-Diffusion models aggregate volume and capacity curves. It does not execute microscopic, agent-based simulation of individual vehicles.
- **Static vs. Dynamic Routing**: Detour assignments reflect deterministic macroscopic routing. Real-world driver compliance with dynamic VMS advisory signs typically ranges between 35% and 65%.
- **Initial Condition Calibration**: Network flows are initialized from calibrated baseline density scores. Real-time inductive loop detectors or GPS probe feeds can be integrated to refine baseline flow estimates.

---

## 5. Web Portals & Operator Interfaces

### 1. Control Room Command Center (`/`)
- **Primary View**: The unified operator workspace.
- **3D MapLibre GL Map**: Displays Mangaluru Metropolitan arterials with 3D extruded buildings, real-time congestion coloring, active incident markers, and dynamic detour overlays.
- **Incident & Blockage Controller**: Dropdown selection of Mangaluru arterials, blockage severity slider (10% - 100%), and one-click demo presets.
- **Detour Candidates List**: Displays discovered simple paths with route lengths, free-flow times, and bottleneck capacities.
- **Side-by-Side Comparison Matrix**: Direct comparison of Baseline, Alternative A, Alternative B, and Capacity Split across assigned flow, route travel time, peak V/C, new bottlenecks, and delay savings.
- **Operational Recommendation Banner**: Transparent mathematical rationale and trade-off analysis.

### 2. Citizen Incident Reporting Portal (`/public`)
- Commuter mobile web interface powered by Leaflet.
- Commuters report collisions, breakdowns, and waterlogging with GPS coordinates and camera evidence.
- Submissions stream into the Control Room's Citizen Feed queue for operator verification.

---

## 6. API Reference

### Diversion & Intelligence Endpoints (`/api/v1/intelligence`)

| Method | Endpoint | Description |
|:---|:---|:---|
| `POST` | `/interventions/evaluate` | Evaluates graph-based diversion scenarios (Baseline, Alt A, Alt B, Capacity Split) with genuine traffic reassignment. |
| `POST` | `/forecast` | Multi-horizon spatiotemporal congestion forecast (15m, 30m, 60m). |
| `GET` | `/risk-assessment` | Prioritized risk ranking of corridors and critical saturated junctions. |
| `POST` | `/demo-scenario` | Loads deterministic demonstration scenarios (Nanthoor, Bunts Hostel, MG Road, Hampankatta). |
| `GET` | `/citizen-reports` | Lists citizen incident reports submitted from `/public`. |
| `POST` | `/citizen-reports/{id}/verify` | Operator action to verify a report, spawn an active incident, and update the graph. |
| `GET` | `/incidents` | Lists active confirmed traffic incidents. |
| `POST` | `/incidents` | Registers or updates an active disruption corridor. |

### Road Network Endpoints (`/api/v1/navigation`)

| Method | Endpoint | Description |
|:---|:---|:---|
| `GET` | `/network` | Retrieves complete Mangaluru road graph topology (17 nodes, 38 edges, telemetry). |
| `POST` | `/reset` | Resets road network state to clean nominal baseline. |

---

## 7. Installation & Verification

### Prerequisites
- Python 3.11+
- Git

### Setup
```bash
# 1. Clone repository
git clone https://github.com/Pavanspoojary/Traffic-Diffusion.git
cd Traffic-Diffusion

# 2. Create virtual environment and install dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 3. Execute automated test suite (37 tests)
pytest -v

# 4. Start the application server
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Access URLs
- **Control Room Command Center**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- **Citizen Incident Reporting App**: [http://127.0.0.1:8000/public](http://127.0.0.1:8000/public)
- **Interactive OpenAPI Documentation**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## 8. Step-by-Step Demonstration Script

1. **Open the Command Center**:
   - Navigate to [http://127.0.0.1:8000/](http://127.0.0.1:8000/).
   - Inspect the 3D MapLibre view showing Mangaluru arterials centered around Nanthoor / Kadri / Bunts Hostel.
2. **Select an Incident Preset**:
   - In the **Incident & Blockage Setup** panel, click **Nanthoor Rollover (80%)**.
   - Notice the target segment updates to `Circuit House - Nanthoor Road (corridor_cctv_07)` with 80% blockage.
   - Inspect the computed demand strip:
     - Baseline Demand: `1,255 PCU/hr`
     - Effective Capacity: `360 PCU/hr`
     - Displaced Flow: `895 PCU/hr`
3. **Simulate & Compare Diversions**:
   - Click **Calculate & Compare Diversions**.
   - Review the discovered graph detours in the left panel:
     - `Detour 1 via Navabharath Circle Link & MG Road (7.5 km, 8.5 min)`
     - `Detour 2 via Ballalbagh & Bejai Expressway (7.8 km, 9.9 min)`
     - `Detour 3 via Balmatta & Pumpwell Bypass (8.1 km, 10.2 min)`
4. **Inspect the Side-by-Side Comparison Matrix**:
   - **Baseline**: 0 PCU diverted, peak V/C 3.48 on the blocked road, 0 veh-hrs delay saved.
   - **Alternative A**: 895 PCU/hr on Detour 1, route time 8.9 min, peak V/C 1.00, saves 29.6 veh-hrs.
   - **Alternative B**: 895 PCU/hr on Detour 2, route time 9.9 min, peak V/C 1.00, saves 29.4 veh-hrs.
   - **Capacity-Aware Split**: 456 PCU/hr via Detour 1 and 438 PCU/hr via Detour 2, saves 32.6 veh-hrs (-70.9% delay reduction).
5. **Review the Mathematical Recommendation**:
   - Inspect the green recommendation banner detailing why the Capacity-Aware Split is selected (highest net delay reduction with balanced arterial loading).
   - Notice the detour routes rendered in vivid cyan and purple on the 3D map.
6. **Citizen Reporting Ingestion**:
   - Open [http://127.0.0.1:8000/public](http://127.0.0.1:8000/public) in an adjacent window.
   - Submit an emergency hazard report on any road segment.
   - In the Control Room, click the **Citizen Feed** badge in the header, review the inbound alert, and click **Verify & Simulate Diversion**.
   - The platform verifies the report and recalculates network detours in real time.
