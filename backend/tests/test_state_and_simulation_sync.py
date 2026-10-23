"""
Regression tests for Incident Preset and Simulation State Synchronization.
Verifies that presets (80%, 50%, 60%, 100%), severity adjustments, effective capacities,
and displaced demand calculations are mathematically consistent and strictly isolated.
"""

import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_nanthoor_80pct_preset_sync():
    """Verify Nanthoor Rollover 80% preset computes exact 80% capacity loss and 895 PCU/hr displaced demand."""
    payload = {
        "incident": {
            "incident_id": "INC-MNG-CORRIDOR_CCTV_07",
            "affected_edge_id": "corridor_cctv_07",
            "capacity_reduction_pct": 0.80,
            "severity": "CRITICAL",
            "estimated_duration_min": 45.0,
            "provenance": "ESTIMATED",
            "description": "Nanthoor Rollover (80%)"
        },
        "override_blockage_pct": 0.80
    }

    res = client.post("/api/v1/intelligence/interventions/evaluate", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert "Nanthoor" in data["affected_corridor"]
    assert data["nominal_capacity_veh_hr"] == 1800.0
    # Effective capacity = 1800 * (1 - 0.8) = 360
    assert data["effective_capacity_veh_hr"] == 360.0
    # Baseline demand = 1255. Displaced = 1255 - 360 = 895
    assert data["baseline_flow_veh_hr"] == 1254.5
    assert data["displaced_demand_veh_hr"] == 894.5

    # Blocked edge must never appear in any candidate detours
    for detour in data.get("candidate_detours", []):
        assert "corridor_cctv_07" not in detour["edge_ids"]


def test_bunts_50pct_preset_sync():
    """Verify Bunts Waterlogging 50% preset computes exact 50% capacity loss."""
    payload = {
        "incident": {
            "incident_id": "INC-MNG-CORRIDOR_CCTV_05",
            "affected_edge_id": "corridor_cctv_05",
            "capacity_reduction_pct": 0.50,
            "severity": "HIGH",
            "estimated_duration_min": 45.0,
            "provenance": "ESTIMATED"
        },
        "override_blockage_pct": 0.50
    }

    res = client.post("/api/v1/intelligence/interventions/evaluate", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert "Bunts" in data["affected_corridor"]
    assert data["nominal_capacity_veh_hr"] == 1800.0
    # Effective capacity = 1800 * 0.5 = 900
    assert data["effective_capacity_veh_hr"] == 900.0
    assert data["displaced_demand_veh_hr"] >= 0.0


def test_ks_rao_100pct_full_block_sync():
    """Verify K.S. Rao Closure 100% preset reduces effective capacity to 0."""
    payload = {
        "incident": {
            "incident_id": "INC-MNG-CORRIDOR_CCTV_01",
            "affected_edge_id": "corridor_cctv_01",
            "capacity_reduction_pct": 1.0,
            "severity": "CRITICAL",
            "estimated_duration_min": 60.0,
            "provenance": "ESTIMATED"
        },
        "override_blockage_pct": 1.0
    }

    res = client.post("/api/v1/intelligence/interventions/evaluate", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert "K.S. Rao" in data["affected_corridor"]
    assert data["effective_capacity_veh_hr"] == 0.0
    # With 0 capacity, full baseline demand is displaced
    assert data["displaced_demand_veh_hr"] == data["baseline_flow_veh_hr"]


def test_severity_progression_monotonicity():
    """Verify 25%, 50%, 80%, 100% severity steps produce strictly decreasing capacity and increasing displaced flow."""
    corridor = "corridor_cctv_07"
    blockages = [0.25, 0.50, 0.80, 1.00]
    effective_caps = []
    displaced_demands = []

    for b in blockages:
        payload = {
            "incident": {
                "incident_id": f"INC-TEST-{int(b*100)}",
                "affected_edge_id": corridor,
                "capacity_reduction_pct": b,
                "severity": "MODERATE",
                "estimated_duration_min": 30.0,
                "provenance": "ESTIMATED"
            },
            "override_blockage_pct": b
        }
        res = client.post("/api/v1/intelligence/interventions/evaluate", json=payload)
        assert res.status_code == 200
        d = res.json()
        effective_caps.append(d["effective_capacity_veh_hr"])
        displaced_demands.append(d["displaced_demand_veh_hr"])

    # Effective capacity must strictly decrease
    assert effective_caps[0] > effective_caps[1] > effective_caps[2] > effective_caps[3]
    assert effective_caps[3] == 0.0

    # Displaced demand must monotonically increase
    assert displaced_demands[0] <= displaced_demands[1] <= displaced_demands[2] <= displaced_demands[3]


def test_scenario_segment_impacts_completeness():
    """Verify all scenarios return complete link-by-link segment impacts with valid non-negative values."""
    payload = {
        "incident": {
            "incident_id": "INC-TEST-SEGMENTS",
            "affected_edge_id": "corridor_cctv_07",
            "capacity_reduction_pct": 0.80,
            "severity": "CRITICAL",
            "estimated_duration_min": 45.0,
            "provenance": "ESTIMATED"
        },
        "override_blockage_pct": 0.80
    }

    res = client.post("/api/v1/intelligence/interventions/evaluate", json=payload)
    assert res.status_code == 200
    data = res.json()

    for sc in data.get("candidate_scenarios", []) + [data["baseline_scenario"]]:
        impacts = sc.get("segment_impacts", [])
        assert len(impacts) > 0
        for seg in impacts:
            assert seg["assigned_flow_pcu"] >= 0.0
            assert seg["capacity_pcu"] > 0.0
            assert seg["vc_ratio"] >= 0.0
            assert seg["travel_time_min"] > 0.0
            assert seg["role"] in ["BLOCKED_CORRIDOR", "DETOUR_ROUTE", "UPSTREAM_FEEDER"]
