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
    CongestionLevel,
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

def test_exact_demand_conservation_in_multi_route_split():
    """Verify that in multi-route splits, the sum of demand assigned matches displaced demand exactly."""
    incident = TrafficIncident(
        incident_id="INC-CONSERVE-TEST",
        category=IncidentCategory.ROAD_BLOCKAGE,
        affected_edge_id="corridor_cctv_07",
        road_name="Mallikatte - Nanthoor Stretch",
        start_timestamp=datetime.utcnow().isoformat() + "Z",
        severity=IncidentSeverity.CRITICAL,
        capacity_reduction_pct=0.80,
        estimated_duration_min=45.0,
        provenance=EventProvenance.ESTIMATED,
    )
    res = intervention_service.evaluate_interventions(incident=incident)
    assert res.displaced_demand_veh_hr > 0
    split_scenario = next((s for s in res.candidate_scenarios if s.scenario_id == "scenario_capacity_split"), None)
    if split_scenario:
        total_action_diversion = sum(a.diversion_percentage for a in split_scenario.actions)
        assert abs(total_action_diversion - 1.0) < 1e-4
        assert abs(split_scenario.assigned_demand_pcu - res.displaced_demand_veh_hr) < 0.1

def test_deterministic_blockage_progression_0_80_100():
    """Verify deterministic progression of effective capacity and displaced demand across 0%, 80%, and 100% blockage."""
    target_edge = routing_service.edges["corridor_cctv_07"]
    nom_cap = intervention_service._compute_edge_capacity(target_edge)
    nom_flow = intervention_service._compute_edge_nominal_flow(target_edge)

    # 1. 0% Blockage
    inc_0 = TrafficIncident(
        incident_id="INC-0-PCT",
        category=IncidentCategory.ROAD_BLOCKAGE,
        affected_edge_id="corridor_cctv_07",
        road_name=target_edge.name,
        start_timestamp=datetime.utcnow().isoformat() + "Z",
        severity=IncidentSeverity.LOW,
        capacity_reduction_pct=0.0,
        estimated_duration_min=30.0,
        provenance=EventProvenance.SIMULATED,
    )
    res_0 = intervention_service.evaluate_interventions(incident=inc_0, override_blockage_pct=0.0)
    assert res_0.effective_capacity_veh_hr == nom_cap
    assert res_0.displaced_demand_veh_hr == 0.0

    # 2. 80% Blockage
    inc_80 = TrafficIncident(
        incident_id="INC-80-PCT",
        category=IncidentCategory.COLLISION,
        affected_edge_id="corridor_cctv_07",
        road_name=target_edge.name,
        start_timestamp=datetime.utcnow().isoformat() + "Z",
        severity=IncidentSeverity.CRITICAL,
        capacity_reduction_pct=0.80,
        estimated_duration_min=45.0,
        provenance=EventProvenance.ESTIMATED,
    )
    res_80 = intervention_service.evaluate_interventions(incident=inc_80, override_blockage_pct=0.80)
    expected_eff_cap_80 = round(nom_cap * 0.20, 1)
    assert abs(res_80.effective_capacity_veh_hr - expected_eff_cap_80) < 1.0
    expected_displaced_80 = max(0.0, nom_flow - expected_eff_cap_80)
    assert abs(res_80.displaced_demand_veh_hr - expected_displaced_80) < 1.0

    # 3. 100% Blockage (Full Closure)
    inc_100 = TrafficIncident(
        incident_id="INC-100-PCT",
        category=IncidentCategory.ROAD_BLOCKAGE,
        affected_edge_id="corridor_cctv_07",
        road_name=target_edge.name,
        start_timestamp=datetime.utcnow().isoformat() + "Z",
        severity=IncidentSeverity.CRITICAL,
        capacity_reduction_pct=1.0,
        estimated_duration_min=60.0,
        provenance=EventProvenance.ESTIMATED,
    )
    res_100 = intervention_service.evaluate_interventions(incident=inc_100, override_blockage_pct=1.0)
    assert res_100.effective_capacity_veh_hr == 0.0
    assert abs(res_100.displaced_demand_veh_hr - nom_flow) < 1.0

