from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class CongestionLevel(str, Enum):
    FREE_FLOW = "FREE_FLOW"
    MODERATE = "MODERATE"
    HEAVY = "HEAVY"
    BLOCKED = "BLOCKED"
    UNKNOWN = "UNKNOWN"
    STALE = "STALE"

class IncidentStatus(str, Enum):
    SUSPECTED = "SUSPECTED"
    VERIFICATION_PENDING = "VERIFICATION_PENDING"
    CONFIRMED = "CONFIRMED"
    CLEARED = "CLEARED"
    UNKNOWN = "UNKNOWN"

class DataStatus(str, Enum):
    LIVE = "LIVE"
    STALE = "STALE"
    UNAVAILABLE = "UNAVAILABLE"
    SIMULATED = "SIMULATED"
    ERROR = "ERROR"

class JunctionCoordinationState(str, Enum):
    NOT_REQUESTED = "NOT_REQUESTED"
    REQUESTED = "REQUESTED"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    APPROVED = "APPROVED"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"

class CorridorCoordinationStatus(str, Enum):
    PLANNED = "PLANNED"
    COORDINATION_PENDING = "COORDINATION_PENDING"
    PARTIALLY_COORDINATED = "PARTIALLY_COORDINATED"
    COORDINATED = "COORDINATED"
    DEGRADED = "DEGRADED"
    CANCELLED = "CANCELLED"

class VehicleCounts(BaseModel):
    cars: int = 0
    trucks: int = 0
    buses: int = 0
    motorcycles: int = 0
    total: int = 0

class VehicleTrackingSummary(BaseModel):
    tracked_unique_vehicles: int = 0
    moving_vehicles: int = 0
    stopped_vehicles: int = 0
    queue_detected: bool = False
    max_stopped_duration_sec: float = 0.0
    estimated_flow_rate_vpm: float = 0.0  # vehicles per minute
    confidence: float = 0.90

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
    incident_status: IncidentStatus = IncidentStatus.UNKNOWN
    incident_id: Optional[str] = None
    data_status: DataStatus = DataStatus.LIVE
    confidence_score: float = 0.85
    is_simulated: bool = False
    detection_method: str = "YOLOv8 + Centroid Tracker"
    tracking_summary: Optional[VehicleTrackingSummary] = None
    processed_at: str
    last_successful_update: Optional[str] = None

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
    incident_status: IncidentStatus = IncidentStatus.UNKNOWN
    incident_description: Optional[str] = None
    traffic_signals: int = 1
    estimated_travel_time_min: float = 0.0
    data_status: DataStatus = DataStatus.LIVE
    is_simulated: bool = False
    last_updated_at: Optional[str] = None

class IncidentRecord(BaseModel):
    incident_id: str
    corridor_id: str
    road_name: Optional[str] = None
    status: IncidentStatus
    description: str
    confidence_score: float = 0.85
    detected_at: str
    verified_at: Optional[str] = None
    verified_by: Optional[str] = None
    preview_image_url: Optional[str] = None
    is_simulated: bool = False

class IncidentVerificationRequest(BaseModel):
    incident_id: str
    action: str  # "CONFIRM" | "DISMISS" | "CLEAR"
    notes: Optional[str] = None
    operator_id: Optional[str] = "DISPATCH_OP_01"

class JunctionCoordinationRequest(BaseModel):
    junction_id: str
    junction_name: str
    corridor_id: str
    state: JunctionCoordinationState = JunctionCoordinationState.NOT_REQUESTED
    eta_seconds: float = 0.0
    requested_at: Optional[str] = None
    acknowledged_at: Optional[str] = None
    cleared_at: Optional[str] = None
    controller_type: str = "SIMULATED_ADAPTER"  # Clearly marked as simulated
    is_simulated: bool = True
    status_message: Optional[str] = None

class CorridorCoordinationPlan(BaseModel):
    corridor_id: str
    status: CorridorCoordinationStatus
    total_junctions: int = 0
    cleared_junctions: int = 0
    active_junctions: int = 0
    junctions: List[JunctionCoordinationRequest] = []
    last_status_change: str
    status_rationale: str

class HospitalReadiness(BaseModel):
    hospital_id: str
    hospital_name: str
    eta_minutes: float
    trauma_bay_status: str = "READY"  # READY | PREPARING | STANDBY | BUSY
    triage_level: str = "LEVEL_1_TRAUMA"
    notification_sent: bool = True
    specialties_available: List[str] = ["Emergency Medicine", "Trauma ICU", "Vascular Surgery"]

class RouteSegment(BaseModel):
    edge_id: str
    from_node: str
    to_node: str
    road_name: str
    distance_km: float
    estimated_time_min: float
    congestion_level: CongestionLevel
    is_green_corridor: bool

class RouteCandidate(BaseModel):
    route_id: str
    label: str
    is_recommended: bool = False
    recommendation_reason: str
    path_node_ids: List[str]
    path_coordinates: List[List[float]]
    segments: List[RouteSegment]
    total_distance_km: float
    estimated_travel_time_min: float
    congestion_points: List[str] = []
    signals_count: int = 0
    closures_encountered: List[str] = []
    suspected_incidents_count: int = 0
    data_confidence_score: float = 0.90
    primary_road_name: Optional[str] = "via MG Road"
    turn_instructions: Optional[List[Dict[str, Any]]] = None

class RouteChangeEvent(BaseModel):
    timestamp: str
    previous_route_id: Optional[str] = None
    new_route_id: str
    reason: str
    time_delta_min: float = 0.0

class RouteCalculationResponse(BaseModel):
    origin: RoadNode
    destination: RoadNode
    primary_route: Optional[RouteCandidate] = None
    alternative_routes: List[RouteCandidate] = []
    coordination_plan: Optional[CorridorCoordinationPlan] = None
    hospital_readiness: Optional[HospitalReadiness] = None
    baseline_travel_time_min: float = 0.0
    time_saved_min: float = 0.0
    recent_reroutes: List[RouteChangeEvent] = []
    
    # Backward compatibility fields
    path_node_ids: List[str] = []
    path_coordinates: List[List[float]] = []
    segments: List[RouteSegment] = []
    total_distance_km: float = 0.0
    estimated_travel_time_min: float = 0.0
    standard_travel_time_min: float = 0.0
    signals_preempted: int = 0
    is_green_corridor_active: bool = True
    primary_road_name: Optional[str] = "via MG Road"
    turn_instructions: Optional[List[Dict[str, Any]]] = None

class NetworkStateResponse(BaseModel):
    city: str
    version: str
    nodes: List[RoadNode]
    edges: List[RoadEdge]
    active_incidents_count: int
    critical_corridors_count: int
    active_incidents: List[IncidentRecord] = []

class RouteRequest(BaseModel):
    origin_node_id: str
    destination_node_id: str
    is_emergency: bool = True
    avoid_congestion: bool = True
    current_route_id: Optional[str] = None

class IncidentSimulateRequest(BaseModel):
    edge_id: str
    congestion_level: CongestionLevel = CongestionLevel.BLOCKED
    has_incident: bool = True
    incident_description: str = "Simulated road accident causing traffic diversion"
    is_confirmed: bool = True

class ResetNetworkRequest(BaseModel):
    preserve_incidents: bool = False
