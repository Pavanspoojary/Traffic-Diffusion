import pytest
from backend.app.services.routing_service import RoutingService
from backend.app.models.schemas import CongestionLevel

def test_network_initialization():
    service = RoutingService()
    state = service.get_network_state()
    assert len(state.nodes) >= 10
    assert len(state.edges) >= 12
    assert "EMS_STATE_BANK" in service.nodes
    assert "HOSPITAL_AJ_KUNTIKAN" in service.nodes
    assert "HOSPITAL_FATHER_MULLER" in service.nodes

def test_emergency_route_free_flow():
    service = RoutingService()
    # Clear any incident on corridor_cctv_07 for baseline check
    service.simulate_incident(
        edge_id="corridor_cctv_07",
        congestion_level=CongestionLevel.FREE_FLOW,
        has_incident=False
    )
    # Clear Bunts Hostel corridor
    service.simulate_incident(
        edge_id="corridor_cctv_05",
        congestion_level=CongestionLevel.FREE_FLOW,
        has_incident=False
    )

    route = service.calculate_emergency_route(
        origin_node_id="EMS_STATE_BANK",
        destination_node_id="HOSPITAL_AJ_KUNTIKAN",
        is_emergency=True,
    )
    assert route.origin.id == "EMS_STATE_BANK"
    assert route.destination.id == "HOSPITAL_AJ_KUNTIKAN"
    assert len(route.path_node_ids) >= 3
    assert route.total_distance_km > 0
    assert route.estimated_travel_time_min > 0

def test_dynamic_rerouting_around_blockage():
    service = RoutingService()
    
    # Simulate a major accident at Nanthoor (corridor_cctv_07)
    service.simulate_incident(
        edge_id="corridor_cctv_07",
        congestion_level=CongestionLevel.BLOCKED,
        has_incident=True,
        incident_description="Freight collision blocking Nanthoor junction",
    )

    route = service.calculate_emergency_route(
        origin_node_id="EMS_STATE_BANK",
        destination_node_id="HOSPITAL_AJ_KUNTIKAN",
        is_emergency=True,
        avoid_congestion=True,
    )

    # Verify that the emergency route avoided the blocked Nanthoor corridor (corridor_cctv_07)
    used_edges = [seg.edge_id for seg in route.segments]
    assert "corridor_cctv_07" not in used_edges

    # Verify that it took the green bypass route via Lalbagh / Bejai
    assert "INT_LALBAGH" in route.path_node_ids
    assert route.is_green_corridor_active is True