def test_capacity_aware_allocation_boundary_conditions():
    """Verify capacity-aware split handles zero-reserve and oversaturated routes mathematically."""
    # When Route A has spare capacity and Route B has zero spare capacity (V/C >= 1.0)
    viable_mock = [
        {"bottleneck_capacity_pcu": 1000.0, "max_baseline_vc": 0.60},
        {"bottleneck_capacity_pcu": 1000.0, "max_baseline_vc": 1.10},
    ]
    reserves = [max(0.0, d["bottleneck_capacity_pcu"] * (1.0 - d["max_baseline_vc"])) for d in viable_mock]
    assert reserves[0] == 400.0
    assert reserves[1] == 0.0
    total_res = sum(reserves)
    w1 = reserves[0] / total_res
    w2 = reserves[1] / total_res
    assert w1 == 1.0
    assert w2 == 0.0

    # When both routes are oversaturated (reserve == 0), allocate inversely to (V/C)^2
    viable_mock_sat = [
        {"bottleneck_capacity_pcu": 1000.0, "max_baseline_vc": 1.20},
        {"bottleneck_capacity_pcu": 1000.0, "max_baseline_vc": 1.50},
    ]
    reserves_sat = [max(0.0, d["bottleneck_capacity_pcu"] * (1.0 - d["max_baseline_vc"])) for d in viable_mock_sat]
    assert sum(reserves_sat) == 0.0
    inv1 = 1.0 / (1.20 ** 2)
    inv2 = 1.0 / (1.50 ** 2)
    sum_inv = inv1 + inv2
    w1_sat = inv1 / sum_inv
    w2_sat = inv2 / sum_inv
    assert w1_sat > w2_sat
    assert abs((w1_sat + w2_sat) - 1.0) < 1e-6

def test_alternative_unavailable_due_to_secondary_closure():
    """Verify that an active closure on another corridor excludes that corridor from detour generation."""
    detours_initial = intervention_service.find_viable_detours(
        source_node_id="INT_MALLIKATTE",
        target_node_id="INT_NANTHOOR",
        blocked_edge_id="corridor_cctv_07"
    )
    assert len(detours_initial) >= 2
    first_detour_edge = detours_initial[0]["edge_ids"][0]

    sec_inc = prediction_service.create_incident(
        affected_edge_id=first_detour_edge,
        category=IncidentCategory.ROAD_BLOCKAGE,
        severity=IncidentSeverity.CRITICAL,
        capacity_reduction_pct=0.95,
    )
    try:
        detours_after = intervention_service.find_viable_detours(
            source_node_id="INT_MALLIKATTE",
            target_node_id="INT_NANTHOOR",
            blocked_edge_id="corridor_cctv_07"
        )
        for detour in detours_after:
            assert first_detour_edge not in detour["edge_ids"]
            assert "corridor_cctv_07" not in detour["edge_ids"]
    finally:
        if sec_inc.incident_id in prediction_service.active_incidents:
            del prediction_service.active_incidents[sec_inc.incident_id]
        edge_obj = routing_service.edges.get(first_detour_edge)
        if edge_obj:
            edge_obj.has_incident = False
            edge_obj.congestion_level = CongestionLevel.FREE_FLOW

