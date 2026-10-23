from fastapi import APIRouter, HTTPException, status
from backend.app.models.schemas import (
    NetworkStateResponse,
    RouteRequest,
    RouteCalculationResponse,
    IncidentSimulateRequest,
    ResetNetworkRequest,
    RoadEdge,
)
from backend.app.services.routing_service import routing_service

router = APIRouter(prefix="/api/v1/navigation", tags=["Emergency Navigation & Routing"])

@router.get("/network", response_model=NetworkStateResponse)
async def get_road_network_state():
    """Returns the full urban road network, including current node coordinates, edges, and congestion telemetry."""
    return routing_service.get_network_state()

@router.post("/route", response_model=RouteCalculationResponse)
async def calculate_emergency_route(request: RouteRequest):
    """
    Computes the optimal Green Corridor route for emergency ambulances.
    Bypasses blocked corridors, avoids heavy congestion, and calculates signal preemption along the path.
    """
    try:
        response = routing_service.calculate_emergency_route(
            origin_node_id=request.origin_node_id,
            destination_node_id=request.destination_node_id,
            is_emergency=request.is_emergency,
            avoid_congestion=request.avoid_congestion,
        )
        return response
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Route calculation error: {str(e)}"
        )

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
    )
    if not updated_edge:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Road edge '{request.edge_id}' not found in network"
        )
    return updated_edge

@router.post("/reset", response_model=NetworkStateResponse)
async def reset_network():
    """Resets the road network and all edge weights back to clean seed values."""
    routing_service.load_network()
    return routing_service.get_network_state()
