from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, status, Query

from backend.app.models.schemas import (
    TrafficIncident,
    IncidentCreateRequest,
    IncidentCategory,
    IncidentSeverity,
    EventProvenance,
    ForecastRequest,
    MultiHorizonForecastResponse,
    RiskAssessmentResponse,
    InterventionEvaluationRequest,
    InterventionEvaluationResponse,
    HistoricalAnalyticsResponse,
    HistoricalImportRequest,
    CitizenReport,
    CitizenReportCreate,
    ResourceDispatchOrder,
    ResourceDispatchCreate,
    ResourceDispatchUpdate,
    InfrastructureRecommendation,
    TrafficPatternComparison,
    InfrastructureSimulateRequest,
    InfrastructureSimulateResponse,
)
from backend.app.services.prediction_service import prediction_service
from backend.app.services.risk_service import risk_service
from backend.app.services.intervention_service import intervention_service
from backend.app.services.historical_service import historical_service
from backend.app.services.dispatch_service import dispatch_service
from backend.app.services.routing_service import routing_service

router = APIRouter(prefix="/api/v1/intelligence", tags=["Predictive Traffic Intelligence & Intervention Planning"])

@router.post("/incidents", response_model=TrafficIncident, status_code=status.HTTP_201_CREATED)
async def create_traffic_incident(request: IncidentCreateRequest):
    """
    Registers a new traffic incident (collision, breakdown, roadworks, waterlogging, etc.)
    and integrates it into the predictive intelligence graph.
    """
    if request.affected_edge_id not in routing_service.edges:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Road edge '{request.affected_edge_id}' not found in active network"
        )

    incident = prediction_service.create_incident(
        affected_edge_id=request.affected_edge_id,
        category=request.category,
        severity=request.severity,
        blocked_lanes=request.blocked_lanes or 1,
        capacity_reduction_pct=request.capacity_reduction_pct or 0.60,
        estimated_duration_min=request.estimated_duration_min or 45.0,
        description=request.description,
        provenance=request.provenance,
    )
    return incident

@router.get("/incidents", response_model=List[TrafficIncident])
async def list_active_incidents():
    """Lists all active traffic disruptions under analysis."""
    incidents = prediction_service.list_incidents()
    if not incidents:
        # Create a deterministic default incident if store is fresh
        default_inc = prediction_service.create_incident(
            affected_edge_id="corridor_cctv_07",
            category=IncidentCategory.COLLISION,
            severity=IncidentSeverity.CRITICAL,
            blocked_lanes=2,
            capacity_reduction_pct=0.85,
            estimated_duration_min=60.0,
            description="Multi-axle commercial freight collision blocking Nanthoor arterial approaches",
            provenance=EventProvenance.SIMULATED,
        )
        return [default_inc]
    return incidents

@router.get("/incidents/{incident_id}", response_model=TrafficIncident)
async def get_incident_details(incident_id: str):
    """Retrieves full attributes and metadata for a specific incident."""
    incident = prediction_service.get_incident(incident_id)
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident '{incident_id}' not found in active registry"
        )
    return incident

@router.post("/forecast", response_model=MultiHorizonForecastResponse)
async def generate_impact_forecast(request: ForecastRequest):
    """
    Generates multi-horizon network impact forecasts (15, 30, and 60 minutes)
    evaluating direct blockage, upstream spillback, downstream bottlenecks, and diversion loading.
    """
    target_incident = request.incident
    if not target_incident and request.incident_id:
        target_incident = prediction_service.get_incident(request.incident_id)

    if not target_incident:
        # Fallback to the latest active incident or create default
        incidents = prediction_service.list_incidents()
        if incidents:
            target_incident = incidents[-1]
        else:
            target_incident = prediction_service.create_incident(
                affected_edge_id="corridor_cctv_07",
                category=IncidentCategory.COLLISION,
                severity=IncidentSeverity.CRITICAL,
                blocked_lanes=2,
                capacity_reduction_pct=0.85,
                estimated_duration_min=60.0,
                description="Freight vehicle collision blocking Circuit House - Nanthoor corridor",
                provenance=EventProvenance.SIMULATED,
            )

    horizons = request.horizons or [15, 30, 60]
    forecast = prediction_service.simulate_network_forecast(
        incident=target_incident,
        horizons=horizons
    )
    return forecast