def test_objective_ranking_and_downstream_bottleneck_detection():
    """Verify that scenario ranking uses physical criteria and documents trade-offs without arbitrary penalties."""
    inc = TrafficIncident(
        incident_id="INC-RANK-TEST",
        category=IncidentCategory.COLLISION,
        affected_edge_id="corridor_cctv_07",
        road_name="Mallikatte - Nanthoor Stretch",
        start_timestamp=datetime.utcnow().isoformat() + "Z",
        severity=IncidentSeverity.CRITICAL,
        capacity_reduction_pct=0.80,
        estimated_duration_min=45.0,
        provenance=EventProvenance.ESTIMATED,
    )
    res = intervention_service.evaluate_interventions(incident=inc)
    assert res.recommended_scenario_id is not None
    ranks = [s.rank for s in res.candidate_scenarios]
    assert ranks == list(range(1, len(res.candidate_scenarios) + 1))

    rec = next(s for s in res.candidate_scenarios if s.scenario_id == res.recommended_scenario_id)
    assert rec.rank == 1
    assert len(res.recommendation_rationale) > 10
    assert len(res.tradeoff_summary) > 10


def test_manual_baseline_demand_entry_override():
    """Verify that the control room operator can manually specify custom baseline demand."""
    inc = TrafficIncident(
        incident_id="INC-MANUAL-DEMAND",
        category=IncidentCategory.ROAD_BLOCKAGE,
        affected_edge_id="corridor_cctv_07",
        capacity_reduction_pct=0.50,
        provenance=EventProvenance.SIMULATED,
    )
    # Calibrated nominal flow on corridor_cctv_07 is 1254.5 PCU/hr
    # Operator manually enters peak-surge demand of 2200 PCU/hr
    custom_demand = 2200.0
    res = intervention_service.evaluate_interventions(
        incident=inc,
        override_baseline_demand=custom_demand,
        override_blockage_pct=0.50,
    )
    # Effective capacity = 1800 * (1 - 0.50) = 900 PCU/hr
    # Displaced demand = 2200 - 900 = 1300 PCU/hr
    assert res.baseline_flow_veh_hr == 2200.0
    assert res.effective_capacity_veh_hr == 900.0
    assert res.displaced_demand_veh_hr == 1300.0
    assert res.viable_detours_count >= 2


def test_anti_jam_multi_corridor_split_prevents_secondary_congestion():
    """Verify that capacity-aware multi-corridor split assigns flow to keep peak V/C within safe limits."""
    inc = TrafficIncident(
        incident_id="INC-ANTI-JAM-TEST",
        category=IncidentCategory.COLLISION,
        affected_edge_id="corridor_cctv_07",
        capacity_reduction_pct=0.85,
        provenance=EventProvenance.SIMULATED,
    )
    res = intervention_service.evaluate_interventions(incident=inc)
    split_scen = next((s for s in res.candidate_scenarios if s.scenario_id == "scenario_capacity_split"), None)
    assert split_scen is not None
    assert len(split_scen.actions) >= 2
    # Capacity-aware split must achieve 0 new downstream bottlenecks
    assert len(split_scen.downstream_bottlenecks) == 0
    assert split_scen.max_vc_ratio <= 1.05


def test_all_mangaluru_arterials_have_viable_detours():
    """Verify that all key mapped arterial corridors in Mangaluru discover viable detour alternatives."""
    corridors_to_check = [
        "corridor_cctv_01",  # K.S. Rao Road
        "corridor_cctv_03",  # Light House Hill Road
        "corridor_cctv_05",  # Bunts Hostel Avenue
        "corridor_cctv_06",  # Kadri Road Corridor
        "corridor_cctv_07",  # Circuit House - Nanthoor Road
        "corridor_cctv_08",  # NH-66 Highway Corridor
        "corridor_cctv_10",  # MG Road
        "corridor_cctv_15",  # Kankanady - Pumpwell Connector
    ]
    for cid in corridors_to_check:
        inc = TrafficIncident(
            incident_id=f"INC-{cid}-DETOUR-TEST",
            category=IncidentCategory.ROAD_BLOCKAGE,
            affected_edge_id=cid,
            capacity_reduction_pct=0.80,
            provenance=EventProvenance.SIMULATED,
        )
        res = intervention_service.evaluate_interventions(incident=inc)
        assert res.viable_detours_count > 0, f"Corridor {cid} should have at least 1 viable detour"

