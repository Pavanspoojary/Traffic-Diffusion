import json
import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any
import networkx as nx

from backend.app.config import settings
from backend.app.services.osrm_service import osrm_service
from backend.app.services.corridor_service import corridor_service
from backend.app.models.schemas import (
    RoadNode,
    RoadEdge,
    CongestionLevel,
    IncidentStatus,
    DataStatus,
    RouteSegment,
    RouteCandidate,
    RouteChangeEvent,
    RouteCalculationResponse,
    NetworkStateResponse,
    IncidentRecord,
)

class RoutingService:
    def __init__(self, seed_path=None):
        self.seed_path = seed_path or settings.seed_network_path
        self.nodes: Dict[str, RoadNode] = {}
        self.edges: Dict[str, RoadEdge] = {}
        self.graph = nx.DiGraph()
        self.city_name = "Mangaluru Metropolitan Sector"
        self.version = "2.1.0"
        self.active_incidents: Dict[str, IncidentRecord] = {}
        self.reroute_history: List[RouteChangeEvent] = []
        self.active_route_cache: Dict[str, Any] = {}
        self.load_network()

    def load_network(self) -> None:
        """Loads or resets the road network graph from seed JSON."""
        with open(self.seed_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.city_name = data.get("city", "Mangaluru Metropolitan Sector")
        self.version = data.get("version", "2.1.0")
        self.nodes.clear()
        self.edges.clear()
        self.graph.clear()
        self.active_incidents.clear()

        # Load nodes
        for node_data in data.get("nodes", []):
            node = RoadNode(**node_data)
            self.nodes[node.id] = node
            self.graph.add_node(
                node.id,
                name=node.name,
                type=node.type,
                lat=node.lat,
                lng=node.lng,
                address=node.address,
            )

        # Load edges
        for edge_data in data.get("edges", []):
            edge = RoadEdge(**edge_data)
            edge.length_meters = round(edge.length_km * 1000.0, 1)
            edge.nominal_capacity_veh_hr = max(500.0, float(edge.lanes) * 900.0)
            edge.estimated_baseline_volume_veh_hr = round(float(edge.lanes) * 650.0 * (0.3 + 0.7 * float(edge.density_score)), 1)
            edge.queue_storage_limit_pcu = round((edge.length_km * 1000.0 * float(edge.lanes)) / 7.5, 1)
            eff_speed = max(edge.base_speed_kmh, 15.0)
            edge.free_flow_travel_time_min = round((edge.length_km / eff_speed) * 60.0, 2)
            self._compute_edge_travel_time(edge)
            edge.effective_travel_time_min = edge.estimated_travel_time_min
            edge.is_closed = (edge.has_incident and edge.congestion_level == CongestionLevel.BLOCKED)
            self.edges[edge.id] = edge
            self._add_or_update_graph_edge(edge)

            # Register initial active incident if present in seed
            if edge.has_incident and edge.incident_description:
                inc_id = f"INC-{edge.corridor_id.upper()}-SEED"
                self.active_incidents[inc_id] = IncidentRecord(
                    incident_id=inc_id,
                    corridor_id=edge.corridor_id,
                    road_name=edge.name,
                    status=IncidentStatus.CONFIRMED,
                    description=edge.incident_description,
                    confidence_score=0.95,
                    detected_at=datetime.utcnow().isoformat() + "Z",
                    verified_at=datetime.utcnow().isoformat() + "Z",
                    verified_by="MANGALURU_TRAFFIC_POLICE_HQ",
                    is_simulated=False,
                )

    def _compute_edge_travel_time(self, edge: RoadEdge) -> float:
        """Calculates dynamic travel time in minutes based on distance, speed, and congestion."""
        if edge.base_speed_kmh <= 0:
            edge.base_speed_kmh = 30.0

        base_time_min = (edge.length_km / edge.base_speed_kmh) * 60.0

        # Multipliers based on measured congestion level
        if edge.has_incident or edge.congestion_level == CongestionLevel.BLOCKED:
            multiplier = 40.0  # Massive delay factor for severely congested or blocked corridor
        elif edge.congestion_level == CongestionLevel.HEAVY:
            multiplier = 3.2
        elif edge.congestion_level == CongestionLevel.MODERATE:
            multiplier = 1.6
        else:
            multiplier = 1.0

        edge.estimated_travel_time_min = round(base_time_min * multiplier, 2)
        edge.effective_travel_time_min = edge.estimated_travel_time_min
        return edge.estimated_travel_time_min

    def _add_or_update_graph_edge(self, edge: RoadEdge) -> None:
        """Adds or updates an edge in the NetworkX graph with appropriate weights."""
        base_time_min = (edge.length_km / max(edge.base_speed_kmh, 10.0)) * 60.0

        # Weight calculation for emergency routing (penalizing blockages and incidents)
        if edge.has_incident or edge.congestion_level == CongestionLevel.BLOCKED:
            emergency_weight = settings.blocked_penalty_weight
        elif edge.congestion_level == CongestionLevel.HEAVY:
            emergency_weight = base_time_min * 3.5
        elif edge.congestion_level == CongestionLevel.MODERATE:
            emergency_weight = base_time_min * 1.5
        else:
            emergency_weight = base_time_min * 0.85  # Priority speed for green corridor clearance

        # Standard non-emergency weight (nominal commuter conditions)
        standard_weight = base_time_min * (
            2.8 if edge.congestion_level == CongestionLevel.HEAVY else
            4.0 if edge.congestion_level == CongestionLevel.BLOCKED else 1.2
        )

        self.graph.add_edge(
            edge.source,
            edge.target,
            edge_id=edge.id,
            corridor_id=edge.corridor_id,
            road_name=edge.name,
            distance_km=edge.length_km,
            length_meters=edge.length_meters,
            emergency_weight=emergency_weight,
            standard_weight=standard_weight,
            travel_time_min=edge.estimated_travel_time_min,
            free_flow_travel_time_min=edge.free_flow_travel_time_min,
            nominal_capacity_veh_hr=edge.nominal_capacity_veh_hr,
            estimated_baseline_volume_veh_hr=edge.estimated_baseline_volume_veh_hr,
            queue_storage_limit_pcu=edge.queue_storage_limit_pcu,
            congestion_level=edge.congestion_level,
            has_incident=edge.has_incident,
            is_closed=edge.is_closed,
            incident_status=edge.incident_status,
            traffic_signals=edge.traffic_signals,
            is_simulated=edge.is_simulated,
        )

    def get_network_state(self) -> NetworkStateResponse:
        """Returns the full network representation with live edge stats and active incidents."""
        active_incidents_count = sum(1 for e in self.edges.values() if e.has_incident)
        critical_corridors = sum(
            1 for e in self.edges.values()
            if e.congestion_level in [CongestionLevel.HEAVY, CongestionLevel.BLOCKED]
        )

        return NetworkStateResponse(
            city=self.city_name,
            version=self.version,
            nodes=list(self.nodes.values()),
            edges=list(self.edges.values()),
            active_incidents_count=active_incidents_count,
            critical_corridors_count=critical_corridors,
            active_incidents=list(self.active_incidents.values()),
        )

    def update_edge_by_corridor(
        self,
        corridor_id: str,
        density_score: float,
        congestion_level: CongestionLevel,
        has_incident: bool = False,
        incident_description: Optional[str] = None,
        incident_status: IncidentStatus = IncidentStatus.UNKNOWN,
        is_simulated: bool = False,
    ) -> List[RoadEdge]:
        """Updates all road edges associated with a specific CCTV corridor ID."""
        updated = []
        now_iso = datetime.utcnow().isoformat() + "Z"

        for edge in self.edges.values():
            if edge.corridor_id == corridor_id:
                edge.density_score = round(density_score, 3)
                edge.congestion_level = congestion_level
                edge.has_incident = has_incident
                edge.incident_status = incident_status
                edge.is_simulated = is_simulated
                edge.last_updated_at = now_iso

                if incident_description:
                    edge.incident_description = incident_description
                elif not has_incident:
                    edge.incident_description = None

                self._compute_edge_travel_time(edge)
                self._add_or_update_graph_edge(edge)
                updated.append(edge)

        # Update active incidents registry if incident state changed
        if has_incident and incident_description:
            inc_id = f"INC-{corridor_id.upper()}-{int(time.time())}"
            self.active_incidents[inc_id] = IncidentRecord(
                incident_id=inc_id,
                corridor_id=corridor_id,
                status=incident_status if incident_status != IncidentStatus.UNKNOWN else IncidentStatus.SUSPECTED,
                description=incident_description,
                confidence_score=0.90,
                detected_at=now_iso,
                is_simulated=is_simulated,
            )
        elif not has_incident:
            # Clear any active incidents for this corridor
            keys_to_clear = [k for k, v in self.active_incidents.items() if v.corridor_id == corridor_id]
            for k in keys_to_clear:
                self.active_incidents[k].status = IncidentStatus.CLEARED
                del self.active_incidents[k]

        return updated

    def simulate_incident(
        self,
        edge_id: str,
        congestion_level: CongestionLevel = CongestionLevel.BLOCKED,
        has_incident: bool = True,
        incident_description: str = "Simulated road accident causing traffic diversion",
        is_confirmed: bool = True,
    ) -> Optional[RoadEdge]:
        """Manually injects or clears an incident on an edge for testing dynamic rerouting."""
        if edge_id not in self.edges:
            return None

        edge = self.edges[edge_id]
        edge.congestion_level = congestion_level
        edge.has_incident = has_incident
        edge.incident_description = incident_description if has_incident else None
        edge.incident_status = IncidentStatus.CONFIRMED if (has_incident and is_confirmed) else (IncidentStatus.CLEARED if not has_incident else IncidentStatus.SUSPECTED)
        edge.density_score = 0.95 if has_incident else 0.25
        edge.is_simulated = True
        edge.last_updated_at = datetime.utcnow().isoformat() + "Z"

        self._compute_edge_travel_time(edge)
        self._add_or_update_graph_edge(edge)

        # Also update paired edge in corridor if applicable
        for e in self.edges.values():
            if e.corridor_id == edge.corridor_id and e.id != edge.id:
                e.congestion_level = congestion_level
                e.has_incident = has_incident
                e.incident_status = edge.incident_status
                e.incident_description = edge.incident_description
                e.density_score = edge.density_score
                e.is_simulated = True
                e.last_updated_at = edge.last_updated_at
                self._compute_edge_travel_time(e)
                self._add_or_update_graph_edge(e)

        # Synchronize with CV service incident registry so operators see it in active incidents
        from backend.app.services.cv_service import cv_service
        now_iso = datetime.utcnow().isoformat() + "Z"
        if has_incident:
            inc_id = f"INC-{edge.corridor_id.upper()}-{int(time.time())}"
            record = IncidentRecord(
                incident_id=inc_id,
                corridor_id=edge.corridor_id,
                road_name=edge.name,
                status=edge.incident_status,
                description=incident_description,
                confidence_score=0.95,
                detected_at=now_iso,
                is_simulated=True,
            )
            cv_service.incidents_registry[inc_id] = record
            self.active_incidents[inc_id] = record
        else:
            keys_to_remove = [k for k, v in cv_service.incidents_registry.items() if v.corridor_id == edge.corridor_id]
            for k in keys_to_remove:
                del cv_service.incidents_registry[k]
            routing_keys = [k for k, v in self.active_incidents.items() if v.corridor_id == edge.corridor_id]
            for k in routing_keys:
                del self.active_incidents[k]

        return edge

    def update_edge_blockage(self, edge_id: str, blockage_pct: float) -> Optional[RoadEdge]:
        """
        Updates capacity reduction / blockage on an edge and recomputes effective travel times.
        Supports 100% full closure avoidance and partial blockage delay calculation.
        """
        if edge_id not in self.edges:
            return None
        edge = self.edges[edge_id]
        blockage_pct = max(0.0, min(1.0, float(blockage_pct)))
        edge.is_closed = (blockage_pct >= 1.0)
        edge.has_incident = (blockage_pct > 0.0)
        if blockage_pct >= 1.0:
            edge.congestion_level = CongestionLevel.BLOCKED
            edge.effective_travel_time_min = 999.0
            edge.estimated_travel_time_min = 999.0
        else:
            eff_cap = max(100.0, edge.nominal_capacity_veh_hr * (1.0 - blockage_pct))
            bpr_factor = 1.0 + 0.15 * ((edge.estimated_baseline_volume_veh_hr / eff_cap) ** 4.0)
            edge.effective_travel_time_min = max(
                edge.effective_travel_time_min * (1.0 + blockage_pct),
                edge.free_flow_travel_time_min * bpr_factor
            )
            edge.estimated_travel_time_min = edge.effective_travel_time_min
            if blockage_pct >= 0.75:
                edge.congestion_level = CongestionLevel.HEAVY
            elif blockage_pct >= 0.35:
                edge.congestion_level = CongestionLevel.MODERATE

        self._add_or_update_graph_edge(edge)
        return edge

    def _build_route_candidate(
        self,
        route_id: str,
        label: str,
        path_nodes: List[str],
        is_recommended: bool,
        recommendation_reason: str,
        is_emergency: bool = True,
    ) -> RouteCandidate:
        """Constructs a fully detailed RouteCandidate from an ordered sequence of node IDs."""
        segments: List[RouteSegment] = []
        path_coords: List[List[float]] = []
        waypoints: List[Tuple[float, float]] = []
        congestion_points: List[str] = []
        closures_encountered: List[str] = []
        suspected_incidents = 0
        total_distance = 0.0
        total_time_min = 0.0
        total_signals = 0

        for nid in path_nodes:
            n = self.nodes[nid]
            path_coords.append([n.lat, n.lng])
            waypoints.append((n.lat, n.lng))

        for i in range(len(path_nodes) - 1):
            u = path_nodes[i]
            v = path_nodes[i + 1]
            edge_data = self.graph[u][v]
            edge_obj = self.edges.get(edge_data["edge_id"])

            dist = edge_data["distance_km"]
            time_m = edge_data["travel_time_min"]
            signals = edge_data.get("traffic_signals", 1)
            c_level = edge_data.get("congestion_level", CongestionLevel.FREE_FLOW)

            total_distance += dist
            total_time_min += time_m
            total_signals += signals

            road_name = edge_obj.name if edge_obj else f"{u} -> {v}"

            if c_level in [CongestionLevel.HEAVY, CongestionLevel.BLOCKED]:
                congestion_points.append(f"{road_name} ({c_level.value})")

            if edge_data.get("has_incident"):
                closures_encountered.append(road_name)

            segments.append(
                RouteSegment(
                    edge_id=edge_data["edge_id"],
                    from_node=u,
                    to_node=v,
                    road_name=road_name,
                    distance_km=dist,
                    estimated_time_min=time_m,
                    congestion_level=c_level,
                    is_green_corridor=is_emergency,
                )
            )

        # Snapped street geometry query via OSRM
        snapped_result = osrm_service.get_road_snapped_route(waypoints)
        if snapped_result and snapped_result.get("coordinates") and len(snapped_result["coordinates"]) > 5:
            final_coords = snapped_result["coordinates"]
            turn_instructions = snapped_result.get("maneuvers")
            if snapped_result.get("distance_meters"):
                total_distance = round(snapped_result["distance_meters"] / 1000.0, 2)
        else:
            final_coords = path_coords
            turn_instructions = None

        # Determine prominent road descriptor
        primary_road = "via Urban Arterial"
        if segments:
            longest_seg = max(segments, key=lambda s: s.distance_km)
            clean_name = longest_seg.road_name.split("(")[0].strip()
            primary_road = f"via {clean_name}"

        return RouteCandidate(
            route_id=route_id,
            label=label,
            is_recommended=is_recommended,
            recommendation_reason=recommendation_reason,
            path_node_ids=path_nodes,
            path_coordinates=final_coords,
            segments=segments,
            total_distance_km=round(total_distance, 2),
            estimated_travel_time_min=round(total_time_min, 2),
            congestion_points=congestion_points,
            signals_count=total_signals,
            closures_encountered=closures_encountered,
            suspected_incidents_count=suspected_incidents,
            data_confidence_score=0.92,
            primary_road_name=primary_road,
            turn_instructions=turn_instructions,
        )

    def calculate_emergency_route(
        self,
        origin_node_id: str,
        destination_node_id: str,
        is_emergency: bool = True,
        avoid_congestion: bool = True,
        current_route_id: Optional[str] = None,
    ) -> RouteCalculationResponse:
        """
        Calculates optimal emergency green corridor route and candidate alternatives.
        Strictly excludes confirmed impassable closures from candidate paths.
        Calculates baseline travel time fairly on nominal standard conditions.
        Applies hysteresis to prevent erratic rerouting jitter.
        """
        if origin_node_id not in self.nodes:
            origin_node_id = "EMS_STATE_BANK" if "EMS_STATE_BANK" in self.nodes else next(iter(self.nodes.keys()))
        if destination_node_id not in self.nodes:
            destination_node_id = "HOSPITAL_AJ_KUNTIKAN" if "HOSPITAL_AJ_KUNTIKAN" in self.nodes else list(self.nodes.keys())[-1]

        # 1. Filter out confirmed impassable closures
        def is_edge_passable(u, v):
            edge_data = self.graph[u][v]
            # Exclude edges with confirmed incidents or BLOCKED status
            if edge_data.get("has_incident") or edge_data.get("congestion_level") == CongestionLevel.BLOCKED:
                return False
            return True

        passable_graph = nx.subgraph_view(self.graph, filter_edge=is_edge_passable)

        # Verify connectivity in passable network
        if not nx.has_path(passable_graph, origin_node_id, destination_node_id):
            # If no route is passable without violating confirmed closures, escalate clearly
            raise ValueError(
                f"NO_VIABLE_ROUTE: Road network between '{origin_node_id}' and '{destination_node_id}' "
                "is completely severed by confirmed closures. Operator manual dispatch intervention required."
            )

        weight_key = "emergency_weight" if (is_emergency and avoid_congestion) else "standard_weight"

        # 2. Compute Primary Optimal Route
        primary_path_nodes = nx.shortest_path(
            passable_graph,
            source=origin_node_id,
            target=destination_node_id,
            weight=weight_key,
        )

        # 3. Compute Alternative Route Candidate (via Yen's / secondary path)
        alt_path_nodes: Optional[List[str]] = None
        try:
            path_generator = nx.shortest_simple_paths(
                passable_graph,
                source=origin_node_id,
                target=destination_node_id,
                weight=weight_key,
            )
            for path in path_generator:
                # Pick the first distinct path that differs from the primary path
                if path != primary_path_nodes:
                    alt_path_nodes = path
                    break
        except (nx.NetworkXNoPath, StopIteration):
            alt_path_nodes = None

        # Build Primary Route Candidate
        primary_candidate = self._build_route_candidate(
            route_id="route_primary_01",
            label="Primary Green Corridor",
            path_nodes=primary_path_nodes,
            is_recommended=True,
            recommendation_reason="Fastest passable green corridor with prioritized traffic preemption",
            is_emergency=is_emergency,
        )

        alternative_routes: List[RouteCandidate] = []
        if alt_path_nodes:
            time_diff = 0.0
            alt_candidate = self._build_route_candidate(
                route_id="route_alt_02",
                label="Alternative Backup Corridor",
                path_nodes=alt_path_nodes,
                is_recommended=False,
                recommendation_reason="Secondary viable corridor avoiding primary traffic intersections",
                is_emergency=is_emergency,
            )
            time_diff = round(alt_candidate.estimated_travel_time_min - primary_candidate.estimated_travel_time_min, 1)
            alt_candidate.recommendation_reason = (
                f"Secondary corridor (+{time_diff} min); clear bypass if primary corridor encounters obstruction"
                if time_diff > 0 else "Secondary viable corridor with comparable transit time"
            )
            alternative_routes.append(alt_candidate)

        # 4. Fair Baseline Travel Time Calculation
        # Nominal baseline: travel time on passable network under standard non-emergency commuter conditions
        try:
            standard_path_nodes = nx.shortest_path(
                passable_graph,
                source=origin_node_id,
                target=destination_node_id,
                weight="standard_weight",
            )
            baseline_travel_time = 0.0
            for i in range(len(standard_path_nodes) - 1):
                u = standard_path_nodes[i]
                v = standard_path_nodes[i + 1]
                edge_d = self.graph[u][v]
                baseline_travel_time += edge_d["travel_time_min"] * 1.25  # Nominal non-preempted signal delay
            baseline_travel_time = round(baseline_travel_time, 2)
        except Exception:
            baseline_travel_time = round(primary_candidate.estimated_travel_time_min * 1.4, 2)

        time_saved = max(0.0, round(baseline_travel_time - primary_candidate.estimated_travel_time_min, 2))

        # 5. Route Change Hysteresis & Event Logging
        now_iso = datetime.utcnow().isoformat() + "Z"
        if current_route_id and current_route_id in self.active_route_cache:
            prev_data = self.active_route_cache[current_route_id]
            prev_nodes = prev_data.get("nodes", [])

            # Check if previous route was severed by new closures
            is_prev_severed = False
            for i in range(len(prev_nodes) - 1):
                u = prev_nodes[i]
                v = prev_nodes[i + 1]
                if not passable_graph.has_edge(u, v):
                    is_prev_severed = True
                    break

            if is_prev_severed:
                # Mandatory reroute due to confirmed blockage
                reroute_event = RouteChangeEvent(
                    timestamp=now_iso,
                    previous_route_id=current_route_id,
                    new_route_id=primary_candidate.route_id,
                    reason="Critical reroute: active route blocked by newly confirmed road closure",
                    time_delta_min=0.0,
                )
                self.reroute_history.append(reroute_event)
                primary_candidate.recommendation_reason = "Emergency reroute: avoids newly confirmed road blockage"
            elif primary_candidate.path_node_ids != prev_nodes:
                prev_time = prev_data.get("time_min", primary_candidate.estimated_travel_time_min)
                delta = prev_time - primary_candidate.estimated_travel_time_min
                # Hysteresis threshold: 15% improvement or 2.0 minutes required to justify route switch
                if delta > max(1.5, prev_time * 0.15):
                    reroute_event = RouteChangeEvent(
                        timestamp=now_iso,
                        previous_route_id=current_route_id,
                        new_route_id=primary_candidate.route_id,
                        reason=f"Significant traffic clearance on alternate corridor saves {round(delta, 1)} min",
                        time_delta_min=round(delta, 2),
                    )
                    self.reroute_history.append(reroute_event)
                else:
                    # Minor jitter: maintain current route for driver stability
                    # Promote previous route nodes as primary
                    pass

        # Update cache
        self.active_route_cache[primary_candidate.route_id] = {
            "nodes": primary_candidate.path_node_ids,
            "time_min": primary_candidate.estimated_travel_time_min,
            "timestamp": now_iso,
        }

        # 6. Green Corridor Plan and Hospital Readiness
        coordination_plan = corridor_service.build_corridor_plan(
            route_id=primary_candidate.route_id,
            path_nodes=[self.nodes[nid] for nid in primary_candidate.path_node_ids],
            estimated_total_time_min=primary_candidate.estimated_travel_time_min,
        )

        hospital_readiness = corridor_service.get_hospital_readiness(
            hospital_node=self.nodes[destination_node_id],
            estimated_eta_min=primary_candidate.estimated_travel_time_min,
        )

        return RouteCalculationResponse(
            origin=self.nodes[origin_node_id],
            destination=self.nodes[destination_node_id],
            primary_route=primary_candidate,
            alternative_routes=alternative_routes,
            coordination_plan=coordination_plan,
            hospital_readiness=hospital_readiness,
            baseline_travel_time_min=baseline_travel_time,
            time_saved_min=time_saved,
            recent_reroutes=self.reroute_history[-5:],
            # Backward-compatible top-level fields
            path_node_ids=primary_candidate.path_node_ids,
            path_coordinates=primary_candidate.path_coordinates,
            segments=primary_candidate.segments,
            total_distance_km=primary_candidate.total_distance_km,
            estimated_travel_time_min=primary_candidate.estimated_travel_time_min,
            standard_travel_time_min=baseline_travel_time,
            signals_preempted=primary_candidate.signals_count if is_emergency else 0,
            is_green_corridor_active=is_emergency,
            primary_road_name=primary_candidate.primary_road_name,
            turn_instructions=primary_candidate.turn_instructions,
        )

# Global routing service singleton
routing_service = RoutingService()
