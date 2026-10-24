# Traffic-Diffusion

**Predictive Traffic Incident Intelligence & Diversion Decision-Support Platform for Control Rooms**

---

## 1. Overview & Problem Statement

When an incident occurs on an urban road network—such as an overturned fuel tanker, multi-vehicle pileup, or emergency water main collapse—traffic control-room operators must make critical intervention decisions within minutes:
- Which road segment is disrupted, and what caused the obstruction?
- How much vehicle capacity is lost, and how many Passenger Car Units (PCU/hr) must be diverted?
- What alternative routes are physically viable in the connected network graph?
- If traffic is diverted to adjacent roads, will that cause secondary gridlock or push downstream links over capacity?
- What is the least harmful, capacity-safe diversion plan?
- **What exact operational action should the control room take right now?**

**Traffic-Diffusion** is a decision-support system built specifically for **traffic operations centers and dispatch engineers**. It automates the complete incident-to-diversion analytical workflow:

```
[ Active Incident / Accident Queue ]  or  [ Manual What-If Simulation Setup ]
                                |
                                v
[ Direct Disruption & Lost Capacity Assessment ]
                                |
                                v
[ Network Graph Detour Discovery (NetworkX Multi-Path) ]
                                |
                                v
[ Anti-Jam Headroom Assignment & BPR Travel-Time Recalculation ]
                                |
                                v
[ Side-by-Side Scenario Comparison (Baseline vs Alt A vs Alt B vs Capacity Split) ]
                                |
                                v
[ Actionable Recommendation: What Next Action to Take & Field Dispatch Order ]
```

---

## 2. Road Network Topology & Mathematical Foundations

### Network Topology
The system models the **Mangaluru Metropolitan Sector (NH-66 / NH-73 corridors)** as a calibrated, directed multigraph $G = (V, E)$:
- **17 Junction Nodes ($V$)**: Strategic intersections including Nanthoor Junction, Bunts Hostel, Mallikatte, Jyothi Circle, Kuntikan, Lalbagh, Hampankatta, State Bank, and Pumpwell.
- **44 Directed Arterial Edges ($E$)**: Directional road links including major arterials (K.S. Rao, Bunts Hostel, MG Road, Kadri Road, Balmatta, Falnir - Kankanady), bypass expressways (NH-66 Kuntikan - Nanthoor, Pumpwell Bypass, Bejai Green Expressway), commercial links (GHS Road, Port Road - Bunder), and emergency hospital corridors (Wenlock Emergency, AJ Trauma, Father Muller).

### Macroscopic Traffic Flow Formulation
All calculations adhere to Indian Road Congress (IRC) traffic engineering standards:
- **Nominal Link Capacity ($C_{\text{nominal}}$)**: Calibrated at 900 PCU per hour per lane:
  $$C_{\text{nominal}} = \text{lanes} \times 900.0\text{ PCU/hr}$$
- **Nominal Inflow Demand ($V_{\text{nominal}}$)**: Derived from calibrated baseline density scores or manual operator input:
  $$V_{\text{nominal}} = \text{lanes} \times 650.0 \times [0.3 + 0.7 \times \text{density\_score}]\text{ PCU/hr}$$
- **Free-Flow Travel Time ($t_0$)**:
  $$t_0 = \left(\frac{L}{\max(15.0, s_0)}\right) \times 60.0\text{ minutes}$$

### Incident Capacity Reduction & Displaced Demand
When an incident occurs with blockage severity fraction $\beta \in [0.0, 1.0]$:
- **Effective Residual Capacity ($C_{\text{eff}}$)**:
  $$C_{\text{eff}} = \max(0.0, C_{\text{nominal}} \times [1.0 - \beta])$$
- **Displaced Traffic Flow ($V_{\text{displaced}}$)**:
  $$\text{If } \beta \ge 0.95 \implies V_{\text{displaced}} = V_{\text{nominal}}\text{ (Full Corridor Closure)}$$
  $$\text{Otherwise } \implies V_{\text{displaced}} = \max(0.0, V_{\text{nominal}} - C_{\text{eff}})$$
- **Remaining Flow on Blocked Segment**:
  $$V_{\text{remaining}} = \min(V_{\text{nominal}}, C_{\text{eff}})$$

### Bureau of Public Roads (BPR) Volume-Delay Model
Every candidate link carrying volume $V$ under capacity $C$ recalculates travel time according to standard BPR curves:
$$V/C = \frac{V}{\max(1.0, C)}$$
$$t = t_0 \times \left[1.0 + 0.15 \times \min\left(8.0, (V/C)^4\right)\right]$$
$$\text{Segment Delay} = \max(0.0, t - t_0)\text{ minutes}$$
$$\text{Flow-Weighted Delay} = \frac{V \times (t - t_0)}{60.0}\text{ vehicle-hours}$$

