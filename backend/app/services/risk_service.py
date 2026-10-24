from datetime import datetime, timezone
from typing import List, Dict, Optional, Any
import networkx as nx

from backend.app.models.schemas import (
    NetworkForecastSnapshot,
    PrioritizedRoadRisk,
    PrioritizedJunctionRisk,
    RiskComponentBreakdown,
    RiskAssessmentResponse,
    IncidentSeverity,
)

class RiskAnalysisService:
    """
    Evaluates explainable traffic risk across road segments and junctions.
    Decomposes risk scores into 4 clear components:
    1. Incident Severity (0-25)
    2. Capacity Load & V/C Ratio (0-25)
    3. Downstream Dependency / Network Criticality (0-25)
    4. Diversion Deficit / Bottleneck Trapping (0-25)
    """
    def __init__(self, routing_service):
        self.routing_service = routing_service

    def assess_network_risk(
        self,
        snapshot: NetworkForecastSnapshot,
        incident_severity: IncidentSeverity = IncidentSeverity.HIGH
    ) -> RiskAssessmentResponse:
        """Evaluates and ranks all road segments and junctions by operational risk."""
        graph = self.routing_service.graph
        nodes_map = self.routing_service.nodes

        # Precompute betweenness centrality for structural dependency
        try:
            centrality = nx.betweenness_centrality(graph)
        except Exception:
            centrality = {}

        high_risk_roads: List[PrioritizedRoadRisk] = []
        for impact in snapshot.edge_impacts:
            # 1. Severity component
            if impact.impact_type == "DIRECT_INCIDENT":
                sev_score = 25.0 if incident_severity == IncidentSeverity.CRITICAL else (20.0 if incident_severity == IncidentSeverity.HIGH else 14.0)
            elif impact.impact_type == "UPSTREAM_SPILLBACK":
                sev_score = 18.0
            elif impact.impact_type == "DIVERSION_LOADED":
                sev_score = 12.0
            else:
                sev_score = 4.0

            # 2. Capacity Load component (V/C ratio scaled to 25)
            vc = impact.predicted_volume_capacity_ratio
            cap_score = min(25.0, round(max(0.0, vc * 16.0), 1))

            # 3. Downstream Dependency component (Centrality of target node)
            c_val = centrality.get(impact.target, 0.1)
            dep_score = min(25.0, round(c_val * 60.0 + 8.0, 1))

            # 4. Diversion Deficit (Out-degree of target junction)
            out_degree = graph.out_degree(impact.target) if graph.has_node(impact.target) else 2
            div_score = 25.0 if out_degree <= 1 else (16.0 if out_degree == 2 else 9.0)

            total_risk = round(sev_score + cap_score + dep_score + div_score, 1)

            # Assign risk level
            if total_risk >= 75.0:
                risk_lvl = "CRITICAL"
            elif total_risk >= 55.0:
                risk_lvl = "HIGH"
            elif total_risk >= 35.0:
                risk_lvl = "MODERATE"
            else:
                risk_lvl = "LOW"

            contributing = []
            if impact.impact_type == "DIRECT_INCIDENT":
                contributing.append(f"Direct corridor disruption ({incident_severity.value} severity)")
            if vc > 1.0:
                contributing.append(f"Volume exceeds arterial capacity (V/C: {vc:.2f})")
            if impact.queue_length_meters > 150:
                contributing.append(f"Spillback queue accumulation: {int(impact.queue_length_meters)} meters")
            if out_degree <= 2:
                contributing.append("Limited diversion outlets (high bottleneck entrapment)")
            if not contributing:
                contributing.append("Normal arterial flow conditions")

            if risk_lvl == "CRITICAL":
                consequence = f"Imminent corridor paralysis; expected delay +{impact.expected_delay_min:.1f} min spilling to adjacent intersections"
                recom = "Deploy traffic management team; initiate upstream variable message sign (VMS) diversion"
            elif risk_lvl == "HIGH":
                consequence = f"Significant queue accumulation ({int(impact.queue_length_meters)}m) threatening downstream junction clearance"
                recom = "Monitor signal cycle timing; adjust green split for queue flushing"
            elif risk_lvl == "MODERATE":
                consequence = "Moderate speed reduction and elevated traffic density"
                recom = "Maintain situational awareness; prepare secondary detour signs"
            else:
                consequence = "Passable flow within standard capacity tolerance"
                recom = "No immediate physical intervention required"

            high_risk_roads.append(
                PrioritizedRoadRisk(
                    rank=1,
                    edge_id=impact.edge_id,
                    road_name=impact.road_name,
                    risk_level=risk_lvl,
                    risk_score=total_risk,
                    components=RiskComponentBreakdown(
                        severity_component=sev_score,
                        capacity_load_component=cap_score,
                        downstream_dependency=dep_score,
                        diversion_deficit=div_score,
                        total_risk_score=total_risk,
                    ),
                    contributing_factors=contributing,
                    expected_consequences=consequence,
                    recommended_action=recom,
                )
            )

        # Sort road risks descending
        high_risk_roads.sort(key=lambda r: r.risk_score, reverse=True)
        for idx, r in enumerate(high_risk_roads, 1):
            r.rank = idx

        # Junction Risk Evaluation
        critical_junctions: List[PrioritizedJunctionRisk] = []
        for junc in snapshot.junction_saturations:
            sat = junc.saturation_index
            sat_score = round(sat * 100.0, 1)

            if sat >= 0.75:
                lvl = "CRITICAL"
                recom = "Deploy field traffic officer for manual cycle override; flush blocked feeder arm"
            elif sat >= 0.50:
                lvl = "HIGH"
                recom = "Extend green phase split by 20% on saturated incoming approaches"
            elif sat >= 0.35:
                lvl = "MODERATE"
                recom = "Monitor ingress volume queues via surveillance cameras"
            else:
                lvl = "LOW"
                recom = "Normal automated signal operation"

            critical_junctions.append(
                PrioritizedJunctionRisk(
                    rank=1,
                    junction_id=junc.junction_id,
                    junction_name=junc.junction_name,
                    saturation_risk=lvl,
                    risk_score=sat_score,
                    critical_feeder_corridors=junc.incoming_delayed_edges or ["Nominal approaches"],
                    recommended_action=recom,
                )
            )

        critical_junctions.sort(key=lambda j: j.risk_score, reverse=True)
        for idx, j in enumerate(critical_junctions, 1):
            j.rank = idx

        highest_sector = high_risk_roads[0].road_name if high_risk_roads else "Central Arterial Grid"

        return RiskAssessmentResponse(
            generated_at=datetime.now(timezone.utc).isoformat() + "Z",
            forecast_horizon_minutes=snapshot.horizon_minutes,
            high_risk_roads=high_risk_roads[:8],
            critical_junctions=critical_junctions[:6],
            highest_vulnerability_sector=highest_sector,
        )

# Global Risk Analysis Service initialized below
from backend.app.services.routing_service import routing_service
risk_service = RiskAnalysisService(routing_service)
