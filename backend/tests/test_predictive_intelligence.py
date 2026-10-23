import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.models.schemas import (
    IncidentCategory,
    IncidentSeverity,
    EventProvenance,
    InterventionType,
)
from backend.app.services.prediction_service import prediction_service
from backend.app.services.risk_service import risk_service
from backend.app.services.intervention_service import intervention_service
from backend.app.services.historical_service import historical_service

client = TestClient(app)

def test_incident_creation_and_retrieval():
    incident = prediction_service.create_incident(
        affected_edge_id="corridor_cctv_07",
        category=IncidentCategory.COLLISION,
        severity=IncidentSeverity.CRITICAL,
        blocked_lanes=2,
        capacity_reduction_pct=0.85,
        estimated_duration_min=60.0,
        description="Multi-axle freight rollover blocking Nanthoor junction",
        provenance=EventProvenance.SIMULATED,
    )
    assert incident.incident_id.startswith("INC-CORRIDOR_CCTV_07")
    assert incident.category == IncidentCategory.COLLISION
    assert incident.severity == IncidentSeverity.CRITICAL
    assert incident.capacity_reduction_pct == 0.85
    assert incident.estimated_duration_min == 60.0

    retrieved = prediction_service.get_incident(incident.incident_id)
    assert retrieved is not None
    assert retrieved.incident_id == incident.incident_id

def test_multi_horizon_impact_forecasting():
    incident = prediction_service.create_incident(
        affected_edge_id="corridor_cctv_07",
        category=IncidentCategory.ROAD_BLOCKAGE,
        severity=IncidentSeverity.HIGH,
        capacity_reduction_pct=0.75,
        estimated_duration_min=45.0,
    )

    forecast_res = prediction_service.simulate_network_forecast(
        incident=incident,
        horizons=[15, 30, 60]
    )

    assert 15 in forecast_res.forecasts
    assert 30 in forecast_res.forecasts
    assert 60 in forecast_res.forecasts

    snap15 = forecast_res.forecasts[15]
    snap30 = forecast_res.forecasts[30]
    snap60 = forecast_res.forecasts[60]

    # Congestion delay should compound from 15 to 30 mins
    assert snap30.network_delay_relative_to_baseline_min >= snap15.network_delay_relative_to_baseline_min
    assert snap15.total_network_travel_time_min > 0
    assert len(snap15.edge_impacts) > 10
    assert len(snap15.junction_saturations) > 0
    assert len(forecast_res.model_assumptions) >= 4

    # Verify direct incident edge is flagged
    target_impacts = [e for e in snap30.edge_impacts if e.edge_id == "corridor_cctv_07"]
    assert len(target_impacts) == 1
    assert target_impacts[0].impact_type == "DIRECT_INCIDENT"
    assert target_impacts[0].expected_delay_min > 0

    # Verify upstream feeder spillback exists
    feeders = [e for e in snap30.edge_impacts if e.impact_type == "UPSTREAM_SPILLBACK"]
    assert len(feeders) >= 1

def test_risk_assessment_ranking_and_decomposition():
    incident = prediction_service.create_incident(
        affected_edge_id="corridor_cctv_07",
        category=IncidentCategory.COLLISION,
        severity=IncidentSeverity.CRITICAL,
        capacity_reduction_pct=0.85,
    )

    forecast_res = prediction_service.simulate_network_forecast(incident=incident, horizons=[30])
    snapshot = forecast_res.forecasts[30]

    assessment = risk_service.assess_network_risk(snapshot, incident_severity=incident.severity)
    assert len(assessment.high_risk_roads) > 0
    assert len(assessment.critical_junctions) > 0

    top_road = assessment.high_risk_roads[0]
    assert top_road.rank == 1
    assert top_road.risk_score >= 60.0
    assert top_road.components.total_risk_score == top_road.risk_score
    assert top_road.components.severity_component > 0
    assert top_road.components.capacity_load_component > 0
    assert len(top_road.contributing_factors) > 0
    assert len(top_road.recommended_action) > 0

