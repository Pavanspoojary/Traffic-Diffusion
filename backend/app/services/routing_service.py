import json
from typing import Dict, List, Optional, Tuple, Any
import networkx as nx

from backend.app.config import settings
from backend.app.services.osrm_service import osrm_service
from backend.app.models.schemas import (
    RoadNode,
    RoadEdge,
    CongestionLevel,
    RouteSegment,
    RouteCalculationResponse,
    NetworkStateResponse,
)

class RoutingService:
    def __init__(self, seed_path=None):
        self.seed_path = seed_path or settings.seed_network_path
        self.nodes: Dict[str, RoadNode] = {}
        self.edges: Dict[str, RoadEdge] = {}
        self.graph = nx.DiGraph()
        self.city_name = "Urban Metropolitan Sector"
        self.version = "1.0.0"
        self.load_network()

    def load_network(self) -> None:
        """Loads or resets the road network graph from seed JSON."""
        with open(self.seed_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.city_name = data.get("city", "Urban Metropolitan Sector")
        self.version = data.get("version", "1.0.0")
        self.nodes.clear()
        self.edges.clear()
        self.graph.clear()

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
            self._compute_edge_travel_time(edge)
            self.edges[edge.id] = edge
            self._add_or_update_graph_edge(edge)

    def _compute_edge_travel_time(self, edge: RoadEdge) -> float:
        """Calculates dynamic travel time in minutes based on distance, speed, and congestion."""
        if edge.base_speed_kmh <= 0:
            edge.base_speed_kmh = 30.0

        base_time_min = (edge.length_km / edge.base_speed_kmh) * 60.0

        # Multipliers based on congestion and incident
        if edge.has_incident or edge.congestion_level == CongestionLevel.BLOCKED:
            multiplier = 50.0  # Massive delay if blocked
        elif edge.congestion_level == CongestionLevel.HEAVY:
            multiplier = 3.5
        elif edge.congestion_level == CongestionLevel.MODERATE:
            multiplier = 1.6
        else:
            multiplier = 1.0

        edge.estimated_travel_time_min = round(base_time_min * multiplier, 2)
        return edge.estimated_travel_time_min

    def _add_or_update_graph_edge(self, edge: RoadEdge) -> None:
        """Adds or updates an edge in the NetworkX graph with appropriate weights."""
        base_time_min = (edge.length_km / max(edge.base_speed_kmh, 10.0)) * 60.0

        # Weight calculation for emergency routing (penalizing blockages and incidents)
        if edge.has_incident or edge.congestion_level == CongestionLevel.BLOCKED:
            emergency_weight = settings.blocked_penalty_weight
        elif edge.congestion_level == CongestionLevel.HEAVY:
            emergency_weight = base_time_min * 4.0
        elif edge.congestion_level == CongestionLevel.MODERATE:
            emergency_weight = base_time_min * 1.5
        else:
            emergency_weight = base_time_min * 0.9  # Priority speed for free flow green corridor

        # Standard non-emergency weight (nominal distance / speed without dynamic green avoidance)
        standard_weight = base_time_min * (
            3.0 if edge.congestion_level == CongestionLevel.HEAVY else
            5.0 if edge.congestion_level == CongestionLevel.BLOCKED else 1.0
        )

        self.graph.add_edge(
            edge.source,
            edge.target,
            edge_id=edge.id,
            corridor_id=edge.corridor_id,
            distance_km=edge.length_km,
            emergency_weight=emergency_weight,
            standard_weight=standard_weight,
            travel_time_min=edge.estimated_travel_time_min,
            congestion_level=edge.congestion_level,
            has_incident=edge.has_incident,
            traffic_signals=edge.traffic_signals,
        )

    def get_network_state(self) -> NetworkStateResponse:
        """Returns the full network representation with live edge stats."""
        active_incidents = sum(1 for e in self.edges.values() if e.has_incident)
        critical_corridors = sum(
            1 for e in self.edges.values()
            if e.congestion_level in [CongestionLevel.HEAVY, CongestionLevel.BLOCKED]
        )

        return NetworkStateResponse(
            city=self.city_name,
            version=self.version,
            nodes=list(self.nodes.values()),
            edges=list(self.edges.values()),
            active_incidents_count=active_incidents,
            critical_corridors_count=critical_corridors,
        )

    def update_edge_by_corridor(
        self,
        corridor_id: str,
        density_score: float,
        congestion_level: CongestionLevel,
        has_incident: bool = False,
        incident_description: Optional[str] = None,
    ) -> List[RoadEdge]:
        """Updates all road edges associated with a specific CCTV corridor ID."""
        updated = []
        for edge in self.edges.values():
            if edge.corridor_id == corridor_id:
                edge.density_score = round(density_score, 3)
                edge.congestion_level = congestion_level
                edge.has_incident = has_incident
                if incident_description:
                    edge.incident_description = incident_description
                elif not has_incident:
                    edge.incident_description = None

                self._compute_edge_travel_time(edge)
                self._add_or_update_graph_edge(edge)
                updated.append(edge)

        return updated

    def simulate_incident(
        self,
        edge_id: str,
        congestion_level: CongestionLevel = CongestionLevel.BLOCKED,
        has_incident: bool = True,
        incident_description: str = "Simulated traffic collision blocking corridor",
    ) -> Optional[RoadEdge]:
        """Manually injects or clears an incident on an edge for testing dynamic rerouting."""
        if edge_id not in self.edges:
            return None

        edge = self.edges[edge_id]
        edge.congestion_level = congestion_level
        edge.has_incident = has_incident
        edge.incident_description = incident_description if has_incident else None
        edge.density_score = 0.95 if has_incident else 0.25

        self._compute_edge_travel_time(edge)
        self._add_or_update_graph_edge(edge)
        return edge

    def calculate_emergency_route(
        self,
        origin_node_id: str,
        destination_node_id: str,
        is_emergency: bool = True,
        avoid_congestion: bool = True,
    ) -> RouteCalculationResponse:
        """
        Computes the optimal Green Corridor emergency route using Dijkstra shortest path,
        avoiding blocked/congested edges and prioritizing signal preemption.
        """
        if origin_node_id not in self.nodes:
            # Fallback to primary EMS station if client holds cached node ID
            origin_node_id = "EMS_STATE_BANK" if "EMS_STATE_BANK" in self.nodes else next(iter(self.nodes.keys()))
        if destination_node_id not in self.nodes:
            # Fallback to primary trauma hospital if client holds cached node ID
            destination_node_id = "HOSPITAL_AJ_KUNTIKAN" if "HOSPITAL_AJ_KUNTIKAN" in self.nodes else list(self.nodes.keys())[-1]

        weight_key = "emergency_weight" if (is_emergency and avoid_congestion) else "standard_weight"

        try:
            # Dijkstra shortest path on weighted directed graph
            path_nodes = nx.shortest_path(
                self.graph,
                source=origin_node_id,
                target=destination_node_id,
                weight=weight_key,
            )
        except nx.NetworkXNoPath:
            # Fallback to shortest unweighted distance if network is severed
            path_nodes = nx.shortest_path(
                self.graph,
                source=origin_node_id,
                target=destination_node_id,
                weight="distance_km",
            )

        # Standard unoptimized path for baseline comparison
        try:
            standard_nodes = nx.shortest_path(
                self.graph,
                source=origin_node_id,
                target=destination_node_id,
                weight="distance_km",
            )
        except nx.NetworkXNoPath:
            standard_nodes = path_nodes

        # Assemble coordinates and route segments
        path_coords: List[List[float]] = []
        waypoints: List[Tuple[float, float]] = []
        for nid in path_nodes:
            n = self.nodes[nid]
            path_coords.append([n.lat, n.lng])
            waypoints.append((n.lat, n.lng))

        segments: List[RouteSegment] = []
        total_distance = 0.0
        total_time_min = 0.0
        total_signals = 0

        for i in range(len(path_nodes) - 1):
            u = path_nodes[i]
            v = path_nodes[i + 1]
            edge_data = self.graph[u][v]
            edge_obj = self.edges.get(edge_data["edge_id"])

            dist = edge_data["distance_km"]
            time_m = edge_data["travel_time_min"]
            signals = edge_data.get("traffic_signals", 1)

            total_distance += dist
            total_time_min += time_m
            total_signals += signals

            segments.append(
                RouteSegment(
                    edge_id=edge_data["edge_id"],
                    from_node=u,
                    to_node=v,
                    road_name=edge_obj.name if edge_obj else f"{u} -> {v}",
                    distance_km=dist,
                    estimated_time_min=time_m,
                    congestion_level=edge_data["congestion_level"],
                    is_green_corridor=is_emergency,
                )
            )

        # Baseline standard travel time calculation
        standard_time_min = 0.0
        for i in range(len(standard_nodes) - 1):
            su = standard_nodes[i]
            sv = standard_nodes[i + 1]
            s_edge_data = self.graph[su][sv]
            standard_time_min += s_edge_data["travel_time_min"]

        # If green corridor routed around an incident, calculate time saved
        time_saved = max(0.0, round(standard_time_min - total_time_min, 2))

        # Query real street-snapped, road-following geometry (Google Maps style)
        snapped_result = osrm_service.get_road_snapped_route(waypoints)
        if snapped_result and snapped_result.get("coordinates") and len(snapped_result["coordinates"]) > 5:
            final_coords = snapped_result["coordinates"]
            turn_instructions = snapped_result.get("maneuvers")
            if snapped_result.get("distance_meters"):
                total_distance = round(snapped_result["distance_meters"] / 1000.0, 2)
        else:
            final_coords = path_coords
            turn_instructions = None

        # Determine prominent road descriptor (e.g., 'via MG Rd' as seen in Google Maps)
        primary_road = "via MG Road"
        if segments:
            longest_seg = max(segments, key=lambda s: s.distance_km)
            clean_name = longest_seg.road_name.split("(")[0].strip()
            primary_road = f"via {clean_name}"

        return RouteCalculationResponse(
            origin=self.nodes[origin_node_id],
            destination=self.nodes[destination_node_id],
            path_node_ids=path_nodes,
            path_coordinates=final_coords,
            segments=segments,
            total_distance_km=round(total_distance, 2),
            estimated_travel_time_min=round(total_time_min, 2),
            standard_travel_time_min=round(standard_time_min, 2),
            time_saved_min=time_saved,
            signals_preempted=total_signals if is_emergency else 0,
            is_green_corridor_active=is_emergency,
            primary_road_name=primary_road,
            turn_instructions=turn_instructions,
        )

# Global routing service singleton
routing_service = RoutingService()
