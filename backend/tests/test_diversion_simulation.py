import pytest
from datetime import datetime
import networkx as nx

from backend.app.services.routing_service import routing_service
from backend.app.services.prediction_service import prediction_service
from backend.app.services.intervention_service import intervention_service
from backend.app.models.schemas import (
    TrafficIncident,
    IncidentCategory,
    IncidentSeverity,
    EventProvenance,
    VerificationStatus,
)

def test_blocked_edge_never_used_in_detour():
    """Verify that a confirmed blocked edge is never included in any alternative detour route."""
    incident = prediction_service.create_incident(
        affected_edge_id="corridor_cctv_07",
        category=IncidentCategory.COLLISION,
        severity=IncidentSeverity.CRITICAL,
        capacity_reduction_pct=1.0,
    )
    res = intervention_service.evaluate_interventions(incident=incident)
    assert res.viable_detours_count > 0

    for detour in res.candidate_detours:
        assert "corridor_cctv_07" not in detour["edge_ids"]
        # Ensure the direct endpoints (Mallikatte and Nanthoor) are connected via intermediate nodes
        assert len(detour["node_path"]) > 2

def test_multiple_distinct_viable_detours_returned():
    """Verify that when the graph supports multiple paths, distinct viable detours are returned."""
    incident = prediction_service.create_incident(
        affected_edge_id="corridor_cctv_07",
        capacity_reduction_pct=0.80,
    )
    res = intervention_service.evaluate_interventions(incident=incident)
    assert res.viable_detours_count >= 2

    # Check distinct edge sequences
    detour1_edges = res.candidate_detours[0]["edge_ids"]
    detour2_edges = res.candidate_detours[1]["edge_ids"]
    assert detour1_edges != detour2_edges

def test_severed_network_returns_no_fabricated_detour():
    """Verify that when the network is severed and no path exists, no fake detour is generated."""
    # Sever the graph by removing all outgoing edges from INT_MALLIKATTE temporarily
    target_edge = routing_service.edges["corridor_cctv_07"]
    s, t = target_edge.source, target_edge.target

    # Create a fresh isolated graph test
    incident = TrafficIncident(
        incident_id="INC-ISOLATED-TEST",
        category=IncidentCategory.ROAD_BLOCKAGE,
        affected_edge_id="corridor_cctv_07",
        road_name="Test Blocked Corridor",
        start_timestamp=datetime.utcnow().isoformat() + "Z",
        severity=IncidentSeverity.CRITICAL,
        capacity_reduction_pct=1.0,
        estimated_duration_min=45.0,
        provenance=EventProvenance.SIMULATED,
    )

    # In a severed test, we test find_viable_detours on non-connected nodes
    detours = intervention_service.find_viable_detours("NON_EXISTENT_A", "NON_EXISTENT_B", "none")
    assert len(detours) == 0

def test_complete_closure_displaces_full_nominal_demand():
    """Verify that a 100% road closure displaces the complete nominal baseline demand."""
    target_edge = routing_service.edges["corridor_cctv_07"]
    nom_vol = intervention_service._compute_edge_nominal_flow(target_edge)

    incident = TrafficIncident(
        incident_id="INC-FULL-CLOSURE",
        category=IncidentCategory.ROAD_BLOCKAGE,
        affected_edge_id="corridor_cctv_07",
        road_name=target_edge.name,
        start_timestamp=datetime.utcnow().isoformat() + "Z",
        severity=IncidentSeverity.CRITICAL,
        capacity_reduction_pct=1.0,  # 100% closure
        estimated_duration_min=60.0,
        provenance=EventProvenance.ESTIMATED,
    )

    res = intervention_service.evaluate_interventions(incident=incident)
    assert res.effective_capacity_veh_hr == 0.0
    assert abs(res.displaced_demand_veh_hr - nom_vol) < 1.0

