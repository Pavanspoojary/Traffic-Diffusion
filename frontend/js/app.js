// Traffic Diffusion - Predictive Traffic Intelligence & Intervention Planning Controller
document.addEventListener('DOMContentLoaded', () => {
  const trafficMap = new TrafficMap('map');

  // Top Telemetry Elements
  const valActiveHorizon = document.getElementById('valActiveHorizon');
  const valNetworkDelay = document.getElementById('valNetworkDelay');
  const valElevatedCorridors = document.getElementById('valElevatedCorridors');
  const valSaturatedJunctions = document.getElementById('valSaturatedJunctions');
  const valOptimalMitigation = document.getElementById('valOptimalMitigation');
  const btnResetAll = document.getElementById('btnResetAll');

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

  // Historical Elements
  const histTotalRecords = document.getElementById('histTotalRecords');
  const histTopHotspotName = document.getElementById('histTopHotspotName');
  const hotspotMiniList = document.getElementById('hotspotMiniList');

  // State
  let networkNodes = [];
  let networkEdges = [];
  let activeIncident = null;
  let activeHorizon = 30; // default 30 minutes
  let forecastData = null;
  let riskData = null;
  let interventionData = null;

  // 1. Initial Startup & Network Loading
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

      await loadHistoricalAnalytics();

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

  // 2. Demo Scenario Presets Loader
  async function triggerDemoScenario(scenarioKey) {
    try {
      btnRunForecast.disabled = true;
      btnRunForecast.textContent = 'Loading Demo Scenario...';

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

      displayIncidentMetadata(activeIncident);

      // Re-run full forecast across 15, 30, 60 min
      await runFullForecast(activeIncident);
    } catch (err) {
      alert('Demo scenario error: ' + err.message);
    } finally {
      btnRunForecast.disabled = false;
      btnRunForecast.textContent = 'Run Spatiotemporal Impact Forecast';
    }
  }

  btnDemoNanthoor.addEventListener('click', () => triggerDemoScenario('nanthoor_freight_rollover'));
  btnDemoBunts.addEventListener('click', () => triggerDemoScenario('bunts_hostel_waterlogging'));
  btnDemoMgRoad.addEventListener('click', () => triggerDemoScenario('mg_road_breakdown'));

  // 3. Custom Incident Form Handler
  incidentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const edgeId = incidentEdgeSelect.value;
    const cat = incidentCategorySelect.value;
    const sev = incidentSeveritySelect.value;
    const reduc = parseFloat(capacityReductionInput.value) / 100.0;
    const dur = parseFloat(durationInput.value);

    btnRunForecast.disabled = true;
    btnRunForecast.textContent = 'Simulating Congestion Model...';

    try {
      const res = await fetch('/api/v1/intelligence/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          affected_edge_id: edgeId,
          category: cat,
          severity: sev,
          capacity_reduction_pct: reduc,
          estimated_duration_min: dur,
          description: `Custom ${cat.replace(/_/g, ' ')} disruption (${sev} severity) on ${edgeId}`,
          provenance: 'SIMULATED',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create incident');
      }

      activeIncident = await res.json();
      displayIncidentMetadata(activeIncident);
      await runFullForecast(activeIncident);
    } catch (err) {
      alert('Impact simulation error: ' + err.message);
    } finally {
      btnRunForecast.disabled = false;
      btnRunForecast.textContent = 'Run Spatiotemporal Impact Forecast';
    }
  });

  function displayIncidentMetadata(inc) {
    txtIncidentId.textContent = inc.incident_id;
    txtIncidentStatus.textContent = inc.verification_status;
    txtIncidentDesc.textContent = `${inc.description} | ${Math.round(inc.capacity_reduction_pct * 100)}% capacity reduction | Est. Duration: ${inc.estimated_duration_min} min`;
  }

  // 4. Run Multi-Horizon Forecast & What-If Interventions
  async function runFullForecast(incident) {
    try {
      // A. Forecast Request
      const fcRes = await fetch('/api/v1/intelligence/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incident_id: incident.incident_id,
          horizons: [15, 30, 60],
        }),
      });
      if (!fcRes.ok) throw new Error('Forecast calculation failure');
      forecastData = await fcRes.json();

      // B. What-If Intervention Evaluation
      const intRes = await fetch('/api/v1/intelligence/interventions/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incident_id: incident.incident_id,
          optimization_objective: 'MINIMIZE_NETWORK_DELAY_AND_PREVENT_JUNCTION_GRIDLOCK',
        }),
      });
      if (intRes.ok) {
        interventionData = await intRes.json();
        renderInterventionScenarios(interventionData);
      }

      // C. Render Active Horizon on Map & Telemetry
      renderHorizonSnapshot(activeHorizon);

      // D. Risk Assessment for Active Horizon
      await fetchAndRenderRiskAssessment(activeHorizon, incident.incident_id);
    } catch (err) {
      console.error('Forecast execution error:', err);
    }
  }

  // 5. Horizon Tabs Switcher Handler
  horizonPills.forEach(pill => {
    pill.addEventListener('click', async (e) => {
      horizonPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeHorizon = parseInt(pill.getAttribute('data-horizon'), 10);
      renderHorizonSnapshot(activeHorizon);
      if (activeIncident) {
        await fetchAndRenderRiskAssessment(activeHorizon, activeIncident.incident_id);
      }
    });
  });

  function renderHorizonSnapshot(horizon) {
    if (!forecastData || !forecastData.forecasts) return;
    const snapshot = forecastData.forecasts[horizon] || forecastData.forecasts[String(horizon)];
    if (!snapshot) return;

    // Update Top Telemetry Banner
    valActiveHorizon.textContent = `T+${horizon} min`;
    valNetworkDelay.textContent = `+${snapshot.network_delay_relative_to_baseline_min.toFixed(1)} min`;
    valElevatedCorridors.textContent = snapshot.elevated_risk_corridors_count;
    valSaturatedJunctions.textContent = snapshot.saturated_junctions_count;

    // Narrative & Stats
    forecastHorizonTitle.textContent = `Forecast Horizon: T+${horizon} Minutes (${snapshot.model_method})`;
    forecastNarrative.textContent = snapshot.propagation_summary;

    const targetImpact = snapshot.edge_impacts.find(e => e.impact_type === 'DIRECT_INCIDENT');
    if (targetImpact) {
      statQueueMeters.textContent = `${Math.round(targetImpact.queue_length_meters)} m`;
      const excess = Math.round((targetImpact.predicted_volume_capacity_ratio - 1.0) * 450 * (horizon / 60));
      statExcessPcu.textContent = `${Math.max(15, excess)} PCU`;
    } else {
      statQueueMeters.textContent = '0 m';
      statExcessPcu.textContent = '0 PCU';
    }

    // Render on Map
    trafficMap.renderPredictiveForecast(snapshot, networkNodes, activeIncident);
  }

  // 6. Risk Assessment Fetch & Render
  async function fetchAndRenderRiskAssessment(horizon, incidentId) {
    try {
      const res = await fetch(`/api/v1/intelligence/risk-assessment?horizon_minutes=${horizon}&incident_id=${incidentId}`);
      if (!res.ok) return;
      riskData = await res.json();
      renderRiskRankings(riskData);
    } catch (err) {
      console.warn('Risk assessment fetch error:', err);
    }
  }

  function renderRiskRankings(data) {
    if (!data.high_risk_roads || data.high_risk_roads.length === 0) {
      riskRankList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 12px;">No elevated risk corridors at this horizon.</div>`;
      return;
    }

    riskRankList.innerHTML = '';
    data.high_risk_roads.slice(0, 5).forEach(item => {
      const card = document.createElement('div');
      card.className = `risk-rank-card ${item.risk_level.toLowerCase()}`;
      card.innerHTML = `
        <div class="risk-header">
          <span class="risk-road-name">#${item.rank} ${item.road_name}</span>
          <span class="risk-score-badge ${item.risk_level === 'CRITICAL' ? 'tag-blocked' : (item.risk_level === 'HIGH' ? 'tag-heavy' : 'tag-moderate')}">
            ${item.risk_score.toFixed(1)} / 100
          </span>
        </div>
        <div class="risk-breakdown-bars">
          <div class="risk-component-col">
            <span class="risk-component-lbl">Severity</span>
            <span class="risk-component-val">${item.components.severity_component.toFixed(1)}</span>
          </div>
          <div class="risk-component-col">
            <span class="risk-component-lbl">V/C Load</span>
            <span class="risk-component-val">${item.components.capacity_load_component.toFixed(1)}</span>
          </div>
          <div class="risk-component-col">
            <span class="risk-component-lbl">Network Dep</span>
            <span class="risk-component-val">${item.components.downstream_dependency.toFixed(1)}</span>
          </div>
          <div class="risk-component-col">
            <span class="risk-component-lbl">Div Deficit</span>
            <span class="risk-component-val">${item.components.diversion_deficit.toFixed(1)}</span>
          </div>
        </div>
        <div style="font-size: 10px; color: var(--text-muted);">${item.contributing_factors.join('; ')}</div>
        <div class="risk-recom-box">Action: ${item.recommended_action}</div>
      `;
      riskRankList.appendChild(card);
    });
  }

  // 7. What-If Intervention Scenarios Matrix
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
          ${isRecom ? '<span class="badge-recom">RECOMMENDED</span>' : `<span class="status-tag tag-free">#${scen.rank}</span>`}
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

  // 8. Historical Intelligence & Recurring Hotspots
  async function loadHistoricalAnalytics() {
    try {
      const res = await fetch('/api/v1/intelligence/historical/analytics');
      if (!res.ok) return;
      const data = await res.json();

      histTotalRecords.textContent = data.total_records_analyzed;
      if (data.top_recurring_hotspots && data.top_recurring_hotspots.length > 0) {
        histTopHotspotName.textContent = data.top_recurring_hotspots[0].location_name.split('-')[0].trim();
      }

      hotspotMiniList.innerHTML = '';
      data.top_recurring_hotspots.slice(0, 3).forEach(spot => {
        const item = document.createElement('div');
        item.className = 'hotspot-mini-item';
        item.innerHTML = `
          <div style="display: flex; justify-content: space-between; font-weight: 700;">
            <span>${spot.location_name}</span>
            <span style="color: var(--accent-amber); font-family: var(--font-mono);">${spot.incident_count} events</span>
          </div>
          <div style="color: var(--text-muted); font-size: 10px; margin-top: 2px;">
            ${spot.recurring_pattern_summary}
          </div>
        `;
        hotspotMiniList.appendChild(item);
      });
    } catch (err) {
      console.warn('Historical analytics fetch error:', err);
    }
  }

  // 9. Reset Grid
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
