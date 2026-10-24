// Traffic-Diffusion Operations Console Controller
// Leaflet Map Orchestrator with 3-Colour Scheme:
// - Red (#E53935): Confirmed blocked road segments
// - Blue (#1565FF): Recommended route
// - Orange (#FF9800): Alternative routes
// All unrelated roads retain normal basemap appearance.

async function initOperations() {
  // Initialize Leaflet Map
  const trafficMap = new TrafficMap('map');

  // DOM Elements
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
  const btnResetNetwork = document.getElementById('btnResetNetwork');
  const activeIncidentsCount = document.getElementById('activeIncidentsCount');

  const valDistance = document.getElementById('valDistance');
  const valEmsTime = document.getElementById('valEmsTime');
  const valStandardTime = document.getElementById('valStandardTime');
  const valTimeSaved = document.getElementById('valTimeSaved');
  const valSignals = document.getElementById('valSignals');

  // State
  let networkData = null;
  let currentRouteData = null;
  let activeSelectedRouteId = null;

  // 1. Load Road Network State
  async function loadNetworkState() {
    try {
      const res = await fetch('/api/v1/navigation/network');
      if (!res.ok) throw new Error('Failed to load network state');
      networkData = await res.json();

      // Render network: unrelated roads retain basemap styling; blocked segments appear in RED (#E53935)
      trafficMap.renderNetwork(networkData.nodes, networkData.edges);

      // Populate simulator dropdown if empty
      if (simEdgeSelect.options.length === 0) {
        simEdgeSelect.innerHTML = '';
        networkData.edges.forEach(edge => {
          const opt = document.createElement('option');
          opt.value = edge.id;
          opt.textContent = `${edge.id}: ${edge.name} (${edge.congestion_level})`;
          simEdgeSelect.appendChild(opt);
        });

        // Default to corridor_cctv_10 (MG Road) or corridor_cctv_07 (Nanthoor)
        const preferredEdge = networkData.edges.find(e => e.id === 'corridor_cctv_10' || e.id === 'corridor_cctv_07');
        if (preferredEdge) {
          simEdgeSelect.value = preferredEdge.id;
        }
      }

      // Update active incident counter badge
      const activeIncidents = networkData.edges.filter(e => e.has_incident || e.congestion_level === 'BLOCKED');
      if (activeIncidentsCount) {
        activeIncidentsCount.textContent = activeIncidents.length;
      }
    } catch (err) {
      console.error('Network load error:', err);
    }
  }

  // 2. Compute and Display Routes
  async function computeAndRenderRoute() {
    btnComputeRoute.disabled = true;
    btnComputeRoute.textContent = 'Calculating Corridor...';

    try {
      const res = await fetch('/api/v1/navigation/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin_node_id: originSelect.value,
          destination_node_id: destinationSelect.value,
          avoid_congestion: chkAvoidCongestion.checked,
          enable_preemption: chkPreemption.checked,
          is_emergency: true,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || 'Route calculation failed');
      }

      currentRouteData = await res.json();
      activeSelectedRouteId = currentRouteData.primary_route ? currentRouteData.primary_route.route_id : 'primary';

      // Render Recommended Route (Blue #1565FF) and Alternative Routes (Orange #FF9800)
      trafficMap.renderRoutes(currentRouteData);

      // Render Options Switcher
      renderRouteOptions(currentRouteData);

      // Render Preemption Coordination Plan
      if (currentRouteData.coordination_plan) {
        renderCorridorPlan(currentRouteData.coordination_plan);
      }

      // Render Destination Hospital Readiness
      if (currentRouteData.hospital_readiness) {
        renderHospitalReadiness(currentRouteData.hospital_readiness);
      }

      // Update Metrics Banner
      valDistance.textContent = `${currentRouteData.total_distance_km.toFixed(2)} km`;
      valEmsTime.textContent = `${currentRouteData.estimated_travel_time_min.toFixed(1)} min`;
      valStandardTime.textContent = `${currentRouteData.standard_travel_time_min.toFixed(1)} min`;
      valTimeSaved.textContent = `${currentRouteData.time_saved_min.toFixed(1)} min`;
      valSignals.textContent = currentRouteData.signals_preempted;

    } catch (err) {
      console.warn('Routing notice:', err.message);
      // Informative user display without unhandled crashing
      junctionTableBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: #f87171; padding: 12px; font-weight: 600;">
            ${err.message}
          </td>
        </tr>
      `;
    } finally {
      btnComputeRoute.disabled = false;
      btnComputeRoute.textContent = 'Dispatch Green Corridor';
    }
  }

  btnComputeRoute.addEventListener('click', computeAndRenderRoute);

  // 3. Render Route Options (Clicking updates Recommended vs Alternative styling)
  function renderRouteOptions(data) {
    if (!data.primary_route && (!data.alternative_routes || data.alternative_routes.length === 0)) {
      routeSelectorSection.classList.add('hidden');
      return;
    }

    routeSelectorSection.classList.remove('hidden');
    routeOptionCards.innerHTML = '';

    const allRoutes = [];
    if (data.primary_route) allRoutes.push({ ...data.primary_route, isDefaultPrimary: true });
    (data.alternative_routes || []).forEach(alt => allRoutes.push({ ...alt, isDefaultPrimary: false }));

    allRoutes.forEach((rt, idx) => {
      const isSelected = (rt.route_id === activeSelectedRouteId || (!activeSelectedRouteId && rt.isDefaultPrimary));
      const card = document.createElement('div');
      card.className = `route-option-card ${isSelected ? 'selected' : ''}`;
      card.style.cursor = 'pointer';

      const badgeColor = isSelected ? '#1565FF' : '#FF9800';
      const badgeText = isSelected ? 'RECOMMENDED (BLUE)' : `ALTERNATIVE ${idx} (ORANGE)`;

      card.innerHTML = `
        <div class="route-option-header" style="display: flex; justify-content: space-between; align-items: center;">
          <span class="route-option-title" style="font-weight: 700;">${rt.label || `Route Option ${idx + 1}`}</span>
          <span class="status-tag" style="background: ${badgeColor}; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700;">
            ${badgeText}
          </span>
        </div>
        <div class="route-option-meta" style="font-size: 11px; margin-top: 4px; color: #94a3b8; display: flex; gap: 10px;">
          <span>ETA: <strong style="color: #f8fafc;">${rt.estimated_travel_time_min?.toFixed(1) || '?'} min</strong></span>
          <span>Dist: <strong style="color: #f8fafc;">${rt.total_distance_km?.toFixed(1) || '?'} km</strong></span>
          <span>Signals: <strong style="color: #f8fafc;">${rt.signals_count || 0}</strong></span>
        </div>
        <div class="route-option-reason" style="font-size: 10px; color: #cbd5e1; margin-top: 4px;">
          ${rt.recommendation_reason || (isSelected ? 'Fastest clearance corridor' : 'Viable detour corridor')}
        </div>
      `;

      card.addEventListener('click', () => {
        activeSelectedRouteId = rt.route_id;
        // Swap selected route into primary position and remaining routes into alternatives
        const updatedPrimary = rt;
        const updatedAlts = allRoutes.filter(r => r.route_id !== rt.route_id);

        trafficMap.renderRoutes({
          primary_route: updatedPrimary,
          alternative_routes: updatedAlts
        });

        renderRouteOptions(data);
      });

      routeOptionCards.appendChild(card);
    });
  }

  // 4. Render Corridor Signal Preemption Plan
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

    junctionTableBody.querySelectorAll('.btn-override').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const jId = e.target.getAttribute('data-junction');
        const rId = e.target.getAttribute('data-route');
        try {
          const res = await fetch('/api/v1/navigation/corridor/override', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              route_id: rId,
              junction_id: jId,
              target_state: 'ACTIVE',
              operator_notes: 'Manual Dispatch Green Wave Preemption',
            }),
          });
          if (!res.ok) throw new Error('Override failed');
          const planRes = await fetch(`/api/v1/navigation/corridor/${rId}`);
          if (planRes.ok) {
            const updatedPlan = await planRes.json();
            renderCorridorPlan(updatedPlan);
          }
        } catch (err) {
          alert('Override error: ' + err.message);
        }
      });
    });
  }

  // 5. Render Destination Hospital Readiness Telemetry
  function renderHospitalReadiness(hosp) {
    hospName.textContent = hosp.hospital_name;
    hospBayStatus.textContent = hosp.trauma_bay_status === 'READY' ? 'TRAUMA BAY READY' : hosp.trauma_bay_status;
    hospBayStatus.className = `status-tag ${hosp.trauma_bay_status === 'READY' ? 'tag-free' : 'tag-moderate'}`;
    hospEta.textContent = `${hosp.eta_minutes.toFixed(1)} min`;
    hospTriage.textContent = hosp.triage_level.replace(/_/g, ' ');

    hospSpecialties.innerHTML = '';
    (hosp.specialties_available || []).forEach(s => {
      const tag = document.createElement('span');
      tag.className = 'specialty-tag';
      tag.textContent = s;
      hospSpecialties.appendChild(tag);
    });
  }

  // 6. Interactive Roadblock Simulator Handlers
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

      // Reload network: Blocked segment is highlighted in Red (#E53935)
      await loadNetworkState();
      // Recalculate viable routes around the blockage
      await computeAndRenderRoute();
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
      await computeAndRenderRoute();
    } catch (err) {
      alert('Simulator error: ' + err.message);
    }
  });

  btnResetNetwork.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/v1/navigation/reset', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to reset network');
      await loadNetworkState();
      await computeAndRenderRoute();
    } catch (err) {
      alert('Reset error: ' + err.message);
    }
  });

  // 7. Video Ingestion & Vision Sensing
  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const corridorId = corridorSelect.value;
      const file = videoFileInput.files[0];

      const formData = new FormData();
      formData.append('corridor_id', corridorId);
      if (file) {
        formData.append('video_file', file);
      }

      btnUploadSubmit.disabled = true;
      btnUploadSubmit.textContent = 'Processing Video Stream...';

      try {
        const res = await fetch('/api/v1/cv/detect', {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) throw new Error('CV analysis failed');
        const cvData = await res.json();
        renderCvResults(cvData);
        await loadNetworkState();
      } catch (err) {
        alert('Vision sensing error: ' + err.message);
      } finally {
        btnUploadSubmit.disabled = false;
        btnUploadSubmit.textContent = 'Analyze Video Stream';
      }
    });

    btnLoadHeavySample?.addEventListener('click', async () => {
      const corridorId = corridorSelect.value;
      const res = await fetch(`/api/v1/cv/sample-detection?corridor_id=${corridorId}&type=heavy`);
      if (res.ok) {
        const data = await res.json();
        renderCvResults(data);
      }
    });

    btnLoadFreeflowSample?.addEventListener('click', async () => {
      const corridorId = corridorSelect.value;
      const res = await fetch(`/api/v1/cv/sample-detection?corridor_id=${corridorId}&type=freeflow`);
      if (res.ok) {
        const data = await res.json();
        renderCvResults(data);
      }
    });
  }

  function renderCvResults(cvData) {
    cvResultsBox.classList.remove('hidden');
    resCorridorId.textContent = cvData.corridor_id;
    resFrames.textContent = cvData.processed_frames_count || cvData.total_frames || '120';
    resDensityScore.textContent = cvData.density_score.toFixed(2);
    densityProgressBar.style.width = `${Math.min(100, Math.round(cvData.density_score * 100))}%`;

    resCars.textContent = cvData.vehicle_counts?.car || 0;
    resTrucks.textContent = cvData.vehicle_counts?.truck || 0;
    resBuses.textContent = cvData.vehicle_counts?.bus || 0;
    resBikes.textContent = cvData.vehicle_counts?.motorcycle || 0;

    resTrackingFlow.textContent = `${cvData.flow_rate_vpm?.toFixed(1) || '0.0'} vpm`;
    resCongestionBadge.textContent = cvData.congestion_level;
    resCongestionBadge.className = `status-tag ${cvData.congestion_level === 'FREE_FLOW' ? 'tag-free' : (cvData.congestion_level === 'MODERATE' ? 'tag-moderate' : 'tag-heavy')}`;

    if (cvData.annotated_frame_base64) {
      previewContainer.classList.remove('hidden');
      previewImage.src = `data:image/jpeg;base64,${cvData.annotated_frame_base64}`;
    }
  }

  // 8. Initial Startup Boot Sequence
  await loadNetworkState();
  await computeAndRenderRoute();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOperations);
} else {
  initOperations();
}
