from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class CongestionLevel(str, Enum):
    FREE_FLOW = "FREE_FLOW"
    MODERATE = "MODERATE"
    HEAVY = "HEAVY"
    BLOCKED = "BLOCKED"

class VehicleCounts(BaseModel):
    cars: int = 0
    trucks: int = 0
    buses: int = 0
    motorcycles: int = 0
    total: int = 0

class VideoAnalysisResult(BaseModel):
    corridor_id: str
    video_filename: str
    frames_analyzed: int
    duration_seconds: float
    average_vehicles_per_frame: float
    peak_vehicles_per_frame: int
    vehicle_counts: VehicleCounts
    density_score: float
    congestion_level: CongestionLevel
    is_incident_detected: bool
    incident_reason: Optional[str] = None
    processed_at: str

class RoadNode(BaseModel):
    id: str
    name: str
    type: str  # intersection | hospital | ems_station
    lat: float
    lng: float
    address: Optional[str] = None

class RoadEdge(BaseModel):
    id: str
    source: str
    target: str
    name: str
    corridor_id: str
    length_km: float
    base_speed_kmh: float
    lanes: int
    density_score: float
    congestion_level: CongestionLevel
    has_incident: bool = False
    incident_description: Optional[str] = None
    traffic_signals: int = 1
    estimated_travel_time_min: float = 0.0

class NetworkStateResponse(BaseModel):
    city: str
    version: str
    nodes: List[RoadNode]
    edges: List[RoadEdge]
    active_incidents_count: int
    critical_corridors_count: int

class RouteRequest(BaseModel):
    origin_node_id: str
    destination_node_id: str
    is_emergency: bool = True
    avoid_congestion: bool = True

class RouteSegment(BaseModel):
    edge_id: str
    from_node: str
    to_node: str
    road_name: str
    distance_km: float
    estimated_time_min: float
    congestion_level: CongestionLevel
    is_green_corridor: bool

class RouteCalculationResponse(BaseModel):
    origin: RoadNode
    destination: RoadNode
    path_node_ids: List[str]
    path_coordinates: List[List[float]]
    segments: List[RouteSegment]
    total_distance_km: float
    estimated_travel_time_min: float
    standard_travel_time_min: float
    time_saved_min: float
    signals_preempted: int
    is_green_corridor_active: bool
    primary_road_name: Optional[str] = "via MG Road"
    turn_instructions: Optional[List[Dict[str, Any]]] = None

class IncidentSimulateRequest(BaseModel):
    edge_id: str
    congestion_level: CongestionLevel = CongestionLevel.BLOCKED
    has_incident: bool = True
    incident_description: str = "Simulated road accident causing traffic diversion"

class ResetNetworkRequest(BaseModel):
    reset_to_seed: bool = True
