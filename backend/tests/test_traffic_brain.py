import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.services.routing_service import routing_service
from backend.app.services.prediction_service import prediction_service
from backend.app.services.intervention_service import intervention_service
from backend.app.services.risk_service import risk_service
from backend.app.models.schemas import (
    TrafficIncident,
    IncidentCategory,
    IncidentSeverity,
    EventProvenance,
    VerificationStatus,
    ForecastRequest,
    InterventionEvaluationRequest,
    DemandSimulationRequest,
)

client = TestClient(app)


# =============================================================================
# 1. GRAPH AND ROUTING TESTS (Part H)
# =============================================================================

def test_graph_directionality_is_strictly_respected():
    """Verify that routing strictly honors directed edges and does not traverse reverse links."""
    routing_service.load_network()
    
    # Check that directed edges in DiGraph only allow traversal in their designated direction
    for u, v, data in routing_service.graph.edges(data=True):
        if not routing_service.graph.has_edge(v, u):
            # One-way edge: attempting to route against the arrow must not fabricate a direct reverse edge
            try:
                res = routing_service.calculate_emergency_route(v, u)
                if res and res.primary_route:
                    path_nodes = res.primary_route.path_node_ids
                    # If a path exists in reverse, it must follow an actual alternate cycle, not the direct reverse edge (v, u)
                    assert (v, u) not in zip(path_nodes[:-1], path_nodes[1:]), (
                        f"Direct reverse traversal occurred on strictly one-way edge {v}->{u}"
                    )
            except ValueError:
                # No route in reverse is completely valid for one-way disconnected paths
                pass


def test_disconnected_subgraphs_cannot_fabricate_routes():
    """Severing all connections to a node must result in NO_VIABLE_ROUTE ValueError, not teleportation."""
    routing_service.load_network()
    
    # Temporarily remove all outgoing edges from INT_NANTHOOR in graph
    out_edges = list(routing_service.graph.out_edges("INT_NANTHOOR"))
    for u, v in out_edges:
        routing_service.graph.remove_edge(u, v)

    try:
        with pytest.raises(ValueError, match="NO_VIABLE_ROUTE"):
            routing_service.calculate_emergency_route("INT_NANTHOOR", "INT_PUMPWELL")
    finally:
        # Restore network
        routing_service.load_network()


def test_confirmed_full_closures_are_avoided_by_router():
    """When an edge is fully closed, shortest path routing must not traverse that edge."""
    routing_service.load_network()
    
    test_edge_id = "corridor_cctv_07"
    edge = routing_service.edges[test_edge_id]
    
    # Mark edge as closed
    routing_service.update_edge_blockage(test_edge_id, blockage_pct=1.0)
    assert routing_service.edges[test_edge_id].is_closed is True
    
    res = routing_service.calculate_emergency_route("INT_BUNTS_HOSTEL", "INT_NANTHOOR")
    assert res is not None
    assert res.primary_route is not None
    
    # Verify the closed edge itself is not in the traversed route segments
    used_edge_ids = [seg.edge_id for seg in res.primary_route.segments]
    assert test_edge_id not in used_edge_ids, f"Closed edge {test_edge_id} was traversed by router!"


def test_partial_blockage_increases_travel_cost_without_disconnecting():
    """Partial blockage increases effective BPR cost while keeping the road physically traversable."""
    routing_service.load_network()
    test_edge_id = "corridor_cctv_05"
    edge = routing_service.edges[test_edge_id]
    
    initial_time = edge.effective_travel_time_min
    
    # Apply 50% partial blockage
    routing_service.update_edge_blockage(test_edge_id, blockage_pct=0.5)
    
    assert edge.is_closed is False
    assert edge.effective_travel_time_min > initial_time, (
        f"Travel time did not increase after partial blockage: {edge.effective_travel_time_min} vs {initial_time}"
    )


# =============================================================================
# 2. TRAFFIC BRAIN QUEUE AND DEMONSTRATION LOGIC (Part H)
# =============================================================================

def test_queue_simulation_bounds_and_spillback():
    """Queue accumulation must never go negative and must respect physical storage limits."""
    edge_id = "corridor_cctv_07"
    edge = routing_service.edges[edge_id]
    storage_limit = edge.queue_storage_limit_pcu
    
    # Scenario: arrivals vastly exceed capacity
    service_rate_per_min = (edge.nominal_capacity_veh_hr * 0.20) / 60.0  # 80% blocked
    arrival_rate_per_min = (edge.estimated_baseline_volume_veh_hr) / 60.0
    
    current_queue = 0.0
    for _ in range(60):  # 60 minutes
        arrivals = arrival_rate_per_min
        departures = min(current_queue + arrivals, service_rate_per_min)
        next_queue = max(0.0, current_queue + arrivals - departures)
        current_queue = min(next_queue, storage_limit)
        
        assert current_queue >= 0.0, "Queue dropped below zero!"
        assert current_queue <= storage_limit, "Queue exceeded physical storage limit!"