@router.get("/risk-assessment", response_model=RiskAssessmentResponse)
async def get_network_risk_assessment(
    horizon_minutes: int = Query(30, description="Forecast horizon to evaluate (15, 30, or 60 min)"),
    incident_id: Optional[str] = Query(None, description="Target incident ID to assess")
):
    """
    Returns prioritized rankings of high-risk road segments and critical junctions
    with complete component score breakdowns (Severity, V/C load, Dependency, Diversion deficit).
    """
    target_incident = None
    if incident_id:
        target_incident = prediction_service.get_incident(incident_id)

    if not target_incident:
        incidents = prediction_service.list_incidents()
        if incidents:
            target_incident = incidents[-1]
        else:
            target_incident = prediction_service.create_incident(
                affected_edge_id="corridor_cctv_07",
                category=IncidentCategory.COLLISION,
                severity=IncidentSeverity.CRITICAL,
                blocked_lanes=2,
                capacity_reduction_pct=0.85,
                estimated_duration_min=60.0,
                description="Freight vehicle collision blocking Circuit House - Nanthoor corridor",
            )

    forecast_res = prediction_service.simulate_network_forecast(
        incident=target_incident,
        horizons=[horizon_minutes]
    )
    snapshot = forecast_res.forecasts[horizon_minutes]

    assessment = risk_service.assess_network_risk(
        snapshot=snapshot,
        incident_severity=target_incident.severity
    )
    return assessment

@router.post("/interventions/evaluate", response_model=InterventionEvaluationResponse)
async def evaluate_intervention_scenarios(request: InterventionEvaluationRequest):
    """
    What-If Intervention Planner: Compares Baseline against candidate interventions
    (Diversion, Rapid Tow Clearance, Lane Restoration, Combined Action Plan)
    under identical initial conditions and recommends the optimal response plan.
    """
    target_incident = request.incident
    if not target_incident and request.incident_id:
        target_incident = prediction_service.get_incident(request.incident_id)

    if not target_incident:
        incidents = prediction_service.list_incidents()
        if incidents:
            target_incident = incidents[-1]
        else:
            target_incident = prediction_service.create_incident(
                affected_edge_id="corridor_cctv_07",
                category=IncidentCategory.COLLISION,
                severity=IncidentSeverity.CRITICAL,
                blocked_lanes=2,
                capacity_reduction_pct=0.85,
                estimated_duration_min=60.0,
                description="Freight vehicle collision blocking Nanthoor arterial corridor",
            )

    evaluation = intervention_service.evaluate_interventions(
        incident=target_incident,
        horizon_minutes=30,
        custom_scenarios=request.custom_scenarios,
        optimization_objective=request.optimization_objective,
    )
    return evaluation

@router.get("/historical/analytics", response_model=HistoricalAnalyticsResponse)
async def get_historical_analytics(
    provenance: Optional[str] = Query(None, description="Optional filter by provenance (OBSERVED or SIMULATED)")
):
    """
    Returns historical incident patterns, recurring hotspot rankings,
    time-of-day/day-of-week distributions, and mean clearance timelines.
    """
    filter_prov = None
    if provenance:
        try:
            filter_prov = EventProvenance(provenance.upper())
        except ValueError:
            pass

    return historical_service.get_analytics(filter_provenance=filter_prov)

@router.post("/historical/import", status_code=status.HTTP_200_OK)
async def import_historical_records(request: HistoricalImportRequest):
    """Validates and imports historical incident records into the intelligence store."""
    result = historical_service.import_records(
        raw_items=request.records,
        source_name=request.source_name,
        is_simulated=request.is_simulated,
    )
    return result

@router.post("/demo-scenario")
async def load_demo_scenario(scenario_key: str = Query("nanthoor_freight_rollover", description="Demo scenario identifier")):
    """
    Loads deterministic, repeatable demonstration scenarios for hackathon presentations.
    Supported: 'nanthoor_freight_rollover', 'bunts_hostel_waterlogging', 'mg_road_breakdown'.
    """
    if scenario_key == "bunts_hostel_waterlogging":
        edge_id = "corridor_cctv_05"
        category = IncidentCategory.WEATHER_WATERLOGGING
        sev = IncidentSeverity.HIGH
        desc = "Severe monsoon waterlogging inundating Bunts Hostel Avenue; 1 of 2 lanes submerged"
        reduc = 0.65
        dur = 90.0
    elif scenario_key == "mg_road_breakdown":
        edge_id = "corridor_cctv_10"
        category = IncidentCategory.VEHICLE_BREAKDOWN
        sev = IncidentSeverity.MODERATE
        desc = "Disabled articulated transit bus blocking central lane on M.G. Road near Lalbagh"
        reduc = 0.40
        dur = 35.0
    else:
        # Default: nanthoor_freight_rollover
        edge_id = "corridor_cctv_07"
        category = IncidentCategory.COLLISION
        sev = IncidentSeverity.CRITICAL
        desc = "Multi-axle commercial freight rollover blocking Circuit House - Nanthoor Highway corridor"
        reduc = 0.85
        dur = 60.0

    incident = prediction_service.create_incident(
        affected_edge_id=edge_id,
        category=category,
        severity=sev,
        blocked_lanes=2 if reduc > 0.5 else 1,
        capacity_reduction_pct=reduc,
        estimated_duration_min=dur,
        description=desc,
        provenance=EventProvenance.SIMULATED,
    )

    forecast = prediction_service.simulate_network_forecast(incident=incident, horizons=[15, 30, 60])
    interventions = intervention_service.evaluate_interventions(incident=incident, horizon_minutes=30)
    risk = risk_service.assess_network_risk(snapshot=forecast.forecasts[30], incident_severity=sev)

    return {
        "status": "loaded",
        "scenario_key": scenario_key,
        "incident": incident,
        "forecast_30m": forecast.forecasts[30],
        "interventions": interventions,
        "risk_assessment": risk,
    }