### Anti-Jam Multi-Corridor Headroom Allocation
Single-detour interventions often cause secondary congestion by dumping an entire corridor's displaced traffic onto a single downstream road. Traffic-Diffusion solves this via **bottleneck reserve capacity weighting**:
1. For each candidate simple path $P_k$ in $G \setminus \{e_{\text{blocked}}\}$, calculate the path's bottleneck reserve headroom:
   $$R(P_k) = \min_{e \in P_k} \max\left(0.0, C(e) - V_{0}(e)\right)$$
2. If total reserve capacity $\sum R(P_k) > 0$, assign traffic in proportion to available headroom:
   $$w_k = \frac{R(P_k)}{\sum_j R(P_j)}, \quad V_k = V_{\text{displaced}} \times w_k$$
3. Exact flow conservation is enforced: $\sum_k V_k = V_{\text{displaced}}$.
4. **Anti-Jam Guarantee**: Diversion loading actively prevents detour links from exceeding saturation ($V/C \le 1.00$), eliminating secondary gridlock.

---

## 3. Control-Room Interface Architecture

The dashboard is structured into three connected workspaces in the top section, followed by a quantitative evaluation and decision engine:

### 1. Left Panel: Simulation Controls & Parameters
- **Reported Accident Selector**: Replaces raw corridor codes with clean active incident options (e.g. `INC-401: Nanthoor Fuel Tanker Rollover`, `INC-402: Bunts Hostel Bus Crash`).
- **Incident Context Card**: Displays the target road name, edge identifier, and the reported cause / disruption description.
- **Manual Inflow Demand Entry**: Number input (PCU/hr) pre-filled with nominal baseline flow, allowing operators to simulate custom peak volumes with a 1-click "Reset" button.
- **Blockage & Capacity Loss**: 0%–100% slider with quick percentage chips (25% Minor, 50% Half, 80% Severe, 100% Full Closure).
- **Simulation Horizon**: 30m, 45m, 60m (default peak), 90m, or 120m analysis windows.
- **Live Demand Telemetry**: Real-time readout of Inflow Demand, Remaining Capacity, and Displaced Flow.
- **"Simulate Traffic Diversion" Action Button**: Triggers immediate macroscopic network evaluation.

### 2. Center Panel: Mangaluru Arterial Network Map
- **3D MapLibre GL Visualization**: High-performance vector map rendered with antialiasing and 3D building extrusions.
- **Real-Time Traffic Speed Bands**: Corridors colored by congestion levels:
  - Green (`#10b981`): Free Flow
  - Amber (`#f59e0b`): Moderate Density
  - Orange (`#f97316`): Heavy Congestion
  - Red (`#ef4444`): Active Incident / Blocked Corridor
- **Pulsing Hazard Pin**: Centered at the incident location with popup telemetry.
- **Dynamic Detour Overlays**: Follows physical road geometry in Cyan (Route A), Purple (Route B), Emerald (Route C), and Orange (Downstream Bottleneck Warnings).
- **Interactive Road Selection**: Clicking any corridor on the map selects that link and evaluates its diversion options.

### 3. Right Panel: Reported Accidents Queue (Live Feed)
- Displays all currently reported active incidents across Mangaluru:
  - **INC-401 (Nanthoor Road)**: Overturned chemical fuel tanker with hazardous spill blocking both eastbound lanes.
  - **INC-402 (Bunts Hostel Avenue)**: Private bus brake failure & head-on car impact near Bunts Circle with stormwater pooling.
  - **INC-403 (NH-66 Kuntikan - Nanthoor)**: Multi-axle container trailer axle fracture stalled on highway gradient choking freight.
  - **INC-404 (K.S. Rao Road)**: Major subterranean water main fracture & roadway crater collapse; full emergency carriageway shutdown.
  - **INC-405 (MG Road Lalbagh)**: KSRTC City bus colliding with electric utility pole blocking northbound arterial.
  - **INC-406 (Falnir - Kankanady Road)**: Heavy banyan tree branch fall & snapped live electric cables restricting hospital ambulance access.
  - **INC-407 (Port Road - Bunder Link)**: Fish export refrigerated trailer jackknifed across narrow wharf curve stalling port traffic.
- Each incident card includes severity tags, time reported, inflow vs displaced metrics, and a 1-click **"Simulate Action"** button.

### 4. Bottom Panels: Scenario Matrix & Operational Recommendation
- **Stage 03: Scenario Comparison Table**:
  - Direct comparison of **Baseline (Unmitigated)**, **Alternative A**, **Alternative B**, and **Capacity-Aware Split**.
  - Metrics: Assigned Flow (PCU/hr), Route Travel Time (min), Peak V/C, Downstream Bottlenecks, Network Delay Saved (veh-hrs).
  - Expandable **Segment-by-Segment Capacity & Flow Inspector** detailing link-level reserve capacity and V/C ratios.