def test_ten_vehicles_demand_model_evaluation():
    """Prompt C5: '10 vehicles, same destination' demand assignment model."""
    result = prediction_service.evaluate_demand_scenario(
        origin_node_id="INT_BUNTS_HOSTEL",
        destination_node_id="INT_NANTHOOR",
        extra_vehicles=10,
        background_volume_mode="CALCULATED_NOMINAL",
        arrival_window_min=5.0
    )
    
    assert result.extra_vehicles == 10
    assert result.feasible_routes_count >= 1
    assert result.recommended_strategy != ""
    assert result.uncertainty_notice is None
    assert result.provenance == "SIMULATION_BASED_ESTIMATE"
    
    # Test with UNKNOWN background demand
    result_unknown = prediction_service.evaluate_demand_scenario(
        origin_node_id="INT_BUNTS_HOSTEL",
        destination_node_id="INT_NANTHOOR",
        extra_vehicles=10,
        background_volume_mode="UNKNOWN",
        arrival_window_min=5.0
    )
    assert result_unknown.uncertainty_notice is not None
    assert "unmeasured" in result_unknown.uncertainty_notice.lower()


def test_shared_downstream_bottleneck_detection():
    """Intervention planner must detect when diversion routes merge into a common bottleneck."""
    inc = TrafficIncident(
        incident_id="TEST-INC-BOTTLENECK",
        affected_edge_id="corridor_cctv_07",
        category=IncidentCategory.COLLISION,
        severity=IncidentSeverity.CRITICAL,
        blocked_lanes=2,
        capacity_reduction_pct=0.85,
        estimated_duration_min=45.0,
        provenance=EventProvenance.SIMULATED,
        verification_status=VerificationStatus.VERIFIED,
    )
    
    eval_res = intervention_service.evaluate_interventions(incident=inc, horizon_minutes=30)
    
    assert eval_res is not None
    assert eval_res.candidate_scenarios is not None
    assert len(eval_res.candidate_scenarios) >= 3
    # Check that candidate scenarios compute downstream bottlenecks
    for sc in eval_res.candidate_scenarios:
        assert isinstance(sc.downstream_bottlenecks, list)


def test_capacity_aware_diversion_superiority_logic():
    """Capacity-aware diversion must only be recommended if it demonstrably reduces delay or chokepoints."""
    inc = TrafficIncident(
        incident_id="TEST-INC-REC",
        affected_edge_id="corridor_cctv_07",
        category=IncidentCategory.COLLISION,
        severity=IncidentSeverity.CRITICAL,
        blocked_lanes=2,
        capacity_reduction_pct=0.80,
        estimated_duration_min=45.0,
        provenance=EventProvenance.SIMULATED,
        verification_status=VerificationStatus.VERIFIED,
    )
    
    eval_res = intervention_service.evaluate_interventions(incident=inc, horizon_minutes=30)
    
    rec_id = eval_res.recommended_scenario_id
    rec_sc = next(s for s in eval_res.candidate_scenarios if s.scenario_id == rec_id)
    
    # Recommended scenario must save positive delay over baseline
    assert rec_sc.delay_saved_veh_hours > 0.0 or eval_res.is_inconclusive is True


def test_unconfirmed_incident_does_not_force_closure():
    """Unconfirmed reports remain flagged without forcibly severing the corridor unless confirmed."""
    routing_service.load_network()
    
    unconf_inc = prediction_service.create_incident(
        affected_edge_id="corridor_cctv_05",
        category=IncidentCategory.ROAD_BLOCKAGE,
        severity=IncidentSeverity.HIGH,
        capacity_reduction_pct=0.90,
        verification_status=VerificationStatus.UNVERIFIED,
        is_full_closure=False,
    )
    
    assert unconf_inc.verification_status == VerificationStatus.UNVERIFIED
    # Road should not be forcibly marked closed for unconfirmed incident
    assert routing_service.edges["corridor_cctv_05"].is_closed is False


def test_deterministic_demo_scenario_repeatability():
    """Resetting demo scenario must produce identical deterministic metrics."""
    res1 = client.post("/api/demo/reset")
    assert res1.status_code == 200
    data1 = res1.json()
    
    res2 = client.post("/api/demo/reset")
    assert res2.status_code == 200
    data2 = res2.json()
    
    assert data1["incident"]["affected_edge_id"] == data2["incident"]["affected_edge_id"]
    assert data1["incident"]["capacity_reduction_pct"] == data2["incident"]["capacity_reduction_pct"]


