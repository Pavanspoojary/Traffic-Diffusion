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

def test_analyze_sample_and_propagate():
    # Test analyze-sample endpoint
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
