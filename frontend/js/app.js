// Traffic-Diffusion — Traffic Incident Intelligence & Diversion Decision-Support
// MapLibre GL JS with Real Physical Geometry Normalization & 3D Urban Buildings
// Unified Demonstration Geography: Mangaluru Metropolitan Arterials (NH-66 / NH-73)

document.addEventListener('DOMContentLoaded', async () => {

  // =========================================================================
  // 1. Live Operational Clock
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
  let isMapReady = false;
  let pendingScenarioToRender = null;
  let activeIncidentMarker = null;
  let activeMarkers = [];
  let currentCorridorsData = [];
  let currentNodesMap = new Map();

  let activeCorridorId = 'corridor_cctv_07';
  let activeBlockagePct = 80;
  let activeDisplacedDemand = 895.0;
  let latestEvaluation = null;
  let activeSelectedScenarioId = null;

  // Window debug hooks
  window.__getMap = () => mapInstance;
  Object.defineProperty(window, '__mapInstance', { get: () => mapInstance });
  Object.defineProperty(window, '__isMapReady', { get: () => isMapReady });
  Object.defineProperty(window, '__latestEvaluation', { get: () => latestEvaluation });
  Object.defineProperty(window, '__currentCorridorsData', { get: () => currentCorridorsData });
  window.__renderScenarioOnMap = (sc) => renderScenarioOnMap(sc);
  window.__renderNetworkOnMap = () => renderNetworkOnMap();
  window.__getEdgeCoords = (id) => getEdgeCoords(id);

  // =========================================================================
  // 3. Coordinate Geometry Normalization (GeoJSON RFC 7946: [lng, lat])
  // =========================================================================
  function toGeoJSONCoords(rawCoords) {
    if (!rawCoords || !rawCoords.length) return [];
    return rawCoords.map(pt => {
      if (!Array.isArray(pt) || pt.length < 2) return null;
      const a = Number(pt[0]);
      const b = Number(pt[1]);
      if (isNaN(a) || isNaN(b)) return null;
      // In Mangaluru: latitude is ~12.8 to 13.0, longitude is ~74.8 to 75.0.
      // GeoJSON standard requires [longitude, latitude].
      // If a < b (e.g. 12.86 < 74.83), raw is [lat, lng] -> flip to [lng, lat] = [b, a].
      return (a < b) ? [b, a] : [a, b];
    }).filter(Boolean);
  }

  function getEdgeCoords(eid) {
    const edge = currentCorridorsData.find(e => e.id === eid);
    if (!edge) return null;
    if (edge.path_coordinates && edge.path_coordinates.length > 1) {
      const converted = toGeoJSONCoords(edge.path_coordinates);
      if (converted.length > 1) return converted;
    }
    const u = currentNodesMap.get(edge.source);
    const v = currentNodesMap.get(edge.target);
    if (u && v && !isNaN(u.lng) && !isNaN(u.lat) && !isNaN(v.lng) && !isNaN(v.lat)) {
      return [[u.lng, u.lat], [v.lng, v.lat]];
    }
    return null;
  }

  // =========================================================================
  // 4. MapLibre GL JS Map Initialization with 3D Buildings Extrusion
  // =========================================================================
  function initMapLibre() {
    const mapContainer = document.getElementById('liveTrafficMap');
    if (!mapContainer || typeof maplibregl === 'undefined') return;

    mapInstance = new maplibregl.Map({
      container: 'liveTrafficMap',
      style: 'https://tiles.openfreemap.org/styles/bright',
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

    function onMapReady() {
      if (isMapReady) return;
      isMapReady = true;
      try { setup3DBuildings(); } catch (e) { console.warn('3d buildings error:', e); }
      if (currentCorridorsData.length) {
        renderNetworkOnMap();
        setupJunctionMarkers();
      }
      const sc = pendingScenarioToRender || getActiveOrRecommendedScenario();
      if (sc) {
        renderScenarioOnMap(sc);
        pendingScenarioToRender = null;
      }
    }

    mapInstance.on('load', onMapReady);

    // Concurrently load network data and initial diversion evaluation
    loadMangaluruNetwork().then(() => {
      triggerDiversionEvaluation();
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
                0, '#d1d5db',
                40, '#94a3b8',
                120, '#60a5fa',
                250, '#2563eb'
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
              'fill-extrusion-opacity': 0.72
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
  // 5. Load Mangaluru Network from Backend (/api/v1/navigation/network)
  // =========================================================================
  async function loadMangaluruNetwork() {
    try {
      const res = await fetch('/api/v1/navigation/network');
      if (!res.ok) return;
      const data = await res.json();

      currentNodesMap.clear();
      data.nodes.forEach(n => currentNodesMap.set(n.id, n));
      currentCorridorsData = data.edges;

      // Sync manual demand input if empty or default
      const inputDemandEl = document.getElementById('inputBaselineDemand');
      const activeEdge = currentCorridorsData.find(e => e.id === activeCorridorId);
      if (inputDemandEl && activeEdge) {
        const lanes = activeEdge.lanes || 2;
        const nominalFlow = activeEdge.baseline_flow_veh_hr || (lanes * 900.0 * 0.7);
        if (!inputDemandEl.value) {
          inputDemandEl.value = Math.round(nominalFlow);
        }
      }

      // Update initial demand/capacity calculation strip
      updateDemandPreviewStrip();

      // Render base road network if map is already loaded
      if (isMapReady && mapInstance) {
        renderNetworkOnMap();
        setupJunctionMarkers();
        const sc = pendingScenarioToRender || getActiveOrRecommendedScenario();
        if (sc) {
          renderScenarioOnMap(sc);
          pendingScenarioToRender = null;
        }
      }

    } catch (err) {
      console.error('Failed to load Mangaluru network:', err);
    }
  }

  function renderNetworkOnMap() {
    if (!mapInstance || !isMapReady || !currentCorridorsData.length) return;

    const features = [];
    currentCorridorsData.forEach(edge => {
      const coords = getEdgeCoords(edge.id);
      if (!coords || coords.length < 2) return;

      const isTarget = (edge.id === activeCorridorId);
      let color = '#10b981'; // Green: Free Flow
      if (isTarget) {
        color = '#ef4444'; // Red: Target Incident Road
      } else if (edge.congestion_level === 'HEAVY') {
        color = '#f97316'; // Orange: Heavy Congestion
      } else if (edge.congestion_level === 'MODERATE') {
        color = '#f59e0b'; // Amber: Moderate
      } else if (edge.congestion_level === 'BLOCKED') {
        color = '#ef4444'; // Red: Blocked
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
          coordinates: coords
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

      // Background casing for corridors
      mapInstance.addLayer({
        id: 'corridors-casing',
        type: 'line',
        source: 'mng-corridors',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['case', ['get', 'isTarget'], '#fee2e2', '#0f172a'],
          'line-width': ['case', ['get', 'isTarget'], 10, 4.5],
          'line-opacity': 0.85
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
          'line-width': ['case', ['get', 'isTarget'], 6, 2.8],
          'line-opacity': 0.95
        }
      });

      mapInstance.on('click', 'corridors-core', (e) => {
        if (!e.features || !e.features.length) return;
        const prop = e.features[0].properties;
        setIncidentState(prop.id, activeBlockagePct, null, true);
      });

      mapInstance.on('mouseenter', 'corridors-core', () => {
        mapInstance.getCanvas().style.cursor = 'pointer';
      });
      mapInstance.on('mouseleave', 'corridors-core', () => {
        mapInstance.getCanvas().style.cursor = '';
      });
    }
  }

  function setupJunctionMarkers() {
    if (!mapInstance || !isMapReady || !mapInstance.isStyleLoaded()) return;

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
        .setPopup(new maplibregl.Popup({ offset: 12 }).setHTML(`<strong style="color:#0f172a; font-size:12px;">${node.name}</strong>`))
        .addTo(mapInstance);

      activeMarkers.push(marker);
    });
  }

  // =========================================================================
  // 6. Stepper & Scenario Helpers
  // =========================================================================
  function updateWorkflowStepper(currentStage) {
    const s1 = document.getElementById('stepDetect');
    const s2 = document.getElementById('stepPredict');
    const s3 = document.getElementById('stepCompare');
    const s4 = document.getElementById('stepRecommend');
    if (!s1 || !s2 || !s3 || !s4) return;

    [s1, s2, s3, s4].forEach(s => s.classList.remove('active', 'completed'));

    if (currentStage === 1) {
      s1.classList.add('active');
    } else if (currentStage === 2) {
      s1.classList.add('completed');
      s2.classList.add('active');
    } else if (currentStage === 3) {
      s1.classList.add('completed');
      s2.classList.add('completed');
      s3.classList.add('active');
    } else if (currentStage === 4) {
      s1.classList.add('completed');
      s2.classList.add('completed');
      s3.classList.add('completed');
      s4.classList.add('active');
    }
  }

  function getActiveOrRecommendedScenario() {
    if (!latestEvaluation) return null;
    if (activeSelectedScenarioId) {
      if (latestEvaluation.baseline_scenario && latestEvaluation.baseline_scenario.scenario_id === activeSelectedScenarioId) {
        return latestEvaluation.baseline_scenario;
      }
      const match = (latestEvaluation.candidate_scenarios || []).find(s => s.scenario_id === activeSelectedScenarioId);
      if (match) return match;
    }
    const recId = latestEvaluation.recommended_scenario_id;
    return (latestEvaluation.candidate_scenarios || []).find(s => s.scenario_id === recId)
      || (latestEvaluation.candidate_scenarios && latestEvaluation.candidate_scenarios[0])
      || latestEvaluation.baseline_scenario;
  }

  // =========================================================================
  // 7. Calculate & Compare Diversions (/api/v1/intelligence/interventions/evaluate)
  // =========================================================================
  async function triggerDiversionEvaluation() {
    const btnSim = document.getElementById('btnSimulateDiversion');
    if (btnSim) {
      btnSim.disabled = true;
      btnSim.innerHTML = `<span>Evaluating Network Redistribution...</span>`;
    }
    updateWorkflowStepper(2);

    const inputDemandEl = document.getElementById('inputBaselineDemand');
    const selectIncType = document.getElementById('selectIncidentType');
    const selectHoriz = document.getElementById('selectHorizon');

    const manualDemand = inputDemandEl ? parseFloat(inputDemandEl.value) : null;
    const incCategory = selectIncType ? selectIncType.value : 'COLLISION';
    const horizonMin = selectHoriz ? parseInt(selectHoriz.value, 10) : 60;

    try {
      const payload = {
        incident: {
          incident_id: `INC-MNG-${activeCorridorId.toUpperCase()}`,
          affected_edge_id: activeCorridorId,
          capacity_reduction_pct: activeBlockagePct / 100.0,
          severity: activeBlockagePct >= 80 ? 'CRITICAL' : (activeBlockagePct >= 50 ? 'HIGH' : 'MODERATE'),
          estimated_duration_min: horizonMin,
          provenance: 'ESTIMATED',
          description: `${incCategory} on ${activeCorridorId} with ${activeBlockagePct}% capacity loss`
        },
        override_blockage_pct: activeBlockagePct / 100.0,
        override_baseline_demand: (!isNaN(manualDemand) && manualDemand > 0) ? manualDemand : null,
        horizon_minutes: horizonMin
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

      // Select recommended scenario by default
      const recId = latestEvaluation.recommended_scenario_id;
      activeSelectedScenarioId = recId;
      const recScenario = (latestEvaluation.candidate_scenarios || []).find(s => s.scenario_id === recId)
        || (latestEvaluation.candidate_scenarios && latestEvaluation.candidate_scenarios[0])
        || latestEvaluation.baseline_scenario;

      if (recScenario) {
        selectScenario(recScenario.scenario_id);
      }

      updateWorkflowStepper(4);
      showToast('Incident simulation evaluated');

    } catch (err) {
      console.error('Diversion evaluation error:', err);
      showToast('Error connecting to diversion calculation engine');
    } finally {
      if (btnSim) {
        btnSim.disabled = false;
        btnSim.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>Simulate Traffic Diversion</span>
        `;
      }
    }
  }

  // =========================================================================
  // 8. Render Calculated Diversion Results into UI
  // =========================================================================
  function renderEvaluationResults(data) {
    if (!data) return;

    // Update Top KPIs with genuine data
    const kpiDisplaced = document.getElementById('kpiDisplacedDemand');
    const kpiCapacityLost = document.getElementById('kpiCapacityLost');
    const kpiSaturated = document.getElementById('kpiSaturatedCount');
    const kpiDelaySaved = document.getElementById('kpiDelaySaved');
    const kpiDelayPctTag = document.getElementById('kpiDelayPctTag');

    if (kpiDisplaced) kpiDisplaced.textContent = `${data.displaced_demand_veh_hr.toFixed(0)} PCU/hr`;

    const capLost = Math.max(0, (data.nominal_capacity_veh_hr || 0) - (data.effective_capacity_veh_hr || 0));
    if (kpiCapacityLost) kpiCapacityLost.textContent = `[${capLost.toFixed(0)} PCU/hr LOST]`;

    const provBadge = document.getElementById('provenanceBadge');
    if (provBadge && data.provenance) {
      provBadge.textContent = data.provenance;
    }

    // Demand strip in parameters box
    const lblNom = document.getElementById('lblNominalFlow');
    const lblEff = document.getElementById('lblEffectiveCap');
    const lblDisp = document.getElementById('lblDisplacedFlow');

    if (lblNom) lblNom.textContent = `${data.baseline_flow_veh_hr.toFixed(0)} PCU/hr`;
    if (lblEff) lblEff.textContent = `${data.effective_capacity_veh_hr.toFixed(0)} PCU/hr`;
    if (lblDisp) lblDisp.textContent = `${data.displaced_demand_veh_hr.toFixed(0)} PCU/hr`;

    // Downstream Ripple stats
    const rippleCorridors = document.getElementById('rippleCorridorsCount');
    const rippleQueue = document.getElementById('rippleQueueBacklog');

    const firstScen = data.candidate_scenarios && data.candidate_scenarios[0];
    if (rippleCorridors && firstScen && firstScen.segment_impacts) {
      rippleCorridors.textContent = `${firstScen.segment_impacts.length}`;
    }
    if (rippleQueue) {
      const backlogPcu = Math.round(data.displaced_demand_veh_hr * 0.75);
      rippleQueue.textContent = `${backlogPcu} PCU`;
    }

    // Render Side-by-Side Comparison Table
    const tbody = document.getElementById('matrixTableBody');
    if (tbody) {
      tbody.innerHTML = '';

      // Baseline Row
      const base = data.baseline_scenario;
      if (base) {
        const baseRow = document.createElement('tr');
        baseRow.className = 'table-row-baseline';
        baseRow.dataset.scenarioId = base.scenario_id;
        baseRow.innerHTML = `
          <td><strong style="color: #ef4444;">Baseline</strong> (Unmitigated)</td>
          <td>0 PCU/hr</td>
          <td>${base.route_travel_time_min.toFixed(1)} min</td>
          <td><span class="vc-pill vc-severe">${base.max_vc_ratio.toFixed(2)}</span></td>
          <td><span class="badge-chokepoints">${base.saturated_segments.length} segment(s)</span></td>
          <td><span style="color: var(--text-dim);">0 veh-hrs</span></td>
          <td>
            <button type="button" class="btn-table-apply" data-id="${base.scenario_id}">
              Inspect
            </button>
          </td>
        `;
        baseRow.addEventListener('click', () => selectScenario(base.scenario_id));
        tbody.appendChild(baseRow);
      }

      // Candidate Scenarios Rows
      (data.candidate_scenarios || []).forEach(sc => {
        const isRec = (sc.scenario_id === data.recommended_scenario_id);
        const vcClass = sc.max_vc_ratio >= 1.0 ? 'vc-warning' : 'vc-normal';
        const tr = document.createElement('tr');
        tr.dataset.scenarioId = sc.scenario_id;
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
          <td><strong style="color: #34d399;">${sc.delay_saved_veh_hours.toFixed(1)} veh-hrs</strong> (-${sc.delay_reduction_pct.toFixed(0)}%)</td>
          <td>
            <button type="button" class="btn-table-apply ${isRec ? 'btn-apply-rec' : ''}" data-id="${sc.scenario_id}">
              ${isRec ? 'Recommended' : 'Inspect'}
            </button>
          </td>
        `;
        tr.addEventListener('click', () => selectScenario(sc.scenario_id));
        tbody.appendChild(tr);
      });
    }

    // Recommendation Section
    const recScen = (data.candidate_scenarios || []).find(s => s.scenario_id === data.recommended_scenario_id) || firstScen;
    if (recScen) {
      if (kpiDelaySaved) kpiDelaySaved.textContent = `${recScen.delay_saved_veh_hours.toFixed(1)} veh-hrs`;
      if (kpiDelayPctTag) kpiDelayPctTag.textContent = `-${recScen.delay_reduction_pct.toFixed(0)}%`;
      if (kpiSaturated) {
        const botCount = recScen.downstream_bottlenecks.length;
        kpiSaturated.textContent = `${botCount} New Bottlenecks`;
      }

      const recTitle = document.getElementById('recTitle');
      const recDesc = document.getElementById('recDesc');
      const recTradeoff = document.getElementById('recTradeoff');
      const recRouteAllocations = document.getElementById('recRouteAllocations');

      if (recTitle) recTitle.textContent = `Optimal: ${recScen.scenario_name.split(':')[0]}`;
      if (recDesc) {
        recDesc.textContent = `Recommended Strategy: '${recScen.scenario_name}' achieves optimal network relief, saving ${recScen.delay_saved_veh_hours.toFixed(1)} vehicle-hours (-${recScen.delay_reduction_pct.toFixed(0)}% vs baseline) with peak arterial V/C at ${recScen.max_vc_ratio.toFixed(2)}.`;
      }
      if (recTradeoff) {
        const botText = recScen.downstream_bottlenecks.length === 0
          ? "Creates zero new saturated bottlenecks."
          : `Creates ${recScen.downstream_bottlenecks.length} secondary bottleneck(s): ${recScen.downstream_bottlenecks.join(', ')}.`;
        recTradeoff.textContent = `Trade-off Analysis: ${botText} Requires 2 field units (Multi-Junction VMS Signage & Dynamic Guidance).`;
      }

      if (recRouteAllocations) {
        if (data.candidate_detours && data.candidate_detours.length) {
          const splits = recScen.route_allocations || {};
          const allocHtml = data.candidate_detours.map((d, i) => {
            const pct = splits[d.title] !== undefined ? splits[d.title] : (i === 0 ? 0.62 : 0.38);
            const pcu = Math.round(recScen.assigned_demand_pcu * pct);
            const color = i === 0 ? '#0284c7' : '#9333ea';
            return `<span style="display:inline-block; margin-right: 12px; font-weight:600;"><span style="color:${color};">&bull; Route ${String.fromCharCode(65+i)} (${d.title}):</span> ${(pct*100).toFixed(0)}% (~${pcu} PCU/hr)</span>`;
          }).join('');
          recRouteAllocations.innerHTML = `<strong>Volume Allocation Split:</strong> ${allocHtml}`;
        }
      }
    }
  }

  // =========================================================================
  // 9. Scenario Selection & Map Layer Rendering
  // =========================================================================
  function selectScenario(scenarioId) {
    if (!latestEvaluation) return;
    activeSelectedScenarioId = scenarioId;

    let sc = null;
    if (latestEvaluation.baseline_scenario && latestEvaluation.baseline_scenario.scenario_id === scenarioId) {
      sc = latestEvaluation.baseline_scenario;
    } else {
      sc = (latestEvaluation.candidate_scenarios || []).find(s => s.scenario_id === scenarioId);
    }
    if (!sc) return;

    // Highlight row in comparison table
    document.querySelectorAll('#matrixTableBody tr').forEach(tr => {
      if (tr.dataset.scenarioId === scenarioId) {
        tr.classList.add('table-row-selected');
      } else {
        tr.classList.remove('table-row-selected');
      }
    });

    // Render Segment Breakdown
    renderScenarioSegmentInspector(sc);

    // Update Map with actual calculated routes for this scenario
    renderScenarioOnMap(sc);
  }

  function renderScenarioSegmentInspector(scenario) {
    const inspectorName = document.getElementById('inspectorScenarioName');
    const tbody = document.getElementById('inspectorTableBody');
    if (inspectorName) {
      inspectorName.textContent = scenario.scenario_name.split(':')[0];
    }
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!scenario.segment_impacts || !scenario.segment_impacts.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: #94a3b8; padding: 12px;">No individual segment metrics available for this scenario.</td></tr>';
      return;
    }

    scenario.segment_impacts.forEach(seg => {
      let roleClass = 'role-badge-feeder';
      let roleLabel = 'Feeder Link';
      if (seg.role === 'BLOCKED_CORRIDOR') {
        roleClass = 'role-badge-blocked';
        roleLabel = 'Blocked Road';
      } else if (seg.role === 'DETOUR_ROUTE') {
        roleClass = 'role-badge-detour';
        roleLabel = 'Detour Path';
      }

      let vcClass = 'vc-normal';
      if (seg.vc_ratio >= 1.0) vcClass = 'vc-warning';
      else if (seg.vc_ratio >= 0.85) vcClass = 'vc-moderate';

      let statusBadge = '<span class="badge-clean">Flows OK</span>';
      if (seg.is_new_bottleneck) {
        statusBadge = '<span class="badge-bottleneck">New Bottleneck</span>';
      } else if (seg.is_saturated) {
        statusBadge = '<span class="badge-chokepoints">Saturated</span>';
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${seg.name}</strong></td>
        <td><span class="role-badge ${roleClass}">${roleLabel}</span></td>
        <td>${seg.assigned_flow_pcu.toFixed(0)} PCU/hr</td>
        <td>${seg.capacity_pcu.toFixed(0)} PCU/hr</td>
        <td><span style="color: ${seg.reserve_capacity_pcu <= 0 ? '#f43f5e' : '#4ade80'}; font-weight: 600;">${seg.reserve_capacity_pcu.toFixed(0)} PCU/hr</span></td>
        <td><span class="vc-pill ${vcClass}">${seg.vc_ratio.toFixed(2)}</span></td>
        <td>${statusBadge}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderScenarioOnMap(scenario) {
    if (!scenario) scenario = getActiveOrRecommendedScenario();
    if (!scenario || !latestEvaluation) return;
    if (!mapInstance || !isMapReady) {
      pendingScenarioToRender = scenario;
      return;
    }
    pendingScenarioToRender = null;

    // Refresh base corridors
    renderNetworkOnMap();

    const overlayFeatures = [];
    const allRoutePoints = [];

    // 1. INCIDENT ROAD (Bold RED with Casing & Pulsing Pin)
    const targetEdge = currentCorridorsData.find(e => e.id === activeCorridorId);
    if (targetEdge) {
      const incCoords = getEdgeCoords(targetEdge.id);
      if (incCoords && incCoords.length > 1) {
        overlayFeatures.push({
          type: 'Feature',
          properties: {
            routeType: 'INCIDENT',
            color: '#ef4444',
            width: 7.5,
            name: targetEdge.name,
            desc: `Active Disruption: ${targetEdge.name} (${activeBlockagePct}% Blocked)`
          },
          geometry: { type: 'LineString', coordinates: incCoords }
        });
        incCoords.forEach(pt => allRoutePoints.push(pt));

        // Pulsing Incident Pin at midpoint
        const midIdx = Math.floor(incCoords.length / 2);
        const midPt = incCoords[midIdx];
        if (midPt) {
          if (activeIncidentMarker) activeIncidentMarker.remove();
          const markerEl = document.createElement('div');
          markerEl.className = 'map-incident-pin';
          markerEl.title = `Active Incident: ${targetEdge.name}`;
          markerEl.innerHTML = `<span class="pin-pulse"></span><span class="pin-core">!</span>`;

          const dispPcu = Math.round(latestEvaluation.displaced_demand_veh_hr || activeDisplacedDemand);
          const popupContent = `
            <div style="font-family: var(--font-sans); padding: 4px 6px;">
              <div style="font-weight: 700; color: #ef4444; font-size: 11px; text-transform: uppercase;">Active Road Incident</div>
              <div style="font-weight: 600; color: #0f172a; font-size: 12px; margin: 2px 0;">${targetEdge.name}</div>
              <div style="font-size: 11px; color: #64748b;">${activeBlockagePct}% Blockage &bull; ${dispPcu} PCU/hr Displaced Demand</div>
            </div>
          `;
          activeIncidentMarker = new maplibregl.Marker({ element: markerEl, offset: [0, -4] })
            .setLngLat(midPt)
            .setPopup(new maplibregl.Popup({ offset: 12 }).setHTML(popupContent))
            .addTo(mapInstance);
        }
      }
    }

    // 2. CANDIDATE DETOUR ROUTES (Route A: Cyan #0284c7, Route B: Purple #9333ea)
    const scenId = scenario ? scenario.scenario_id : 'scenario_capacity_split';
    const isCapacitySplit = (scenId === 'scenario_capacity_split');
    const isDetour1 = (scenId === 'scenario_detour_1' || scenId === 'scenario_metered_corridor');
    const isDetour2 = (scenId === 'scenario_detour_2');

    // Route A (Detour 1)
    if ((isCapacitySplit || isDetour1) && latestEvaluation.candidate_detours && latestEvaluation.candidate_detours.length >= 1) {
      const d1 = latestEvaluation.candidate_detours[0];
      if (d1.edge_ids) {
        d1.edge_ids.forEach(eid => {
          const coords = getEdgeCoords(eid);
          if (coords && coords.length > 1) {
            overlayFeatures.push({
              type: 'Feature',
              properties: {
                routeType: 'ROUTE_A',
                color: '#0284c7',
                width: isCapacitySplit ? 5.5 : 6.5,
                name: d1.title,
                desc: `Alternative Route A: ${d1.title}`
              },
              geometry: { type: 'LineString', coordinates: coords }
            });
            coords.forEach(pt => allRoutePoints.push(pt));
          }
        });
      }
    }

    // Route B (Detour 2)
    if ((isCapacitySplit || isDetour2) && latestEvaluation.candidate_detours && latestEvaluation.candidate_detours.length >= 2) {
      const d2 = latestEvaluation.candidate_detours[1];
      if (d2.edge_ids) {
        d2.edge_ids.forEach(eid => {
          const coords = getEdgeCoords(eid);
          if (coords && coords.length > 1) {
            overlayFeatures.push({
              type: 'Feature',
              properties: {
                routeType: 'ROUTE_B',
                color: '#9333ea',
                width: isCapacitySplit ? 5.0 : 6.5,
                name: d2.title,
                desc: `Alternative Route B: ${d2.title}`
              },
              geometry: { type: 'LineString', coordinates: coords }
            });
            coords.forEach(pt => allRoutePoints.push(pt));
          }
        });
      }
    }

    // Route C (Detour 3)
    const isDetour3 = (scenId === 'scenario_detour_3');
    if ((isCapacitySplit || isDetour3) && latestEvaluation.candidate_detours && latestEvaluation.candidate_detours.length >= 3) {
      const d3 = latestEvaluation.candidate_detours[2];
      if (d3.edge_ids) {
        d3.edge_ids.forEach(eid => {
          const coords = getEdgeCoords(eid);
          if (coords && coords.length > 1) {
            overlayFeatures.push({
              type: 'Feature',
              properties: {
                routeType: 'ROUTE_C',
                color: '#10b981',
                width: isCapacitySplit ? 4.8 : 6.5,
                name: d3.title,
                desc: `Alternative Route C: ${d3.title}`
              },
              geometry: { type: 'LineString', coordinates: coords }
            });
            coords.forEach(pt => allRoutePoints.push(pt));
          }
        });
      }
    }

    // 3. DOWNSTREAM BOTTLENECKS (Amber/Orange #ea580c)
    if (scenario && scenario.downstream_bottlenecks && scenario.downstream_bottlenecks.length) {
      scenario.downstream_bottlenecks.forEach(botName => {
        const botEdge = currentCorridorsData.find(e => e.name === botName);
        if (botEdge) {
          const coords = getEdgeCoords(botEdge.id);
          if (coords && coords.length > 1) {
            overlayFeatures.push({
              type: 'Feature',
              properties: {
                routeType: 'BOTTLENECK',
                color: '#ea580c',
                width: 6.5,
                name: botEdge.name,
                desc: `Downstream Bottleneck: ${botEdge.name} (Capacity Constrained)`
              },
              geometry: { type: 'LineString', coordinates: coords }
            });
            coords.forEach(pt => allRoutePoints.push(pt));
          }
        }
      });
    }

    const overlayGeoJSON = { type: 'FeatureCollection', features: overlayFeatures };

    if (mapInstance.getSource('active-scenario-routes')) {
      mapInstance.getSource('active-scenario-routes').setData(overlayGeoJSON);
    } else {
      mapInstance.addSource('active-scenario-routes', {
        type: 'geojson',
        data: overlayGeoJSON
      });

      // White casing behind overlay routes
      mapInstance.addLayer({
        id: 'scenario-routes-casing',
        type: 'line',
        source: 'active-scenario-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['+', ['get', 'width'], 3.5],
          'line-opacity': 0.95
        }
      });

      // Sharp Core Line for overlay routes
      mapInstance.addLayer({
        id: 'scenario-routes-core',
        type: 'line',
        source: 'active-scenario-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': 0.95
        }
      });

      // Popup on clicking scenario route
      mapInstance.on('click', 'scenario-routes-core', (e) => {
        if (!e.features || !e.features.length) return;
        const p = e.features[0].properties;
        new maplibregl.Popup({ offset: 10 })
          .setLngLat(e.lngLat)
          .setHTML(`<strong style="font-family:sans-serif; font-size:12px; color:#0f172a;">${p.desc}</strong>`)
          .addTo(mapInstance);
      });

      mapInstance.on('mouseenter', 'scenario-routes-core', () => {
        mapInstance.getCanvas().style.cursor = 'pointer';
      });
      mapInstance.on('mouseleave', 'scenario-routes-core', () => {
        mapInstance.getCanvas().style.cursor = '';
      });
    }

    // Automatically fit bounds so the incident and detour routes are centered and visible!
    if (allRoutePoints.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      allRoutePoints.forEach(pt => bounds.extend(pt));
      mapInstance.fitBounds(bounds, {
        padding: { top: 40, bottom: 40, left: 40, right: 40 },
        maxZoom: 15.2,
        duration: 700
      });
    }
  }

  function renderDetoursOnMap(evalData) {
    const sc = getActiveOrRecommendedScenario();
    if (sc) {
      renderScenarioOnMap(sc);
    }
  }

  // =========================================================================
  // 10. Unified Incident State Management & Event Handlers
  // =========================================================================
  function updateDemandPreviewStrip() {
    const edge = currentCorridorsData.find(e => e.id === activeCorridorId);
    const lanes = (edge && edge.lanes) ? edge.lanes : 2;
    const nominalCap = lanes * 900.0;
    const nominalBaseFlow = (edge && edge.baseline_flow_veh_hr) ? edge.baseline_flow_veh_hr : (nominalCap * 0.7);

    const inputDemandEl = document.getElementById('inputBaselineDemand');
    const lblNominalHint = document.getElementById('lblNominalBaselineHint');
    if (lblNominalHint) {
      lblNominalHint.textContent = `Nominal: ${Math.round(nominalBaseFlow)} PCU/hr`;
    }

    let actualInflow = nominalBaseFlow;
    if (inputDemandEl) {
      const val = parseFloat(inputDemandEl.value);
      if (!isNaN(val) && val > 0) {
        actualInflow = val;
      } else if (!inputDemandEl.value) {
        inputDemandEl.value = Math.round(nominalBaseFlow);
      }
    }

    const effCap = Math.max(0, nominalCap * (1.0 - (activeBlockagePct / 100.0)));
    const dispDemand = Math.max(0, actualInflow - effCap);

    activeDisplacedDemand = dispDemand;

    const lblNom = document.getElementById('lblNominalFlow');
    const lblEff = document.getElementById('lblEffectiveCap');
    const lblDisp = document.getElementById('lblDisplacedFlow');

    if (lblNom) lblNom.textContent = `${Math.round(actualInflow)} PCU/hr`;
    if (lblEff) lblEff.textContent = `${Math.round(effCap)} PCU/hr`;
    if (lblDisp) lblDisp.textContent = `${Math.round(dispDemand)} PCU/hr`;
  }

  function setIncidentState(newCorridorId, newBlockagePct, newDemand = null, shouldTriggerEval = true) {
    const corridorChanged = (newCorridorId && newCorridorId !== activeCorridorId);
    if (newCorridorId) activeCorridorId = newCorridorId;
    if (newBlockagePct !== undefined && newBlockagePct !== null) {
      activeBlockagePct = parseInt(newBlockagePct, 10);
    }

    // 1. Sync corridor dropdown
    const select = document.getElementById('selectCorridor');
    if (select && select.value !== activeCorridorId) {
      select.value = activeCorridorId;
    }

    // 2. Sync demand input: if corridor changed and no manual override passed, reset to nominal baseline
    const inputDemandEl = document.getElementById('inputBaselineDemand');
    if (inputDemandEl) {
      if (newDemand !== null && !isNaN(newDemand)) {
        inputDemandEl.value = Math.round(newDemand);
      } else if (corridorChanged) {
        const edge = currentCorridorsData.find(e => e.id === activeCorridorId);
        const lanes = (edge && edge.lanes) ? edge.lanes : 2;
        const nominalFlow = (edge && edge.baseline_flow_veh_hr) ? edge.baseline_flow_veh_hr : (lanes * 900.0 * 0.7);
        inputDemandEl.value = Math.round(nominalFlow);
      }
    }

    // 3. Sync slider & readout
    const slider = document.getElementById('sliderBlockage');
    const lbl = document.getElementById('lblBlockagePct');
    if (slider) slider.value = activeBlockagePct;
    if (lbl) lbl.textContent = `${activeBlockagePct}% Blocked`;

    // 4. Sync severity quick-chips
    const severityBtns = document.querySelectorAll('.severity-chip');
    severityBtns.forEach(btn => {
      const bPct = parseInt(btn.dataset.block, 10);
      if (bPct === activeBlockagePct) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 5. Update demand & capacity preview strip immediately
    updateDemandPreviewStrip();

    // 6. Update workflow stepper to Stage 1 (Detect)
    updateWorkflowStepper(1);

    // 7. Refresh base corridors so the new target corridor is highlighted in red
    if (isMapReady && mapInstance && mapInstance.isStyleLoaded()) {
      renderNetworkOnMap();
    }

    // 8. Trigger evaluation if requested
    if (shouldTriggerEval) {
      triggerDiversionEvaluation();
    }
  }

  // Corridor Select dropdown change
  const selectCorridor = document.getElementById('selectCorridor');
  if (selectCorridor) {
    selectCorridor.addEventListener('change', (e) => {
      setIncidentState(e.target.value, activeBlockagePct, null, true);
    });
  }

  // Incident Category change
  const selectIncidentType = document.getElementById('selectIncidentType');
  const lblSeverityTag = document.getElementById('lblSeverityTag');
  if (selectIncidentType) {
    selectIncidentType.addEventListener('change', (e) => {
      if (lblSeverityTag) {
        const cat = e.target.value;
        if (cat === 'COLLISION') lblSeverityTag.textContent = 'CRITICAL IMPACT';
        else if (cat === 'BREAKDOWN') lblSeverityTag.textContent = 'HIGH IMPACT';
        else if (cat === 'WATERLOGGING') lblSeverityTag.textContent = 'HIGH IMPACT';
        else if (cat === 'ROADWORK') lblSeverityTag.textContent = 'MODERATE IMPACT';
        else if (cat === 'VIP_MOVEMENT') lblSeverityTag.textContent = 'HIGH PRIORITY';
        else if (cat === 'SURGE') lblSeverityTag.textContent = 'DEMAND SURGE';
      }
      triggerDiversionEvaluation();
    });
  }

  // Inflow Demand Input
  const inputBaselineDemand = document.getElementById('inputBaselineDemand');
  if (inputBaselineDemand) {
    inputBaselineDemand.addEventListener('input', () => {
      updateDemandPreviewStrip();
    });
    inputBaselineDemand.addEventListener('change', () => {
      updateDemandPreviewStrip();
      triggerDiversionEvaluation();
    });
  }

  // Reset Demand Button
  const btnResetDemand = document.getElementById('btnResetDemand');
  if (btnResetDemand) {
    btnResetDemand.addEventListener('click', () => {
      const edge = currentCorridorsData.find(e => e.id === activeCorridorId);
      const lanes = (edge && edge.lanes) ? edge.lanes : 2;
      const nominalFlow = (edge && edge.baseline_flow_veh_hr) ? edge.baseline_flow_veh_hr : (lanes * 900.0 * 0.7);
      if (inputBaselineDemand) {
        inputBaselineDemand.value = Math.round(nominalFlow);
      }
      updateDemandPreviewStrip();
      triggerDiversionEvaluation();
    });
  }

  // Simulation Horizon Select
  const selectHorizon = document.getElementById('selectHorizon');
  if (selectHorizon) {
    selectHorizon.addEventListener('change', () => {
      triggerDiversionEvaluation();
    });
  }

  // Severity Quick-Chips
  const severityButtons = document.querySelectorAll('.severity-chip');
  severityButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const bPct = parseInt(btn.dataset.block, 10);
      setIncidentState(activeCorridorId, bPct, null, true);
    });
  });

  // Blockage Slider change
  const sliderBlockage = document.getElementById('sliderBlockage');
  if (sliderBlockage) {
    sliderBlockage.addEventListener('input', (e) => {
      setIncidentState(activeCorridorId, e.target.value, null, false);
    });
    sliderBlockage.addEventListener('change', (e) => {
      setIncidentState(activeCorridorId, e.target.value, null, true);
    });
  }

  // Simulate Button
  const btnSimulate = document.getElementById('btnSimulateDiversion');
  if (btnSimulate) {
    btnSimulate.addEventListener('click', () => {
      triggerDiversionEvaluation();
    });
  }

  // =========================================================================
  // 11. Global Toast Notification
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
