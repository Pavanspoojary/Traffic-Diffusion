// Traffic Diffusion - Mangaluru Traffic Police Command Center Controller
// Clean, minimal, high-utility operations dashboard
document.addEventListener('DOMContentLoaded', () => {

  // Live Digital Clock
  const liveClock = document.getElementById('liveClock');

  // Top Metric Elements
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

  // Presets & Disruption Form
  const btnDemoNanthoor = document.getElementById('btnDemoNanthoor');
  const btnDemoBunts = document.getElementById('btnDemoBunts');
  const btnDemoMgRoad = document.getElementById('btnDemoMgRoad');
  const presetPills = document.querySelectorAll('.preset-pill');

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
  const horizonBtns = document.querySelectorAll('.h-btn');
  const forecastHorizonTitle = document.getElementById('forecastHorizonTitle');
  const forecastNarrative = document.getElementById('forecastNarrative');
  const statQueueMeters = document.getElementById('statQueueMeters');
  const statExcessPcu = document.getElementById('statExcessPcu');
  const corridorSpreadTbody = document.getElementById('corridorSpreadTbody');
  const saturatedJuncTbody = document.getElementById('saturatedJuncTbody');

  // Risk & Interventions Elements
  const riskRankList = document.getElementById('riskRankList');
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

  // State
  let networkEdges = [];
  let activeIncident = null;
  let activeHorizon = 30; // default 30 min
  let forecastData = null;
  let riskData = null;
  let interventionData = null;
  let lastCitizenFingerprint = '';
  let lastDispatchFingerprint = '';

  const CORRIDOR_JUNCTION_MAP = {
    'corridor_cctv_07': { id: 'INT_NANTHOOR', name: 'Nanthoor Junction' },
    'corridor_cctv_05': { id: 'INT_BUNTS_HOSTEL', name: 'Bunts Hostel Circle' },
    'corridor_cctv_10': { id: 'INT_PVS', name: 'PVS Junction' },
    'corridor_cctv_11': { id: 'INT_KADRI', name: 'Kadri Tollgate / Bypass' },
    'corridor_cctv_13': { id: 'INT_BUNTS_HOSTEL', name: 'Bunts Hostel Circle' },
    'corridor_cctv_01': { id: 'INT_HAMPANKATTA', name: 'Hampankatta Junction' },
    'corridor_cctv_09': { id: 'INT_LADYHILL', name: 'Ladyhill Circle' },
    'corridor_cctv_12': { id: 'INT_KADRI', name: 'Kadri Tollgate' },
  };

  function ensureDispatchLocation(locId, locName) {
    if (!dispatchLocationSelect) return;
    let opt = Array.from(dispatchLocationSelect.options).find(o => o.value === locId);
    if (!opt) {
      opt = document.createElement('option');
      opt.value = locId;
      opt.textContent = locName || locId;
      dispatchLocationSelect.appendChild(opt);
    }
    dispatchLocationSelect.value = locId;
  }

  // =========================================================================
  // 1. Live Digital Clock
  // =========================================================================
  function updateLiveClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    if (liveClock) liveClock.textContent = `${h}:${m}:${s}`;
  }
  setInterval(updateLiveClock, 1000);
  updateLiveClock();

  // =========================================================================
  // 2. Initialize Platform & Load Corridors
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

      // Periodic live data sync between public app submissions and dispatch ledger
      if (!window._syncIntervalStarted) {
        window._syncIntervalStarted = true;
        setInterval(loadCitizenReports, 3000);
        setInterval(loadResourceDispatches, 4000);
      }
    } catch (err) {
      console.error('Initialization error:', err);
    }
  }

  function populateEdgeDropdown(edges) {
    incidentEdgeSelect.innerHTML = '';
    edges.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = `${e.name} (${e.lanes}L)`;
      incidentEdgeSelect.appendChild(opt);
    });
  }

  // =========================================================================
  // 3. Citizen Inbound Reports Queue
  // =========================================================================
  async function loadCitizenReports() {
    try {
      const res = await fetch('/api/v1/intelligence/citizen-reports');
      if (!res.ok) return;
      const reports = await res.json();

      const fingerprint = JSON.stringify(reports.map(r => [r.report_id, r.verification_status, r.verified_incident_id, r.road_segment_id]));
      if (fingerprint === lastCitizenFingerprint) {
        return;
      }
      lastCitizenFingerprint = fingerprint;

      badgeCitizenCount.textContent = reports.length;
      citizenReportsList.innerHTML = '';

      if (reports.length === 0) {
        citizenReportsList.innerHTML = '<div class="feed-empty">No pending citizen reports</div>';
        return;
      }

      reports.forEach(rep => {
        const isVerified = (rep.verification_status === 'VERIFIED');
        const card = document.createElement('div');
        card.className = 'feed-item';
        card.innerHTML = `
          <div class="feed-head">
            <span class="feed-loc">${rep.road_name}</span>
            <span class="badge-tag ${isVerified ? 'badge-cyan' : 'badge-amber'}">${isVerified ? 'VERIFIED' : 'PENDING'}</span>
          </div>
          <div class="feed-sub">${rep.description} (${rep.category.replace(/_/g, ' ')})</div>
          <div class="feed-foot">
            <span style="font-size: 9.5px; color: var(--text-dim); font-family: var(--font-mono);">${rep.report_id}</span>
            ${!isVerified ? `
              <button type="button" class="btn-mini-adv btn-verify-report" data-id="${rep.report_id}" data-edge="${rep.road_segment_id}" data-cat="${rep.category}" data-lanes="${rep.lanes_affected}" data-desc="${encodeURIComponent(rep.description)}">
                Verify & Forecast
              </button>
            ` : `
              <button type="button" class="btn-mini-adv btn-forecast-report" data-id="${rep.report_id}" data-edge="${rep.road_segment_id}" data-incident="${rep.verified_incident_id || ''}" data-cat="${rep.category}" data-lanes="${rep.lanes_affected}" data-desc="${encodeURIComponent(rep.description)}">
                Forecast
              </button>
            `}
          </div>
        `;
        citizenReportsList.appendChild(card);
      });

      document.querySelectorAll('.btn-verify-report').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const repId = e.currentTarget.dataset.id;
          const edgeId = e.currentTarget.dataset.edge;
          const cat = e.currentTarget.dataset.cat;
          const lanes = parseInt(e.currentTarget.dataset.lanes || '1', 10);
          const desc = decodeURIComponent(e.currentTarget.dataset.desc || '');
          await verifyCitizenReportAndForecast(repId, edgeId, cat, lanes, desc);
        });
      });

      document.querySelectorAll('.btn-forecast-report').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const repId = e.currentTarget.dataset.id;
          const edgeId = e.currentTarget.dataset.edge;
          const incidentId = e.currentTarget.dataset.incident;
          const cat = e.currentTarget.dataset.cat;
          const lanes = parseInt(e.currentTarget.dataset.lanes || '1', 10);
          const desc = decodeURIComponent(e.currentTarget.dataset.desc || '');
          await loadCitizenReportForecast(repId, edgeId, incidentId, cat, lanes, desc);
        });
      });
    } catch (err) {
      console.warn('Citizen reports fetch error:', err);
    }
  }

  async function verifyCitizenReportAndForecast(reportId, edgeId, cat, lanes, desc) {
    try {
      presetPills.forEach(p => p.classList.remove('active'));
      const res = await fetch(`/api/v1/intelligence/citizen-reports/${reportId}/verify?verified=true`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Verification failed');
      const updated = await res.json();

      incidentEdgeSelect.value = edgeId;
      if (cat && incidentCategorySelect.querySelector(`option[value="${cat}"]`)) {
        incidentCategorySelect.value = cat;
      }
      incidentSeveritySelect.value = (lanes > 1 ? 'CRITICAL' : 'HIGH');
      capacityReductionInput.value = (lanes > 1 ? 75 : 45);

      const mapping = CORRIDOR_JUNCTION_MAP[edgeId] || { id: edgeId, name: edgeId };
      ensureDispatchLocation(mapping.id, mapping.name);
      dispatchDirectiveInput.value = `Deploy units to handle verified citizen alert: ${desc || edgeId}`;

      lastCitizenFingerprint = '';
      await loadCitizenReports();

      if (updated.verified_incident_id) {
        await fetchAndDisplayForecast(updated.verified_incident_id);
      } else {
        await triggerCustomForecast();
      }
    } catch (err) {
      alert('Verification error: ' + err.message);
    }
  }

  async function loadCitizenReportForecast(reportId, edgeId, incidentId, cat, lanes, desc) {
    try {
      presetPills.forEach(p => p.classList.remove('active'));
      incidentEdgeSelect.value = edgeId;
      if (cat && incidentCategorySelect.querySelector(`option[value="${cat}"]`)) {
        incidentCategorySelect.value = cat;
      }
      incidentSeveritySelect.value = (lanes > 1 ? 'CRITICAL' : 'HIGH');
      capacityReductionInput.value = (lanes > 1 ? 75 : 45);

      const mapping = CORRIDOR_JUNCTION_MAP[edgeId] || { id: edgeId, name: edgeId };
      ensureDispatchLocation(mapping.id, mapping.name);
      dispatchDirectiveInput.value = `Deploy units to handle citizen alert: ${desc || edgeId}`;

      if (incidentId) {
        await fetchAndDisplayForecast(incidentId);
      } else {
        await triggerCustomForecast();
      }
    } catch (err) {
      console.warn('Citizen report forecast execution failed:', err);
      await triggerCustomForecast();
    }
  }

  // =========================================================================
  // 4. Tactical Presets & Forecast Submission
  // =========================================================================
  function setActivePreset(key) {
    presetPills.forEach(pill => {
      if (pill.dataset.preset === key) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }

  async function triggerDemoScenario(scenarioKey) {
    try {
      setActivePreset(scenarioKey);
      btnRunForecast.disabled = true;
      btnRunForecast.textContent = 'Calculating...';

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
      btnRunForecast.textContent = 'Run Impact Forecast';
    }
  }

  btnDemoNanthoor.addEventListener('click', () => triggerDemoScenario('nanthoor_freight_rollover'));
  btnDemoBunts.addEventListener('click', () => triggerDemoScenario('bunts_hostel_waterlogging'));
  btnDemoMgRoad.addEventListener('click', () => triggerDemoScenario('mg_road_breakdown'));

  incidentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await triggerCustomForecast();
  });

  async function triggerCustomForecast() {
    try {
      presetPills.forEach(p => p.classList.remove('active'));
      btnRunForecast.disabled = true;
      btnRunForecast.textContent = 'Calculating...';

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
      btnRunForecast.textContent = 'Run Impact Forecast';
    }
  }

  // =========================================================================
  // 5. Multi-Horizon Forecast Fetcher & View
  // =========================================================================
  async function fetchAndDisplayForecast(incidentId) {
    try {
      const fcRes = await fetch('/api/v1/intelligence/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident_id: incidentId, horizons: [15, 30, 60] }),
      });
      if (!fcRes.ok) throw new Error('Forecast calculation failed');
      forecastData = await fcRes.json();
      activeIncident = forecastData.incident;

      await updateRiskAssessment(incidentId, activeHorizon);

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

  // Horizon Buttons
  horizonBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      horizonBtns.forEach(b => b.classList.remove('active'));
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

    // Mini metadata
    txtIncidentId.textContent = forecastData.incident.incident_id;
    txtIncidentStatus.textContent = forecastData.incident.severity;
    txtIncidentDesc.textContent = forecastData.incident.description;

    kpiSeverity.textContent = forecastData.incident.severity;
    kpiLocation.textContent = forecastData.incident.road_name || forecastData.incident.affected_edge_id;

    forecastHorizonTitle.textContent = `T+${horizon} Minutes Projection`;
    forecastNarrative.textContent = snap.propagation_summary;
    valActiveHorizon.textContent = `T+${horizon} min`;

    valNetworkDelay.textContent = `+${snap.network_delay_relative_to_baseline_min.toFixed(1)} min`;
    valSaturatedJunctions.textContent = `${snap.saturated_junctions_count}`;

    const directImpact = snap.edge_impacts.find(e => e.impact_type === 'DIRECT_INCIDENT');
    if (directImpact) {
      const qMeters = Math.round(directImpact.queue_length_meters || 0);
      const exPcu = Math.round(qMeters / 7.5 * 1.35) || 140;
      statQueueMeters.textContent = `${qMeters.toLocaleString()} m`;
      statExcessPcu.textContent = `${exPcu.toLocaleString()} PCU`;
      kpiQueueMeters.textContent = `${qMeters.toLocaleString()} m`;
      kpiExcessPcu.textContent = `${exPcu.toLocaleString()} PCU Backlog`;
    }

    renderCorridorSpreadTable(snap.edge_impacts);
    renderSaturatedJunctionsTable(snap.junction_saturations);
  }

  function renderCorridorSpreadTable(impacts) {
    corridorSpreadTbody.innerHTML = '';
    const sorted = [...impacts].sort((a, b) => b.risk_score - a.risk_score).slice(0, 5);

    sorted.forEach(imp => {
      let tagClass = 'badge-amber';
      let tagText = imp.impact_type.replace(/_/g, ' ');
      if (imp.impact_type === 'DIRECT_INCIDENT') {
        tagClass = 'badge-red';
        tagText = 'DIRECT';
      } else if (imp.impact_type === 'DIVERSION_LOADED') {
        tagClass = 'badge-cyan';
        tagText = 'BYPASS';
      }

      const vc = imp.predicted_volume_capacity_ratio;
      const vcColor = vc > 1.2 ? 'var(--accent-red)' : (vc > 0.9 ? 'var(--accent-amber)' : 'var(--accent-green)');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 700; color: var(--text-head);">${imp.road_name}</td>
        <td><span class="badge-tag ${tagClass}">${tagText}</span></td>
        <td><span style="font-family: var(--font-mono); font-weight: 700;">${imp.predicted_travel_time_min.toFixed(1)}m</span> <span style="color: var(--accent-red); font-size: 9.5px;">(+${imp.expected_delay_min.toFixed(1)}m)</span></td>
        <td style="font-family: var(--font-mono);">${Math.round(imp.queue_length_meters || 0)} m</td>
        <td><span style="font-family: var(--font-mono); font-weight: 800; color: ${vcColor};">${vc.toFixed(2)}</span></td>
      `;
      corridorSpreadTbody.appendChild(tr);
    });
  }

  function renderSaturatedJunctionsTable(juncs) {
    saturatedJuncTbody.innerHTML = '';
    const critical = juncs.filter(j => j.saturation_index >= 0.65);

    if (critical.length === 0) {
      saturatedJuncTbody.innerHTML = '<tr><td colspan="4" class="table-empty">No junctions over capacity threshold</td></tr>';
      return;
    }

    critical.forEach(j => {
      const satPct = Math.round(j.saturation_index * 100);
      const tagClass = (j.inflow_spillback_risk === 'CRITICAL' ? 'badge-red' : 'badge-amber');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 700; color: var(--text-head);">${j.junction_name}</td>
        <td style="font-family: var(--font-mono); font-weight: 800; color: ${satPct >= 80 ? 'var(--accent-red)' : 'var(--accent-amber)'};">${satPct}%</td>
        <td><span class="badge-tag ${tagClass}">${j.inflow_spillback_risk}</span></td>
        <td style="font-size: 10px; color: var(--text-dim);">${j.incoming_delayed_edges.length > 0 ? j.incoming_delayed_edges.join(', ') : 'Direct Feeders'}</td>
      `;
      saturatedJuncTbody.appendChild(tr);
    });
  }

  // =========================================================================
  // 6. Risk Ranking List (Clean Minimal List)
  // =========================================================================
  function renderRiskRankings(data) {
    if (!data.high_risk_roads) return;
    riskRankList.innerHTML = '';

    data.high_risk_roads.slice(0, 4).forEach(item => {
      const card = document.createElement('div');
      card.className = 'risk-item';
      card.innerHTML = `
        <div class="risk-head">
          <span>#${item.rank} ${item.road_name}</span>
          <span class="risk-score">${item.risk_score.toFixed(1)}</span>
        </div>
        <div class="risk-dir">${item.recommended_action}</div>
      `;
      riskRankList.appendChild(card);
    });
  }

  // =========================================================================
  // 7. What-If Intervention Scenarios Matrix
  // =========================================================================
  function renderInterventionScenarios(data) {
    if (!data.candidate_scenarios || data.candidate_scenarios.length === 0) return;

    recomRationaleTxt.textContent = data.recommendation_rationale;
    const optimal = data.candidate_scenarios[0];
    if (optimal) {
      valOptimalMitigation.textContent = `${optimal.scenario_name.split(':')[0]} (-${optimal.delay_reduction_pct.toFixed(0)}%)`;
    }

    intervScenarioList.innerHTML = '';

    // Baseline Scenario Card
    const baseCard = document.createElement('div');
    baseCard.className = 'scen-card';
    baseCard.innerHTML = `
      <div class="scen-head">
        <span class="scen-title">${data.baseline_scenario.scenario_name}</span>
        <span class="scen-metrics text-red">0% Relief</span>
      </div>
      <div class="scen-desc">${data.baseline_scenario.estimated_network_travel_time_min.toFixed(1)}m net time · Unmitigated queue growth</div>
    `;
    intervScenarioList.appendChild(baseCard);

    // Candidate Scenarios
    data.candidate_scenarios.forEach(scen => {
      const isRecom = (scen.scenario_id === data.recommended_scenario_id);
      const card = document.createElement('div');
      card.className = `scen-card ${isRecom ? 'active-opt' : ''}`;
      card.innerHTML = `
        <div class="scen-head">
          <span class="scen-title">${scen.scenario_name}</span>
          <span class="scen-metrics text-green">-${scen.delay_reduction_pct.toFixed(0)}% Delay</span>
        </div>
        <div class="scen-desc">${scen.resource_summary} · Delay saved: -${scen.delay_reduction_relative_to_baseline_min.toFixed(1)}m</div>
      `;
      intervScenarioList.appendChild(card);
    });

    btnApplyRecomPlan.onclick = () => {
      if (optimal) {
        dispatchDirectiveInput.value = `Implement Recommended Action Plan: ${optimal.scenario_name}`;
        dispatchLocationSelect.value = 'INT_NANTHOOR';
        dispatchResourceSelect.value = 'TRAFFIC_POLICE_OFFICER';
        dispatchForm.scrollIntoView({ behavior: 'smooth' });
      }
    };
  }

  // =========================================================================
  // 8. Tactical Resource Deployment Console
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

      const fingerprint = JSON.stringify(orders.map(o => [o.order_id, o.status, o.directive]));
      if (fingerprint === lastDispatchFingerprint) {
        return;
      }
      lastDispatchFingerprint = fingerprint;

      dispatchOrdersList.innerHTML = '';
      ledgerCountBadge.textContent = `${orders.length} Units Active`;

      if (orders.length === 0) {
        dispatchOrdersList.innerHTML = '<div class="feed-empty">No active dispatches</div>';
        return;
      }

      orders.forEach(ord => {
        const item = document.createElement('div');
        item.className = 'dsp-item';

        let statusClass = 'dispatched';
        let advanceBtnText = 'En Route';
        let nextStatus = 'EN_ROUTE';

        if (ord.status === 'ON_SCENE') {
          statusClass = 'on-scene';
          advanceBtnText = 'Resolve';
          nextStatus = 'RESOLVED';
        } else if (ord.status === 'EN_ROUTE') {
          statusClass = 'en-route';
          advanceBtnText = 'On Scene';
          nextStatus = 'ON_SCENE';
        }

        item.innerHTML = `
          <div class="dsp-info">
            <span class="dsp-target">${ord.target_location_name}</span>
            <span class="dsp-dir">${ord.directive} (${ord.resource_type.replace(/_/g, ' ')})</span>
          </div>
          <div class="dsp-actions">
            <span class="dsp-badge ${statusClass}">${ord.status}</span>
            <button type="button" class="btn-mini-adv btn-advance-status" data-id="${ord.order_id}" data-next="${nextStatus}">
              ${advanceBtnText}
            </button>
          </div>
        `;
        dispatchOrdersList.appendChild(item);
      });

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
          notes: `Updated to ${nextStatus}`
        })
      });
      if (!res.ok) throw new Error('Status transition failed');
      lastDispatchFingerprint = '';
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
        notes: 'Dispatched via Command Center'
      };

      const res = await fetch('/api/v1/intelligence/dispatches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Failed to dispatch unit');
      lastDispatchFingerprint = '';
      await loadResourceDispatches();
    } catch (err) {
      alert('Dispatch error: ' + err.message);
    }
  });

  // =========================================================================
  // 9. Reset Grid
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