# ================= Citizen Incident Reports (Public App Ingestion) =================
@router.post("/incident/trigger", status_code=status.HTTP_201_CREATED)
async def trigger_incident_from_public(payload: dict):
    """
    Direct bridge endpoint for public citizen app submissions.
    Creates a citizen report and immediately registers active incident forecasting.
    """
    edge_id = payload.get("edge_id") or payload.get("road_segment_id") or "corridor_cctv_07"
    category_raw = payload.get("category", "ROAD_BLOCKAGE")
    try:
        cat = IncidentCategory(category_raw)
    except ValueError:
        cat = IncidentCategory.ROAD_BLOCKAGE

    desc = payload.get("custom_subject") or payload.get("description") or f"Citizen alert on {edge_id}"
    reporter = payload.get("reporter") or payload.get("reporter_name") or "Citizen Commuter"
    contact = payload.get("location") or payload.get("contact_number")
    lanes = int(payload.get("lanes_affected", 1))

    report = dispatch_service.create_citizen_report(
        CitizenReportCreate(
            reporter_name=reporter,
            contact_number=contact,
            road_segment_id=edge_id,
            category=cat,
            description=desc,
            lanes_affected=lanes
        )
    )

    # Auto-verify report from citizen app so the dashboard immediately updates
    verified_report = dispatch_service.verify_citizen_report(report.report_id, verified=True)
    return {
        "status": "success",
        "message": f"Alert received and verified: {desc}",
        "report": verified_report,
        "incident_id": verified_report.verified_incident_id
    }

@router.get("/citizen-reports", response_model=List[CitizenReport])
async def list_citizen_reports():
    """Lists all incoming citizen reports submitted via the public mobile map app."""
    return dispatch_service.list_citizen_reports()

@router.post("/citizen-reports", response_model=CitizenReport, status_code=status.HTTP_201_CREATED)
async def submit_citizen_report(request: CitizenReportCreate):
    """Allows public users / mobile apps to report observed road hazards, collisions, or waterlogging."""
    return dispatch_service.create_citizen_report(request)

@router.post("/citizen-reports/{report_id}/verify", response_model=CitizenReport)
async def verify_citizen_report(
    report_id: str,
    verified: bool = Query(True, description="Whether the control-room operator confirms this report")
):
    """
    Control-room operator action to verify an incoming citizen report.
    When verified, this automatically spawns an active TrafficIncident ready for impact forecasting.
    """
    try:
        return dispatch_service.verify_citizen_report(report_id, verified=verified)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

# ================= Police & Control-Room Resource Dispatches =================
@router.get("/dispatches", response_model=List[ResourceDispatchOrder])
async def list_resource_dispatches():
    """Lists all active and completed traffic police, heavy tow, and patrol unit dispatches."""
    return dispatch_service.list_dispatch_orders()

@router.post("/dispatches", response_model=ResourceDispatchOrder, status_code=status.HTTP_201_CREATED)
async def create_resource_dispatch(request: ResourceDispatchCreate):
    """
    Control-room operator tool: Dispatches traffic officers, recovery tow units, or patrol cars
    to specific road bottlenecks or saturated junctions to enact intervention plans.
    """
    return dispatch_service.create_dispatch_order(request)

@router.patch("/dispatches/{order_id}", response_model=ResourceDispatchOrder)
async def update_resource_dispatch(order_id: str, request: ResourceDispatchUpdate):
    """Updates the status or ETA of an active resource dispatch (e.g. EN_ROUTE -> ON_SCENE)."""
    try:
        return dispatch_service.update_dispatch_order(order_id, request)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

# ================= City Traffic Planners & Road Authorities =================
@router.get("/planner/infrastructure-recommendations", response_model=List[InfrastructureRecommendation])
async def get_infrastructure_recommendations():
    """
    Returns data-driven capital and operational infrastructure proposals
    derived from recurring historical chokepoint and bottleneck analysis.
    """
    return dispatch_service.get_infrastructure_recommendations()

@router.get("/planner/traffic-patterns", response_model=TrafficPatternComparison)
async def get_traffic_patterns():
    """
    Returns macro traffic pattern comparison across Morning Peak, Mid-Day Off-Peak, and Evening Peak
    including speed degradation, V/C load, and chronic bottleneck locations.
    """
    return dispatch_service.get_traffic_pattern_comparison()

@router.post("/planner/simulate-infrastructure", response_model=InfrastructureSimulateResponse)
async def simulate_infrastructure_upgrade(request: InfrastructureSimulateRequest):
    """
    What-If Infrastructure Modeling: Simulates the network-wide benefit of adding lane capacity,
    constructing a grade-separated flyover, or optimizing signal cycles on a chronic chokepoint.
    """
    return dispatch_service.simulate_infrastructure_upgrade(request)