def test_what_if_intervention_evaluation():
    incident = prediction_service.create_incident(
        affected_edge_id="corridor_cctv_07",
        category=IncidentCategory.COLLISION,
        severity=IncidentSeverity.HIGH,
        capacity_reduction_pct=0.80,
        estimated_duration_min=50.0,
    )

    eval_res = intervention_service.evaluate_interventions(incident=incident, horizon_minutes=30)
    assert eval_res.incident_id == incident.incident_id
    assert eval_res.baseline_scenario.scenario_id == "scenario_baseline"
    assert len(eval_res.candidate_scenarios) >= 3

    # All candidate scenarios must show delay reduction relative to baseline
    baseline_delay = eval_res.baseline_scenario.estimated_network_travel_time_min
    for scen in eval_res.candidate_scenarios:
        assert scen.estimated_network_travel_time_min < baseline_delay
        assert scen.delay_reduction_relative_to_baseline_min > 0
        assert scen.delay_reduction_pct > 0

    # Best recommended scenario
    assert eval_res.recommended_scenario_id is not None
    assert len(eval_res.recommendation_rationale) > 10
    assert len(eval_res.tradeoff_summary) > 10

def test_historical_incident_analytics():
    analytics = historical_service.get_analytics()
    assert analytics.total_records_analyzed >= 10
    assert len(analytics.top_recurring_hotspots) >= 1
    top_spot = analytics.top_recurring_hotspots[0]
    assert top_spot.incident_count >= 2
    assert top_spot.recurring_risk_score > 0
    assert len(top_spot.recurring_pattern_summary) > 0

    # Distributions check
    assert len(analytics.category_distribution) >= 3
    assert len(analytics.hourly_distribution) == 24
    assert len(analytics.weekday_distribution) == 7
    assert len(analytics.mean_duration_by_category_min) >= 3

def test_historical_record_import():
    valid_batch = [
        {
            "record_id": "TEST-IMP-01",
            "category": "COLLISION",
            "edge_id": "corridor_cctv_01",
            "road_name": "K.S. Rao Road",
            "hour_of_day": 9,
            "day_of_week": "Monday",
            "severity": "HIGH",
            "duration_minutes": 40.0,
            "observed_delay_min": 15.0,
        }
    ]
    res = historical_service.import_records(valid_batch, is_simulated=True)
    assert res["status"] == "success"
    assert res["imported_count"] == 1

def test_intelligence_api_endpoints():
    # 1. Create incident API
    inc_payload = {
        "category": "ROAD_BLOCKAGE",
        "affected_edge_id": "corridor_cctv_05",
        "severity": "HIGH",
        "blocked_lanes": 1,
        "capacity_reduction_pct": 0.70,
        "estimated_duration_min": 40.0,
        "description": "API Test road obstruction at Bunts Hostel",
        "provenance": "SIMULATED"
    }
    create_res = client.post("/api/v1/intelligence/incidents", json=inc_payload)
    assert create_res.status_code == 201
    inc_data = create_res.json()
    test_inc_id = inc_data["incident_id"]
    assert inc_data["affected_edge_id"] == "corridor_cctv_05"

    # 2. Get incident details API
    get_res = client.get(f"/api/v1/intelligence/incidents/{test_inc_id}")
    assert get_res.status_code == 200
    assert get_res.json()["incident_id"] == test_inc_id

    # 3. Forecast API
    fc_payload = {
        "incident_id": test_inc_id,
        "horizons": [15, 30, 60]
    }
    fc_res = client.post("/api/v1/intelligence/forecast", json=fc_payload)
    assert fc_res.status_code == 200
    fc_data = fc_res.json()
    assert "15" in fc_data["forecasts"]
    assert "30" in fc_data["forecasts"]
    assert "60" in fc_data["forecasts"]

    # 4. Risk assessment API
    risk_res = client.get(f"/api/v1/intelligence/risk-assessment?horizon_minutes=30&incident_id={test_inc_id}")
    assert risk_res.status_code == 200
    risk_data = risk_res.json()
    assert len(risk_data["high_risk_roads"]) > 0
    assert len(risk_data["critical_junctions"]) > 0

    # 5. Intervention evaluation API
    interv_payload = {
        "incident_id": test_inc_id,
        "optimization_objective": "MINIMIZE_NETWORK_DELAY_AND_PREVENT_JUNCTION_GRIDLOCK"
    }
    int_res = client.post("/api/v1/intelligence/interventions/evaluate", json=interv_payload)
    assert int_res.status_code == 200
    int_data = int_res.json()
    assert int_data["recommended_scenario_id"] is not None
    assert len(int_data["candidate_scenarios"]) >= 3

    # 6. Historical analytics API
    hist_res = client.get("/api/v1/intelligence/historical/analytics")
    assert hist_res.status_code == 200
    hist_data = hist_res.json()
    assert hist_data["total_records_analyzed"] > 0
    assert len(hist_data["top_recurring_hotspots"]) > 0

    # 7. Demo scenario loader API
    demo_res = client.post("/api/v1/intelligence/demo-scenario?scenario_key=nanthoor_freight_rollover")
    assert demo_res.status_code == 200
    demo_data = demo_res.json()
    assert demo_data["status"] == "loaded"
    assert "forecast_30m" in demo_data
    assert "interventions" in demo_data
    assert "risk_assessment" in demo_data

