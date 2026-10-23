// Traffic Diffusion - Traffic Police & Control Room Command Center Controller
document.addEventListener('DOMContentLoaded', () => {
  const trafficMap = new TrafficMap('map');

  // Top Telemetry Elements
  const valActiveHorizon = document.getElementById('valActiveHorizon');
  const valNetworkDelay = document.getElementById('valNetworkDelay');
  const valElevatedCorridors = document.getElementById('valElevatedCorridors');
  const valSaturatedJunctions = document.getElementById('valSaturatedJunctions');
  const valOptimalMitigation = document.getElementById('valOptimalMitigation');
  const btnResetAll = document.getElementById('btnResetAll');

  // Citizen Reports Elements
  const citizenReportsList = document.getElementById('citizenReportsList');
  const badgeCitizenCount = document.getElementById('badgeCitizenCount');

  // Tactical Dispatch Elements
  const dispatchForm = document.getElementById('dispatchForm');
  const dispatchLocationSelect = document.getElementById('dispatchLocationSelect');
  const dispatchResourceSelect = document.getElementById('dispatchResourceSelect');
  const dispatchDirectiveInput = document.getElementById('dispatchDirectiveInput');
  const dispatchOrdersList = document.getElementById('dispatchOrdersList');

  // Scenario & Demo Elements
  const btnDemoNanthoor = document.getElementById('btnDemoNanthoor');
  const btnDemoBunts = document.getElementById('btnDemoBunts');
  const btnDemoMgRoad = document.getElementById('btnDemoMgRoad');

  const incidentForm = document.getElementById('incidentForm');
  const incidentEdgeSelect = document.getElementById('incidentEdgeSelect');
  const incidentCategorySelect = document.getElementById('incidentCategorySelect');
  const incidentSeveritySelect = document.getElementById('incidentSeveritySelect');
  const capacityReductionInput = document.getElementById('capacityReductionInput');
  const durationInput = document.getElementById('durationInput');
  const btnRunForecast = document.getElementById('btnRunForecast');

  const txtIncidentId = document.getElementById('txtIncidentId');
  const txtIncidentStatus = document.getElementById('txtIncidentStatus');
  const txtIncidentDesc = document.getElementById('txtIncidentDesc');

  // Forecast Elements
  const horizonPills = document.querySelectorAll('.horizon-pill');
  const forecastHorizonTitle = document.getElementById('forecastHorizonTitle');
  const forecastNarrative = document.getElementById('forecastNarrative');
  const statQueueMeters = document.getElementById('statQueueMeters');
  const statExcessPcu = document.getElementById('statExcessPcu');

  // Risk Assessment Elements
  const riskRankList = document.getElementById('riskRankList');

  // Intervention Elements
  const recomPlanBanner = document.getElementById('recomPlanBanner');
  const recomRationaleTxt = document.getElementById('recomRationaleTxt');
  const intervScenarioList = document.getElementById('intervScenarioList');

  // State
  let networkNodes = [];
  let networkEdges = [];
  let activeIncident = null;
  let activeHorizon = 30; // default 30 minutes
  let forecastData = null;
  let riskData = null;
  let interventionData = null;
  let activeDispatches = [];

  // =========================================================================
  // 1. Initial Startup & Network Loading
  // =========================================================================
  async function initializePlatform() {
    try {
      const netRes = await fetch('/api/v1/navigation/network');
      if (netRes.ok) {
        const netData = await netRes.json();
        networkNodes = netData.nodes;
        networkEdges = netData.edges;
        trafficMap.renderNetwork(networkNodes, networkEdges);
        populateEdgeDropdown(networkEdges);
      }

      // Load Citizen Reports & Tactical Dispatches
      await loadCitizenReports();
      await loadResourceDispatches();

      // Trigger default demonstration scenario: Nanthoor Freight Rollover
      await triggerDemoScenario('nanthoor_freight_rollover');
    } catch (err) {
      console.error('Initialization error:', err);
    }
  }

  function populateEdgeDropdown(edges) {
    incidentEdgeSelect.innerHTML = '';
    edges.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = `${e.name} (${e.id}) [${e.lanes} lanes]`;
      incidentEdgeSelect.appendChild(opt);
    });
  }

  // =========================================================================
  // 2. Citizen Incident Reports (Public Ingestion & Operator Verification)
  // =========================================================================
  async function loadCitizenReports() {
    try {
      const res = await fetch('/api/v1/intelligence/citizen-reports');
      if (!res.ok) return;
      const reports = await res.json();

      badgeCitizenCount.textContent = `${reports.length} Inbound`;
      citizenReportsList.innerHTML = '';

      if (reports.length === 0) {
        citizenReportsList.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 11px; padding: 10px;">No pending citizen reports</div>';
        return;
      }

      reports.forEach(rep => {
        const isVerified = rep.verification_status === 'VERIFIED';
        const card = document.createElement('div');
        card.className = 'citizen-report-item';
        card.innerHTML = `
          <div class="citizen-report-header">
            <span class="citizen-report-id">${rep.report_id}</span>
            <span class="status-tag ${isVerified ? 'tag-free' : 'tag-heavy'}">${rep.verification_status}</span>
          </div>
          <div class="citizen-report-loc">${rep.road_name}</div>
          <div class="citizen-report-desc">${rep.description}</div>
          <div class="citizen-report-footer">
            <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">${rep.category} · ${rep.lanes_affected} lane(s)</span>
            ${!isVerified ? `
              <button class="btn btn-sm btn-primary btn-verify-report" data-id="${rep.report_id}" data-edge="${rep.road_segment_id}" style="font-size: 10px; padding: 3px 8px;">
                Verify & Forecast
              </button>
            ` : `
              <span style="font-size: 10px; color: var(--accent-green); font-weight: 700;">Verified Incident</span>
            `}
          </div>
        `;
        citizenReportsList.appendChild(card);
      });

      // Hook up verify buttons
      document.querySelectorAll('.btn-verify-report').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const repId = e.currentTarget.dataset.id;
          const edgeId = e.currentTarget.dataset.edge;
          await verifyCitizenReportAndForecast(repId, edgeId);
        });
      });
    } catch (err) {
      console.warn('Citizen reports fetch error:', err);
    }
  }

  async function verifyCitizenReportAndForecast(reportId, edgeId) {
    try {
      const res = await fetch(`/api/v1/intelligence/citizen-reports/${reportId}/verify?verified=true`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Verification failed');
      const updated = await res.json();

      incidentEdgeSelect.value = edgeId;
      capacityReductionInput.value = updated.lanes_affected > 1 ? 70 : 40;

      await loadCitizenReports();
      await triggerCustomForecast();
    } catch (err) {
      alert('Verification error: ' + err.message);
    }
  }

  // =========================================================================
  // 3. Tactical Resource & Police Deployment Console
  // =========================================================================
  async function loadResourceDispatches() {
    try {
      const res = await fetch('/api/v1/intelligence/dispatches');
      if (!res.ok) return;
      activeDispatches = await res.json();

      dispatchOrdersList.innerHTML = '';
      if (activeDispatches.length === 0) {
        dispatchOrdersList.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 11px; padding: 8px;">No active dispatches</div>';
        return;
      }

      activeDispatches.forEach(ord => {
        const item = document.createElement('div');
        item.className = 'dispatch-item';
        
        let statusClass = 'dispatched';
        if (ord.status === 'ON_SCENE') statusClass = 'on-scene';
        else if (ord.status === 'EN_ROUTE') statusClass = 'en-route';

        item.innerHTML = `
          <div class="dispatch-header">
            <span class="dispatch-type-badge">${ord.resource_type.replace(/_/g, ' ')} (${ord.units_assigned}u)</span>
            <span class="dispatch-status-badge ${statusClass}">${ord.status} ${ord.eta_minutes > 0 ? `· ETA ${ord.eta_minutes.toFixed(0)}m` : ''}</span>
          </div>
          <div class="dispatch-target">${ord.target_location_name}</div>
          <div class="dispatch-directive">${ord.directive}</div>
          ${ord.notes ? `<div style="font-size: 10px; color: var(--text-muted);">${ord.notes}</div>` : ''}
        `;
        dispatchOrdersList.appendChild(item);
      });

      // Render tactical assets onto the Leaflet map!
      trafficMap.renderDispatches(activeDispatches);
    } catch (err) {
      console.warn('Dispatch load error:', err);
    }
  }

  dispatchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const targetId = dispatchLocationSelect.value;
      const targetName = dispatchLocationSelect.options[dispatchLocationSelect.selectedIndex].text;
      const resourceType = dispatchResourceSelect.value;
      const directive = dispatchDirectiveInput.value.trim() || 'Manual Traffic Regulation & Queue Clearing';

      const payload = {
        incident_id: activeIncident ? activeIncident.incident_id : 'INC-CURRENT-TACTICAL',
        target_location_id: targetId,
        target_location_name: targetName,
        resource_type: resourceType,
        units_assigned: resourceType === 'TRAFFIC_POLICE_OFFICER' ? 2 : 1,
        directive: directive,
        priority: 'HIGH',
        eta_minutes: 5.0,
        notes: 'Dispatched via Traffic Police Command Center'
      };

      const res = await fetch('/api/v1/intelligence/dispatches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Failed to dispatch unit');
      await loadResourceDispatches();
    } catch (err) {
      alert('Dispatch error: ' + err.message);
    }
  });

  // =========================================================================
  // 4. Quick Demo Scenario Presets Loader
  // =========================================================================
  async function triggerDemoScenario(scenarioKey) {
    try {
      btnRunForecast.disabled = true;
      btnRunForecast.textContent = 'Projecting Spread...';

      const res = await fetch(`/api/v1/intelligence/demo-scenario?scenario_key=${scenarioKey}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to load demo scenario');
      const data = await res.json();

      activeIncident = data.incident;
      incidentEdgeSelect.value = activeIncident.affected_edge_id;
      incidentCategorySelect.value = activeIncident.category;
      incidentSeveritySelect.value = activeIncident.severity;
      capacityReductionInput.value = Math.round(activeIncident.capacity_reduction_pct * 100);
      durationInput.value = Math.round(activeIncident.estimated_duration_min);

      await fetchAndDisplayForecast(activeIncident.incident_id);
    } catch (err) {
      console.error('Demo scenario error:', err);
      alert('Could not load scenario: ' + err.message);
    } finally {
      btnRunForecast.disabled = false;
      btnRunForecast.textContent = 'Run Spatiotemporal Impact Forecast';
    }
  }

  btnDemoNanthoor.addEventListener('click', () => triggerDemoScenario('nanthoor_freight_rollover'));
  btnDemoBunts.addEventListener('click', () => triggerDemoScenario('bunts_hostel_waterlogging'));
  btnDemoMgRoad.addEventListener('click', () => triggerDemoScenario('mg_road_breakdown'));

  // =========================================================================
  // 5. Custom Incident Forecast Form Handler
  // =========================================================================
  incidentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await triggerCustomForecast();
  });

  async function triggerCustomForecast() {
    try {
      btnRunForecast.disabled = true;
      btnRunForecast.textContent = 'Projecting Network Spread...';

      const edgeId = incidentEdgeSelect.value;
      const category = incidentCategorySelect.value;
      const severity = incidentSeveritySelect.value;
      const capacityCut = parseFloat(capacityReductionInput.value) / 100.0;
      const duration = parseFloat(durationInput.value);

      const incPayload = {
        affected_edge_id: edgeId,
        category: category,
        severity: severity,
        blocked_lanes: capacityCut > 0.5 ? 2 : 1,
        capacity_reduction_pct: capacityCut,
        estimated_duration_min: duration,
        description: `Disruption on ${edgeId} (${category}): ${Math.round(capacityCut * 100)}% capacity reduction`,
        provenance: 'SIMULATED',
      };

      const incRes = await fetch('/api/v1/intelligence/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(incPayload),
      });

      if (!incRes.ok) throw new Error('Failed to register incident');
      activeIncident = await incRes.json();

      await fetchAndDisplayForecast(activeIncident.incident_id);
    } catch (err) {
      console.error('Forecast execution error:', err);
      alert('Forecast error: ' + err.message);
    } finally {
      btnRunForecast.disabled = false;
      btnRunForecast.textContent = 'Run Spatiotemporal Impact Forecast';
    }
  }

  // =========================================================================
  // 6. Multi-Horizon Impact Forecast Fetcher
  // =========================================================================
  async function fetchAndDisplayForecast(incidentId) {
    try {
      // 1. Multi-horizon forecast
      const fcRes = await fetch('/api/v1/intelligence/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident_id: incidentId, horizons: [15, 30, 60] }),
      });
      if (!fcRes.ok) throw new Error('Forecast calculation failed');
      forecastData = await fcRes.json();

      // 2. Risk assessment for active horizon
      await updateRiskAssessment(incidentId, activeHorizon);

      // 3. What-if intervention evaluation
      const intRes = await fetch('/api/v1/intelligence/interventions/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incident_id: incidentId,
          optimization_objective: 'MINIMIZE_NETWORK_DELAY_AND_PREVENT_JUNCTION_GRIDLOCK'
        }),
      });
      if (intRes.ok) {
        interventionData = await intRes.json();
        renderInterventionScenarios(interventionData);
      }

      // Render Active Snapshot
      renderHorizonView(activeHorizon);
    } catch (err) {
      console.error('Data pipeline error:', err);
    }
  }

  async function updateRiskAssessment(incidentId, horizon) {
    try {
      const riskRes = await fetch(`/api/v1/intelligence/risk-assessment?horizon_minutes=${horizon}&incident_id=${incidentId}`);
      if (!riskRes.ok) return;
      riskData = await riskRes.json();
      renderRiskRankings(riskData);
    } catch (err) {
      console.warn('Risk assessment error:', err);
    }
  }

  // =========================================================================
  // 7. Horizon Toggling & Visualization Update
  // =========================================================================
  horizonPills.forEach(pill => {
    pill.addEventListener('click', async (e) => {
      horizonPills.forEach(p => p.classList.remove('active'));
      e.currentTarget.classList.add('active');
      activeHorizon = parseInt(e.currentTarget.dataset.horizon, 10);

      renderHorizonView(activeHorizon);
      if (activeIncident) {
        await updateRiskAssessment(activeIncident.incident_id, activeHorizon);
      }
    });
  });

  function renderHorizonView(horizon) {
    if (!forecastData || !forecastData.forecasts) return;
    const snap = forecastData.forecasts[horizon];
    if (!snap) return;

    // Active Incident metadata card
    txtIncidentId.textContent = forecastData.incident.incident_id;
    txtIncidentStatus.textContent = forecastData.incident.severity;
    txtIncidentDesc.textContent = forecastData.incident.description;

    // Narrative & Titles
    forecastHorizonTitle.textContent = `Forecast Horizon: T+${horizon} Minutes (Model: ${snap.model_method})`;
    forecastNarrative.textContent = snap.propagation_summary;
    valActiveHorizon.textContent = `T+${horizon} min`;

    // Metrics
    valNetworkDelay.textContent = `+${snap.network_delay_relative_to_baseline_min.toFixed(1)} min`;
    valElevatedCorridors.textContent = snap.elevated_risk_corridors_count;
    valSaturatedJunctions.textContent = snap.saturated_junctions_count;

    const directImpact = snap.edge_impacts.find(e => e.impact_type === 'DIRECT_INCIDENT');
    if (directImpact) {
      statQueueMeters.textContent = `${Math.round(directImpact.estimated_queue_length_meters)} m`;
      statExcessPcu.textContent = `${Math.round(directImpact.accumulated_excess_volume_pcu)} PCU`;
    }

    // Leaflet map render
    trafficMap.renderPredictiveForecast(snap, networkNodes, networkEdges);
    
    // Re-render tactical field assets
    trafficMap.renderDispatches(activeDispatches);
  }

  // =========================================================================
  // 8. Risk Breakdown Ranking List
  // =========================================================================
  function renderRiskRankings(data) {
    if (!data.high_risk_roads) return;
    riskRankList.innerHTML = '';

    data.high_risk_roads.forEach(item => {
      const card = document.createElement('div');
      card.className = `risk-rank-item ${item.risk_level.toLowerCase()}`;
      card.innerHTML = `
        <div class="risk-rank-header">
          <div style="font-weight: 700; color: var(--text-primary); font-size: 11px;">
            #${item.rank} ${item.road_name}
          </div>
          <span class="risk-score-badge">${item.risk_score.toFixed(1)}</span>
        </div>
        <div class="risk-components-bar">
          <div class="risk-sub-bar" style="background-color: #ef4444; width: ${(item.components.severity_component / 25) * 100}%;" title="Disruption Severity: ${item.components.severity_component.toFixed(1)}">
            ${item.components.severity_component > 8 ? `Sev: ${item.components.severity_component.toFixed(0)}` : ''}
          </div>
          <div class="risk-sub-bar" style="background-color: #f97316; width: ${(item.components.capacity_load_component / 25) * 100}%;" title="V/C Ratio Load: ${item.components.capacity_load_component.toFixed(1)}">
            ${item.components.capacity_load_component > 8 ? `V/C: ${item.components.capacity_load_component.toFixed(0)}` : ''}
          </div>
          <div class="risk-sub-bar" style="background-color: #3b82f6; width: ${(item.components.downstream_dependency / 25) * 100}%;" title="Network Dependency: ${item.components.downstream_dependency.toFixed(1)}">
            ${item.components.downstream_dependency > 8 ? `Net: ${item.components.downstream_dependency.toFixed(0)}` : ''}
          </div>
          <div class="risk-sub-bar" style="background-color: #8b5cf6; width: ${(item.components.diversion_deficit / 25) * 100}%;" title="Diversion Deficit: ${item.components.diversion_deficit.toFixed(1)}">
            ${item.components.diversion_deficit > 8 ? `Div: ${item.components.diversion_deficit.toFixed(0)}` : ''}
          </div>
        </div>
        <div style="font-size: 10px; color: var(--text-muted);">${item.contributing_factors.join('; ')}</div>
        <div class="risk-recom-box">Directive: ${item.recommended_action}</div>
      `;
      riskRankList.appendChild(card);
    });
  }

  // =========================================================================
  // 9. What-If Intervention Scenarios Matrix
  // =========================================================================
  function renderInterventionScenarios(data) {
    if (!data.candidate_scenarios || data.candidate_scenarios.length === 0) return;

    recomRationaleTxt.textContent = data.recommendation_rationale;
    const optimal = data.candidate_scenarios[0];
    if (optimal) {
      valOptimalMitigation.textContent = `${optimal.scenario_name.split(':')[0]} (-${optimal.delay_reduction_pct.toFixed(0)}%)`;
    }

    intervScenarioList.innerHTML = '';

    // Render Baseline Card first
    const baseCard = document.createElement('div');
    baseCard.className = 'interv-card';
    baseCard.innerHTML = `
      <div class="interv-card-header">
        <span class="interv-card-title">${data.baseline_scenario.scenario_name}</span>
        <span class="status-tag tag-blocked">BASELINE</span>
      </div>
      <div class="interv-metrics-row">
        <span>Net Travel Time: <strong>${data.baseline_scenario.estimated_network_travel_time_min.toFixed(1)} min</strong></span>
        <span>Delay Relief: <strong>0.0 min (0%)</strong></span>
      </div>
      <div style="font-size: 10px; color: var(--text-muted);">${data.baseline_scenario.description}</div>
      <div class="interv-tradeoff-txt">Trade-off: ${data.baseline_scenario.key_tradeoffs}</div>
    `;
    intervScenarioList.appendChild(baseCard);

    // Render Candidate Scenarios
    data.candidate_scenarios.forEach(scen => {
      const isRecom = (scen.scenario_id === data.recommended_scenario_id);
      const card = document.createElement('div');
      card.className = `interv-card ${isRecom ? 'recommended' : ''}`;
      card.innerHTML = `
        <div class="interv-card-header">
          <span class="interv-card-title">${scen.scenario_name}</span>
          ${isRecom ? '<span class="badge-recom">RECOMMENDED ACTION</span>' : `<span class="status-tag tag-free">#${scen.rank}</span>`}
        </div>
        <div class="interv-metrics-row">
          <span>Net Travel Time: <strong>${scen.estimated_network_travel_time_min.toFixed(1)} min</strong></span>
          <span style="color: var(--accent-green);">Saved: <strong>-${scen.delay_reduction_relative_to_baseline_min.toFixed(1)} min (-${scen.delay_reduction_pct.toFixed(1)}%)</strong></span>
        </div>
        <div style="font-size: 10px; color: var(--text-muted);">${scen.description}</div>
        <div style="font-size: 10px; color: var(--accent-cyan); margin-top: 2px;">
          Resources: <strong>${scen.resource_summary}</strong> | Dispatch Delay: <strong>${scen.dispatch_delay_min} min</strong>
        </div>
        <div class="interv-tradeoff-txt">Trade-off: ${scen.key_tradeoffs}</div>
      `;
      intervScenarioList.appendChild(card);
    });
  }

  // =========================================================================
  // 10. Reset Grid
  // =========================================================================
  btnResetAll.addEventListener('click', async () => {
    try {
      await fetch('/api/v1/navigation/reset', { method: 'POST' });
      await initializePlatform();
    } catch (err) {
      alert('Reset error: ' + err.message);
    }
  });

  // Launch initial execution
  initializePlatform();
});
