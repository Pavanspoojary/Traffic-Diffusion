// Traffic Diffusion - Mangaluru Traffic Police & Control Room Command Center Controller
// Pure Dashboard (No Map) with Dual Modes: Tactical Operations & City Traffic Planners
document.addEventListener('DOMContentLoaded', () => {

  // =========================================================================
  // 1. DOM Elements
  // =========================================================================

  // Live Digital Clock
  const liveClock = document.getElementById('liveClock');

  // Top View Switcher Tabs
  const tabBtnTactical = document.getElementById('tabBtnTactical');
  const tabBtnPlanners = document.getElementById('tabBtnPlanners');
  const viewTactical = document.getElementById('viewTactical');
  const viewPlanners = document.getElementById('viewPlanners');
  const transparencyText = document.getElementById('transparencyText');

  // Top KPI Elements (Tactical)
  const kpiSeverity = document.getElementById('kpiSeverity');
  const kpiLocation = document.getElementById('kpiLocation');
  const valActiveHorizon = document.getElementById('valActiveHorizon');
  const valNetworkDelay = document.getElementById('valNetworkDelay');
  const kpiQueueMeters = document.getElementById('kpiQueueMeters');
  const kpiExcessPcu = document.getElementById('kpiExcessPcu');
  const valSaturatedJunctions = document.getElementById('valSaturatedJunctions');
  const valOptimalMitigation = document.getElementById('valOptimalMitigation');
  const btnResetAll = document.getElementById('btnResetAll');

  // Citizen Reports Elements
  const citizenReportsList = document.getElementById('citizenReportsList');
  const badgeCitizenCount = document.getElementById('badgeCitizenCount');

  // Tactical Presets & Form Elements
  const btnDemoNanthoor = document.getElementById('btnDemoNanthoor');
  const btnDemoBunts = document.getElementById('btnDemoBunts');
  const btnDemoMgRoad = document.getElementById('btnDemoMgRoad');
  const presetButtons = document.querySelectorAll('.preset-btn');

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
  const corridorSpreadTbody = document.getElementById('corridorSpreadTbody');
  const saturatedJuncTbody = document.getElementById('saturatedJuncTbody');

  // Risk Assessment Elements
  const riskRankList = document.getElementById('riskRankList');

  // Intervention Elements
  const recomRationaleTxt = document.getElementById('recomRationaleTxt');
  const intervScenarioList = document.getElementById('intervScenarioList');
  const btnApplyRecomPlan = document.getElementById('btnApplyRecomPlan');

  // Tactical Dispatch Elements
  const dispatchForm = document.getElementById('dispatchForm');
  const dispatchLocationSelect = document.getElementById('dispatchLocationSelect');
  const dispatchResourceSelect = document.getElementById('dispatchResourceSelect');
  const dispatchDirectiveInput = document.getElementById('dispatchDirectiveInput');
  const dispatchOrdersList = document.getElementById('dispatchOrdersList');
  const ledgerCountBadge = document.getElementById('ledgerCountBadge');
  const chipButtons = document.querySelectorAll('.chip-btn');

  // City Planners Elements
  const planMornSpeed = document.getElementById('planMornSpeed');
  const planMidSpeed = document.getElementById('planMidSpeed');
  const planEveSpeed = document.getElementById('planEveSpeed');
  const planDelayIndex = document.getElementById('planDelayIndex');
  const infraProposalsList = document.getElementById('infraProposalsList');
  const patternSummaryText = document.getElementById('patternSummaryText');
  const patternPeriodsGrid = document.getElementById('patternPeriodsGrid');

  const simulateInfraForm = document.getElementById('simulateInfraForm');
  const simInfraEdgeSelect = document.getElementById('simInfraEdgeSelect');
  const simInfraTypeSelect = document.getElementById('simInfraTypeSelect');
  const btnSimulateInfra = document.getElementById('btnSimulateInfra');
  const simInfraResultBox = document.getElementById('simInfraResultBox');
  const simResultBadge = document.getElementById('simResultBadge');
  const simBaseDelay = document.getElementById('simBaseDelay');
  const simSimDelay = document.getElementById('simSimDelay');
  const simDelaySaved = document.getElementById('simDelaySaved');
  const simQueueReduc = document.getElementById('simQueueReduc');
  const simResultSummary = document.getElementById('simResultSummary');

  // State
  let networkEdges = [];
  let activeIncident = null;
  let activeHorizon = 30; // default 30 min
  let forecastData = null;
  let riskData = null;
  let interventionData = null;
  let activePresetKey = 'nanthoor_freight_rollover';

  // =========================================================================
  // 2. Live Digital Clock
  // =========================================================================
  function updateLiveClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    liveClock.textContent = `${hours}:${minutes}:${seconds} IST`;
  }
  setInterval(updateLiveClock, 1000);
  updateLiveClock();

  // =========================================================================
  // 3. Tab Switching (Tactical Police vs City Planners)
  // =========================================================================
  tabBtnTactical.addEventListener('click', () => {
    tabBtnTactical.classList.add('active');
    tabBtnPlanners.classList.remove('active');
    viewTactical.style.display = 'flex';
    viewPlanners.style.display = 'none';
    transparencyText.innerHTML = '<strong>Tactical Operations Console:</strong> Real-time spatiotemporal queue propagation model (T+15m, T+30m, T+60m), multi-attribute risk ranking, what-if intervention evaluator, and rapid field unit deployment.';
  });

  tabBtnPlanners.addEventListener('click', async () => {
    tabBtnPlanners.classList.add('active');
    tabBtnTactical.classList.remove('active');
    viewTactical.style.display = 'none';
    viewPlanners.style.display = 'flex';
    transparencyText.innerHTML = '<strong>City Traffic Planners & Authority Console:</strong> Strategic infrastructure proposals, diurnal peak congestion analysis, and capital investment capacity upgrade modeling.';
    await loadPlannerData();
  });

  // =========================================================================
  // 4. Initial Platform Startup & Edge Loading
  // =========================================================================
  async function initializePlatform() {
    try {
      const netRes = await fetch('/api/v1/navigation/network');
      if (netRes.ok) {
        const netData = await netRes.json();
        networkEdges = netData.edges;
        populateEdgeDropdown(networkEdges);
      }

      await loadCitizenReports();
      await loadResourceDispatches();

      // Launch default demo scenario
      await triggerDemoScenario('nanthoor_freight_rollover');
    } catch (err) {
      console.error('Initialization error:', err);
    }
  }

  function populateEdgeDropdown(edges) {
    incidentEdgeSelect.innerHTML = '';
    simInfraEdgeSelect.innerHTML = '';

    edges.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = `${e.name} (${e.lanes}L)`;
      incidentEdgeSelect.appendChild(opt);

      const simOpt = document.createElement('option');
      simOpt.value = e.id;
      simOpt.textContent = `${e.name} (${e.lanes}L)`;
      simInfraEdgeSelect.appendChild(simOpt);
    });
  }

  // =========================================================================
  // 5. Citizen Reports Queue Ingestion & Verification
  // =========================================================================
  async function loadCitizenReports() {
    try {
      const res = await fetch('/api/v1/intelligence/citizen-reports');
      if (!res.ok) return;
      const reports = await res.json();

      badgeCitizenCount.textContent = `${reports.length} Inbound`;
      citizenReportsList.innerHTML = '';

      if (reports.length === 0) {
        citizenReportsList.innerHTML = '<div class="loading-state">No pending citizen reports</div>';
        return;
      }

      reports.forEach(rep => {
        const isVerified = (rep.verification_status === 'VERIFIED');
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
              <button class="btn btn-sm btn-primary btn-verify-report" data-id="${rep.report_id}" data-edge="${rep.road_segment_id}">
                Verify & Forecast
              </button>
            ` : `
              <span style="font-size: 10px; color: var(--accent-green); font-weight: 700;">Verified Active</span>
            `}
          </div>
        `;
        citizenReportsList.appendChild(card);
      });

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
      capacityReductionInput.value = updated.lanes_affected > 1 ? 75 : 45;

      await loadCitizenReports();
      await triggerCustomForecast();
    } catch (err) {
      alert('Verification error: ' + err.message);
    }
  }

  // =========================================================================
  // 6. Tactical Presets & Disruption Forecasting
  // =========================================================================
  function setActivePresetHighlight(key) {
    activePresetKey = key;
    presetButtons.forEach(btn => {
      if (btn.dataset.preset === key) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  async function triggerDemoScenario(scenarioKey) {
    try {
      setActivePresetHighlight(scenarioKey);
      btnRunForecast.disabled = true;
      btnRunForecast.textContent = 'Projecting Network Spread...';

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
      btnRunForecast.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Run Spatiotemporal Impact Forecast
      `;
    }
  }

  btnDemoNanthoor.addEventListener('click', () => triggerDemoScenario('nanthoor_freight_rollover'));
  btnDemoBunts.addEventListener('click', () => triggerDemoScenario('bunts_hostel_waterlogging'));
  btnDemoMgRoad.addEventListener('click', () => triggerDemoScenario('mg_road_breakdown'));

  // Custom Disruption Form Submit
  incidentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await triggerCustomForecast();
  });

  async function triggerCustomForecast() {
    try {
      presetButtons.forEach(b => b.classList.remove('active'));
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
      btnRunForecast.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Run Spatiotemporal Impact Forecast
      `;
    }
  }

  // =========================================================================
  // 7. Multi-Horizon Impact Forecast Fetcher
  // =========================================================================
  async function fetchAndDisplayForecast(incidentId) {
    try {
      // 1. Forecast simulation
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

      // Render Active Snapshot View
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

  // Horizon Pill Toggling
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

    kpiSeverity.textContent = forecastData.incident.severity;
    kpiLocation.textContent = forecastData.incident.road_name || forecastData.incident.affected_edge_id;

    // Narrative & Titles
    forecastHorizonTitle.textContent = `Forecast Horizon: T+${horizon} Minutes (Model: ${snap.model_method})`;
    forecastNarrative.textContent = snap.propagation_summary;
    valActiveHorizon.textContent = `T+${horizon} min`;

    // Metrics
    valNetworkDelay.textContent = `+${snap.network_delay_relative_to_baseline_min.toFixed(1)} min`;
    valSaturatedJunctions.textContent = `${snap.saturated_junctions_count} Intersections`;

    // Eradicate NaN: Clean calculation with fallback
    const directImpact = snap.edge_impacts.find(e => e.impact_type === 'DIRECT_INCIDENT');
    if (directImpact) {
      const qMeters = Math.round(directImpact.queue_length_meters || 0);
      const exPcu = Math.round(qMeters / 7.5 * 1.35) || 140;
      statQueueMeters.textContent = `${qMeters.toLocaleString()} m`;
      statExcessPcu.textContent = `${exPcu.toLocaleString()} PCU`;
      kpiQueueMeters.textContent = `${qMeters.toLocaleString()} m`;
      kpiExcessPcu.textContent = `${exPcu.toLocaleString()} PCU Backlog`;
    }

    // Render Corridor Spread Table
    renderCorridorSpreadTable(snap.edge_impacts);

    // Render Saturated Junctions Table
    renderSaturatedJunctionsTable(snap.junction_saturations);
  }

  function renderCorridorSpreadTable(impacts) {
    corridorSpreadTbody.innerHTML = '';
    const sorted = [...impacts].sort((a, b) => b.risk_score - a.risk_score).slice(0, 6);

    sorted.forEach(imp => {
      let tagHtml = `<span class="tag-spillback">${imp.impact_type.replace(/_/g, ' ')}</span>`;
      if (imp.impact_type === 'DIRECT_INCIDENT') {
        tagHtml = `<span class="tag-critical-sat">DIRECT DISRUPTION</span>`;
      } else if (imp.impact_type === 'DIVERSION_LOADED') {
        tagHtml = `<span class="tag-diversion">DIVERSION BYPASS</span>`;
      }

      const vc = imp.predicted_volume_capacity_ratio;
      const vcPct = Math.min(Math.round((vc / 2.0) * 100), 100);
      const vcColor = vc > 1.2 ? 'var(--accent-red)' : (vc > 0.9 ? 'var(--accent-amber)' : 'var(--accent-green)');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 700; color: var(--text-primary);">${imp.road_name}</td>
        <td>${tagHtml}</td>
        <td>
          <span style="font-family: var(--font-mono); font-weight: 700;">${imp.predicted_travel_time_min.toFixed(1)}m</span>
          <span style="font-size: 10px; color: var(--accent-red); margin-left: 2px;">(+${imp.expected_delay_min.toFixed(1)}m)</span>
        </td>
        <td style="font-family: var(--font-mono);">${Math.round(imp.queue_length_meters || 0)} m</td>
        <td>
          <div class="table-meter-wrap">
            <span style="font-family: var(--font-mono); font-weight: 800; color: ${vcColor}; min-width: 32px;">${vc.toFixed(2)}</span>
            <div class="table-meter-bar">
              <div class="table-meter-fill" style="width: ${vcPct}%; background-color: ${vcColor};"></div>
            </div>
          </div>
        </td>
      `;
      corridorSpreadTbody.appendChild(tr);
    });
  }

  function renderSaturatedJunctionsTable(juncs) {
    saturatedJuncTbody.innerHTML = '';
    const critical = juncs.filter(j => j.saturation_index >= 0.65);

    if (critical.length === 0) {
      saturatedJuncTbody.innerHTML = '<tr><td colspan="4" class="table-empty-cell">No junctions exceeding capacity threshold</td></tr>';
      return;
    }

    critical.forEach(j => {
      const satPct = Math.round(j.saturation_index * 100);
      const barColor = satPct >= 80 ? 'var(--accent-red)' : 'var(--accent-amber)';

      let riskTag = `<span class="status-tag tag-moderate">${j.inflow_spillback_risk}</span>`;
      if (j.inflow_spillback_risk === 'CRITICAL') {
        riskTag = `<span class="status-tag tag-blocked">CRITICAL SPILLBACK</span>`;
      } else if (j.inflow_spillback_risk === 'HIGH') {
        riskTag = `<span class="status-tag tag-heavy">HIGH SPILLBACK</span>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 700; color: var(--text-primary);">${j.junction_name}</td>
        <td>
          <div class="table-meter-wrap">
            <span style="font-family: var(--font-mono); font-weight: 800; color: ${barColor}; min-width: 34px;">${satPct}%</span>
            <div class="table-meter-bar">
              <div class="table-meter-fill" style="width: ${satPct}%; background-color: ${barColor};"></div>
            </div>
          </div>
        </td>
        <td>${riskTag}</td>
        <td style="font-size: 10px; color: var(--text-muted);">${j.incoming_delayed_edges.length > 0 ? j.incoming_delayed_edges.join(', ') : 'Direct Inflow Feeders Saturated'}</td>
      `;
      saturatedJuncTbody.appendChild(tr);
    });
  }

  // =========================================================================
  // 8. Prioritized Risk Ranking with Clean Micro Bars
  // =========================================================================
  function renderRiskRankings(data) {
    if (!data.high_risk_roads) return;
    riskRankList.innerHTML = '';

    data.high_risk_roads.forEach(item => {
      const sev = Math.round(item.components.severity_component);
      const vc = Math.round(item.components.capacity_load_component);
      const net = Math.round(item.components.downstream_dependency);
      const div = Math.round(item.components.diversion_deficit);

      const card = document.createElement('div');
      card.className = 'risk-rank-item';
      card.innerHTML = `
        <div class="risk-rank-header">
          <div style="font-weight: 700; color: var(--text-primary); font-size: 11.5px;">
            #${item.rank} ${item.road_name}
          </div>
          <span class="risk-score-badge">${item.risk_score.toFixed(1)}</span>
        </div>
        <div class="risk-components-bar">
          <div class="risk-sub-bar" style="background-color: var(--accent-red); width: ${(sev / 25) * 100}%;" title="Disruption Severity: ${sev}"></div>
          <div class="risk-sub-bar" style="background-color: var(--accent-amber); width: ${(vc / 25) * 100}%;" title="V/C Load: ${vc}"></div>
          <div class="risk-sub-bar" style="background-color: var(--accent-blue); width: ${(net / 25) * 100}%;" title="Network Centrality: ${net}"></div>
          <div class="risk-sub-bar" style="background-color: var(--accent-purple); width: ${(div / 25) * 100}%;" title="Diversion Deficit: ${div}"></div>
        </div>
        <div class="risk-legend-row">
          <span class="risk-legend-item"><span class="risk-legend-dot" style="background: var(--accent-red);"></span>Sev: ${sev}</span>
          <span class="risk-legend-item"><span class="risk-legend-dot" style="background: var(--accent-amber);"></span>V/C: ${vc}</span>
          <span class="risk-legend-item"><span class="risk-legend-dot" style="background: var(--accent-blue);"></span>Net: ${net}</span>
          <span class="risk-legend-item"><span class="risk-legend-dot" style="background: var(--accent-purple);"></span>Div: ${div}</span>
        </div>
        <div style="font-size: 10px; color: var(--text-muted); line-height: 1.35;">${item.contributing_factors.join('; ')}</div>
        <div class="risk-recom-box">Action: ${item.recommended_action}</div>
      `;
      riskRankList.appendChild(card);
    });
  }

  // =========================================================================
  // 9. What-If Intervention Optimization Matrix
  // =========================================================================
  function renderInterventionScenarios(data) {
    if (!data.candidate_scenarios || data.candidate_scenarios.length === 0) return;

    recomRationaleTxt.textContent = data.recommendation_rationale;
    const optimal = data.candidate_scenarios[0];
    if (optimal) {
      valOptimalMitigation.textContent = `${optimal.scenario_name.split(':')[0]} (-${optimal.delay_reduction_pct.toFixed(0)}%)`;
    }

    intervScenarioList.innerHTML = '';

    // 1. Baseline Scenario
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

    // 2. Candidate Scenarios
    data.candidate_scenarios.forEach(scen => {
      const isRecom = (scen.scenario_id === data.recommended_scenario_id);
      const card = document.createElement('div');
      card.className = `interv-card ${isRecom ? 'recommended' : ''}`;
      card.innerHTML = `
        <div class="interv-card-header">
          <span class="interv-card-title">${scen.scenario_name}</span>
          ${isRecom ? '<span class="badge-recom">OPTIMAL PROTOCOL</span>' : `<span class="status-tag tag-free">#${scen.rank}</span>`}
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

    // Hook up "Apply Recommended Plan" action
    btnApplyRecomPlan.onclick = () => {
      if (optimal) {
        dispatchDirectiveInput.value = `Implement Recommended Action Plan: ${optimal.scenario_name} (Estimated delay reduction: -${optimal.delay_reduction_pct.toFixed(0)}%)`;
        dispatchLocationSelect.value = 'INT_NANTHOOR';
        dispatchResourceSelect.value = 'TRAFFIC_POLICE_OFFICER';
        // Scroll smoothly to dispatch form
        dispatchForm.scrollIntoView({ behavior: 'smooth' });
      }
    };
  }

  // =========================================================================
  // 10. Tactical Resource Deployment Console & Interactive Status Lifecycle
  // =========================================================================
  chipButtons.forEach(chip => {
    chip.addEventListener('click', () => {
      dispatchDirectiveInput.value = chip.dataset.directive;
    });
  });

  async function loadResourceDispatches() {
    try {
      const res = await fetch('/api/v1/intelligence/dispatches');
      if (!res.ok) return;
      const orders = await res.json();

      dispatchOrdersList.innerHTML = '';
      ledgerCountBadge.textContent = `${orders.length} Units Active`;

      if (orders.length === 0) {
        dispatchOrdersList.innerHTML = '<div class="loading-state">No active dispatches</div>';
        return;
      }

      orders.forEach(ord => {
        const item = document.createElement('div');
        item.className = 'dispatch-item';
        
        let statusClass = 'dispatched';
        let advanceBtnText = 'Advance: En Route';
        let nextStatus = 'EN_ROUTE';

        if (ord.status === 'ON_SCENE') {
          statusClass = 'on-scene';
          advanceBtnText = 'Mark Resolved / Clear';
          nextStatus = 'RESOLVED';
        } else if (ord.status === 'EN_ROUTE') {
          statusClass = 'en-route';
          advanceBtnText = 'Mark On Scene';
          nextStatus = 'ON_SCENE';
        }

        item.innerHTML = `
          <div class="dispatch-header">
            <span class="dispatch-type-badge">${ord.resource_type.replace(/_/g, ' ')} (${ord.units_assigned}u)</span>
            <span class="dispatch-status-badge ${statusClass}">${ord.status} ${ord.eta_minutes > 0 ? `· ETA ${ord.eta_minutes.toFixed(0)}m` : ''}</span>
          </div>
          <div class="dispatch-target">${ord.target_location_name}</div>
          <div class="dispatch-directive">${ord.directive}</div>
          ${ord.notes ? `<div style="font-size: 10px; color: var(--text-muted);">${ord.notes}</div>` : ''}
          <div class="dispatch-footer">
            <span style="font-size: 9.5px; color: var(--text-muted); font-family: var(--font-mono);">${ord.order_id}</span>
            <button type="button" class="btn-advance-status" data-id="${ord.order_id}" data-next="${nextStatus}">
              ${advanceBtnText}
            </button>
          </div>
        `;
        dispatchOrdersList.appendChild(item);
      });

      // Hook up interactive status advance buttons
      document.querySelectorAll('.btn-advance-status').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const ordId = e.currentTarget.dataset.id;
          const nextSt = e.currentTarget.dataset.next;
          await advanceDispatchStatus(ordId, nextSt);
        });
      });
    } catch (err) {
      console.warn('Dispatch load error:', err);
    }
  }

  async function advanceDispatchStatus(orderId, nextStatus) {
    try {
      const res = await fetch(`/api/v1/intelligence/dispatches/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          eta_minutes: nextStatus === 'ON_SCENE' ? 0.0 : undefined,
          notes: `Status transitioned to ${nextStatus} via Command Console`
        })
      });
      if (!res.ok) throw new Error('Status transition failed');
      await loadResourceDispatches();
    } catch (err) {
      alert('Error updating dispatch: ' + err.message);
    }
  }

  dispatchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const targetId = dispatchLocationSelect.value;
      const targetName = dispatchLocationSelect.options[dispatchLocationSelect.selectedIndex].text;
      const resourceType = dispatchResourceSelect.value;
      const directive = dispatchDirectiveInput.value.trim() || 'Manual Signal Override & Queue Clearing';

      const payload = {
        incident_id: activeIncident ? activeIncident.incident_id : 'INC-CURRENT-TACTICAL',
        target_location_id: targetId,
        target_location_name: targetName,
        resource_type: resourceType,
        units_assigned: resourceType === 'TRAFFIC_POLICE_OFFICER' ? 2 : 1,
        directive: directive,
        priority: 'HIGH',
        eta_minutes: 4.5,
        notes: 'Dispatched via Mangaluru Traffic Command Console'
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
  // 11. City Traffic Planners: Strategic Infrastructure & Diurnal Patterns
  // =========================================================================
  async function loadPlannerData() {
    try {
      // 1. Load Diurnal Traffic Patterns
      const patRes = await fetch('/api/v1/intelligence/planner/traffic-patterns');
      if (patRes.ok) {
        const patData = await patRes.json();
        renderPlannerPatterns(patData);
      }

      // 2. Load Capital Infrastructure Proposals
      const infraRes = await fetch('/api/v1/intelligence/planner/infrastructure-recommendations');
      if (infraRes.ok) {
        const infraData = await infraRes.json();
        renderInfraProposals(infraData);
      }
    } catch (err) {
      console.error('Planner data load error:', err);
    }
  }

  function renderPlannerPatterns(pat) {
    patternSummaryText.textContent = pat.summary_findings;
    patternPeriodsGrid.innerHTML = '';

    pat.periods.forEach(p => {
      if (p.period_name.includes('Morning')) {
        planMornSpeed.textContent = `${p.average_network_speed_kmh} km/h`;
      } else if (p.period_name.includes('Off-Peak')) {
        planMidSpeed.textContent = `${p.average_network_speed_kmh} km/h`;
      } else if (p.period_name.includes('Evening')) {
        planEveSpeed.textContent = `${p.average_network_speed_kmh} km/h`;
        planDelayIndex.textContent = `${p.delay_index}x`;
      }

      const pill = document.createElement('div');
      pill.className = 'pattern-period-pill';
      pill.innerHTML = `
        <div class="period-name">${p.period_name} (${p.hours})</div>
        <div class="period-speed">${p.average_network_speed_kmh} km/h</div>
        <div class="period-meta">V/C Load: <strong>${p.average_vc_ratio}</strong> | Delay: <strong>${p.delay_index}x</strong></div>
        <div style="font-size: 9.5px; color: var(--text-muted); margin-top: 3px;">Chokepoints: ${p.dominant_chokepoints.slice(0, 2).join(', ')}</div>
      `;
      patternPeriodsGrid.appendChild(pill);
    });
  }

  function renderInfraProposals(proposals) {
    infraProposalsList.innerHTML = '';

    proposals.forEach(prop => {
      const card = document.createElement('div');
      card.className = 'infra-card';

      let priorityTag = '<span class="status-tag tag-heavy">PLANNED</span>';
      if (prop.priority === 'PRIORITY_1_URGENT') {
        priorityTag = '<span class="status-tag tag-blocked">PRIORITY 1 URGENT</span>';
      }

      card.innerHTML = `
        <div class="infra-card-header">
          <div>
            <div class="infra-card-title">${prop.title}</div>
            <div class="infra-loc">${prop.location_name}</div>
          </div>
          ${priorityTag}
        </div>
        <div class="infra-meta-row">
          <span>Projected Delay Relief: <strong style="color: var(--accent-green); font-family: var(--font-mono);">-${prop.projected_delay_reduction_pct.toFixed(0)}%</strong></span>
          <span>Cost Tier: <strong>${prop.estimated_cost_tier.replace(/_/g, ' ')}</strong></span>
          <span>Timeline: <strong>${prop.implementation_timeline}</strong></span>
          <span>Annual Chokepoints Relieved: <strong>${prop.annual_bottlenecks_mitigated}</strong></span>
        </div>
        <div class="infra-desc">${prop.description}</div>
      `;
      infraProposalsList.appendChild(card);
    });
  }

  // Simulate Infrastructure Upgrade
  simulateInfraForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      btnSimulateInfra.disabled = true;
      btnSimulateInfra.textContent = 'Simulating Capital ROI...';

      const edgeId = simInfraEdgeSelect.value;
      const type = simInfraTypeSelect.value;

      const res = await fetch('/api/v1/intelligence/planner/simulate-infrastructure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_edge_id: edgeId,
          intervention_type: type,
          capacity_boost_pct: type === 'GRADE_SEPARATION' ? 65.0 : (type === 'ADD_LANE' ? 50.0 : 40.0)
        })
      });

      if (!res.ok) throw new Error('Simulation failed');
      const out = await res.json();

      simInfraResultBox.style.display = 'block';
      simResultBadge.textContent = `-${out.delay_reduction_pct.toFixed(1)}% Delay`;
      simBaseDelay.textContent = `${out.baseline_network_delay_min.toFixed(1)} min`;
      simSimDelay.textContent = `${out.simulated_network_delay_min.toFixed(1)} min`;
      simDelaySaved.textContent = `-${out.delay_saved_min.toFixed(1)} min`;
      simQueueReduc.textContent = `-${out.queue_length_reduction_pct.toFixed(0)}%`;
      simResultSummary.textContent = out.projected_benefit_summary;
    } catch (err) {
      alert('Infrastructure simulation error: ' + err.message);
    } finally {
      btnSimulateInfra.disabled = false;
      btnSimulateInfra.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Simulate Capital Investment ROI & Capacity Relief
      `;
    }
  });

  // =========================================================================
  // 12. Reset Grid
  // =========================================================================
  btnResetAll.addEventListener('click', async () => {
    try {
      await fetch('/api/v1/navigation/reset', { method: 'POST' });
      await initializePlatform();
    } catch (err) {
      alert('Reset error: ' + err.message);
    }
  });

  // Start Platform Initial Load
  initializePlatform();
});