def test_citizen_reports_and_operator_verification():
    # 1. Citizen submits report from public app
    payload = {
        "reporter_name": "Test Commuter",
        "road_segment_id": "corridor_cctv_07",
        "category": "COLLISION",
        "description": "Multi-car pileup blocking lanes near Nanthoor",
        "lanes_affected": 2,
    }
    create_res = client.post("/api/v1/intelligence/citizen-reports", json=payload)
    assert create_res.status_code == 201
    rep = create_res.json()
    assert rep["report_id"].startswith("CIT-MNG-")
    assert rep["verification_status"] == "VERIFICATION_PENDING"

    # 2. Control room operator lists reports
    list_res = client.get("/api/v1/intelligence/citizen-reports")
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1

    # 3. Control room operator verifies report -> auto-spawns active TrafficIncident
    verify_res = client.post(f"/api/v1/intelligence/citizen-reports/{rep['report_id']}/verify?verified=true")
    assert verify_res.status_code == 200
    v_data = verify_res.json()
    assert v_data["verification_status"] == "VERIFIED"
    assert v_data["verified_incident_id"] is not None

def test_resource_dispatch_lifecycle():
    # 1. Dispatch officers to an incident
    dispatch_payload = {
        "incident_id": "INC-TEST-001",
        "target_location_id": "INT_NANTHOOR",
        "target_location_name": "Nanthoor Junction",
        "resource_type": "TRAFFIC_POLICE_OFFICER",
        "units_assigned": 2,
        "directive": "Manual Green Wave Override",
        "priority": "HIGH",
        "eta_minutes": 5.0,
        "notes": "Deploy immediately to alleviate feeder queues",
    }
    create_res = client.post("/api/v1/intelligence/dispatches", json=dispatch_payload)
    assert create_res.status_code == 201
    dsp = create_res.json()
    assert dsp["order_id"].startswith("DSP-MNG-")
    assert dsp["status"] == "DISPATCHED"

    # 2. List active dispatches
    list_res = client.get("/api/v1/intelligence/dispatches")
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1

    # 3. Update dispatch status to ON_SCENE
    patch_res = client.patch(
        f"/api/v1/intelligence/dispatches/{dsp['order_id']}",
        json={"status": "ON_SCENE", "notes": "Units arrived on scene and managing traffic"}
    )
    assert patch_res.status_code == 200
    updated = patch_res.json()
    assert updated["status"] == "ON_SCENE"
    assert updated["eta_minutes"] == 0.0

def test_traffic_planner_infrastructure_endpoints():
    # 1. Infrastructure recommendations
    rec_res = client.get("/api/v1/intelligence/planner/infrastructure-recommendations")
    assert rec_res.status_code == 200
    recs = rec_res.json()
    assert len(recs) >= 3
    assert any("GRADE_SEPARATION" in r["category"] for r in recs)

    # 2. Macro traffic pattern comparison
    pat_res = client.get("/api/v1/intelligence/planner/traffic-patterns")
    assert pat_res.status_code == 200
    patterns = pat_res.json()
    assert len(patterns["periods"]) >= 3
    assert "Morning Peak" in [p["period_name"] for p in patterns["periods"]]

    # 3. What-if infrastructure simulation
    sim_res = client.post(
        "/api/v1/intelligence/planner/simulate-infrastructure",
        json={
            "target_edge_id": "corridor_cctv_07",
            "intervention_type": "GRADE_SEPARATION",
            "capacity_increase_pct": 0.80
        }
    )
    assert sim_res.status_code == 200
    sim_data = sim_res.json()
    assert sim_data["delay_saved_min"] > 0
    assert sim_data["delay_reduction_pct"] > 50.0

