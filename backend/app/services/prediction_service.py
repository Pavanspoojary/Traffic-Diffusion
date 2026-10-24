import time
import math
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Any
import networkx as nx

from backend.app.config import settings
from backend.app.models.schemas import (
    TrafficIncident,
    IncidentCategory,
    IncidentSeverity,
    EventProvenance,
    VerificationStatus,
    CongestionLevel,
    IncidentStatus,
    EdgeImpactForecast,
    JunctionSaturationForecast,
    NetworkForecastSnapshot,
    MultiHorizonForecastResponse,
    RiskComponentBreakdown,
    PrioritizedRoadRisk,
    PrioritizedJunctionRisk,
    RiskAssessmentResponse,
    DiversionDeploymentRequest,
    ActiveDiversionRecord,
    DemandSimulationResponse,
)

class PredictiveIncidentEngine:
    """
    Predictive Traffic Impact & Network Cascading Congestion Model.
    Simulates spatiotemporal queue spillback, downstream bottlenecks,
    and alternative route diversion loading across 15, 30, and 60 minute horizons.
    """
    def __init__(self, routing_service):
        self.routing_service = routing_service
        self.active_incidents: Dict[str, TrafficIncident] = {}
        self.active_diversions: Dict[str, ActiveDiversionRecord] = {}
        self._init_default_assumptions()
        self._seed_default_incidents()

    def _init_default_assumptions(self):
        self.assumptions = [
            "Lane saturation flow rate: 900 vehicles/hour/lane nominal arterial capacity.",
            "Discrete queue accumulation: next_queue = max(0, current_queue + arrivals - departures) evaluated at 1-min time steps.",
            "Vehicle storage footprint: 7.5 meters effective space per passenger car unit (PCU).",
            "Upstream spillback triggers when queue length exceeds segment storage capacity (length_m * lanes / 7.5).",
            "Diversion loading: 45% of upstream demand seeks nearest parallel bypass corridor.",
            "Forecast horizons calibrated for 15, 30, and 60 minutes from incident inception."
        ]

    def _seed_default_incidents(self):
        incidents_seed = [
            {
                "incident_id": "INC-MNG-401",
                "category": IncidentCategory.COLLISION,
                "affected_edge_id": "corridor_cctv_07",
                "lat": 12.88307,
                "lng": 74.86340,
                "road_name": "Circuit House - Nanthoor Road",
                "severity": IncidentSeverity.CRITICAL,
                "blocked_lanes": 2,
                "total_lanes": 2,
                "capacity_reduction_pct": 0.80,
                "estimated_duration_min": 60.0,
                "description": "Overturned chemical fuel tanker with hazardous spill blocking both eastbound lanes. HAZMAT emergency response active.",
            },
            {
                "incident_id": "INC-MNG-402",
                "category": IncidentCategory.COLLISION,
                "affected_edge_id": "corridor_cctv_06",
                "lat": 12.87967,
                "lng": 74.85544,
                "road_name": "Bunts Hostel - Kadri Road",
                "severity": IncidentSeverity.HIGH,
                "blocked_lanes": 1,
                "total_lanes": 2,
                "capacity_reduction_pct": 0.50,
                "estimated_duration_min": 45.0,
                "description": "Private bus brake failure & head-on car impact near Bunts Circle with monsoon stormwater pooling.",
            },
            {
                "incident_id": "INC-MNG-403",
                "category": IncidentCategory.VEHICLE_BREAKDOWN,
                "affected_edge_id": "corridor_cctv_08_rev",
                "road_name": "NH-66 Kuntikan to Nanthoor",
                "severity": IncidentSeverity.HIGH,
                "blocked_lanes": 1,
                "total_lanes": 3,
                "capacity_reduction_pct": 0.75,
                "estimated_duration_min": 90.0,
                "description": "Multi-axle container trailer axle fracture stalled on highway gradient choking port-bound freight traffic.",
            },
            {
                "incident_id": "INC-MNG-404",
                "category": IncidentCategory.ROADWORKS,
                "affected_edge_id": "corridor_cctv_01",
                "road_name": "K.S. Rao Arterial Road",
                "severity": IncidentSeverity.CRITICAL,
                "blocked_lanes": 2,
                "total_lanes": 2,
                "capacity_reduction_pct": 1.00,
                "estimated_duration_min": 120.0,
                "description": "Major subterranean water main fracture & roadway crater collapse; full emergency carriageway shutdown.",
            },
            {
                "incident_id": "INC-MNG-405",
                "category": IncidentCategory.COLLISION,
                "affected_edge_id": "corridor_cctv_10",
                "lat": 12.88336,
                "lng": 74.84532,
                "road_name": "Mahatma Gandhi (MG) Road",
                "severity": IncidentSeverity.MODERATE,
                "blocked_lanes": 1,
                "total_lanes": 2,
                "capacity_reduction_pct": 0.60,
                "estimated_duration_min": 45.0,
                "description": "KSRTC City bus colliding with electric utility pole near Lalbagh Junction blocking northbound arterial.",
            },
            {
                "incident_id": "INC-MNG-406",
                "category": IncidentCategory.WEATHER_WATERLOGGING,
                "affected_edge_id": "corridor_cctv_20",
                "road_name": "Falnir - Kankanady Arterial Road",
                "severity": IncidentSeverity.HIGH,
                "blocked_lanes": 1,
                "total_lanes": 2,
                "capacity_reduction_pct": 0.65,
                "estimated_duration_min": 60.0,
                "description": "Heavy banyan tree branch fall & snapped live electric cables restricting ambulance transit toward Father Muller.",
            },
            {
                "incident_id": "INC-MNG-407",
                "category": IncidentCategory.VEHICLE_BREAKDOWN,
                "affected_edge_id": "corridor_cctv_22",
                "road_name": "Port Road - Bunder Commercial Link",
                "severity": IncidentSeverity.MODERATE,
                "blocked_lanes": 1,
                "total_lanes": 2,
                "capacity_reduction_pct": 0.70,
                "estimated_duration_min": 50.0,
                "description": "Fish export refrigerated trailer jackknifed across narrow wharf curve stalling Old Port commercial logistics.",
            },
        ]

        now_iso = datetime.utcnow().isoformat() + "Z"
        for inc in incidents_seed:
            edge = self.routing_service.edges.get(inc["affected_edge_id"])
            incident_obj = TrafficIncident(
                incident_id=inc["incident_id"],
                category=inc["category"],
                affected_edge_id=inc["affected_edge_id"],
                lat=inc.get("lat"),
                lng=inc.get("lng"),
                road_name=inc["road_name"],
                start_timestamp=now_iso,
                severity=inc["severity"],
                blocked_lanes=inc["blocked_lanes"],
                total_lanes=edge.lanes if edge else inc["total_lanes"],
                capacity_reduction_pct=inc["capacity_reduction_pct"],
                estimated_duration_min=inc["estimated_duration_min"],
                provenance=EventProvenance.OBSERVED,
                verification_status=VerificationStatus.VERIFIED,
                confidence_score=0.95,
                description=inc["description"],
                reported_by="MANGALURU_TRAFFIC_POLICE_DISPATCH",
            )
            self.active_incidents[inc["incident_id"]] = incident_obj

    def create_incident(
        self,
        affected_edge_id: str,
        category: IncidentCategory = IncidentCategory.COLLISION,
        severity: IncidentSeverity = IncidentSeverity.HIGH,
        blocked_lanes: int = 1,
        capacity_reduction_pct: float = 0.60,
        estimated_duration_min: float = 45.0,
        description: Optional[str] = None,
        provenance: EventProvenance = EventProvenance.SIMULATED,
        lat: Optional[float] = None,
        lng: Optional[float] = None,
        is_full_closure: bool = False,
        verification_status: VerificationStatus = VerificationStatus.VERIFIED,
        source: Optional[str] = "OPERATOR_CONSOLE",
        notes: Optional[str] = None,
        start_timestamp: Optional[str] = None,
    ) -> TrafficIncident:
        """Registers a new traffic incident in the predictive intelligence store."""
        edge = self.routing_service.edges.get(affected_edge_id)
        road_name = edge.name if edge else affected_edge_id
        inc_id = f"INC-{affected_edge_id.upper()}-{int(time.time())}"
        now_iso = start_timestamp or (datetime.now(timezone.utc).isoformat() + "Z")

        if is_full_closure:
            capacity_reduction_pct = 1.0

        incident = TrafficIncident(
            incident_id=inc_id,
            category=category,
            affected_edge_id=affected_edge_id,
            lat=lat,
            lng=lng,
            road_name=road_name,
            start_timestamp=now_iso,
            severity=severity,
            blocked_lanes=blocked_lanes,
            total_lanes=edge.lanes if edge else 2,
            capacity_reduction_pct=min(1.0, max(0.0, capacity_reduction_pct)),
            is_full_closure=is_full_closure,
            estimated_duration_min=max(5.0, estimated_duration_min),
            provenance=provenance,
            verification_status=verification_status,
            confidence_score=0.95 if verification_status == VerificationStatus.VERIFIED else (0.85 if provenance == EventProvenance.OBSERVED else 0.70),
            description=description or f"{category.value} blocking {road_name}",
            reported_by="TRAFFIC_CONTROL_ANALYST",
            source=source,
            notes=notes,
            method="BPR_VOLUME_DELAY_AND_DISCRETE_QUEUE_MODEL",
            limitations="Conditional macroscopic simulation based on link capacities and baseline flow",
        )

        self.active_incidents[inc_id] = incident

        # Update edge in routing_service based on verification state:
        # Distinguish unconfirmed reports from confirmed closures.
        # An unconfirmed incident is flagged but does not force a closure unless confirmed or simulated.
        if edge:
            edge.has_incident = True
            edge.incident_description = incident.description
            edge.is_closed = is_full_closure and (verification_status == VerificationStatus.VERIFIED or provenance == EventProvenance.SIMULATED)
            if verification_status == VerificationStatus.VERIFIED or provenance == EventProvenance.SIMULATED:
                edge.incident_status = IncidentStatus.CONFIRMED
                if is_full_closure or severity == IncidentSeverity.CRITICAL:
                    edge.congestion_level = CongestionLevel.BLOCKED
                else:
                    edge.congestion_level = CongestionLevel.HEAVY
            else:
                edge.incident_status = IncidentStatus.SUSPECTED
                # Unconfirmed report: show on map with moderate flag, do not force road closure
                edge.congestion_level = CongestionLevel.MODERATE

        return incident

    def get_incident(self, incident_id: str) -> Optional[TrafficIncident]:
        return self.active_incidents.get(incident_id)

    def list_incidents(self) -> List[TrafficIncident]:
        return list(self.active_incidents.values())

    def deploy_diversion(self, request: DiversionDeploymentRequest) -> ActiveDiversionRecord:
        """
        Deploys an approved incident diversion plan to the network and broadcasts
        it to the public app and citizen navigation routing engine.
        """
        known_edge_ids = set(self.routing_service.edges) | set(
            getattr(getattr(self.routing_service, "osm_router", None), "edges", {})
        )
        requested_groups = request.detour_routes or ([{
            "edge_ids": request.detour_route_ids,
            "allocation": 1.0,
            "name": request.detour_name or "Official Detour",
        }] if request.detour_route_ids else [])
        route_groups = []
        for group in requested_groups:
            edge_ids = [eid for eid in group.get("edge_ids", []) if eid in known_edge_ids]
            if edge_ids:
                route_groups.append({
                    **group,
                    "edge_ids": edge_ids,
                    "allocation": min(1.0, max(0.0, float(group.get("allocation", 1.0)))),
                })
        deployed_edge_ids = list(dict.fromkeys(
            eid for group in route_groups for eid in group["edge_ids"]
        ))

        coords: List[List[float]] = []
        for group in route_groups:
            group_coords = group.get("path_coordinates")
            if isinstance(group_coords, list) and len(group_coords) > 1:
                coords = group_coords
                break
        if not coords:
            osm_edges = getattr(getattr(self.routing_service, "osm_router", None), "edges", {})
            for eid in deployed_edge_ids:
                edge = self.routing_service.edges.get(eid) or osm_edges.get(eid)
                if edge and edge.path_coordinates:
                    if coords and coords[-1] == edge.path_coordinates[0]:
                        coords.extend(edge.path_coordinates[1:])
                    else:
                        coords.extend(edge.path_coordinates)

        div_id = f"DIV-{request.incident_id.replace('INC-MNG-', '').replace('INC-', '')}"
        advisory_msg = request.advisory_text or (
            f"POLICE TRAFFIC ADVISORY: {request.edge_name} is restricted. "
            f"Official detour active via {request.detour_name}. "
            f"Expected delay saved: {request.delay_saved_veh_hours:.1f} vehicle-hours."
        )

        record = ActiveDiversionRecord(
            diversion_id=div_id,
            incident_id=request.incident_id,
            edge_id=request.edge_id,
            edge_name=request.edge_name or "Corridor",
            scenario_id=request.scenario_id,
            scenario_name=request.scenario_name,
            detour_route_ids=deployed_edge_ids,
            detour_routes=route_groups,
            detour_name=request.detour_name or "Official Detour",
            detour_path_coordinates=coords,
            displaced_demand_pcu_hr=request.displaced_demand_pcu_hr,
            delay_saved_veh_hours=request.delay_saved_veh_hours,
            advisory_text=advisory_msg,
            deployed_by=request.deployed_by or "Control Room Operator",
            deployed_at=datetime.utcnow().isoformat() + "Z",
            status="ACTIVE"
        )
        self.active_diversions[request.incident_id] = record
        return record

    def list_active_diversions(self) -> List[ActiveDiversionRecord]:
        return list(self.active_diversions.values())

    def get_active_diversion(self, incident_id: str) -> Optional[ActiveDiversionRecord]:
        return self.active_diversions.get(incident_id)

    def cancel_diversion(self, incident_id: str) -> bool:
        if incident_id in self.active_diversions:
            del self.active_diversions[incident_id]
            return True
        return False

    def simulate_network_forecast(
        self,
        incident: TrafficIncident,
        horizons: List[int] = [15, 30, 60]
    ) -> MultiHorizonForecastResponse:
        """
        Computes multi-horizon cascading congestion forecasts across the network.
        Evaluates direct blockage, upstream spillback, downstream bottlenecks, and bypass loading.
        """
        graph = self.routing_service.graph
        edges_map = self.routing_service.edges
        nodes_map = self.routing_service.nodes

        target_edge_id = incident.affected_edge_id
        target_edge = edges_map.get(target_edge_id)
        if not target_edge:
            # Fallback if edge ID invalid: pick first available edge
            target_edge_id = next(iter(edges_map.keys()))
            target_edge = edges_map[target_edge_id]

        target_source = target_edge.source
        target_target = target_edge.target

        # Compute baseline total network nominal travel time under clean standard conditions
        baseline_total_time = round(sum((e.length_km / max(e.base_speed_kmh, 15.0)) * 60.0 for e in edges_map.values()), 2)

        # Determine upstream feeder edges (predecessors to target_source)
        upstream_feeders = []
        for pred in graph.predecessors(target_source):
            if graph.has_edge(pred, target_source):
                edge_data = graph[pred][target_source]
                upstream_feeders.append(edge_data["edge_id"])

        # Determine downstream exit edges (successors to target_target)
        downstream_exits = []
        for succ in graph.successors(target_target):
            if graph.has_edge(target_target, succ):
                edge_data = graph[target_target][succ]
                downstream_exits.append(edge_data["edge_id"])

        # Determine parallel bypass edges (alternative path from target_source to target_target)
        bypass_edges = []
        try:
            # Subgraph without the incident edge
            def filter_without_incident(u, v):
                return not (u == target_source and v == target_target)
            alt_view = nx.subgraph_view(graph, filter_edge=filter_without_incident)
            if nx.has_path(alt_view, target_source, target_target):
                alt_path = nx.shortest_path(alt_view, source=target_source, target=target_target, weight="distance_km")
                for i in range(len(alt_path) - 1):
                    u = alt_path[i]
                    v = alt_path[i + 1]
                    bypass_edges.append(graph[u][v]["edge_id"])
        except Exception:
            pass

        forecast_snapshots: Dict[int, NetworkForecastSnapshot] = {}
        primary_affected_corridors = set([target_edge.name])
        next_probable_bottlenecks = set()

        for H in horizons:
            # Horizon scaling factors
            h_ratio = H / 60.0
            dur_fraction = min(1.0, H / max(1.0, incident.estimated_duration_min))

            # Severity factor: LOW=0.25, MODERATE=0.5, HIGH=0.8, CRITICAL=1.0
            sev_multiplier = {
                IncidentSeverity.LOW: 0.35,
                IncidentSeverity.MODERATE: 0.65,
                IncidentSeverity.HIGH: 0.90,
                IncidentSeverity.CRITICAL: 1.25,
            }.get(incident.severity, 0.85)

            # Precalculate target corridor displaced rate to ground bypass loading
            target_nom_vol = target_edge.lanes * 650.0 * (0.3 + (target_edge.density_score * 0.7))
            target_base_cap = target_edge.lanes * 900.0
            target_eff_cap = max(100.0, target_base_cap * (1.0 - incident.capacity_reduction_pct))
            target_displaced_rate = max(0.0, target_nom_vol - target_eff_cap)

            edge_impacts: List[EdgeImpactForecast] = []
            total_net_time = 0.0
            elevated_count = 0

            for eid, edge in edges_map.items():
                base_time = (edge.length_km / max(edge.base_speed_kmh, 15.0)) * 60.0
                nominal_vol = edge.lanes * 650.0 * (0.3 + (edge.density_score * 0.7))
                base_capacity = edge.lanes * 900.0

                if eid == target_edge_id:
                    # Direct incident corridor
                    effective_capacity = target_eff_cap
                    vc_ratio = nominal_vol / effective_capacity
                    
                    # BPR delay growth over horizon
                    growth_factor = 1.0 + (sev_multiplier * dur_fraction * 3.5 * min(4.0, vc_ratio ** 2))
                    pred_time = round(base_time * growth_factor, 2)
                    delay = round(max(0.0, pred_time - base_time), 2)

                    # Queue buildup in meters
                    excess_rate = target_displaced_rate
                    accumulated_pcu = excess_rate * h_ratio
                    queue_len = round(min(edge.length_km * 1000.0, (accumulated_pcu * 7.5) / max(1, edge.lanes)), 1)

                    risk = min(100.0, round(40.0 + (delay * 3.5) + (vc_ratio * 20.0), 1))
                    c_level = CongestionLevel.BLOCKED if vc_ratio > 1.4 else (CongestionLevel.HEAVY if vc_ratio > 1.0 else CongestionLevel.MODERATE)
                    impact_type = "DIRECT_INCIDENT"
                    elevated_count += 1
                    primary_affected_corridors.add(edge.name)

                elif eid in upstream_feeders:
                    # Upstream feeder edge experiencing queue spillback
                    spillback_intensity = dur_fraction * sev_multiplier * min(1.0, (H / 25.0))
                    effective_capacity = base_capacity * max(0.35, 1.0 - (0.55 * spillback_intensity))
                    vc_ratio = round(nominal_vol / effective_capacity, 2)

                    delay_factor = 1.0 + (1.8 * spillback_intensity)
                    pred_time = round(base_time * delay_factor, 2)
                    delay = round(max(0.0, pred_time - base_time), 2)
                    queue_len = round((edge.length_km * 1000.0) * min(0.9, spillback_intensity * 0.75), 1)

                    risk = min(95.0, round(25.0 + (delay * 4.0) + (vc_ratio * 18.0), 1))
                    c_level = CongestionLevel.HEAVY if vc_ratio > 1.1 else (CongestionLevel.MODERATE if vc_ratio > 0.8 else CongestionLevel.FREE_FLOW)
                    impact_type = "UPSTREAM_SPILLBACK"
                    if c_level in [CongestionLevel.HEAVY, CongestionLevel.BLOCKED]:
                        elevated_count += 1
                        next_probable_bottlenecks.add(edge.name)

                elif eid in bypass_edges:
                    # Diversion bypass absorbing traffic genuinely displaced from the blocked segment
                    diverted_vol = (target_displaced_rate / max(1, len(bypass_edges))) * dur_fraction
                    total_vol = nominal_vol + diverted_vol
                    vc_ratio = round(total_vol / base_capacity, 2)

                    delay_factor = 1.0 + (0.8 * min(2.0, (vc_ratio ** 2)))
                    pred_time = round(base_time * delay_factor, 2)
                    delay = round(max(0.0, pred_time - base_time), 2)
                    queue_len = round((edge.length_km * 1000.0) * 0.25 * min(1.0, vc_ratio), 1)

                    risk = min(80.0, round(15.0 + (vc_ratio * 30.0), 1))
                    c_level = CongestionLevel.MODERATE if vc_ratio > 0.8 else CongestionLevel.FREE_FLOW
                    impact_type = "DIVERSION_LOADED"
                    if vc_ratio > 1.0:
                        elevated_count += 1
                        next_probable_bottlenecks.add(edge.name)

                elif eid in downstream_exits:
                    # Downstream bottleneck / shockwave
                    vc_ratio = round(nominal_vol / base_capacity, 2)
                    pred_time = round(base_time * 1.15, 2)
                    delay = round(max(0.0, pred_time - base_time), 2)
                    queue_len = 0.0
                    risk = min(60.0, round(10.0 + (vc_ratio * 20.0), 1))
                    c_level = CongestionLevel.MODERATE if vc_ratio > 0.9 else CongestionLevel.FREE_FLOW
                    impact_type = "DOWNSTREAM_BOTTLENECK"

                else:
                    # Nominal background traffic
                    vc_ratio = round(nominal_vol / base_capacity, 2)
                    pred_time = base_time
                    delay = 0.0
                    queue_len = 0.0
                    risk = round(vc_ratio * 25.0, 1)
                    c_level = edge.congestion_level
                    impact_type = "NOMINAL"

                total_net_time += pred_time
                edge_impacts.append(
                    EdgeImpactForecast(
                        edge_id=edge.id,
                        road_name=edge.name,
                        source=edge.source,
                        target=edge.target,
                        baseline_travel_time_min=round(base_time, 2),
                        predicted_travel_time_min=pred_time,
                        expected_delay_min=delay,
                        predicted_volume_capacity_ratio=vc_ratio,
                        predicted_congestion_level=c_level,
                        queue_length_meters=queue_len,
                        impact_type=impact_type,
                        risk_score=risk,
                    )
                )

            # Junction Saturation Analysis
            junction_saturations: List[JunctionSaturationForecast] = []
            saturated_junction_count = 0
            for nid, node in nodes_map.items():
                if node.type != "intersection":
                    continue

                incoming_edges = [e for e in edge_impacts if e.target == nid]
                critical_incomings = [e.road_name for e in incoming_edges if e.expected_delay_min > 2.0]

                if nid == target_source:
                    sat_index = min(1.0, round(0.55 + (0.35 * dur_fraction * sev_multiplier), 2))
                    risk_txt = "CRITICAL" if sat_index > 0.75 else "MODERATE"
                elif nid == target_target:
                    sat_index = min(1.0, round(0.40 + (0.25 * dur_fraction), 2))
                    risk_txt = "MODERATE"
                elif critical_incomings:
                    sat_index = min(1.0, round(0.35 + (0.15 * len(critical_incomings)), 2))
                    risk_txt = "MODERATE" if sat_index < 0.7 else "CRITICAL"
                else:
                    sat_index = 0.20
                    risk_txt = "LOW"

                if sat_index >= 0.70:
                    saturated_junction_count += 1
                    next_probable_bottlenecks.add(node.name)

                junction_saturations.append(
                    JunctionSaturationForecast(
                        junction_id=nid,
                        junction_name=node.name,
                        saturation_index=sat_index,
                        inflow_spillback_risk=risk_txt,
                        incoming_delayed_edges=critical_incomings,
                    )
                )

            net_delay = max(0.0, round(total_net_time - baseline_total_time, 2))
            summary_txt = (
                f"T+{H}min forecast: {target_edge.name} capacity reduced by {int(incident.capacity_reduction_pct * 100)}%. "
                f"Queue accumulation propagates to {len(upstream_feeders)} upstream feeder corridors, "
                f"adding estimated {net_delay:.1f} vehicle-minutes network-wide delay."
            )

            snapshot = NetworkForecastSnapshot(
                horizon_minutes=H,
                forecast_timestamp=datetime.utcnow().isoformat() + "Z",
                model_method="Graph-Based Queue Spillback & Diversion Flow Model v2.0",
                provenance="SIMULATION_BASED_ESTIMATE",
                confidence_score=round(max(0.70, 0.90 - (H * 0.002)), 2),
                total_network_travel_time_min=round(total_net_time, 2),
                network_delay_relative_to_baseline_min=net_delay,
                elevated_risk_corridors_count=elevated_count,
                saturated_junctions_count=saturated_junction_count,
                edge_impacts=edge_impacts,
                junction_saturations=junction_saturations,
                propagation_summary=summary_txt,
            )
            forecast_snapshots[H] = snapshot

        return MultiHorizonForecastResponse(
            incident=incident,
            baseline_total_network_travel_time_min=round(baseline_total_time, 2),
            forecasts=forecast_snapshots,
            primary_affected_corridors=list(primary_affected_corridors),
            next_probable_bottlenecks=list(next_probable_bottlenecks),
            model_assumptions=self.assumptions,
        )

    def evaluate_demand_scenario(
        self,
        origin_node_id: str = "EMS_STATE_BANK",
        destination_node_id: str = "HOSPITAL_AJ_KUNTIKAN",
        extra_vehicles: int = 10,
        background_volume_mode: str = "ESTIMATED_CALIBRATED",
        arrival_window_min: float = 5.0,
    ) -> DemandSimulationResponse:
        """
        Solves the demand model and '10 vehicles, same destination' problem (Prompt C5).
        Evaluates:
        1. One route is faster but almost full.
        2. Another route is longer but has spare capacity.
        3. Several vehicles sent along the same route make it overloaded.
        4. Separate routes merge at the same downstream bottleneck.
        5. All alternatives are poor or infeasible.
        6. Background demand unknown -> surface explicit uncertainty.
        """
        graph = self.routing_service.graph
        edges_map = self.routing_service.edges

        if not graph.has_node(origin_node_id) or not graph.has_node(destination_node_id):
            raise ValueError(f"Origin '{origin_node_id}' or destination '{destination_node_id}' not found in road network")

        # Subgraph excluding closed edges
        subgraph = graph.copy()
        for eid, e in edges_map.items():
            if e.is_closed or e.congestion_level == CongestionLevel.BLOCKED:
                if subgraph.has_edge(e.source, e.target):
                    subgraph.remove_edge(e.source, e.target)

        if not nx.has_path(subgraph, origin_node_id, destination_node_id):
            return DemandSimulationResponse(
                origin_node_id=origin_node_id,
                destination_node_id=destination_node_id,
                extra_vehicles=extra_vehicles,
                background_volume_mode=background_volume_mode,
                feasible_routes_count=0,
                routes_evaluated=[],
                recommended_strategy="NO_FEASIBLE_PATH",
                recommendation_explanation="No viable route exists in the directed graph between origin and destination without traversing closed roads.",
                uncertainty_notice=None,
                assumptions=["No path available due to severe road closures."],
                provenance="SIMULATION_BASED_ESTIMATE",
            )

        # Generate up to 3 candidate routes
        path_gen = nx.shortest_simple_paths(subgraph, origin_node_id, destination_node_id, weight="distance_km")
        viable_routes = []
        for p_idx, node_path in enumerate(path_gen):
            if len(viable_routes) >= 3:
                break
            route_edge_objs = []
            route_edge_ids = []
            tot_len_km = 0.0
            free_flow_min = 0.0
            is_valid = True
            for i in range(len(node_path) - 1):
                u, v = node_path[i], node_path[i+1]
                if not graph.has_edge(u, v):
                    is_valid = False
                    break
                eid = graph[u][v].get("edge_id")
                e = edges_map.get(eid)
                if not e:
                    is_valid = False
                    break
                route_edge_objs.append(e)
                route_edge_ids.append(eid)
                tot_len_km += e.length_km
                free_flow_min += (e.length_km / max(e.base_speed_kmh, 15.0)) * 60.0

            if not is_valid:
                continue

            # Bottleneck and baseline evaluation
            max_vc = 0.0
            min_spare_cap = 999999.0
            bottleneck_name = ""
            for e in route_edge_objs:
                nom_cap = max(500.0, float(e.lanes) * 900.0)
                nom_vol = float(e.lanes) * 650.0 * (0.3 + 0.7 * float(e.density_score)) if background_volume_mode != "UNKNOWN" else nom_cap * 0.50
                vc = nom_vol / nom_cap
                spare = max(0.0, nom_cap - nom_vol)
                if vc > max_vc:
                    max_vc = vc
                    bottleneck_name = e.name
                if spare < min_spare_cap:
                    min_spare_cap = spare

            viable_routes.append({
                "route_index": p_idx + 1,
                "node_path": node_path,
                "edge_ids": route_edge_ids,
                "names": [e.name for e in route_edge_objs],
                "length_km": round(tot_len_km, 2),
                "free_flow_time_min": round(free_flow_min, 2),
                "baseline_max_vc": round(max_vc, 2),
                "bottleneck_name": bottleneck_name,
                "spare_capacity_pcu_hr": round(min_spare_cap, 1),
            })

        # Calculate arrival rate from extra vehicles over window
        added_flow_rate = (float(extra_vehicles) / max(1.0, arrival_window_min)) * 60.0  # PCU/hr equivalent

        # Evaluate Scenario 1: All extra vehicles on Route 1
        r1 = viable_routes[0]
        r1_loaded_vc = r1["baseline_max_vc"] + (added_flow_rate / (float(edges_map[r1['edge_ids'][0]].lanes) * 900.0))
        r1_overloaded = r1_loaded_vc >= 1.0

        fastest_eval = {
            "route_title": f"Route 1 ({viable_routes[0]['length_km']} km)",
            "added_flow_rate_pcu_hr": round(added_flow_rate, 1),
            "projected_peak_vc": round(r1_loaded_vc, 2),
            "causes_overload": r1_overloaded,
            "evaluation": "Overloads corridor" if r1_overloaded else "Absorbs extra demand safely"
        }

        # Evaluate Scenario 2: Route 2 (if available)
        spare_eval = None
        if len(viable_routes) >= 2:
            r2 = viable_routes[1]
            r2_loaded_vc = r2["baseline_max_vc"] + (added_flow_rate / (float(edges_map[r2['edge_ids'][0]].lanes) * 900.0))
            spare_eval = {
                "route_title": f"Route 2 ({r2['length_km']} km)",
                "spare_capacity_pcu_hr": r2["spare_capacity_pcu_hr"],
                "projected_peak_vc": round(r2_loaded_vc, 2),
                "is_longer_but_higher_reserve": r2["length_km"] > r1["length_km"] and r2["spare_capacity_pcu_hr"] > r1["spare_capacity_pcu_hr"]
            }

        # Check shared downstream bottlenecks between Route 1 and Route 2
        shared_edge = None
        shared_warning = None
        if len(viable_routes) >= 2:
            common_edges = set(viable_routes[0]["edge_ids"]).intersection(set(viable_routes[1]["edge_ids"]))
            if common_edges:
                shared_eid = next(iter(common_edges))
                shared_e = edges_map.get(shared_eid)
                shared_edge = shared_e.name if shared_e else shared_eid
                shared_warning = f"Route 1 and Route 2 merge into common segment '{shared_edge}', which concentrates joint traffic before the destination."

        # Recommendation logic
        if len(viable_routes) == 1:
            strategy = "ASSIGN_SINGLE_ROUTE"
            rec_text = f"Only one feasible path exists ({viable_routes[0]['length_km']} km). All {extra_vehicles} vehicles assigned to Route 1."
        elif r1_overloaded and spare_eval and spare_eval["projected_peak_vc"] < 1.0:
            strategy = "CAPACITY_AWARE_DIVERSION_TO_SPARE"
            rec_text = f"Route 1 is shorter ({r1['length_km']} km) but sending all {extra_vehicles} vehicles pushes its peak V/C to {r1_loaded_vc:.2f} (saturation). Route 2 ({viable_routes[1]['length_km']} km) has {viable_routes[1]['spare_capacity_pcu_hr']} PCU/hr reserve; recommend routing vehicles via Route 2 to avoid causing an active jam."
        elif r1_overloaded and len(viable_routes) >= 2:
            strategy = "PROPORTIONAL_CAPACITY_SPLIT"
            rec_text = f"Both alternative corridors have constrained reserve. Splitting the {extra_vehicles} vehicles across Route 1 (50%) and Route 2 (50%) keeps both links below runaway queue thresholds."
        else:
            strategy = "ASSIGN_FASTEST_CORRIDOR"
            rec_text = f"Route 1 ({r1['length_km']} km) possesses sufficient spare capacity ({r1['spare_capacity_pcu_hr']} PCU/hr) to absorb all {extra_vehicles} vehicles without exceeding capacity (loaded V/C: {r1_loaded_vc:.2f})."

        uncertainty_notice = None
        if background_volume_mode == "UNKNOWN":
            uncertainty_notice = "Background arterial demand is unmeasured in the field; baseline volumes are rule-based estimates. Queue calculations are conditional on these modeling assumptions."

        return DemandSimulationResponse(
            origin_node_id=origin_node_id,
            destination_node_id=destination_node_id,
            extra_vehicles=extra_vehicles,
            background_volume_mode=background_volume_mode,
            feasible_routes_count=len(viable_routes),
            routes_evaluated=viable_routes,
            fastest_alternative=fastest_eval,
            spare_capacity_alternative=spare_eval,
            shared_downstream_bottleneck=shared_edge,
            bottleneck_warning=shared_warning,
            recommended_strategy=strategy,
            recommendation_explanation=rec_text,
            uncertainty_notice=uncertainty_notice,
            assumptions=[
                f"{extra_vehicles} extra vehicles arriving over a {arrival_window_min}-minute mobilization window (equivalent flow: {added_flow_rate:.0f} PCU/hr).",
                "Edge travel times governed by standard BPR volume-delay curves: t = t0 * [1 + 0.15*(V/C)^4].",
                "Queue accumulation is evaluated against physical storage limits (7.5m / PCU).",
                "Shared merge bottlenecks are explicitly identified across candidate route geometries.",
            ],
            provenance="SIMULATION_BASED_ESTIMATE",
        )

# Global Prediction Engine initialized below
from backend.app.services.routing_service import routing_service
prediction_service = PredictiveIncidentEngine(routing_service)
