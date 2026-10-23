import pytest
from backend.app.services.routing_service import RoutingService
from backend.app.models.schemas import CongestionLevel

def test_network_initialization():
    service = RoutingService()
    state = service.get_network_state()
    assert len(state.nodes) >= 8
    assert len(state.edges) >= 10
    assert "EMS_HQ_SOUTH" in service.nodes
    assert "HOSPITAL_TRAUMA_CENTER" in service.nodes

def test_emergency_route_free_flow():
    service = RoutingService()
    # Ensure corridor 4 is free flow for baseline check
    service.simulate_incident(
        edge_id="corridor_cctv_04",
        congestion_level=CongestionLevel.FREE_FLOW,
        has_incident=False
    )
    # Clear corridor 3
    service.simulate_incident(
        edge_id="corridor_cctv_03",
        congestion_level=CongestionLevel.FREE_FLOW,
        has_incident=False
    )

    route = service.calculate_emergency_route(
        origin_node_id="EMS_HQ_SOUTH",
        destination_node_id="HOSPITAL_TRAUMA_CENTER",
        is_emergency=True,
    )
    assert route.origin.id == "EMS_HQ_SOUTH"
    assert route.destination.id == "HOSPITAL_TRAUMA_CENTER"
    assert len(route.path_node_ids) >= 3
    assert route.total_distance_km > 0
    assert route.estimated_travel_time_min > 0

def test_dynamic_rerouting_around_blockage():
    service = RoutingService()
    
    # Simulate a major accident on the direct tech corridor link (corridor_cctv_04)
    service.simulate_incident(
        edge_id="corridor_cctv_04",
        congestion_level=CongestionLevel.BLOCKED,
        has_incident=True,
        incident_description="Overturned vehicle blocking all lanes",
    )
    
    # Also block corridor_cctv_03 to test routing detour
    service.simulate_incident(
        edge_id="corridor_cctv_03",
        congestion_level=CongestionLevel.HEAVY,
        has_incident=False,
    )

    route = service.calculate_emergency_route(
        origin_node_id="EMS_HQ_SOUTH",
        destination_node_id="HOSPITAL_TRAUMA_CENTER",
        is_emergency=True,
        avoid_congestion=True,
    )

    # Verify that the emergency route avoided the blocked corridor_cctv_04
    used_edges = [seg.edge_id for seg in route.segments]
    assert "corridor_cctv_04" not in used_edges

    # Verify that it took the alternate route via Civic Center / North Ring
    assert "INT_CIVIC_CENTER" in route.path_node_ids or "INT_NORTH_RING" in route.path_node_ids
    assert route.is_green_corridor_active is True
