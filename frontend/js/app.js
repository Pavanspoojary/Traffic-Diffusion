// Traffic-Diffusion — Traffic Diversion Intelligence for Control Rooms
// MapLibre GL JS with 3D Buildings Extrusion & Vector Tiles
// Unified Demonstration Geography: Mangaluru Metropolitan Arterials (NH-66 / NH-73)

document.addEventListener('DOMContentLoaded', async () => {

  // =========================================================================
  // 1. Live Digital Clock
  // =========================================================================
  const headerLiveClock = document.getElementById('headerLiveClock');

  function updateClock() {
    const now = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const dayStr = days[now.getDay()];
    const monthStr = months[now.getMonth()];
    const dateNum = now.getDate();
    const yearNum = now.getFullYear();

    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    if (headerLiveClock) {
      headerLiveClock.innerHTML = `${dayStr}, ${monthStr} ${dateNum}, ${yearNum} &bull; ${hh}:${mm}:${ss}`;
    }
  }
  setInterval(updateClock, 1000);
  updateClock();

  // =========================================================================
  // 2. State & Sector Data (Mangaluru Metropolitan Sector)
  // =========================================================================
  const MANGALURU_CENTER = [74.8550, 12.8750]; // Center around Bunts Hostel / Kadri / Nanthoor
  let mapInstance = null;
  let activeMarkers = [];
  let currentCorridorsData = [];
  let currentNodesMap = new Map();

  let activeCorridorId = 'corridor_cctv_07';
  let activeBlockagePct = 80;
  let activeDisplacedDemand = 895.0;
  let latestEvaluation = null;

  // Presets mapping
  const PRESETS = {
    nanthoor: { corridor: 'corridor_cctv_07', blockage: 80, desc: 'Nanthoor Rollover (80%)' },
    bunts: { corridor: 'corridor_cctv_05', blockage: 50, desc: 'Bunts Waterlogging (50%)' },
    mgRoad: { corridor: 'corridor_cctv_10', blockage: 60, desc: 'MG Road Bus Stall (60%)' },
    hampankatta: { corridor: 'corridor_cctv_01', blockage: 100, desc: 'K.S. Rao Closure (100%)' }
  };

  // =========================================================================
  // 3. MapLibre GL JS Map Initialization with 3D Buildings Extrusion
  // =========================================================================
  function initMapLibre() {
    const mapContainer = document.getElementById('liveTrafficMap');
    if (!mapContainer || typeof maplibregl === 'undefined') return;

    mapInstance = new maplibregl.Map({
      container: 'liveTrafficMap',
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: MANGALURU_CENTER,
      zoom: 14.3,
      pitch: 45,
      bearing: -15,
      canvasContextAttributes: { antialias: true }
    });

    mapInstance.addControl(
      new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }),
      'top-left'
    );

    mapInstance.on('load', async () => {
      setup3DBuildings();
      await loadMangaluruNetwork();
      await triggerDiversionEvaluation();
    });
  }

  // 3D Buildings Extrusion
  function setup3DBuildings() {
    try {
      const layers = mapInstance.getStyle().layers || [];
      let labelLayerId;
      for (let i = 0; i < layers.length; i++) {
        if (layers[i].type === 'symbol' && layers[i].layout && layers[i].layout['text-field']) {
          labelLayerId = layers[i].id;
          break;
        }
      }

      const existingSource = mapInstance.getSource('openmaptiles') ? 'openmaptiles' : (mapInstance.getSource('openfreemap') ? 'openfreemap' : null);
      if (!existingSource) {
        mapInstance.addSource('openfreemap', {
          url: 'https://tiles.openfreemap.org/planet',
          type: 'vector'
        });
      }
      const actualSource = mapInstance.getSource('openmaptiles') ? 'openmaptiles' : 'openfreemap';

      if (!mapInstance.getLayer('3d-buildings')) {
        mapInstance.addLayer(
          {
            id: '3d-buildings',
            source: actualSource,
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 13,
            filter: ['!=', ['get', 'hide_3d'], true],
            paint: {
              'fill-extrusion-color': [
                'interpolate',
                ['linear'],
                ['get', 'render_height'],
                0, '#151d30',
                40, '#1c2944',
                120, '#2563eb',
                250, '#38bdf8'
              ],
              'fill-extrusion-height': [
                'interpolate',
                ['linear'],
                ['zoom'],
                13, 0,
                15.5, ['get', 'render_height']
              ],
              'fill-extrusion-base': [
                'interpolate',
                ['linear'],
                ['zoom'],
                13, 0,
                15.5, ['get', 'render_min_height']
              ],
              'fill-extrusion-opacity': 0.85
            }
          },
          labelLayerId
        );
      }
    } catch (e) {
      console.warn('3D buildings init notice:', e);
    }
  }

  // =========================================================================
  // 4. Load Mangaluru Network from Backend (/api/v1/navigation/network)
  // =========================================================================
  async function loadMangaluruNetwork() {
    try {
      const res = await fetch('/api/v1/navigation/network');
      if (!res.ok) return;
      const data = await res.json();

      currentNodesMap.clear();
      data.nodes.forEach(n => currentNodesMap.set(n.id, n));
      currentCorridorsData = data.edges;

      // Populate Corridor Select dropdown
      const selectCorridor = document.getElementById('selectCorridor');
      if (selectCorridor && selectCorridor.options.length <= 1) {
        selectCorridor.innerHTML = '';
        data.edges.forEach(e => {
          const opt = document.createElement('option');
          opt.value = e.id;
          opt.textContent = `${e.name} (${e.id})`;
          if (e.id === activeCorridorId) opt.selected = true;
          selectCorridor.appendChild(opt);
        });
      }

      renderNetworkOnMap();
      setupJunctionMarkers();

    } catch (err) {
      console.error('Failed to load Mangaluru network:', err);
    }
  }

  function renderNetworkOnMap() {
    if (!mapInstance || !currentCorridorsData.length) return;

    const features = [];
    currentCorridorsData.forEach(edge => {
      const s = currentNodesMap.get(edge.source);
      const t = currentNodesMap.get(edge.target);
      if (!s || !t) return;

      const isTarget = (edge.id === activeCorridorId);
      let color = '#22c55e'; // Normal
      if (isTarget) {
        color = '#ef4444'; // Blocked
      } else if (edge.congestion_level === 'HEAVY') {
        color = '#fbbf24';
      } else if (edge.congestion_level === 'MODERATE') {
        color = '#38bdf8';
      }

      features.push({
        type: 'Feature',
        properties: {
          id: edge.id,
          name: edge.name,
          color: color,
          isTarget: isTarget,
          lanes: edge.lanes
        },
        geometry: {
          type: 'LineString',
          coordinates: [[s.lng, s.lat], [t.lng, t.lat]]
        }
      });
    });

    const geojson = { type: 'FeatureCollection', features };

    if (mapInstance.getSource('mng-corridors')) {
      mapInstance.getSource('mng-corridors').setData(geojson);
    } else {
      mapInstance.addSource('mng-corridors', {
        type: 'geojson',
        data: geojson
      });

      // Background glow for corridors
      mapInstance.addLayer({
        id: 'corridors-glow',
        type: 'line',
        source: 'mng-corridors',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['case', ['get', 'isTarget'], 10, 5],
          'line-opacity': 0.35,
          'line-blur': 3
        }
      });

      // Foreground sharp corridor line
      mapInstance.addLayer({
        id: 'corridors-core',
        type: 'line',
        source: 'mng-corridors',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['case', ['get', 'isTarget'], 5, 2.5]
        }
      });

      mapInstance.on('click', 'corridors-core', (e) => {
        if (!e.features || !e.features.length) return;
        const prop = e.features[0].properties;
        setTargetCorridor(prop.id, prop.name);
      });
    }
  }

  function setupJunctionMarkers() {
    activeMarkers.forEach(m => m.remove());
    activeMarkers = [];

    const keyJunctions = ['INT_NANTHOOR', 'INT_BUNTS_HOSTEL', 'INT_MALLIKATTE', 'INT_JYOTHI_CIRCLE', 'INT_KUNTIKAN', 'INT_PUMPWELL'];
    keyJunctions.forEach(jid => {
      const node = currentNodesMap.get(jid);
      if (!node) return;

      const el = document.createElement('div');
      el.className = 'junction-map-dot';
      el.title = node.name;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([node.lng, node.lat])
        .setPopup(new maplibregl.Popup({ offset: 12 }).setHTML(`<strong style="color:#0f172a;">${node.name}</strong>`))
        .addTo(mapInstance);

      activeMarkers.push(marker);
    });
  }

  // =========================================================================
  // 5. Calculate & Compare Diversions (/api/v1/intelligence/interventions/evaluate)
  // =========================================================================
  async function triggerDiversionEvaluation() {
    const btnSim = document.getElementById('btnSimulateDiversion');
    if (btnSim) {
      btnSim.disabled = true;
      btnSim.innerHTML = `<span>Computing Graph Redistribution...</span>`;
    }

    try {
      const payload = {
        incident: {
          incident_id: `INC-MNG-${activeCorridorId.toUpperCase()}`,
          affected_edge_id: activeCorridorId,
          capacity_reduction_pct: activeBlockagePct / 100.0,
          severity: activeBlockagePct >= 80 ? 'CRITICAL' : (activeBlockagePct >= 50 ? 'HIGH' : 'MODERATE'),
          estimated_duration_min: 45.0,
          provenance: 'ESTIMATED',
          description: `Disruption on ${activeCorridorId} with ${activeBlockagePct}% blockage`
        },
        override_blockage_pct: activeBlockagePct / 100.0
      };

      const res = await fetch('/api/v1/intelligence/interventions/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        showToast('Diversion calculation request failed');
        return;
      }

      latestEvaluation = await res.json();
      renderEvaluationResults(latestEvaluation);
      renderDetoursOnMap(latestEvaluation);
      showToast('Graph Diversion Scenarios calculated');

    } catch (err) {
      console.error('Diversion evaluation error:', err);
      showToast('Error connecting to diversion calculation engine');
    } finally {
      if (btnSim) {
        btnSim.disabled = false;
        btnSim.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polygon points="10 8 16 12 10 16 10 8"></polygon>
          </svg>
          <span>Calculate &amp; Compare Diversions</span>
        `;
      }
    }
  }

  // =========================================================================
  // 6. Render Calculated Diversion Results into UI
  // =========================================================================
  function renderEvaluationResults(data) {
    if (!data) return;

    // Update Top KPIs with genuine data
    const kpiDisplaced = document.getElementById('kpiDisplacedDemand');
    const kpiSaturated = document.getElementById('kpiSaturatedCount');
    const kpiDelaySaved = document.getElementById('kpiDelaySaved');
    const kpiActive = document.getElementById('kpiActiveIncidents');

    if (kpiDisplaced) kpiDisplaced.textContent = `${data.displaced_demand_veh_hr.toFixed(0)} PCU/hr`;
    if (kpiActive) kpiActive.textContent = `1 Corridor Active`;

    // Displaced demand strip in parameters box
    const lblNom = document.getElementById('lblNominalFlow');
    const lblEff = document.getElementById('lblEffectiveCap');
    const lblDisp = document.getElementById('lblDisplacedFlow');

    if (lblNom) lblNom.textContent = `${data.baseline_flow_veh_hr.toFixed(0)} PCU/hr`;
    if (lblEff) lblEff.textContent = `${data.effective_capacity_veh_hr.toFixed(0)} PCU/hr`;
    if (lblDisp) lblDisp.textContent = `${data.displaced_demand_veh_hr.toFixed(0)} PCU/hr`;

    // Map Floating Callout
    const overlayRoad = document.getElementById('overlayRoadName');
    const overlayMeta = document.getElementById('overlayMetaText');
    if (overlayRoad) overlayRoad.textContent = data.affected_corridor || activeCorridorId;
    if (overlayMeta) overlayMeta.textContent = `${activeBlockagePct}% Blockage • ${data.displaced_demand_veh_hr.toFixed(0)} PCU/hr Displaced`;

    // 1. Render Discovered Viable Detours List
    const detoursContainer = document.getElementById('detoursContainer');
    if (detoursContainer) {
      detoursContainer.innerHTML = '';
      if (!data.candidate_detours || !data.candidate_detours.length) {
        detoursContainer.innerHTML = `
          <div class="empty-detour-notice">
            No alternative graph detour exists without traversing closed segments.
          </div>
        `;
      } else {
        data.candidate_detours.forEach((d, idx) => {
          const badgeClass = idx === 0 ? 'badge-route-a' : 'badge-route-b';
          const badgeLabel = idx === 0 ? 'Route A' : (idx === 1 ? 'Route B' : `Route ${idx+1}`);
          const div = document.createElement('div');
          div.className = `detour-item ${idx === 0 ? 'active-detour' : ''}`;
          div.innerHTML = `
            <div class="detour-header">
              <span class="detour-badge ${badgeClass}">${badgeLabel}</span>
              <span class="detour-name">${d.title}</span>
            </div>
            <div class="detour-metrics">
              <span><strong>${d.total_length_km.toFixed(1)} km</strong> length</span>
              <span><strong>${d.baseline_travel_time_min.toFixed(1)} min</strong> travel time</span>
              <span><strong>${d.bottleneck_capacity_pcu.toFixed(0)} PCU/hr</strong> bottleneck cap</span>
            </div>
          `;
          detoursContainer.appendChild(div);
        });
      }
    }

    // 2. Render Side-by-Side Comparison Table
    const tbody = document.getElementById('matrixTableBody');
    if (tbody) {
      tbody.innerHTML = '';

      // Baseline Row
      const base = data.baseline_scenario;
      const baseRow = document.createElement('tr');
      baseRow.className = 'table-row-baseline';
      baseRow.innerHTML = `
        <td><strong class="text-red">Baseline</strong> (Unmitigated)</td>
        <td>0 PCU/hr</td>
        <td>${base.route_travel_time_min.toFixed(1)} min</td>
        <td><span class="vc-pill vc-severe">${base.max_vc_ratio.toFixed(2)}</span></td>
        <td><span class="badge-chokepoints">${base.saturated_segments.length} segment(s)</span></td>
        <td><span class="text-dim">0 veh-hrs</span></td>
        <td><span class="status-passive">Unmitigated</span></td>
      `;
      tbody.appendChild(baseRow);

      // Candidate Scenarios Rows
      data.candidate_scenarios.forEach(sc => {
        const isRec = (sc.scenario_id === data.recommended_scenario_id);
        const vcClass = sc.max_vc_ratio >= 1.0 ? 'vc-warning' : 'vc-normal';
        const tr = document.createElement('tr');
        if (isRec) tr.className = 'table-row-recommended';

        tr.innerHTML = `
          <td>
            <strong>${sc.scenario_name.split(':')[0]}</strong>
            <div class="scenario-subname">${sc.scenario_name.split(':')[1] || ''}</div>
          </td>
          <td>${sc.assigned_demand_pcu.toFixed(0)} PCU/hr</td>
          <td>${sc.route_travel_time_min.toFixed(1)} min</td>
          <td><span class="vc-pill ${vcClass}">${sc.max_vc_ratio.toFixed(2)}</span></td>
          <td>${sc.downstream_bottlenecks.length > 0 ? `<span class="badge-bottleneck">${sc.downstream_bottlenecks.length} new</span>` : `<span class="badge-clean">0 new</span>`}</td>
          <td><strong class="text-green">${sc.delay_saved_veh_hours.toFixed(1)} veh-hrs</strong> (-${sc.delay_reduction_pct.toFixed(0)}%)</td>
          <td>
            <button type="button" class="btn-table-apply ${isRec ? 'btn-apply-rec' : ''}" data-id="${sc.scenario_id}">
              ${isRec ? 'Recommended' : 'Test'}
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    // 3. Render Recommendation Banner
    const recTitle = document.getElementById('recTitle');
    const recDesc = document.getElementById('recDesc');
    const recTradeoff = document.getElementById('recTradeoff');

    const recScenario = data.candidate_scenarios.find(s => s.scenario_id === data.recommended_scenario_id) || data.candidate_scenarios[0];
    if (recScenario) {
      if (kpiDelaySaved) kpiDelaySaved.textContent = `${recScenario.delay_saved_veh_hours.toFixed(1)} veh-hrs`;
      if (kpiSaturated) kpiSaturated.textContent = `${recScenario.elevated_risk_edges_count} Segments`;

      if (recTitle) recTitle.textContent = `Optimal: ${recScenario.scenario_name}`;
      if (recDesc) recDesc.textContent = data.recommendation_rationale;
      if (recTradeoff) recTradeoff.textContent = data.tradeoff_summary;
    }
  }

  // =========================================================================
  // 7. Render Calculated Detours & Saturated Bottlenecks on 3D Map
  // =========================================================================
  function renderDetoursOnMap(data) {
    if (!mapInstance || !data || !data.candidate_detours) return;

    // Refresh base corridors
    renderNetworkOnMap();

    const detourFeatures = [];

    // Detour 1 (Route A) - Vivid Cyan / Blue
    if (data.candidate_detours.length >= 1) {
      const d1 = data.candidate_detours[0];
      for (let i = 0; i < d1.node_path.length - 1; i++) {
        const u = currentNodesMap.get(d1.node_path[i]);
        const v = currentNodesMap.get(d1.node_path[i+1]);
        if (u && v) {
          detourFeatures.push({
            type: 'Feature',
            properties: { route: 'ROUTE_A', color: '#38bdf8' },
            geometry: { type: 'LineString', coordinates: [[u.lng, u.lat], [v.lng, v.lat]] }
          });
        }
      }
    }

    // Detour 2 (Route B) - Vivid Violet / Purple
    if (data.candidate_detours.length >= 2) {
      const d2 = data.candidate_detours[1];
      for (let i = 0; i < d2.node_path.length - 1; i++) {
        const u = currentNodesMap.get(d2.node_path[i]);
        const v = currentNodesMap.get(d2.node_path[i+1]);
        if (u && v) {
          detourFeatures.push({
            type: 'Feature',
            properties: { route: 'ROUTE_B', color: '#a855f7' },
            geometry: { type: 'LineString', coordinates: [[u.lng, u.lat], [v.lng, v.lat]] }
          });
        }
      }
    }

    const detourGeoJSON = { type: 'FeatureCollection', features: detourFeatures };

    if (mapInstance.getSource('active-detours')) {
      mapInstance.getSource('active-detours').setData(detourGeoJSON);
    } else {
      mapInstance.addSource('active-detours', {
        type: 'geojson',
        data: detourGeoJSON
      });

      mapInstance.addLayer({
        id: 'detours-pulse-layer',
        type: 'line',
        source: 'active-detours',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 6,
          'line-opacity': 0.85
        }
      });
    }

    // Smoothly pan and frame the affected corridor
    const targetEdge = currentCorridorsData.find(e => e.id === activeCorridorId);
    if (targetEdge) {
      const s = currentNodesMap.get(targetEdge.source);
      const t = currentNodesMap.get(targetEdge.target);
      if (s && t) {
        mapInstance.flyTo({
          center: [(s.lng + t.lng) / 2.0, (s.lat + t.lat) / 2.0],
          zoom: 14.5,
          pitch: 45,
          bearing: -15,
          essential: true
        });
      }
    }
  }

  // =========================================================================
  // 8. Event Handlers & Preset Interactivity
  // =========================================================================
  function setTargetCorridor(corridorId, roadName) {
    activeCorridorId = corridorId;
    const select = document.getElementById('selectCorridor');
    if (select) select.value = corridorId;
    triggerDiversionEvaluation();
  }

  // Corridor Select dropdown change
  const selectCorridor = document.getElementById('selectCorridor');
  if (selectCorridor) {
    selectCorridor.addEventListener('change', (e) => {
      activeCorridorId = e.target.value;
      triggerDiversionEvaluation();
    });
  }

  // Blockage Slider change
  const sliderBlockage = document.getElementById('sliderBlockage');
  const lblBlockagePct = document.getElementById('lblBlockagePct');
  if (sliderBlockage) {
    sliderBlockage.addEventListener('input', (e) => {
      activeBlockagePct = parseInt(e.target.value, 10);
      if (lblBlockagePct) lblBlockagePct.textContent = `${activeBlockagePct}% Blocked`;
    });
    sliderBlockage.addEventListener('change', () => {
      triggerDiversionEvaluation();
    });
  }

  // Presets
  const presetButtons = document.querySelectorAll('.preset-chip');
  presetButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      presetButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      activeCorridorId = btn.dataset.corridor;
      activeBlockagePct = parseInt(btn.dataset.block, 10);

      if (sliderBlockage) sliderBlockage.value = activeBlockagePct;
      if (lblBlockagePct) lblBlockagePct.textContent = `${activeBlockagePct}% Blocked`;
      if (selectCorridor) selectCorridor.value = activeCorridorId;

      triggerDiversionEvaluation();
    });
  });

  // Calculate Button
  const btnSimulate = document.getElementById('btnSimulateDiversion');
  if (btnSimulate) {
    btnSimulate.addEventListener('click', () => {
      triggerDiversionEvaluation();
    });
  }

  // =========================================================================
  // 9. Citizen Reports Ingestion Modal
  // =========================================================================
  const incidentModal = document.getElementById('incidentModal');
  const btnOpenCitizenFeed = document.getElementById('btnOpenCitizenFeed');
  const btnCloseIncidentModal = document.getElementById('btnCloseIncidentModal');
  const citizenFeedList = document.getElementById('citizenFeedList');
  const tabIncidentAnalysis = document.getElementById('tabIncidentAnalysis');

  function openIncidentModal() {
    if (incidentModal) incidentModal.classList.remove('hidden');
    loadCitizenReports();
  }

  function closeIncidentModal() {
    if (incidentModal) incidentModal.classList.add('hidden');
  }

  if (btnOpenCitizenFeed) btnOpenCitizenFeed.addEventListener('click', openIncidentModal);
  if (tabIncidentAnalysis) tabIncidentAnalysis.addEventListener('click', openIncidentModal);
  if (btnCloseIncidentModal) btnCloseIncidentModal.addEventListener('click', closeIncidentModal);

  async function loadCitizenReports() {
    try {
      const res = await fetch('/api/v1/intelligence/citizen-reports');
      if (!res.ok) return;
      const reports = await res.json();

      const feedBadge = document.getElementById('citizenFeedCount');
      if (feedBadge) feedBadge.textContent = reports.length;

      citizenFeedList.innerHTML = '';
      if (!reports.length) {
        citizenFeedList.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 20px;">No pending citizen reports</div>';
        return;
      }

      reports.forEach(rep => {
        const isVerified = (rep.verification_status === 'VERIFIED');
        const card = document.createElement('div');
        card.className = 'citizen-feed-card';
        card.innerHTML = `
          <div class="feed-card-header">
            <span class="feed-road-title">${rep.road_name}</span>
            <span class="feed-badge ${isVerified ? 'badge-verified' : 'badge-pending'}">${rep.verification_status}</span>
          </div>
          <div class="feed-card-desc">${rep.description} &bull; ${rep.category.replace(/_/g, ' ')} (${rep.lanes_affected} lane affected)</div>
          <div class="feed-card-actions">
            <span style="font-size: 11px; color: var(--text-dim);">${rep.report_id}</span>
            ${!isVerified ? `
              <button type="button" class="btn-action-small btn-modal-verify" data-id="${rep.report_id}" data-edge="${rep.road_segment_id}">
                Verify &amp; Simulate Diversion
              </button>
            ` : `
              <button type="button" class="btn-action-small btn-modal-load" data-edge="${rep.road_segment_id}">
                Inspect on Map
              </button>
            `}
          </div>
        `;
        citizenFeedList.appendChild(card);
      });

      document.querySelectorAll('.btn-modal-verify').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.dataset.id;
          const edge = e.currentTarget.dataset.edge;
          await fetch(`/api/v1/intelligence/citizen-reports/${id}/verify?verified=true`, { method: 'POST' });
          showToast(`Report ${id} verified. Corridor loaded into Diversion Studio.`);
          closeIncidentModal();
          activeCorridorId = edge;
          if (selectCorridor) selectCorridor.value = edge;
          triggerDiversionEvaluation();
        });
      });

      document.querySelectorAll('.btn-modal-load').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const edge = e.currentTarget.dataset.edge;
          closeIncidentModal();
          activeCorridorId = edge;
          if (selectCorridor) selectCorridor.value = edge;
          triggerDiversionEvaluation();
        });
      });

    } catch (err) {
      console.warn('Citizen modal fetch error:', err);
    }
  }

  // =========================================================================
  // 10. Global Toast Notification
  // =========================================================================
  const actionToast = document.getElementById('actionToast');
  let toastTimer = null;

  function showToast(message) {
    if (!actionToast) return;
    actionToast.textContent = message;
    actionToast.classList.remove('hidden');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      actionToast.classList.add('hidden');
    }, 3200);
  }

  // Initialize Map
  initMapLibre();

});