- **Stage 04: Operational Recommendation (What Next Action to Take)**:
  - **Primary Action Order**: Clearly states which intervention to execute immediately.
  - **Volume Allocation Split**: Exact percentage and PCU flow distribution across detour routes (e.g. 62% via Navabharath Circle Link, 38% via Bunts Hostel Avenue).
  - **Anti-Jam Verification**: Explicit guarantee confirming zero secondary bottleneck formation.
  - **Field Police Advisory**: Direct instructions for traffic police dispatch (e.g. field officer deployment at metering junctions, traffic signal green phase extension).

---

## 4. API Endpoints Reference

### Intelligence & Diversion Evaluation (`/api/v1/intelligence`)

| Method | Endpoint | Description |
|:---|:---|:---|
| `POST` | `/interventions/evaluate` | Evaluates graph-based diversion scenarios (Baseline, Alt A, Alt B, Capacity Split) with genuine traffic reassignment, custom demand override, and analysis horizons. |
| `GET` | `/incidents` | Lists active confirmed traffic disruptions and reported accidents with full cause descriptions and telemetry. |
| `GET` | `/incidents/{id}` | Retrieves full attributes, road name, coordinates, and severity for a specific incident. |
| `POST` | `/incidents` | Registers or updates an active disruption corridor. |
| `POST` | `/forecast` | Multi-horizon spatiotemporal congestion forecast (15m, 30m, 60m). |
| `GET` | `/risk-assessment` | Prioritized risk ranking of corridors and critical saturated junctions. |

### Network Topology Endpoints (`/api/v1/navigation`)

| Method | Endpoint | Description |
|:---|:---|:---|
| `GET` | `/network` | Retrieves the full Mangaluru road graph (17 nodes, 44 edges, lane counts, speed limits, density scores, and coordinates). |
| `POST` | `/simulate-incident` | Simulates or clears a blockage on a specific edge and updates graph properties. |
| `POST` | `/reset` | Restores network to clean nominal baseline state. |

---

## 5. Installation & Verification

### Prerequisites
- Python 3.11+
- Git

### Setup & Run
```bash
# 1. Clone repository
git clone https://github.com/Pavanspoojary/Traffic-Diffusion.git
cd Traffic-Diffusion

# 2. Create virtual environment and install dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 3. Execute automated test suite (50 tests passing)
pytest -v

# 4. Start the application server
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Access URLs
- **Control Room Operations Dashboard**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- **Interactive OpenAPI Documentation**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## 6. Step-by-Step Operator Workflow Demonstration

1. **Review Active Accidents**:
   - Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/).
   - Inspect the **Reported Accidents** queue on the right side of the dashboard.
   - Review active disruptions with incident cause, reported timestamp, and severity.
2. **Select an Accident for Analysis**:
   - Click on **INC-401 (Nanthoor Chemical Tanker Rollover)**.
   - Notice the left panel automatically populates the affected road (`Circuit House - Nanthoor Road`), cause description, 80% blockage, and nominal demand (1,260 PCU/hr).
   - The map centers on Nanthoor Junction, highlighting the incident in red with the hazard pin.
3. **Simulate Diversion Strategy**:
   - Click **Simulate Traffic Diversion** (or let it auto-calculate upon selection).
   - Review the candidate routes rendered on the map: Route A (Cyan), Route B (Purple), Route C (Emerald).
4. **Compare Diversion Scenarios**:
   - **Baseline (Unmitigated)**: Displaced demand of 900 PCU/hr backs up at Nanthoor Junction with peak V/C at 3.50.
   - **Alternative A**: Diverts 100% flow to Route 1; creates potential secondary congestion.
   - **Capacity-Aware Multi-Corridor Split**: Splits traffic proportionally across available headroom:
     - 62% (~558 PCU/hr) via Navabharath Circle Link
     - 38% (~342 PCU/hr) via Bunts Hostel Avenue
     - Bounded peak arterial V/C at 1.00 (0 new bottlenecks).
     - **Saves 245.2 vehicle-hours** (-95% vs unmitigated baseline).
5. **Inspect the Operational Recommendation (Next Action to Take)**:
   - Check the **Operational Recommendation** panel for the exact directive.
   - Read the **Action Order**, **Volume Allocation Split**, and **Field Police Advisory** for traffic warden placement and signal retiming.
6. **Test "What-If" Manual Variations**:
   - In the left panel, change Baseline Demand to `2,100 PCU/hr` or click `100% Closed`.
   - The system re-simulates instantly, recalculating bottleneck risks under extreme overload and identifying the safest multi-corridor diversion.
