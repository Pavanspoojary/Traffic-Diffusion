// Traffic Diffusion - Emergency Green Corridor Coordination Dashboard
document.addEventListener('DOMContentLoaded', () => {
  const trafficMap = new TrafficMap('map');

  // DOM Elements
  const activeIncidentsCount = document.getElementById('activeIncidentsCount');
  const btnResetNetwork = document.getElementById('btnResetNetwork');

  const corridorSelect = document.getElementById('corridorSelect');
  const videoFileInput = document.getElementById('videoFileInput');
  const uploadForm = document.getElementById('uploadForm');
  const btnUploadSubmit = document.getElementById('btnUploadSubmit');
  const btnLoadHeavySample = document.getElementById('btnLoadHeavySample');
  const btnLoadFreeflowSample = document.getElementById('btnLoadFreeflowSample');

  const cvResultsBox = document.getElementById('cvResultsBox');
  const resCorridorId = document.getElementById('resCorridorId');
  const resFrames = document.getElementById('resFrames');
  const resDensityScore = document.getElementById('resDensityScore');
  const densityProgressBar = document.getElementById('densityProgressBar');
  const resCars = document.getElementById('resCars');
  const resTrucks = document.getElementById('resTrucks');
  const resBuses = document.getElementById('resBuses');
  const resBikes = document.getElementById('resBikes');
  const resTrackingFlow = document.getElementById('resTrackingFlow');
  const resCongestionBadge = document.getElementById('resCongestionBadge');
  const previewContainer = document.getElementById('previewContainer');
  const previewImage = document.getElementById('previewImage');

  const incidentReviewList = document.getElementById('incidentReviewList');

  const originSelect = document.getElementById('originSelect');
  const destinationSelect = document.getElementById('destinationSelect');
  const chkAvoidCongestion = document.getElementById('chkAvoidCongestion');
  const chkPreemption = document.getElementById('chkPreemption');
  const btnComputeRoute = document.getElementById('btnComputeRoute');

  const routeSelectorSection = document.getElementById('routeSelectorSection');
  const routeOptionCards = document.getElementById('routeOptionCards');

  const corridorStatusBadge = document.getElementById('corridorStatusBadge');
  const junctionTableBody = document.getElementById('junctionTableBody');

  const hospName = document.getElementById('hospName');
  const hospBayStatus = document.getElementById('hospBayStatus');
  const hospEta = document.getElementById('hospEta');
  const hospTriage = document.getElementById('hospTriage');
  const hospSpecialties = document.getElementById('hospSpecialties');

  const simEdgeSelect = document.getElementById('simEdgeSelect');
  const btnInjectBlockage = document.getElementById('btnInjectBlockage');
  const btnClearBlockage = document.getElementById('btnClearBlockage');

  const valDistance = document.getElementById('valDistance');
  const valEmsTime = document.getElementById('valEmsTime');
  const valStandardTime = document.getElementById('valStandardTime');
  const valTimeSaved = document.getElementById('valTimeSaved');
  const valSignals = document.getElementById('valSignals');

  // Application State
  let currentNetworkState = null;
  let currentRouteData = null;
  let activeSelectedRouteId = null;

  // 1. Initial Data Fetch & Network State
  async function loadNetworkState() {
    try {
      const res = await fetch('/api/v1/navigation/network');
      if (!res.ok) throw new Error('Failed to fetch network state');
      currentNetworkState = await res.json();

      trafficMap.renderNetwork(currentNetworkState.nodes, currentNetworkState.edges);
      activeIncidentsCount.textContent = currentNetworkState.active_incidents_count;

      populateEdgeDropdown(currentNetworkState.edges);
      await loadActiveIncidents();
    } catch (err) {
      console.error('Error loading network state:', err);
    }
  }

  function populateEdgeDropdown(edges) {
    simEdgeSelect.innerHTML = '';
    edges.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = `${e.name} (${e.id}) [${e.congestion_level}]`;
      simEdgeSelect.appendChild(opt);
    });
  }

  // 2. Load & Render Active Incidents for Operator Review
  async function loadActiveIncidents() {
    try {
      const res = await fetch('/api/v1/cv/incidents');
      if (!res.ok) return;
      const incidents = await res.json();

      if (incidents.length === 0) {
        incidentReviewList.innerHTML = `
          <div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 12px;">
            No active road incidents in sector. All arterial corridors passable.
          </div>
        `;
        return;
      }

      incidentReviewList.innerHTML = '';
      incidents.forEach(inc => {
        const isConfirmed = (inc.status === 'CONFIRMED');
        const card = document.createElement('div');
        card.className = `incident-card ${isConfirmed ? 'confirmed' : 'suspected'}`;
        card.innerHTML = `
          <div class="incident-header">
            <span class="incident-road">${inc.road_name || inc.corridor_id}</span>
            <span class="status-tag ${isConfirmed ? 'tag-blocked' : 'tag-moderate'}">${inc.status}</span>
          </div>
          <div class="incident-desc">${inc.description}</div>
          <div style="font-size: 10px; color: var(--text-muted);">
            Confidence: ${(inc.confidence_score * 100).toFixed(0)}% | Time: ${inc.detected_at.substring(11, 19)} UTC
          </div>
          <div class="incident-actions">
            ${!isConfirmed ? `<button class="btn-xs btn-confirm" data-id="${inc.incident_id}" data-action="CONFIRM">Confirm Closure</button>` : ''}
            <button class="btn-xs btn-clear" data-id="${inc.incident_id}" data-action="CLEAR">Dismiss / Clear</button>
          </div>
        `;
        incidentReviewList.appendChild(card);
      });

      // Bind action buttons
      incidentReviewList.querySelectorAll('.btn-xs').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const incId = e.target.getAttribute('data-id');
          const action = e.target.getAttribute('data-action');
          await verifyIncident(incId, action);
        });
      });
    } catch (err) {
      console.warn('Failed to load active incidents:', err);
    }
  }

  async function verifyIncident(incidentId, action) {
    try {
      const res = await fetch(`/api/v1/cv/incidents/${incidentId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incident_id: incidentId,
          action: action,
          notes: `Operator command from Dispatch Console`,
          operator_id: 'DISPATCH_OP_01',
        }),
      });
      if (!res.ok) throw new Error('Failed to verify incident');
      await loadNetworkState();
      // Recalculate route automatically
      btnComputeRoute.click();
    } catch (err) {
      alert('Incident verification error: ' + err.message);
    }
  }

  // 3. Video Analysis Handlers
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = videoFileInput.files[0];
    const corridorId = corridorSelect.value;

    if (!file) {
      alert('Please select a video file or use one of the sample buttons.');
      return;
    }

    const formData = new FormData();
    formData.append('video_file', file);
    formData.append('corridor_id', corridorId);
    formData.append('is_simulation_mode', 'false');

    btnUploadSubmit.disabled = true;
    btnUploadSubmit.textContent = 'Processing Video Frames...';

    try {
      const res = await fetch('/api/v1/cv/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Analysis failed');
      }

      const result = await res.json();
      displayCvResults(result);
      await loadNetworkState();
      btnComputeRoute.click();
    } catch (err) {
      alert('Error during CV analysis: ' + err.message);
    } finally {
      btnUploadSubmit.disabled = false;
      btnUploadSubmit.textContent = 'Analyze Video Stream';
    }
  });

  async function triggerSampleAnalysis(sampleType) {
    const corridorId = corridorSelect.value;
    btnUploadSubmit.disabled = true;
    btnUploadSubmit.textContent = `Analyzing ${sampleType.toUpperCase()} Sample...`;

    try {
      const res = await fetch(`/api/v1/cv/analyze-sample?sample_type=${sampleType}&corridor_id=${corridorId}&is_simulation_mode=false`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to analyze sample');
      const result = await res.json();
      displayCvResults(result);
      await loadNetworkState();
      btnComputeRoute.click();
    } catch (err) {
      alert('Sample analysis error: ' + err.message);
    } finally {
      btnUploadSubmit.disabled = false;
      btnUploadSubmit.textContent = 'Analyze Video Stream';
    }
  }

  btnLoadHeavySample.addEventListener('click', () => triggerSampleAnalysis('heavy'));
  btnLoadFreeflowSample.addEventListener('click', () => triggerSampleAnalysis('freeflow'));

  function displayCvResults(result) {
    cvResultsBox.classList.remove('hidden');
    resCorridorId.textContent = result.corridor_id;
    resFrames.textContent = result.frames_analyzed;
    resDensityScore.textContent = result.density_score.toFixed(2);

    const percent = Math.min(100, Math.round(result.density_score * 100));
    densityProgressBar.style.width = `${percent}%`;

    if (result.congestion_level === 'BLOCKED') {
      densityProgressBar.style.backgroundColor = 'var(--accent-red)';
    } else if (result.congestion_level === 'HEAVY') {
      densityProgressBar.style.backgroundColor = 'var(--accent-amber)';
    } else {
      densityProgressBar.style.backgroundColor = 'var(--accent-green)';
    }

    resCars.textContent = result.vehicle_counts.cars;
    resTrucks.textContent = result.vehicle_counts.trucks;
    resBuses.textContent = result.vehicle_counts.buses;
    resBikes.textContent = result.vehicle_counts.motorcycles;

    if (result.tracking_summary) {
      resTrackingFlow.textContent = `${result.tracking_summary.estimated_flow_rate_vpm} vpm (${result.tracking_summary.moving_vehicles} moving / ${result.tracking_summary.stopped_vehicles} stopped)`;
    } else {
      resTrackingFlow.textContent = 'Flow tracking active';
    }

    resCongestionBadge.textContent = result.congestion_level;
    resCongestionBadge.className = `status-tag tag-${result.congestion_level.toLowerCase().replace('_', '')}`;

    // Load annotated frame preview
    const previewFilename = `${result.video_filename.replace(/\.[^/.]+$/, "")}_preview.jpg`;
    previewImage.src = `/api/v1/cv/preview/${previewFilename}`;
    previewContainer.classList.remove('hidden');
  }

  // 4. Emergency Routing Handler
  btnComputeRoute.addEventListener('click', async () => {
    const originId = originSelect.value;
    const destId = destinationSelect.value;
    const avoidCongestion = chkAvoidCongestion.checked;

    btnComputeRoute.disabled = true;
    btnComputeRoute.textContent = 'Calculating Corridor...';

    try {
      const res = await fetch('/api/v1/navigation/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin_node_id: originId,
          destination_node_id: destId,
          is_emergency: true,
          avoid_congestion: avoidCongestion,
          current_route_id: activeSelectedRouteId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Route calculation failed');
      }

      currentRouteData = await res.json();
      activeSelectedRouteId = currentRouteData.primary_route ? currentRouteData.primary_route.route_id : null;

      // Render Primary Corridor and Alternative on Map
      const altCoords = (currentRouteData.alternative_routes && currentRouteData.alternative_routes.length > 0)
        ? currentRouteData.alternative_routes[0].path_coordinates
        : null;

      trafficMap.renderGreenCorridor(currentRouteData.path_coordinates, currentRouteData, altCoords);

      // Render Options Switcher
      renderRouteOptions(currentRouteData);

      // Render Corridor Signal Preemption Plan
      if (currentRouteData.coordination_plan) {
        renderCorridorPlan(currentRouteData.coordination_plan);
      }

      // Render Destination Hospital Readiness
      if (currentRouteData.hospital_readiness) {
        renderHospitalReadiness(currentRouteData.hospital_readiness);
      }

      // Update metrics banner
      valDistance.textContent = `${currentRouteData.total_distance_km.toFixed(2)} km`;
      valEmsTime.textContent = `${currentRouteData.estimated_travel_time_min.toFixed(1)} min`;
      valStandardTime.textContent = `${currentRouteData.standard_travel_time_min.toFixed(1)} min`;
      valTimeSaved.textContent = `${currentRouteData.time_saved_min.toFixed(1)} min`;
      valSignals.textContent = currentRouteData.signals_preempted;
    } catch (err) {
      alert('Routing error: ' + err.message);
    } finally {
      btnComputeRoute.disabled = false;
      btnComputeRoute.textContent = 'Dispatch Green Corridor';
    }
  });

  // 5. Render Route Options (Primary vs Alternative)
  function renderRouteOptions(data) {
    if (!data.primary_route) {
      routeSelectorSection.classList.add('hidden');
      return;
    }

    routeSelectorSection.classList.remove('hidden');
    routeOptionCards.innerHTML = '';

    const routes = [data.primary_route, ...(data.alternative_routes || [])];
    routes.forEach(rt => {
      const isPrimary = (rt.route_id === (activeSelectedRouteId || data.primary_route.route_id));
      const card = document.createElement('div');
      card.className = `route-option-card ${isPrimary ? 'selected' : ''}`;
      card.innerHTML = `
        <div class="route-option-header">
          <span class="route-option-title">${rt.label}</span>
          <span class="status-tag ${isPrimary ? 'tag-free' : 'tag-moderate'}">${isPrimary ? 'RECOMMENDED' : 'BACKUP'}</span>
        </div>
        <div class="route-option-meta">
          <span>ETA: <strong>${rt.estimated_travel_time_min.toFixed(1)} min</strong></span>
          <span>Dist: <strong>${rt.total_distance_km.toFixed(1)} km</strong></span>
          <span>Signals: <strong>${rt.signals_count}</strong></span>
        </div>
        <div class="route-option-reason">${rt.recommendation_reason}</div>
      `;

      card.addEventListener('click', () => {
        activeSelectedRouteId = rt.route_id;
        trafficMap.renderGreenCorridor(rt.path_coordinates, rt, null);
        renderRouteOptions(data);
      });

      routeOptionCards.appendChild(card);
    });
  }

  // 6. Render Corridor Signal Preemption Plan
  function renderCorridorPlan(plan) {
    corridorStatusBadge.textContent = plan.status;
    corridorStatusBadge.className = `badge ${plan.status === 'COORDINATED' ? 'badge-accent' : 'badge-subtle'}`;

    if (!plan.junctions || plan.junctions.length === 0) {
      junctionTableBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 12px;">
            No intervening signalized junctions on active corridor.
          </td>
        </tr>
      `;
      return;
    }

    junctionTableBody.innerHTML = '';
    plan.junctions.forEach(j => {
      const isCleared = (j.state === 'ACTIVE' || j.state === 'APPROVED');
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${j.junction_name}</strong></td>
        <td><span class="status-tag ${isCleared ? 'tag-free' : 'tag-moderate'}">${j.state}</span></td>
        <td>T+${Math.round(j.eta_seconds)}s</td>
        <td>
          <button class="btn-xs btn-override" data-junction="${j.junction_id}" data-route="${plan.corridor_id}">
            Force Green
          </button>
        </td>
      `;
      junctionTableBody.appendChild(row);
    });

    // Bind manual preemption buttons
    junctionTableBody.querySelectorAll('.btn-override').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const jId = e.target.getAttribute('data-junction');
        const rId = e.target.getAttribute('data-route');
        await overrideJunction(rId, jId);
      });
    });
  }

  async function overrideJunction(routeId, junctionId) {
    try {
      const res = await fetch('/api/v1/navigation/corridor/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route_id: routeId,
          junction_id: junctionId,
          target_state: 'ACTIVE',
          operator_notes: 'Manual Dispatch Green Wave Preemption',
        }),
      });
      if (!res.ok) throw new Error('Override failed');
      const updated = await res.json();
      // Re-fetch corridor plan
      const planRes = await fetch(`/api/v1/navigation/corridor/${routeId}`);
      if (planRes.ok) {
        const plan = await planRes.json();
        renderCorridorPlan(plan);
      }
    } catch (err) {
      alert('Override error: ' + err.message);
    }
  }

  // 7. Render Hospital Readiness Telemetry
  function renderHospitalReadiness(hosp) {
    hospName.textContent = hosp.hospital_name;
    hospBayStatus.textContent = hosp.trauma_bay_status === 'READY' ? 'TRAUMA BAY READY' : hosp.trauma_bay_status;
    hospBayStatus.className = `status-tag ${hosp.trauma_bay_status === 'READY' ? 'tag-free' : 'tag-moderate'}`;
    hospEta.textContent = `${hosp.eta_minutes.toFixed(1)} min`;
    hospTriage.textContent = hosp.triage_level.replace(/_/g, ' ');

    hospSpecialties.innerHTML = '';
    hosp.specialties_available.forEach(s => {
      const tag = document.createElement('span');
      tag.className = 'specialty-tag';
      tag.textContent = s;
      hospSpecialties.appendChild(tag);
    });
  }

  // 8. Incident Simulator Handlers
  btnInjectBlockage.addEventListener('click', async () => {
    const edgeId = simEdgeSelect.value;
    try {
      const res = await fetch('/api/v1/navigation/simulate-incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edge_id: edgeId,
          congestion_level: 'BLOCKED',
          has_incident: true,
          incident_description: 'Major freight collision blocking roadway; police diversion active',
          is_confirmed: true,
        }),
      });
      if (!res.ok) throw new Error('Failed to inject incident');
      await loadNetworkState();
      btnComputeRoute.click();
    } catch (err) {
      alert('Simulator error: ' + err.message);
    }
  });

  btnClearBlockage.addEventListener('click', async () => {
    const edgeId = simEdgeSelect.value;
    try {
      const res = await fetch('/api/v1/navigation/simulate-incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edge_id: edgeId,
          congestion_level: 'FREE_FLOW',
          has_incident: false,
          incident_description: '',
          is_confirmed: false,
        }),
      });
      if (!res.ok) throw new Error('Failed to clear incident');
      await loadNetworkState();
      btnComputeRoute.click();
    } catch (err) {
      alert('Simulator error: ' + err.message);
    }
  });

  btnResetNetwork.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/v1/navigation/reset', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to reset');
      await loadNetworkState();
      btnComputeRoute.click();
    } catch (err) {
      alert('Reset error: ' + err.message);
    }
  });

  // Startup initialization
  loadNetworkState().then(() => {
    btnComputeRoute.click();
  });
});
