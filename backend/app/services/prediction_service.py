import time
import math
from datetime import datetime
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
    EdgeImpactForecast,
    JunctionSaturationForecast,
    NetworkForecastSnapshot,
    MultiHorizonForecastResponse,
    RiskComponentBreakdown,
    PrioritizedRoadRisk,
    PrioritizedJunctionRisk,
    RiskAssessmentResponse,
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
        self._init_default_assumptions()

    def _init_default_assumptions(self):
        self.assumptions = [
            "Lane saturation flow rate: 900 vehicles/hour/lane nominal arterial capacity.",
            "Queue accumulation: V_excess = max(0, Inflow - Capacity_eff) * delta_t.",
            "Vehicle storage footprint: 7.5 meters effective space per passenger car unit (PCU).",
            "Upstream spillback triggers when queue length exceeds segment storage capacity.",
            "Diversion loading: 45% of upstream demand seeks nearest parallel bypass corridor.",
            "Forecast horizons calibrated for 15, 30, and 60 minutes from incident inception."
        ]

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
    ) -> TrafficIncident:
        """Registers a new traffic incident in the predictive intelligence store."""
        edge = self.routing_service.edges.get(affected_edge_id)
        road_name = edge.name if edge else affected_edge_id
        inc_id = f"INC-{affected_edge_id.upper()}-{int(time.time())}"
        now_iso = datetime.utcnow().isoformat() + "Z"

        incident = TrafficIncident(
            incident_id=inc_id,
            category=category,
            affected_edge_id=affected_edge_id,
            road_name=road_name,
            start_timestamp=now_iso,
            severity=severity,
            blocked_lanes=blocked_lanes,
            total_lanes=edge.lanes if edge else 2,
            capacity_reduction_pct=min(1.0, max(0.1, capacity_reduction_pct)),
            estimated_duration_min=max(5.0, estimated_duration_min),
            provenance=provenance,
            verification_status=VerificationStatus.VERIFIED,
            confidence_score=0.90 if provenance == EventProvenance.OBSERVED else 0.80,
            description=description or f"{category.value} blocking {road_name}",
            reported_by="TRAFFIC_CONTROL_ANALYST",
        )

        self.active_incidents[inc_id] = incident
        # Update edge in routing_service so public map immediately renders active blockage
        if edge:
            edge.has_incident = True
            edge.incident_description = incident.description
            edge.congestion_level = CongestionLevel.BLOCKED if severity == IncidentSeverity.CRITICAL else CongestionLevel.HEAVY
        return incident

    def get_incident(self, incident_id: str) -> Optional[TrafficIncident]:
        return self.active_incidents.get(incident_id)

    def list_incidents(self) -> List[TrafficIncident]:
        return list(self.active_incidents.values())

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

# Global Prediction Engine initialized below
from backend.app.services.routing_service import routing_service
prediction_service = PredictiveIncidentEngine(routing_service)
