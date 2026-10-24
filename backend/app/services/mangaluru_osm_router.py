"""Offline road routing over the Mangaluru OpenStreetMap driving network."""

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import networkx as nx


@dataclass
class OSMRoadEdge:
    id: str
    source: str
    target: str
    name: str
    highway: str
    lanes: int
    base_speed_kmh: float
    length_km: float
    path_coordinates: List[List[float]]  # [lat, lng]
    density_score: float = 0.34
    traffic_signals: int = 0


class MangaluruOSMRoadRouter:
    """Build a directed graph from OSM ways and return road-following alternatives."""

    DEFAULT_PATH = Path(__file__).resolve().parents[3] / "data" / "mangaluru_osm_routing.json"
    SPEED_BY_CLASS = {
        "motorway": 70, "motorway_link": 45,
        "trunk": 60, "trunk_link": 40,
        "primary": 45, "primary_link": 35,
        "secondary": 35, "secondary_link": 30,
        "tertiary": 30, "tertiary_link": 25,
        "unclassified": 25, "residential": 20,
        "living_street": 15, "service": 15,
    }
    LANES_BY_CLASS = {
        "motorway": 4, "motorway_link": 2,
        "trunk": 4, "trunk_link": 2,
        "primary": 2, "primary_link": 1,
        "secondary": 2, "secondary_link": 1,
        "tertiary": 2, "tertiary_link": 1,
        "unclassified": 1, "residential": 1,
        "living_street": 1, "service": 1,
    }

    def __init__(self, path: Optional[Path] = None):
        self.path = path or self.DEFAULT_PATH
        self.graph = nx.DiGraph()
        self.edges: Dict[str, OSMRoadEdge] = {}
        self.nodes: Dict[str, Tuple[float, float]] = {}
        self._snap_cache: Dict[Tuple[float, float], Tuple[str, float]] = {}
        self.source_timestamp = "unknown"
        self._load()

    @staticmethod
    def _haversine_km(a: Sequence[float], b: Sequence[float]) -> float:
        lat1, lon1 = math.radians(float(a[0])), math.radians(float(a[1]))
        lat2, lon2 = math.radians(float(b[0])), math.radians(float(b[1]))
        dlat, dlon = lat2 - lat1, lon2 - lon1
        h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        return 6371.0088 * 2 * math.asin(min(1.0, math.sqrt(h)))

    @staticmethod
    def _lane_count(raw: Optional[str], default: int) -> int:
        if not raw:
            return default
        try:
            return max(1, min(8, int(float(raw.split(";")[0]))))
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _speed(raw: Optional[str], default: float) -> float:
        if not raw:
            return default
        digits = "".join(char for char in raw.split(";")[0] if char.isdigit() or char == ".")
        try:
            value = float(digits)
            if "mph" in raw.lower():
                value *= 1.60934
            return max(8.0, min(100.0, value))
        except ValueError:
            return default

    def _load(self) -> None:
        if not self.path.exists():
            return
        with self.path.open("r", encoding="utf-8") as source:
            data = json.load(source)
        self.source_timestamp = data.get("osm_base_timestamp", "unknown")
        self.nodes = {str(node_id): (float(point[0]), float(point[1])) for node_id, point in data.get("nodes", {}).items()}

        ways = data.get("ways", [])
        way_membership: Dict[str, set] = {}
        for way in ways:
            for node_id in way.get("nodes", []):
                way_membership.setdefault(str(node_id), set()).add(str(way["id"]))

        for way in ways:
            node_ids = [str(node_id) for node_id in way.get("nodes", [])]
            if len(node_ids) < 2:
                continue
            # OSM ways can contain many shape points. Split only at actual
            # junctions and way ends, preserving their full road geometry.
            cuts = [0]
            cuts.extend(i for i in range(1, len(node_ids) - 1) if len(way_membership.get(node_ids[i], ())) > 1)
            cuts.append(len(node_ids) - 1)
            tags = way
            highway = str(tags.get("highway", "residential"))
            lanes = self._lane_count(tags.get("lanes"), self.LANES_BY_CLASS.get(highway, 1))
            speed = self._speed(tags.get("maxspeed"), self.SPEED_BY_CLASS.get(highway, 20))
            oneway = str(tags.get("oneway", "")).lower()
            oneway = "yes" if (oneway == "" and tags.get("junction") == "roundabout") else oneway

            for segment_index, (start_index, end_index) in enumerate(zip(cuts, cuts[1:])):
                segment_nodes = node_ids[start_index:end_index + 1]
                coordinates = [list(self.nodes[node_id]) for node_id in segment_nodes if node_id in self.nodes]
                if len(coordinates) < 2 or len(coordinates) != len(segment_nodes):
                    continue
                segment_id = f"osm:{tags['id']}:{segment_index}"
                name = str(tags.get("name") or tags.get("ref") or highway.replace("_", " ").title())
                length_km = sum(self._haversine_km(a, b) for a, b in zip(coordinates, coordinates[1:]))
                if length_km <= 0.003:
                    continue
                if oneway == "-1":
                    self._add_edge(
                        segment_id, segment_nodes[-1], segment_nodes[0], name, highway,
                        lanes, speed, length_km, list(reversed(coordinates)),
                    )
                else:
                    self._add_edge(segment_id, segment_nodes[0], segment_nodes[-1], name, highway, lanes, speed, length_km, coordinates)
                if oneway not in {"yes", "true", "1", "-1"}:
                    reverse_coordinates = list(reversed(coordinates))
                    reverse_id = f"{segment_id}:rev"
                    self._add_edge(reverse_id, segment_nodes[-1], segment_nodes[0], name, highway, lanes, speed, length_km, reverse_coordinates)

    def _add_edge(self, edge_id: str, source: str, target: str, name: str, highway: str,
                  lanes: int, speed: float, length_km: float, coordinates: List[List[float]]) -> None:
        edge = OSMRoadEdge(edge_id, source, target, name, highway, lanes, speed, length_km, coordinates)
        self.edges[edge_id] = edge
        self.graph.add_edge(
            source, target, edge_id=edge_id, length_km=length_km,
            free_flow_min=(length_km / speed) * 60.0,
            name=name, highway=highway, lanes=lanes, speed_kmh=speed,
        )

    def nearest_node(self, lat: float, lng: float, max_distance_m: float = 350.0) -> Optional[Tuple[str, float]]:
        key = (round(float(lat), 5), round(float(lng), 5))
        if key in self._snap_cache:
            node_id, distance_m = self._snap_cache[key]
            return (node_id, distance_m) if distance_m <= max_distance_m else None
        if not self.graph:
            return None
        cos_lat = math.cos(math.radians(float(lat)))
        routable_nodes = [(node_id, self.nodes[node_id]) for node_id in self.graph.nodes if node_id in self.nodes]
        junction_nodes = [item for item in routable_nodes if self.graph.degree[item[0]] >= 3]
        # Curated network nodes represent junctions. A nearby OSM dead end can
        # be a few meters closer than the real intersection and strand the path.
        snap_nodes = junction_nodes or routable_nodes
        node_id, point = min(
            snap_nodes,
            key=lambda item: ((item[1][0] - lat) ** 2 + ((item[1][1] - lng) * cos_lat) ** 2),
        )
        distance_m = self._haversine_km((lat, lng), point) * 1000.0
        self._snap_cache[key] = (node_id, distance_m)
        return (node_id, distance_m) if distance_m <= max_distance_m else None

    @staticmethod
    def _point_segment_distance_m(point: Sequence[float], start: Sequence[float], end: Sequence[float]) -> float:
        lat_scale = 111_320.0
        lng_scale = 111_320.0 * math.cos(math.radians(float(point[0])))
        px, py = float(point[1]) * lng_scale, float(point[0]) * lat_scale
        ax, ay = float(start[1]) * lng_scale, float(start[0]) * lat_scale
        bx, by = float(end[1]) * lng_scale, float(end[0]) * lat_scale
        dx, dy = bx - ax, by - ay
        denom = dx * dx + dy * dy
        t = 0.0 if denom == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / denom))
        return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

    @classmethod
    def _distance_to_polyline_m(cls, point: Sequence[float], line: Sequence[Sequence[float]]) -> float:
        if len(line) < 2:
            return float("inf")
        return min(cls._point_segment_distance_m(point, a, b) for a, b in zip(line, line[1:]))

    @classmethod
    def _overlaps_blocked_road(cls, edge: OSMRoadEdge, blocked_line: Sequence[Sequence[float]]) -> bool:
        if len(blocked_line) < 2:
            return False
        lats = [point[0] for point in blocked_line]
        lngs = [point[1] for point in blocked_line]
        margin = 0.00035
        if (max(point[0] for point in edge.path_coordinates) < min(lats) - margin
                or min(point[0] for point in edge.path_coordinates) > max(lats) + margin
                or max(point[1] for point in edge.path_coordinates) < min(lngs) - margin
                or min(point[1] for point in edge.path_coordinates) > max(lngs) + margin):
            return False
        samples = edge.path_coordinates
        distances = [cls._distance_to_polyline_m(point, blocked_line) for point in samples]
        return min(distances) <= 24.0 and sum(distance <= 32.0 for distance in distances) / len(distances) >= 0.55

    @staticmethod
    def _bpr_time(edge: OSMRoadEdge, extra_flow: float) -> Tuple[float, float, float]:
        capacity = max(500.0, edge.lanes * 900.0)
        base_flow = edge.lanes * 650.0 * (0.3 + 0.7 * edge.density_score)
        loaded_flow = base_flow + max(0.0, extra_flow)
        vc = loaded_flow / capacity
        freeflow = edge.length_km / max(15.0, edge.base_speed_kmh) * 60.0
        loaded_time = freeflow * min(8.0, 1.0 + 0.15 * min(50.0, vc ** 4))
        return loaded_time, capacity, vc

    def find_alternatives(self, source_node: str, target_node: str, source_coord: Sequence[float],
                          target_coord: Sequence[float], blocked_edge_id: str,
                          blocked_lines: Sequence[Sequence[Sequence[float]]], extra_flow: float,
                          max_candidates: int = 3) -> List[Dict]:
        blocked_lines = [line for line in blocked_lines if len(line) >= 2]
        if not self.graph:
            return []
        start = self.nearest_node(*source_coord)
        end = self.nearest_node(*target_coord)
        if not start or not end or start[0] == end[0]:
            return []

        graph = self.graph.copy()
        blocked_ids = [
            edge_id for edge_id, edge in self.edges.items()
            if any(self._overlaps_blocked_road(edge, line) for line in blocked_lines)
        ]
        graph.remove_edges_from((self.edges[edge_id].source, self.edges[edge_id].target) for edge_id in blocked_ids)
        if not graph.has_node(start[0]) or not graph.has_node(end[0]) or not nx.has_path(graph, start[0], end[0]):
            return []

        for _, _, data in graph.edges(data=True):
            edge = self.edges[data["edge_id"]]
            loaded_time, capacity, vc = self._bpr_time(edge, extra_flow)
            data["weight"] = loaded_time + max(0.0, vc - 0.85) ** 2 * 20.0
            # Keep a separate physical-distance cost. At high demand, a long
            # route can outrank every local option on travel time alone; those
            # overlong paths would consume a small K-shortest search budget and
            # make the router incorrectly report that no detour exists.
            data["distance_weight"] = edge.length_km

        target_length_km = (
            sum(self._haversine_km(a, b) for a, b in zip(blocked_lines[0], blocked_lines[0][1:]))
            if blocked_lines else self._haversine_km(source_coord, target_coord)
        )
        max_length_km = max(target_length_km * 3.0, target_length_km + 2.0)
        candidates = []
        seen_sets = []
        path_budget = max(24, max_candidates * 8)
        try:
            paths_considered = 0
            overlong_paths = 0
            seen_paths = set()
            path_sources = (
                ("distance_weight", path_budget),
                ("weight", path_budget),
            )
            for path_weight, budget in path_sources:
                paths = nx.shortest_simple_paths(graph, start[0], end[0], weight=path_weight)
                source_paths_considered = 0
                for node_path in paths:
                    path_key = tuple(node_path)
                    if path_key in seen_paths:
                        continue
                    seen_paths.add(path_key)
                    source_paths_considered += 1
                    paths_considered += 1
                    if source_paths_considered > budget:
                        break
                    edge_ids = [graph[u][v]["edge_id"] for u, v in zip(node_path, node_path[1:])]
                    route_edges = [self.edges[edge_id] for edge_id in edge_ids]
                    total_length = sum(edge.length_km for edge in route_edges)
                    if total_length > max_length_km:
                        overlong_paths += 1
                        continue
                    edge_set = set(edge_ids)
                    if any(len(edge_set & prior) / max(1, min(len(edge_set), len(prior))) >= 0.55 for prior in seen_sets):
                        continue
                    seen_sets.append(edge_set)
                    route_coords: List[List[float]] = []
                    for edge in route_edges:
                        coords = edge.path_coordinates
                        if route_coords and route_coords[-1] == coords[0]:
                            route_coords.extend(coords[1:])
                        else:
                            route_coords.extend(coords)
                    loaded_metrics = [self._bpr_time(edge, extra_flow) for edge in route_edges]
                    loaded_time = sum(metric[0] for metric in loaded_metrics)
                    freeflow_time = sum(edge.length_km / max(15.0, edge.base_speed_kmh) * 60 for edge in route_edges)
                    baseline_time = sum(self._bpr_time(edge, 0.0)[0] for edge in route_edges)
                    max_vc = max((metric[2] for metric in loaded_metrics), default=0.0)
                    capacities = [metric[1] for metric in loaded_metrics]
                    names = list(dict.fromkeys(edge.name for edge in route_edges))
                    generic_names = {
                        "service", "residential", "living street", "tertiary", "tertiary link",
                        "secondary", "secondary link", "primary", "primary link", "unclassified",
                        "trunk", "trunk link", "motorway", "motorway link",
                    }
                    primary_names = [name for name in names if name.lower() not in generic_names]
                    title_names = (primary_names or names)[:4]
                    index = len(candidates) + 1
                    loaded_cost = sum(graph[u][v]["weight"] for u, v in zip(node_path, node_path[1:]))
                    loaded_cost += max(0.0, max_vc - 0.85) ** 2 * 20.0
                    candidates.append((loaded_cost, {
                        "detour_index": index,
                        "title": f"Detour {index} via {' → '.join(title_names)}",
                        "node_path": node_path,
                        "edge_ids": edge_ids,
                        "edge_names": [edge.name for edge in route_edges],
                        "total_length_km": round(total_length, 2),
                        "free_flow_time_min": round(freeflow_time, 2),
                        "baseline_travel_time_min": round(baseline_time, 2),
                        "bottleneck_capacity_pcu": round(min(capacities), 1),
                        "max_baseline_vc": round(max((self._bpr_time(edge, 0.0)[2] for edge in route_edges), default=0.0), 2),
                        "min_lanes": min((edge.lanes for edge in route_edges), default=1),
                        "road_width_desc": "OSM mapped road network",
                        "loaded_travel_time_min": round(loaded_time, 2),
                        "loaded_capacity_pcu_hr": round(min(capacities), 1),
                        "max_loaded_vc": round(max_vc, 2),
                        "path_coordinates": route_coords,
                        "snapped_from_m": round(start[1], 1),
                        "snapped_to_m": round(end[1], 1),
                        "source": "OpenStreetMap",
                        "routes_evaluated_count": paths_considered,
                        "routes_excluded_as_overlong": overlong_paths,
                    }))
                    if len(candidates) >= max_candidates * 3:
                        break
                if len(candidates) >= max_candidates * 3:
                    break
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return []

        candidates.sort(key=lambda item: (item[0], item[1]["total_length_km"], item[1]["edge_ids"]))
        for _, route in candidates:
            route["routes_evaluated_count"] = paths_considered
            route["routes_excluded_as_overlong"] = overlong_paths
        selected = []
        for _, route in candidates:
            route["detour_index"] = len(selected) + 1
            generic_names = {
                "service", "residential", "living street", "tertiary", "tertiary link",
                "secondary", "secondary link", "primary", "primary link", "unclassified",
                "trunk", "trunk link", "motorway", "motorway link",
            }
            display_names = [
                name for name in dict.fromkeys(route["edge_names"])
                if name.lower() not in generic_names
            ][:4]
            route["title"] = f"Detour {route['detour_index']} via {' → '.join(display_names)}"
            selected.append(route)
            if len(selected) >= max_candidates:
                break
        return selected
