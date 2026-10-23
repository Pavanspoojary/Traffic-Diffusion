from typing import Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from backend.app.models.schemas import (
    NetworkStateResponse,
    RouteRequest,
    RouteCalculationResponse,
    IncidentSimulateRequest,
    ResetNetworkRequest,
    RoadEdge,
    CorridorCoordinationPlan,
    JunctionCoordinationRequest,
    JunctionCoordinationState,
)
from backend.app.services.routing_service import routing_service
from backend.app.services.corridor_service import corridor_service

router = APIRouter(prefix="/api/v1/navigation", tags=["Emergency Navigation & Routing"])

class JunctionOverrideRequest(BaseModel):
    route_id: str
    junction_id: str
    target_state: JunctionCoordinationState = JunctionCoordinationState.ACTIVE
    operator_notes: Optional[str] = "Manual operator green preemption override"

@router.get("/network", response_model=NetworkStateResponse)
async def get_road_network_state():
    """Returns the full urban road network, including current node coordinates, edges, active incidents, and congestion telemetry."""
    return routing_service.get_network_state()

@router.post("/route", response_model=RouteCalculationResponse)
async def calculate_emergency_route(request: RouteRequest):
    """
    Computes the optimal Green Corridor route and viable alternatives for emergency ambulances.
    Bypasses confirmed impassable road closures, coordinates signal clearance, and assesses destination hospital readiness.
    """
    try:
        response = routing_service.calculate_emergency_route(
            origin_node_id=request.origin_node_id,
            destination_node_id=request.destination_node_id,
            is_emergency=request.is_emergency,
            avoid_congestion=request.avoid_congestion,
            current_route_id=request.current_route_id,
        )
        return response
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Route calculation error: {str(e)}"
        )

@router.get("/corridor/{route_id}", response_model=CorridorCoordinationPlan)
async def get_corridor_coordination_status(route_id: str):
    """Returns the active green corridor coordination plan and junction-by-junction clearance state."""
    plan = corridor_service.active_plans.get(route_id)
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active green corridor plan found for route '{route_id}'"
        )
    return plan

@router.post("/corridor/override", response_model=JunctionCoordinationRequest)
async def override_junction_signal(request: JunctionOverrideRequest):
    """
    Allows dispatch operators to manually command a junction signal controller
    to ACTIVE green, ACKNOWLEDGED, or CLEARED.
    """
    result = corridor_service.trigger_junction_manual_override(
        route_id=request.route_id,
        junction_id=request.junction_id,
        target_state=request.target_state,
        operator_notes=request.operator_notes,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Junction '{request.junction_id}' not found in corridor plan '{request.route_id}'"
        )
    return result

@router.post("/simulate-incident", response_model=RoadEdge)
async def simulate_incident(request: IncidentSimulateRequest):
    """
    Simulates or removes an incident/blockage on a specific road edge,
    triggering dynamic rerouting for emergency vehicles.
    """
    updated_edge = routing_service.simulate_incident(
        edge_id=request.edge_id,
        congestion_level=request.congestion_level,
        has_incident=request.has_incident,
        incident_description=request.incident_description,
        is_confirmed=request.is_confirmed,
    )
    if not updated_edge:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Road edge '{request.edge_id}' not found in network"
        )
    return updated_edge

@router.post("/reset", response_model=NetworkStateResponse)
async def reset_network(request: Optional[ResetNetworkRequest] = None):
    """Resets the road network and all edge weights back to clean seed values."""
    routing_service.load_network()
    return routing_service.get_network_state()
