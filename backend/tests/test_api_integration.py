import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"

def test_get_network():
    response = client.get("/api/v1/navigation/network")
    assert response.status_code == 200
    data = response.json()
    assert "nodes" in data
    assert "edges" in data
    assert len(data["nodes"]) >= 8

def test_emergency_route_api():
    payload = {
        "origin_node_id": "EMS_STATE_BANK",
        "destination_node_id": "HOSPITAL_AJ_KUNTIKAN",
        "is_emergency": True,
        "avoid_congestion": True
    }
    response = client.post("/api/v1/navigation/route", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["origin"]["id"] == "EMS_STATE_BANK"
    assert data["destination"]["id"] == "HOSPITAL_AJ_KUNTIKAN"
    assert data["total_distance_km"] > 0
    assert data["estimated_travel_time_min"] > 0
    assert len(data["path_coordinates"]) >= 3
    assert "primary_route" in data
    assert "coordination_plan" in data
    assert "hospital_readiness" in data

def test_analyze_sample_and_propagate():
    response = client.post(
        "/api/v1/cv/analyze-sample?sample_type=heavy&corridor_id=corridor_cctv_04"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["corridor_id"] == "corridor_cctv_04"
    assert data["frames_analyzed"] > 0
    assert "vehicle_counts" in data
    assert data["density_score"] > 0

def test_simulate_incident_api():
    payload = {
        "edge_id": "corridor_cctv_01",
        "congestion_level": "BLOCKED",
        "has_incident": True,
        "incident_description": "Road accident test blockage"
    }
    response = client.post("/api/v1/navigation/simulate-incident", json=payload)
    assert response.status_code == 200
    edge = response.json()
    assert edge["id"] == "corridor_cctv_01"
    assert edge["has_incident"] is True
    assert edge["congestion_level"] == "BLOCKED"

def test_corridor_coordination_and_override_api():
    # 0. Reset network state
    client.post("/api/v1/navigation/reset")

    # 1. Compute a route first so a corridor plan is generated
    payload = {
        "origin_node_id": "EMS_STATE_BANK",
        "destination_node_id": "HOSPITAL_AJ_KUNTIKAN",
        "is_emergency": True,
    }
    route_res = client.post("/api/v1/navigation/route", json=payload)
    assert route_res.status_code == 200
    route_data = route_res.json()
    route_id = route_data["primary_route"]["route_id"]

    # 2. Get corridor plan
    corr_res = client.get(f"/api/v1/navigation/corridor/{route_id}")
    assert corr_res.status_code == 200
    corr_data = corr_res.json()
    assert corr_data["corridor_id"] == route_id
    assert len(corr_data["junctions"]) > 0
    target_junction = corr_data["junctions"][0]["junction_id"]

    # 3. Override junction state
    override_payload = {
        "route_id": route_id,
        "junction_id": target_junction,
        "target_state": "ACTIVE",
        "operator_notes": "Emergency escort override"
    }
    override_res = client.post("/api/v1/navigation/corridor/override", json=override_payload)
    assert override_res.status_code == 200
    ov_data = override_res.json()
    assert ov_data["junction_id"] == target_junction
    assert ov_data["state"] == "ACTIVE"

def test_operator_incident_verification_api():
    # Inject a simulated incident
    payload = {
        "edge_id": "corridor_cctv_05",
        "congestion_level": "BLOCKED",
        "has_incident": True,
        "incident_description": "Test collision for verification API"
    }
    client.post("/api/v1/navigation/simulate-incident", json=payload)

    # Get active incidents
    inc_res = client.get("/api/v1/cv/incidents")
    assert inc_res.status_code == 200
    incidents = inc_res.json()
    assert len(incidents) >= 1
    test_inc_id = incidents[0]["incident_id"]

    # Operator confirms incident
    verify_payload = {
        "incident_id": test_inc_id,
        "action": "CONFIRM",
        "notes": "Verified by dispatch supervisor"
    }
    ver_res = client.post(f"/api/v1/cv/incidents/{test_inc_id}/verify", json=verify_payload)
    assert ver_res.status_code == 200
    ver_data = ver_res.json()
    assert ver_data["status"] == "CONFIRMED"