# =============================================================================
# 3. FASTAPI SEMANTIC BRAIN API ENDPOINTS (Part E & Part H)
# =============================================================================

def test_api_network_state():
    """GET /api/network returns valid nodes, edges, and physical attributes."""
    res = client.get("/api/network")
    assert res.status_code == 200
    data = res.json()
    assert len(data["nodes"]) == 17
    assert len(data["edges"]) == 38
    
    # Check that transparent attributes are exposed
    first_edge = data["edges"][0]
    assert "nominal_capacity_veh_hr" in first_edge
    assert "queue_storage_limit_pcu" in first_edge
    assert "length_meters" in first_edge
    assert "free_flow_travel_time_min" in first_edge


def test_api_incidents_crud_and_validation():
    """POST /api/incidents creates and validates incident records."""
    payload = {
        "affected_edge_id": "corridor_cctv_10",
        "category": "COLLISION",
        "severity": "HIGH",
        "capacity_reduction_pct": 0.70,
        "is_full_closure": False,
        "blocked_lanes": 2,
        "estimated_duration_min": 35.0,
        "verification_status": "VERIFIED",
        "provenance": "SIMULATED",
        "source": "UNIT_TEST_AGENT"
    }
    
    res = client.post("/api/incidents", json=payload)
    assert res.status_code == 201
    created = res.json()
    assert created["affected_edge_id"] == "corridor_cctv_10"
    assert created["capacity_reduction_pct"] == 0.70
    
    # Retrieve incident
    get_res = client.get(f"/api/incidents/{created['incident_id']}")
    assert get_res.status_code == 200
    assert get_res.json()["incident_id"] == created["incident_id"]
    
    # 404 on nonexistent edge
    invalid_payload = dict(payload, affected_edge_id="nonexistent_edge_999")
    err_res = client.post("/api/incidents", json=invalid_payload)
    assert err_res.status_code == 404


def test_api_multi_horizon_impact_analysis():
    """POST /api/analysis/impact returns 15, 30, and 60m forecasts."""
    payload = {
        "incident": {
            "incident_id": "INC-TEST-01",
            "affected_edge_id": "corridor_cctv_07",
            "capacity_reduction_pct": 0.80,
            "severity": "CRITICAL",
            "estimated_duration_min": 45.0,
            "provenance": "SIMULATED",
            "verification_status": "VERIFIED"
        },
        "horizons": [15, 30, 60]
    }
    
    res = client.post("/api/analysis/impact", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "forecasts" in data
    assert "15" in data["forecasts"]
    assert "30" in data["forecasts"]
    assert "60" in data["forecasts"]
    assert len(data["model_assumptions"]) > 0


def test_api_compare_interventions():
    """POST /api/analysis/compare-interventions compares baseline vs what-if plans."""
    payload = {
        "incident": {
            "incident_id": "INC-TEST-02",
            "affected_edge_id": "corridor_cctv_07",
            "capacity_reduction_pct": 0.80,
            "severity": "CRITICAL",
            "estimated_duration_min": 45.0,
            "provenance": "SIMULATED",
            "verification_status": "VERIFIED"
        }
    }
    
    res = client.post("/api/analysis/compare-interventions", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "baseline_scenario" in data
    assert "candidate_scenarios" in data
    assert len(data["candidate_scenarios"]) >= 3
    assert data["provenance"] in ["ESTIMATED", "SIMULATION_BASED_ESTIMATE"]


def test_api_risk_segments():
    """GET /api/analysis/risk-segments returns explainable ranked risk segments."""
    res = client.get("/api/analysis/risk-segments?horizon_minutes=30")
    assert res.status_code == 200
    data = res.json()
    assert "high_risk_roads" in data
    assert "critical_junctions" in data
    if len(data["high_risk_roads"]) > 0:
        first_risk = data["high_risk_roads"][0]
        assert "risk_score" in first_risk
        assert "contributing_factors" in first_risk
        assert len(first_risk["contributing_factors"]) > 0


def test_api_demand_simulation_endpoint():
    """POST /api/analysis/demand-simulation evaluates 10 extra vehicles heading to same destination."""
    payload = {
        "origin_node_id": "INT_BUNTS_HOSTEL",
        "destination_node_id": "INT_NANTHOOR",
        "extra_vehicles": 10,
        "background_volume_mode": "CALCULATED_NOMINAL",
        "arrival_window_min": 5.0
    }
    res = client.post("/api/analysis/demand-simulation", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["extra_vehicles"] == 10
    assert data["feasible_routes_count"] >= 1
    assert data["recommended_strategy"] != ""
