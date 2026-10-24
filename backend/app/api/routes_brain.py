from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, status, Query

from backend.app.models.schemas import (
    TrafficIncident,
    IncidentCreateRequest,
    IncidentCategory,
    IncidentSeverity,
    EventProvenance,
    VerificationStatus,
    ForecastRequest,
    MultiHorizonForecastResponse,
    RiskAssessmentResponse,
    InterventionEvaluationRequest,
    InterventionEvaluationResponse,
    NetworkStateResponse,
    DemandSimulationRequest,
    DemandSimulationResponse,
)
from backend.app.services.prediction_service import prediction_service
from backend.app.services.risk_service import risk_service
from backend.app.services.intervention_service import intervention_service
from backend.app.services.routing_service import routing_service

router = APIRouter(prefix="/api", tags=["Predictive Traffic Intelligence & Brain Operations"])

@router.get("/network", response_model=NetworkStateResponse)
async def get_road_network():
    """
    Returns the transparent road network model, including nodes, directed edges,
    lane capacities, baseline volumes, storage limits, and current effective travel times.
    """
    return routing_service.get_network_state()

@router.get("/incidents", response_model=List[TrafficIncident])
async def list_incidents():
    """Returns all active, confirmed, or unconfirmed traffic incidents and disruptions."""
    incidents = prediction_service.list_incidents()
    if not incidents:
        # Create deterministic default scenario if store is empty
        default_inc = prediction_service.create_incident(
            affected_edge_id="corridor_cctv_07",
            category=IncidentCategory.COLLISION,
            severity=IncidentSeverity.CRITICAL,
            blocked_lanes=2,
            capacity_reduction_pct=0.85,
            is_full_closure=False,
            estimated_duration_min=60.0,
            description="Multi-axle commercial freight collision blocking Nanthoor arterial corridor",
            provenance=EventProvenance.SIMULATED,
            verification_status=VerificationStatus.VERIFIED,
            source="TRAFFIC_CONTROL_ROOM",
        )
        return [default_inc]
    return incidents

@router.post("/incidents", response_model=TrafficIncident, status_code=status.HTTP_201_CREATED)
async def create_incident(request: IncidentCreateRequest):
    """
    Registers an incident on a specific road edge or junction.
    Distinguishes unconfirmed reports from verified closures.
    """
    if request.affected_edge_id not in routing_service.edges:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Road edge '{request.affected_edge_id}' not found in active road network"
        )

    incident = prediction_service.create_incident(
        affected_edge_id=request.affected_edge_id,
        category=request.category,
        severity=request.severity,
        blocked_lanes=request.blocked_lanes or 1,
        capacity_reduction_pct=request.capacity_reduction_pct if request.capacity_reduction_pct is not None else 0.60,
        estimated_duration_min=request.estimated_duration_min or 45.0,
        description=request.description,
        provenance=request.provenance,
        is_full_closure=bool(request.is_full_closure),
        verification_status=request.verification_status or VerificationStatus.VERIFIED,
        source=request.source or "OPERATOR_CONSOLE",
        notes=request.notes,
        start_timestamp=request.start_timestamp,
    )
    return incident

@router.get("/incidents/{incident_id}", response_model=TrafficIncident)
async def get_incident(incident_id: str):
    """Retrieves detailed attributes, provenance, and limitations for a specific incident."""
    incident = prediction_service.get_incident(incident_id)
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident '{incident_id}' not found"
        )
    return incident

@router.post("/analysis/impact", response_model=MultiHorizonForecastResponse)
async def analyze_impact(request: ForecastRequest):
    """
    Runs multi-horizon spatiotemporal traffic impact analysis (15, 30, and 60 minutes)
    evaluating direct blockage, upstream queue accumulation/spillback, and diversion loading.
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
                description="Freight vehicle collision blocking Circuit House - Nanthoor Highway corridor",
                provenance=EventProvenance.SIMULATED,
            )

    horizons = request.horizons or [15, 30, 60]
    forecast = prediction_service.simulate_network_forecast(
        incident=target_incident,
        horizons=horizons
    )
    return forecast

@router.post("/analysis/compare-interventions", response_model=InterventionEvaluationResponse)
async def compare_interventions(request: InterventionEvaluationRequest):
    """
    What-If Intervention Decision Engine:
    Compares Baseline against candidate intervention plans (Alternative A: Single Fastest Detour,
    Alternative B: Capacity-Aware Multi-Corridor Split, Alternative C: Rapid Tow Clearance,
    Alternative D: Combined Plan) under identical initial conditions.
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
        override_displaced_demand=request.override_displaced_demand,
        override_blockage_pct=request.override_blockage_pct,
    )
    return evaluation

@router.get("/analysis/risk-segments", response_model=RiskAssessmentResponse)
async def get_risk_segments(
    horizon_minutes: int = Query(15, description="Forecast horizon to evaluate (15, 30, or 60 min)"),
    incident_id: Optional[str] = Query(None, description="Optional incident ID")
):
    """
    Returns explainable risk ranking for road segments and junctions based on
    incident severity, V/C load, structural dependency, and bottleneck deficit.
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

@router.post("/analysis/demand-simulation", response_model=DemandSimulationResponse)
async def simulate_demand(request: DemandSimulationRequest):
    """
    Solves the '10 vehicles, same destination' demand assignment problem (Prompt C5).
    Evaluates fastest path overloading, spare capacity bypasses, downstream merge bottlenecks,
    and returns a transparent, capacity-grounded recommendation.
    """
    try:
        response = prediction_service.evaluate_demand_scenario(
            origin_node_id=request.origin_node_id,
            destination_node_id=request.destination_node_id,
            extra_vehicles=request.extra_vehicles,
            background_volume_mode=request.background_volume_mode,
            arrival_window_min=request.arrival_window_min,
        )
        return response
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Demand simulation error: {str(e)}"
        )

@router.post("/demo/reset")
async def reset_demo():
    """
    Resets the road network and establishes a clean, repeatable deterministic demo scenario.
    """
    routing_service.load_network()
    prediction_service.active_incidents.clear()

    # Create standard deterministic baseline incident on Nanthoor corridor
    demo_inc = prediction_service.create_incident(
        affected_edge_id="corridor_cctv_07",
        category=IncidentCategory.COLLISION,
        severity=IncidentSeverity.CRITICAL,
        blocked_lanes=2,
        capacity_reduction_pct=0.80,
        estimated_duration_min=45.0,
        description="Circuit House - Nanthoor Road Freight Rollover (80% Blockage)",
        provenance=EventProvenance.SIMULATED,
        verification_status=VerificationStatus.VERIFIED,
        source="DETERMINISTIC_DEMO_FIXTURE",
    )

    return {
        "status": "reset_successful",
        "message": "Road network reloaded and deterministic demo scenario initialized.",
        "incident": demo_inc,
        "provenance": "SIMULATED_SCENARIO",
    }