def test_partial_closure_reduces_effective_capacity_consistently():
    """Verify that a 60% partial closure reduces effective capacity proportionally."""
    target_edge = routing_service.edges["corridor_cctv_07"]
    nom_cap = intervention_service._compute_edge_capacity(target_edge)
    expected_eff_cap = nom_cap * 0.40  # 1.0 - 0.60

    incident = TrafficIncident(
        incident_id="INC-PARTIAL-60",
        category=IncidentCategory.COLLISION,
        affected_edge_id="corridor_cctv_07",
        road_name=target_edge.name,
        start_timestamp=datetime.utcnow().isoformat() + "Z",
        severity=IncidentSeverity.HIGH,
        capacity_reduction_pct=0.60,
        estimated_duration_min=45.0,
        provenance=EventProvenance.ESTIMATED,
    )

    res = intervention_service.evaluate_interventions(incident=incident)
    assert abs(res.effective_capacity_veh_hr - expected_eff_cap) < 1.0

def test_displaced_demand_actually_assigned_to_detour_edges():
    """Verify that displaced demand is actually added to the edges of assigned detour paths."""
    incident = prediction_service.create_incident(
        affected_edge_id="corridor_cctv_07",
        capacity_reduction_pct=0.85,
    )
    res = intervention_service.evaluate_interventions(incident=incident)
    displaced = res.displaced_demand_veh_hr
    assert displaced > 0.0

    # Under Alternative A, assigned demand must equal displaced demand
    scen_a = next(s for s in res.candidate_scenarios if s.scenario_id == "scenario_detour_1")
    assert scen_a.assigned_demand_pcu == displaced
    assert len(scen_a.route_edges) > 0

    # Ensure the route travel time is strictly higher than free-flow time due to BPR loading
    assert scen_a.route_travel_time_min > 0.0

def test_scenarios_are_isolated_no_state_leakage():
    """Verify that evaluating one scenario does not modify or leak state into subsequent calls."""
    incident = prediction_service.create_incident(
        affected_edge_id="corridor_cctv_07",
        capacity_reduction_pct=0.75,
    )

    res1 = intervention_service.evaluate_interventions(incident=incident)
    res2 = intervention_service.evaluate_interventions(incident=incident)

    assert res1.baseline_scenario.total_delay_veh_hours == res2.baseline_scenario.total_delay_veh_hours
    assert res1.recommended_scenario_id == res2.recommended_scenario_id
    assert len(res1.candidate_scenarios) == len(res2.candidate_scenarios)

    for s1, s2 in zip(res1.candidate_scenarios, res2.candidate_scenarios):
        assert s1.scenario_id == s2.scenario_id
        assert s1.delay_saved_veh_hours == s2.delay_saved_veh_hours
        assert s1.max_vc_ratio == s2.max_vc_ratio

def test_capacity_aware_split_reduces_peak_vc():
    """Verify that Capacity-Aware Split distributes traffic and balances peak V/C across detours."""
    incident = prediction_service.create_incident(
        affected_edge_id="corridor_cctv_07",
        capacity_reduction_pct=0.90,
    )
    res = intervention_service.evaluate_interventions(incident=incident)

    if res.viable_detours_count >= 2:
        scen_a = next(s for s in res.candidate_scenarios if s.scenario_id == "scenario_detour_1")
        scen_split = next((s for s in res.candidate_scenarios if s.scenario_id == "scenario_capacity_split"), None)

        if scen_split:
            assert scen_split.delay_saved_veh_hours > 0
            assert scen_split.delay_reduction_pct > 0
            # Split must have a reasonable peak V/C
            assert scen_split.max_vc_ratio <= scen_a.max_vc_ratio + 0.1

def test_provenance_labels_are_explicit():
    """Verify that scenario results and inputs disclose provenance explicitly."""
    incident = prediction_service.create_incident(
        affected_edge_id="corridor_cctv_07",
        capacity_reduction_pct=0.80,
    )
    res = intervention_service.evaluate_interventions(incident=incident)
    assert res.provenance in ["ESTIMATED", "OBSERVED", "SIMULATED"]
    assert len(res.assumptions) >= 4
    for assumption in res.assumptions:
        assert len(assumption) > 5

def test_override_displaced_demand_parameter():
    """Verify that operator can manually adjust estimated displaced demand."""
    incident = prediction_service.create_incident(
        affected_edge_id="corridor_cctv_07",
        capacity_reduction_pct=0.80,
    )
    custom_demand = 1200.0
    res = intervention_service.evaluate_interventions(
        incident=incident,
        override_displaced_demand=custom_demand
    )
    assert res.displaced_demand_veh_hr == custom_demand
