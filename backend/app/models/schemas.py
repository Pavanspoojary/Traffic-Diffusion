from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

# Core Status & Category Enums
class CongestionLevel(str, Enum):
    FREE_FLOW = "FREE_FLOW"
    MODERATE = "MODERATE"
    HEAVY = "HEAVY"
    BLOCKED = "BLOCKED"
    UNKNOWN = "UNKNOWN"
    STALE = "STALE"

class IncidentCategory(str, Enum):
    COLLISION = "COLLISION"
    ROAD_BLOCKAGE = "ROAD_BLOCKAGE"
    VEHICLE_BREAKDOWN = "VEHICLE_BREAKDOWN"
    ROADWORKS = "ROADWORKS"
    LANE_CLOSURE = "LANE_CLOSURE"
    ABNORMAL_CONGESTION = "ABNORMAL_CONGESTION"
    SIGNAL_MALFUNCTION = "SIGNAL_MALFUNCTION"
    WEATHER_WATERLOGGING = "WEATHER_WATERLOGGING"
    OTHER = "OTHER"

class IncidentSeverity(str, Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class EventProvenance(str, Enum):
    OBSERVED = "OBSERVED"
    IMPORTED = "IMPORTED"
    ESTIMATED = "ESTIMATED"
    MANUAL_ENTRY = "MANUAL_ENTRY"
    SIMULATED = "SIMULATED"
    UNKNOWN = "UNKNOWN"

class VerificationStatus(str, Enum):
    UNVERIFIED = "UNVERIFIED"
    VERIFICATION_PENDING = "VERIFICATION_PENDING"
    VERIFIED = "VERIFIED"
    DISMISSED = "DISMISSED"
    RESOLVED = "RESOLVED"

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

class InterventionType(str, Enum):
    TRAFFIC_DIVERSION = "TRAFFIC_DIVERSION"
    INCIDENT_CLEARANCE_DISPATCH = "INCIDENT_CLEARANCE_DISPATCH"
    LANE_CAPACITY_RESTORATION = "LANE_CAPACITY_RESTORATION"
    JUNCTION_SIGNAL_TIMING = "JUNCTION_SIGNAL_TIMING"
    COMBINED_ACTION_PLAN = "COMBINED_ACTION_PLAN"

# Basic Road Models
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
    density_score: float = 0.25
    congestion_level: CongestionLevel = CongestionLevel.FREE_FLOW
    has_incident: bool = False
    incident_status: IncidentStatus = IncidentStatus.UNKNOWN
    incident_description: Optional[str] = None
    traffic_signals: int = 1
    estimated_travel_time_min: float = 0.0
    data_status: DataStatus = DataStatus.LIVE
    is_simulated: bool = False
    last_updated_at: Optional[str] = None
    path_coordinates: Optional[List[List[float]]] = None

# Incident Management Models
class TrafficIncident(BaseModel):
    incident_id: str
    category: IncidentCategory = IncidentCategory.COLLISION
    affected_edge_id: str
    road_name: Optional[str] = None
    start_timestamp: Optional[str] = None
    severity: IncidentSeverity = IncidentSeverity.HIGH
    blocked_lanes: Optional[int] = 1
    total_lanes: Optional[int] = 2
    capacity_reduction_pct: float = Field(0.50, ge=0.0, le=1.0)
    estimated_duration_min: float = Field(45.0, ge=1.0)
    provenance: EventProvenance = EventProvenance.SIMULATED
    verification_status: VerificationStatus = VerificationStatus.VERIFIED
    confidence_score: float = Field(0.85, ge=0.0, le=1.0)
    description: Optional[str] = None
    reported_by: Optional[str] = "TRAFFIC_OPERATOR"

class IncidentCreateRequest(BaseModel):
    category: IncidentCategory = IncidentCategory.COLLISION
    affected_edge_id: str
    severity: IncidentSeverity = IncidentSeverity.HIGH
    blocked_lanes: Optional[int] = 1
    capacity_reduction_pct: Optional[float] = 0.60
    estimated_duration_min: Optional[float] = 45.0
    description: Optional[str] = "Traffic disruption causing arterial queue buildup"
    provenance: EventProvenance = EventProvenance.SIMULATED

class IncidentRecord(BaseModel):
    incident_id: str
    corridor_id: str
    road_name: Optional[str] = None
    status: IncidentStatus = IncidentStatus.UNKNOWN
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

# Impact Forecasting Models
class EdgeImpactForecast(BaseModel):
    edge_id: str
    road_name: str
    source: str
    target: str
    baseline_travel_time_min: float
    predicted_travel_time_min: float
    expected_delay_min: float
    predicted_volume_capacity_ratio: float
    predicted_congestion_level: CongestionLevel
    queue_length_meters: float
    impact_type: str  # DIRECT_INCIDENT | UPSTREAM_SPILLBACK | DOWNSTREAM_BOTTLENECK | DIVERSION_LOADED | NOMINAL
    risk_score: float  # 0.0 - 100.0

class JunctionSaturationForecast(BaseModel):
    junction_id: str
    junction_name: str
    saturation_index: float  # 0.0 - 1.0
    inflow_spillback_risk: str  # LOW | MODERATE | CRITICAL
    incoming_delayed_edges: List[str] = []

class NetworkForecastSnapshot(BaseModel):
    horizon_minutes: int  # 15, 30, 60
    forecast_timestamp: str
    model_method: str = "Graph-Based Queue Spillback & Diversion Flow Model v2.0"
    provenance: str = "SIMULATION_BASED_ESTIMATE"
    confidence_score: float = 0.85
    total_network_travel_time_min: float
    network_delay_relative_to_baseline_min: float
    elevated_risk_corridors_count: int
    saturated_junctions_count: int
    edge_impacts: List[EdgeImpactForecast]
    junction_saturations: List[JunctionSaturationForecast]
    propagation_summary: str

class MultiHorizonForecastResponse(BaseModel):
    incident: TrafficIncident
    baseline_total_network_travel_time_min: float
    forecasts: Dict[int, NetworkForecastSnapshot]  # 15, 30, 60 min
    primary_affected_corridors: List[str]
    next_probable_bottlenecks: List[str]
    model_assumptions: List[str]

class ForecastRequest(BaseModel):
    incident: Optional[TrafficIncident] = None
    incident_id: Optional[str] = None
    horizons: List[int] = [15, 30, 60]

# Risk Assessment Models
class RiskComponentBreakdown(BaseModel):
    severity_component: float       # max 25
    capacity_load_component: float  # max 25
    downstream_dependency: float    # max 25
    diversion_deficit: float        # max 25
    total_risk_score: float         # 0 - 100

class PrioritizedRoadRisk(BaseModel):
    rank: int
    edge_id: str
    road_name: str
    risk_level: str  # CRITICAL | HIGH | MODERATE | LOW
    risk_score: float
    components: RiskComponentBreakdown
    contributing_factors: List[str]
    expected_consequences: str
    recommended_action: str

class PrioritizedJunctionRisk(BaseModel):
    rank: int
    junction_id: str
    junction_name: str
    saturation_risk: str  # CRITICAL | HIGH | MODERATE | LOW
    risk_score: float
    critical_feeder_corridors: List[str]
    recommended_action: str

class RiskAssessmentResponse(BaseModel):
    generated_at: str
    forecast_horizon_minutes: int
    high_risk_roads: List[PrioritizedRoadRisk]
    critical_junctions: List[PrioritizedJunctionRisk]
    highest_vulnerability_sector: str

# What-If Intervention Planner Models
class InterventionAction(BaseModel):
    type: InterventionType
    target_edge_or_junction_id: str
    diversion_route_ids: Optional[List[str]] = None
    diversion_percentage: Optional[float] = 0.50
    dispatch_delay_minutes: Optional[float] = 8.0
    duration_reduction_pct: Optional[float] = 0.50
    capacity_restored_pct: Optional[float] = 0.60
    signal_capacity_boost_pct: Optional[float] = 0.25
    resource_units_required: int = 2

class InterventionScenario(BaseModel):
    scenario_id: str
    scenario_name: str
    description: str
    actions: List[InterventionAction] = []
    dispatch_delay_min: float = 0.0
    resource_summary: str = ""
    estimated_network_travel_time_min: float
    delay_reduction_relative_to_baseline_min: float
    delay_reduction_pct: float
    elevated_risk_edges_count: int = 0
    saturated_junctions_count: int = 0
    expected_incident_duration_min: float = 45.0
    feasibility_rating: str = "HIGH"  # HIGH | MODERATE | COMPLEX
    key_tradeoffs: str
    rank: int = 1
    # Genuine Traffic Diversion & Redistribution Fields
    assigned_demand_pcu: float = 0.0
    route_edges: List[str] = []
    route_names: List[str] = []
    route_length_km: float = 0.0
    route_travel_time_min: float = 0.0
    max_vc_ratio: float = 0.0
    saturated_segments: List[str] = []
    downstream_bottlenecks: List[str] = []
    total_delay_veh_hours: float = 0.0
    delay_saved_veh_hours: float = 0.0
    provenance: str = "ESTIMATED"
    segment_impacts: List[Dict[str, Any]] = []

class InterventionEvaluationRequest(BaseModel):
    incident_id: Optional[str] = None
    incident: Optional[TrafficIncident] = None
    custom_scenarios: Optional[List[InterventionScenario]] = None
    optimization_objective: str = "MINIMIZE_NETWORK_DELAY_AND_PREVENT_JUNCTION_GRIDLOCK"
    override_displaced_demand: Optional[float] = None
    override_blockage_pct: Optional[float] = None
    override_baseline_demand: Optional[float] = None
    horizon_minutes: Optional[int] = 60

class InterventionEvaluationResponse(BaseModel):
    incident_id: str
    evaluation_timestamp: str
    optimization_objective: str
    affected_corridor: Optional[str] = None
    affected_edge_id: Optional[str] = None
    baseline_flow_veh_hr: Optional[float] = 0.0
    nominal_capacity_veh_hr: Optional[float] = 0.0
    effective_capacity_veh_hr: Optional[float] = 0.0
    displaced_demand_veh_hr: Optional[float] = 0.0
    viable_detours_count: int = 0
    candidate_detours: List[Dict[str, Any]] = []
    baseline_scenario: InterventionScenario
    candidate_scenarios: List[InterventionScenario]
    recommended_scenario_id: str
    recommendation_rationale: str
    tradeoff_summary: str
    assumptions: List[str] = []
    provenance: str = "ESTIMATED"

# Historical Analytics & Recurring Hotspot Models
class HistoricalIncidentRecord(BaseModel):
    record_id: str
    category: IncidentCategory
    edge_id: str
    road_name: str
    junction_id: Optional[str] = None
    timestamp: str  # ISO string
    day_of_week: str  # Monday - Sunday
    hour_of_day: int  # 0 - 23
    severity: IncidentSeverity
    duration_minutes: float
    lanes_blocked: int = 1
    observed_delay_min: float = 0.0
    clearance_team_dispatched: bool = True
    provenance: EventProvenance = EventProvenance.HISTORICAL_OBSERVATION if hasattr(EventProvenance, "HISTORICAL_OBSERVATION") else EventProvenance.SIMULATED

class RecurringHotspotSummary(BaseModel):
    location_id: str
    location_name: str
    incident_count: int
    primary_category: IncidentCategory
    mean_duration_minutes: float
    recurring_peak_hours: List[int]
    recurring_peak_days: List[str]
    recurring_risk_score: float
    recurring_pattern_summary: str

class HistoricalAnalyticsResponse(BaseModel):
    total_records_analyzed: int
    observed_records_count: int
    simulated_records_count: int
    top_recurring_hotspots: List[RecurringHotspotSummary]
    category_distribution: Dict[str, int]
    hourly_distribution: Dict[int, int]
    weekday_distribution: Dict[str, int]
    mean_duration_by_category_min: Dict[str, float]
    data_provenance_summary: str

class HistoricalImportRequest(BaseModel):
    records: List[Dict[str, Any]]
    source_name: str = "MANGALURU_TRAFFIC_LOGS"
    is_simulated: bool = False

# Citizen Incident Reports (Public App Ingestion)
class CitizenReport(BaseModel):
    report_id: str
    reported_at: str
    reporter_name: Optional[str] = "Citizen Commuter"
    contact_number: Optional[str] = None
    road_segment_id: str
    road_name: str
    category: IncidentCategory
    description: str
    lanes_affected: int = 1
    verification_status: VerificationStatus = VerificationStatus.VERIFICATION_PENDING
    verified_incident_id: Optional[str] = None
    upvotes: int = 1

class CitizenReportCreate(BaseModel):
    reporter_name: Optional[str] = "Citizen Commuter"
    contact_number: Optional[str] = None
    road_segment_id: str
    category: IncidentCategory = IncidentCategory.COLLISION
    description: str
    lanes_affected: int = 1

# Resource Deployment & Dispatch (Traffic Police & Control Room Operators)
class ResourceDispatchOrder(BaseModel):
    order_id: str
    incident_id: str
    target_location_id: str
    target_location_name: str
    resource_type: str  # TRAFFIC_POLICE_OFFICER | HEAVY_TOW_UNIT | PATROL_INTERCEPTOR | RAPID_RESPONSE_TEAM
    units_assigned: int = 2
    directive: str  # Manual Signal Override, Enforce Diversion, Rapid Vehicle Recovery, Clearance Management
    priority: str = "HIGH"  # CRITICAL | HIGH | STANDARD
    status: str = "DISPATCHED"  # DISPATCHED | EN_ROUTE | ON_SCENE | RESOLVED
    dispatched_at: str
    eta_minutes: float = 6.0
    notes: Optional[str] = None

class ResourceDispatchCreate(BaseModel):
    incident_id: str
    target_location_id: str
    target_location_name: str
    resource_type: str = "TRAFFIC_POLICE_OFFICER"
    units_assigned: int = 2
    directive: str
    priority: str = "HIGH"
    eta_minutes: float = 6.0
    notes: Optional[str] = None

class ResourceDispatchUpdate(BaseModel):
    status: Optional[str] = None
    eta_minutes: Optional[float] = None
    notes: Optional[str] = None

# City Traffic Planners & Road Authorities Models
class InfrastructureRecommendation(BaseModel):
    id: str
    location_id: str
    location_name: str
    category: str  # GRADE_SEPARATION | SIGNAL_RECALIBRATION | BOTTLENECK_WIDENING | DRAINAGE_RESILIENCE
    title: str
    description: str
    projected_delay_reduction_pct: float
    estimated_cost_tier: str  # LOW_OPEX | MEDIUM_CAPEX | MAJOR_CAPEX
    annual_bottlenecks_mitigated: int
    implementation_timeline: str
    priority: str  # PRIORITY_1_URGENT | PRIORITY_2_PLANNED | PRIORITY_3_STRATEGIC

class TrafficPatternPeriod(BaseModel):
    period_name: str
    hours: str
    average_network_speed_kmh: float
    average_vc_ratio: float
    dominant_chokepoints: List[str]
    delay_index: float

class TrafficPatternComparison(BaseModel):
    city: str
    analysis_date: str
    periods: List[TrafficPatternPeriod]
    summary_findings: str
    key_recommendations: List[str]

class InfrastructureSimulateRequest(BaseModel):
    target_edge_id: str
    intervention_type: str  # ADD_LANE | GRADE_SEPARATION | SIGNAL_OPTIMIZATION
    capacity_increase_pct: float = 0.50

class InfrastructureSimulateResponse(BaseModel):
    target_edge_id: str
    road_name: str
    baseline_network_delay_min: float
    simulated_network_delay_min: float
    delay_saved_min: float
    delay_reduction_pct: float
    queue_length_reduction_pct: float
    projected_benefit_summary: str

# Supporting Legacy Models (Ambulance & CCTV)
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
    estimated_flow_rate_vpm: float = 0.0
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

class JunctionCoordinationRequest(BaseModel):
    junction_id: str
    junction_name: str
    corridor_id: str
    state: JunctionCoordinationState = JunctionCoordinationState.NOT_REQUESTED
    eta_seconds: float = 0.0
    requested_at: Optional[str] = None
    acknowledged_at: Optional[str] = None
    cleared_at: Optional[str] = None
    controller_type: str = "SIMULATED_ADAPTER"
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
    trauma_bay_status: str = "READY"
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

class DiversionDeploymentRequest(BaseModel):
    incident_id: str
    edge_id: str
    edge_name: Optional[str] = "Corridor"
    scenario_id: str
    scenario_name: str
    detour_route_ids: List[str] = []
    detour_name: Optional[str] = "Official Detour Route"
    displaced_demand_pcu_hr: float = 0.0
    delay_saved_veh_hours: float = 0.0
    advisory_text: Optional[str] = None
    deployed_by: Optional[str] = "Control Room Operator"

class ActiveDiversionRecord(BaseModel):
    diversion_id: str
    incident_id: str
    edge_id: str
    edge_name: str
    scenario_id: str
    scenario_name: str
    detour_route_ids: List[str]
    detour_name: str
    detour_path_coordinates: List[List[float]] = []
    displaced_demand_pcu_hr: float
    delay_saved_veh_hours: float
    advisory_text: str
    deployed_by: str
    deployed_at: str
    status: str = "ACTIVE"

