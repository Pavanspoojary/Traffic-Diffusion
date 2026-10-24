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
  let activeMarkers = [];
  let currentCorridorsData = [];
  let currentNodesMap = new Map();
  let availableIncidents = [];
  let activeIncidentId = null;

  let activeCorridorId = null;
  let activeBlockagePct = 0;
  let activeDisplacedDemand = 0;
  let latestEvaluation = null;
  let activeSelectedScenarioId = null;

  // Window debug hooks
  window.__getMap = () => mapInstance;
  Object.defineProperty(window, '__mapInstance', { get: () => mapInstance });
  Object.defineProperty(window, '__isMapReady', { get: () => isMapReady });
  Object.defineProperty(window, '__latestEvaluation', { get: () => latestEvaluation });
  Object.defineProperty(window, '__currentCorridorsData', { get: () => currentCorridorsData });
  Object.defineProperty(window, '__availableIncidents', { get: () => availableIncidents });
  window.__selectIncident = (id, shouldTriggerEval = false) => selectIncident(id, shouldTriggerEval);
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

  function geoPointGapMeters(a, b) {
    if (!a || !b) return Infinity;
    const meanLat = ((a[1] + b[1]) / 2) * Math.PI / 180;
    const dx = (a[0] - b[0]) * 111320 * Math.cos(meanLat);
    const dy = (a[1] - b[1]) * 111320;
    return Math.hypot(dx, dy);
  }

  function snapIncidentToRoad(coords, lat, lng, maxDistanceMeters = 80) {
    if (!coords || coords.length < 2 || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const metersPerDegree = 111320;
    const xScale = metersPerDegree * Math.cos(lat * Math.PI / 180);
    const yScale = metersPerDegree;
    const segmentLengths = [];
    let totalLength = 0;
    let best = null;

    for (let i = 0; i < coords.length - 1; i += 1) {
      const [lng1, lat1] = coords[i];
      const [lng2, lat2] = coords[i + 1];
      const ax = (lng1 - lng) * xScale;
      const ay = (lat1 - lat) * yScale;
      const bx = (lng2 - lng) * xScale;
      const by = (lat2 - lat) * yScale;
      const dx = bx - ax;
      const dy = by - ay;
      const segmentLength = Math.hypot(dx, dy);
      const t = segmentLength ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (segmentLength * segmentLength))) : 0;
      const snappedLng = lng1 + (lng2 - lng1) * t;
      const snappedLat = lat1 + (lat2 - lat1) * t;
      const distanceMeters = Math.hypot(ax + dx * t, ay + dy * t);
      segmentLengths.push(segmentLength);
      if (!best || distanceMeters < best.distanceMeters) {
        best = { coordinate: [snappedLng, snappedLat], distanceMeters, segmentIndex: i, segmentT: t };
      }
      totalLength += segmentLength;
    }

    if (!best || best.distanceMeters > maxDistanceMeters || totalLength === 0) return null;
    const before = segmentLengths.slice(0, best.segmentIndex).reduce((sum, length) => sum + length, 0);
    best.fraction = (before + segmentLengths[best.segmentIndex] * best.segmentT) / totalLength;
    return best;
  }

  function getIncidentRoadPosition(incident, coords = getEdgeCoords(incident?.affected_edge_id)) {
    if (!incident || incident.lat == null || incident.lng == null || !coords) return null;
    if (!Number.isFinite(Number(incident.lat)) || !Number.isFinite(Number(incident.lng))) return null;
    return snapIncidentToRoad(coords, Number(incident.lat), Number(incident.lng));
  }

  function getBlockedRoadSection(coords, startFraction = 0.42, endFraction = 0.58) {
    if (!coords || coords.length < 2) return coords || [];
    const lengths = [];
    let totalLength = 0;
    for (let i = 1; i < coords.length; i += 1) {
      const [lng1, lat1] = coords[i - 1];
      const [lng2, lat2] = coords[i];
      const meanLat = (lat1 + lat2) * Math.PI / 360;
      const length = Math.hypot((lng2 - lng1) * Math.cos(meanLat), lat2 - lat1);
      lengths.push(length);
      totalLength += length;
    }
    if (!totalLength) return coords.slice(0, 2);

    const pointAt = fraction => {
      let remaining = totalLength * fraction;
      for (let i = 0; i < lengths.length; i += 1) {
        if (remaining <= lengths[i] || i === lengths.length - 1) {
          const ratio = lengths[i] ? remaining / lengths[i] : 0;
          const [lng1, lat1] = coords[i];
          const [lng2, lat2] = coords[i + 1];
          return [lng1 + (lng2 - lng1) * ratio, lat1 + (lat2 - lat1) * ratio];
        }
        remaining -= lengths[i];
      }
      return coords[coords.length - 1];
    };

    const startDistance = totalLength * startFraction;
    const endDistance = totalLength * endFraction;
    const section = [pointAt(startFraction)];
    let traversed = 0;
    for (let i = 0; i < lengths.length; i += 1) {
      traversed += lengths[i];
      if (traversed > startDistance && traversed < endDistance) section.push(coords[i + 1]);
    }
    section.push(pointAt(endFraction));
    return section;
  }

  // =========================================================================
  // 4. MapLibre GL JS Map Initialization with 3D Buildings Extrusion
  // =========================================================================
  function initMapLibre() {
    const mapContainer = document.getElementById('liveTrafficMap');
    if (!mapContainer || typeof maplibregl === 'undefined') return;

    try {
      mapInstance = new maplibregl.Map({
        container: 'liveTrafficMap',
        style: 'https://tiles.openfreemap.org/styles/bright',
        center: [74.858, 12.876],
        zoom: 14.4,
        pitch: 28,
        bearing: 0,
        canvasContextAttributes: { antialias: true }
      });

      mapInstance.addControl(
        new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }),
        'top-left'
      );

      function onMapReady() {
        if (isMapReady) return;
        isMapReady = true;
        mapInstance.resize();
        try { setup3DBuildings(); } catch (e) { console.warn('3d buildings error:', e); }
        if (currentCorridorsData.length) {
          renderNetworkOnMap();
          renderIncidentPinsOnMap();
        }
        const sc = pendingScenarioToRender || getActiveOrRecommendedScenario();
        if (sc) {
          renderScenarioOnMap(sc);
          pendingScenarioToRender = null;
        }
      }

      mapInstance.on('load', onMapReady);
    } catch (e) {
      console.warn('MapLibre WebGL initialization failed (fallback to data view):', e);
    }
  }

  // 3D Buildings Extrusion (per https://maplibre.org/maplibre-gl-js/docs/examples/display-buildings-in-3d/)
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

      const actualSource = mapInstance.getSource('openmaptiles') ? 'openmaptiles' : 'openfreemap';

      if (!mapInstance.getLayer('3d-buildings')) {
        mapInstance.addLayer(
          {
            id: '3d-buildings',
            source: actualSource,
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 13.5,
            paint: {
              'fill-extrusion-color': '#cbd5e1',
              'fill-extrusion-height': [
                'interpolate',
                ['linear'],
                ['zoom'],
                13.5, 0,
                14.5, ['get', 'render_height']
              ],
              'fill-extrusion-base': [
                'interpolate',
                ['linear'],
                ['zoom'],
                13.5, 0,
                14.5, ['get', 'render_min_height']
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
    renderBlockedSegmentOnMap();
  }

  function renderBlockedSegmentOnMap() {
    if (!mapInstance || !isMapReady) return;
    const incident = availableIncidents.find(item => item.incident_id === activeIncidentId);
    const coords = incident ? getEdgeCoords(incident.affected_edge_id) : null;
    const position = getIncidentRoadPosition(incident, coords);
    const halfWidth = 0.025;
    const start = position ? Math.max(0, position.fraction - halfWidth) : 0;
    const end = position ? Math.min(1, position.fraction + halfWidth) : 0;
    const section = position && coords?.length > 1 ? getBlockedRoadSection(coords, start, end) : [];
    const data = {
      type: 'FeatureCollection',
      features: section.length > 1 ? [{
        type: 'Feature',
        properties: { roadName: currentCorridorsData.find(edge => edge.id === activeCorridorId)?.name || 'Selected road' },
        geometry: { type: 'LineString', coordinates: section }
      }] : []
    };
    if (mapInstance.getSource('blocked-road-section')) {
      mapInstance.getSource('blocked-road-section').setData(data);
      return;
    }
    mapInstance.addSource('blocked-road-section', { type: 'geojson', data });
    mapInstance.addLayer({
      id: 'blocked-road-casing',
      type: 'line',
      source: 'blocked-road-section',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': 0.96 }
    });
    mapInstance.addLayer({
      id: 'blocked-road-core',
      type: 'line',
      source: 'blocked-road-section',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#ef4444', 'line-width': 6, 'line-opacity': 1 }
    });
  }

  function setSimulationResultsVisible(visible) {
    document.querySelectorAll('.simulation-results').forEach(section => {
      section.hidden = !visible;
    });
    document.querySelectorAll('.simulation-legend').forEach(item => {
      if (!visible) {
        item.hidden = true;
      } else if (!item.classList.contains('route-legend-control')) {
        item.hidden = false;
      }
    });
  }

  function clearSimulationResults() {
    latestEvaluation = null;
    activeSelectedScenarioId = null;
    setSimulationResultsVisible(false);
    const routeSource = mapInstance?.getSource('active-scenario-routes');
    if (routeSource) routeSource.setData({ type: 'FeatureCollection', features: [] });
    ['routeLegendA', 'routeLegendB', 'routeLegendC'].forEach(id => {
      const legend = document.getElementById(id);
      if (legend) {
        legend.classList.remove('active');
        legend.setAttribute('aria-pressed', 'false');
      }
    });
    if (isMapReady && availableIncidents.length) renderIncidentPinsOnMap();
  }

  function setIncidentControlsEnabled(enabled) {
    ['inputBaselineDemand', 'btnResetDemand', 'sliderBlockage', 'selectHorizon', 'btnSimulateDiversion']
      .forEach(id => {
        const control = document.getElementById(id);
        if (control) control.disabled = !enabled;
      });
    document.querySelectorAll('.severity-chip').forEach(button => {
      button.disabled = !enabled;
    });
  }

  // Interactive Incident Pins & Popups on 3D Map
  let activeIncidentPins = [];

  function renderIncidentPinsOnMap() {
    if (!mapInstance || !isMapReady || !availableIncidents.length) return;

    activeIncidentPins.forEach(m => m.remove());
    activeIncidentPins = [];

    // Keep the incident queue available before simulation. Once a plan is
    // being inspected, show only its incident so nearby reports cannot look
    // like stray blockage markers on the selected route.
    const incidentsToRender = latestEvaluation && activeIncidentId
      ? availableIncidents.filter(incident => incident.incident_id === activeIncidentId)
      : availableIncidents;
    incidentsToRender.forEach((inc) => {
      const edge = currentCorridorsData.find(e => e.id === inc.affected_edge_id);
      if (!edge) return;
      const coords = getEdgeCoords(edge.id);
      if (!coords || !coords.length) return;

      const roadPosition = getIncidentRoadPosition(inc, coords);
      if (!roadPosition) return;
      const incidentCoord = roadPosition.coordinate;

      const isSelected = Boolean(activeIncidentId && inc.incident_id === activeIncidentId);
      const isDeployed = activeDeployedDiversions.has(inc.incident_id);

      const sev = (inc.severity || 'HIGH').toUpperCase();
      const sevClass = sev === 'CRITICAL' ? 'sev-critical' : (sev === 'HIGH' ? 'sev-high' : 'sev-moderate');
      const blockPct = Math.round((inc.capacity_reduction_pct || 0.8) * 100);

      const lanes = edge.lanes || 2;
      const nominalCap = lanes * 900.0;
      const baseFlow = edge.baseline_flow_veh_hr || (nominalCap * 0.7);
      const dispDemand = Math.round(Math.max(0, baseFlow - (nominalCap * (1 - blockPct / 100))));

      const el = document.createElement('div');
      el.className = `maplibre-incident-marker sev-${sev.toLowerCase()} ${isSelected ? 'selected' : ''}`;
      el.title = `${inc.road_name}: ${inc.description || 'Active Incident'}`;
      el.innerHTML = `
        <span class="maplibre-incident-marker-pulse"></span>
        <div class="maplibre-incident-marker-inner">!</div>
      `;

      const deployBadgeHtml = isDeployed ? `<div style="margin-top:6px; font-size:10px; font-weight:800; color:#34d399; background:rgba(16,185,129,0.15); padding:2px 6px; border-radius:3px; text-align:center;">DIVERSION ACTIVE ON PUBLIC MAP</div>` : '';

      const popupHtml = `
        <div class="incident-map-popup">
          <div class="incident-map-popup-header">
            <span class="incident-map-popup-badge ${sevClass}">${sev} &bull; ${blockPct}% CAPACITY LOSS</span>
            <span class="incident-map-popup-id">${inc.incident_id.replace('INC-MNG-', 'INC-')}</span>
          </div>
          <div class="incident-map-popup-title">${inc.road_name.split(' (')[0]}</div>
          <div class="incident-map-popup-cause">${inc.description || 'Arterial blockage obstructing vehicle flow.'}</div>
          <div class="incident-map-popup-stats">Affected road · red section marks the estimated blockage.</div>
          <div class="incident-map-popup-stats">${Math.round(baseFlow)} Inflow &bull; ~${dispDemand} Displaced</div>
          <button type="button" class="btn-map-popup-simulate ${isSelected ? 'active' : ''}" onclick="window.__selectIncident('${inc.incident_id}', false)">
            ${isSelected ? 'Incident selected' : 'Inspect incident'}
          </button>
          ${deployBadgeHtml}
        </div>
      `;

      const popup = new maplibregl.Popup({
        anchor: 'left',
        offset: 14,
        closeButton: true,
        closeOnClick: false,
        className: 'maplibre-dark-popup'
      }).setHTML(popupHtml);

      // The pin tip, rather than the center of the badge, sits on the snapped
      // incident coordinate so the operator can see the exact affected point.
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(incidentCoord)
        .setPopup(popup)
        .addTo(mapInstance);

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        selectIncident(inc.incident_id, false);
      });

      marker._incidentId = inc.incident_id;
      activeIncidentPins.push(marker);

    });
  }

  function setupJunctionMarkers() {
    // Kept minimal to avoid cluttering 3D map
    activeMarkers.forEach(m => m.remove());
    activeMarkers = [];
  }

  // =========================================================================
  // 6. Stepper & Scenario Helpers
  // =========================================================================
  function updateWorkflowStepper(currentStage) {
    // Stepper removed for a cleaner minimal operations header
    return;
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
    if (!activeIncidentId || !activeCorridorId) {
      showToast('Select an incident before running a simulation');
      return;
    }
    clearSimulationResults();
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
        const errorBody = await res.text();
        console.error(`Diversion calculation failed (${res.status}):`, errorBody);
        showToast(`Simulation failed (${res.status}); please retry`);
        return;
      }

      latestEvaluation = await res.json();
      renderEvaluationResults(latestEvaluation);
      setSimulationResultsVisible(true);
      renderIncidentPinsOnMap();
      const simulationHint = document.getElementById('simulationHint');
      if (simulationHint) {
        const searchedRoutes = Number(latestEvaluation.routes_evaluated_count) || 0;
        const practicalRoutes = Number(latestEvaluation.viable_detours_count) || 0;
        const routeWord = practicalRoutes === 1 ? 'practical route' : 'practical routes';
        simulationHint.textContent = `Simulation complete. Found ${practicalRoutes} ${routeWord} from ${searchedRoutes} network paths. The map shows one selected route at a time.`;
      }
      // Select recommended scenario by default
      const topScenarios = [...(latestEvaluation.candidate_scenarios || [])]
        .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
        .slice(0, 3);
      const recScenario = topScenarios.find(s => s.scenario_id === latestEvaluation.recommended_scenario_id)
        || topScenarios[0]
        || latestEvaluation.baseline_scenario;

      if (recScenario) {
        activeSelectedScenarioId = recScenario.scenario_id;
        selectScenario(recScenario.scenario_id);
      }

      updateWorkflowStepper(4);
      showToast('Incident simulation evaluated');

    } catch (err) {
      console.error('Diversion evaluation error:', err);
      showToast('Error connecting to diversion calculation engine');
    } finally {
      if (btnSim) {
        btnSim.disabled = !activeIncidentId;
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

    // Demand strip in parameters box
    const lblNom = document.getElementById('lblNominalFlow');
    const lblEff = document.getElementById('lblEffectiveCap');
    const lblDisp = document.getElementById('lblDisplacedFlow');

    if (lblNom) lblNom.textContent = `${data.baseline_flow_veh_hr.toFixed(0)} PCU/hr`;
    if (lblEff) lblEff.textContent = `${data.effective_capacity_veh_hr.toFixed(0)} PCU/hr`;
    if (lblDisp) lblDisp.textContent = `${data.displaced_demand_veh_hr.toFixed(0)} PCU/hr`;

    // Render Side-by-Side Comparison Table
    const tbody = document.getElementById('matrixTableBody');
    if (tbody) {
      tbody.innerHTML = '';

      // Candidate Scenarios Rows
      const topScenarios = [...(data.candidate_scenarios || [])]
        .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
        .slice(0, 3);
      topScenarios.forEach(sc => {
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
    const topScenarios = [...(data.candidate_scenarios || [])]
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
      .slice(0, 3);
    const recScen = topScenarios.find(s => s.scenario_id === data.recommended_scenario_id) || topScenarios[0];
    if (recScen) {
      const recTitle = document.getElementById('recTitle');
      const recDesc = document.getElementById('recDesc');
      const recTradeoff = document.getElementById('recTradeoff');
      const recRouteAllocations = document.getElementById('recRouteAllocations');

      if (recTitle) recTitle.textContent = `Action Plan: ${recScen.scenario_name.split(':')[0]}`;
      if (recDesc) {
        recDesc.innerHTML = `<strong>Immediate Operational Action:</strong> Execute '${recScen.scenario_name}' to disperse incident queue. Saves <strong>${recScen.delay_saved_veh_hours.toFixed(1)} vehicle-hours</strong> (-${recScen.delay_reduction_pct.toFixed(0)}% delay) with peak arterial V/C bounded at <strong>${recScen.max_vc_ratio.toFixed(2)}</strong>.`;
      }
      if (recTradeoff) {
        const botText = recScen.downstream_bottlenecks.length === 0
          ? "Anti-Jam Verified: Zero secondary bottlenecks created."
          : `Secondary Bottlenecks Alert: ${recScen.downstream_bottlenecks.length} constrained link(s): ${recScen.downstream_bottlenecks.join(', ')}.`;
        recTradeoff.textContent = `Operational Impact: ${botText} Dispatch Order: Deploy field wardens to meter inbound arterial traffic and adjust junction green phase.`;
      }

      if (recRouteAllocations) {
        if (data.candidate_detours && data.candidate_detours.length) {
          const actions = recScen.actions || [];
          const routeKey = ids => [...ids].sort().join('|');
          const routeActions = actions.filter(action => Array.isArray(action.diversion_route_ids) && action.diversion_route_ids.length);
          const allocations = new Map(routeActions
            .map(action => [routeKey(action.diversion_route_ids), Number(action.diversion_percentage) || 0]));
          const detours = data.candidate_detours.filter(d => Array.isArray(d.edge_ids) && d.edge_ids.length);
          const hasMappedAllocations = detours.some(d => allocations.has(routeKey(d.edge_ids)));
          const fallbackShare = detours.length ? 1 / detours.length : 0;
          const routeShares = (hasMappedAllocations
            ? detours.map(d => ({ detour: d, share: allocations.get(routeKey(d.edge_ids)) || 0 }))
            : (routeActions.length
              ? detours.slice(0, routeActions.length).map((d, i) => ({
                detour: d,
                share: Number(routeActions[i].diversion_percentage) || 1 / routeActions.length
              }))
              : detours.map(d => ({ detour: d, share: fallbackShare }))))
            .filter(item => item.share > 0);
          const totalShare = routeShares.reduce((sum, item) => sum + item.share, 0);
          const allocHtml = routeShares.map(({ detour, share }, i) => {
            const pct = totalShare ? share / totalShare : 0;
            const pcu = Math.round(recScen.assigned_demand_pcu * pct);
            const color = ['#0284c7', '#9333ea', '#10b981'][i % 3];
            return `<div class="rec-route-allocation"><span class="rec-route-main"><span class="rec-route-dot" style="background:${color};"></span><strong>Route ${String.fromCharCode(65+i)}</strong><span class="rec-route-name">${detour.title}</span></span><span class="rec-route-volume">${(pct*100).toFixed(0)}% · ${pcu.toLocaleString()} PCU/hr</span></div>`;
          }).join('');
          recRouteAllocations.innerHTML = `<strong>Traffic allocation</strong>${allocHtml}`;
        }
      }
      updateDeployButtonStatus();
    }

    // Automatically select and render the recommended scenario onto the 3D map & tables
    const targetScenId = activeSelectedScenarioId || data.recommended_scenario_id;
    if (targetScenId) {
      selectScenario(targetScenId);
    }
  }

  // Active Deployed Diversions Management
  const activeDeployedDiversions = new Map();
  let isDeployingDiversion = false;

  async function syncActiveDiversions() {
    try {
      const res = await fetch('/api/v1/intelligence/diversions/active');
      if (res.ok) {
        const list = await res.json();
        activeDeployedDiversions.clear();
        list.forEach(d => activeDeployedDiversions.set(d.incident_id, d));
        updateDeployButtonStatus();
        updateIncidentQueueDeployedBadges();
      }
    } catch (e) {
      console.warn('Could not sync active diversions:', e);
    }
  }

  function updateDeployButtonStatus() {
    const btn = document.getElementById('btnConfirmDeployDiversion');
    const feedback = document.getElementById('deployStatusFeedback');
    const lbl = document.getElementById('lblDeployActionText');
    if (!btn) return;

    const isDeployed = activeDeployedDiversions.has(activeIncidentId);
    btn.disabled = isDeployingDiversion;
    btn.setAttribute('aria-busy', String(isDeployingDiversion));
    if (isDeployingDiversion) {
      if (lbl) lbl.textContent = 'Deploying diversion…';
      return;
    }

    if (isDeployed) {
      btn.classList.add('deployed');
      if (lbl) lbl.textContent = 'Diversion Active on Public Map (Live)';
      if (feedback) feedback.style.display = 'flex';
    } else {
      btn.classList.remove('deployed');
      if (lbl) lbl.textContent = 'Confirm & Deploy Diversion to Public Map';
      if (feedback) feedback.style.display = 'none';
    }
  }

  function updateIncidentQueueDeployedBadges() {
    const cards = document.querySelectorAll('#incidentQueueList .incident-card');
    cards.forEach(c => {
      const incId = c.dataset.incidentId;
      const topRow = c.querySelector('.incident-card-top');
      const existingTag = c.querySelector('.inc-deployed-tag');
      if (activeDeployedDiversions.has(incId)) {
        if (!existingTag && topRow) {
          const tag = document.createElement('span');
          tag.className = 'inc-deployed-tag';
          tag.textContent = 'DIVERSION ACTIVE';
          topRow.appendChild(tag);
        }
      } else {
        existingTag?.remove();
      }
    });
  }

  async function handleDeployDiversion() {
    if (isDeployingDiversion) return;
    if (!latestEvaluation) {
      showToast('Run simulation before deploying diversion');
      return;
    }
    if (!activeIncidentId || !activeCorridorId) {
      showToast('Select an incident before deploying a diversion');
      return;
    }

    const currentScenId = activeSelectedScenarioId || latestEvaluation.recommended_scenario_id;
    const scen = (latestEvaluation.candidate_scenarios || []).find(s => s.scenario_id === currentScenId) ||
                 (latestEvaluation.candidate_scenarios || [])[0];

    if (!scen) {
      showToast('No valid diversion scenario found to deploy');
      return;
    }

    const routeColors = ['#0284c7', '#9333ea', '#10b981'];
    const detourRoutes = (scen.actions || [])
      .filter(action => Array.isArray(action.diversion_route_ids) && action.diversion_route_ids.length)
      .map((action, index) => {
        const detour = latestEvaluation.candidate_detours?.find(candidate =>
          candidate.edge_ids?.length === action.diversion_route_ids.length &&
          candidate.edge_ids.every(id => action.diversion_route_ids.includes(id))
        );
        return {
          edge_ids: action.diversion_route_ids,
          allocation: Number(action.diversion_percentage) || 0,
          name: detour?.title || `Route ${String.fromCharCode(65 + index)}`,
          color: routeColors[index % routeColors.length],
          distance_km: detour?.total_length_km,
          estimated_time_min: detour?.loaded_travel_time_min
        };
      });
    if (!detourRoutes.length && Array.isArray(scen.route_edges) && scen.route_edges.length) {
      detourRoutes.push({ edge_ids: scen.route_edges, allocation: 1, name: scen.scenario_name, color: routeColors[0] });
    }
    const routeEdgeIds = [...new Set(detourRoutes.flatMap(route => route.edge_ids))];
    if (!routeEdgeIds.length) {
      showToast('This plan has no mapped route to publish. Choose a route-based scenario first.');
      return;
    }

    const incidentId = activeIncidentId;
    const edgeObj = currentCorridorsData.find(edge => edge.id === activeCorridorId);
    const roadName = edgeObj ? edgeObj.name : 'Arterial Corridor';
    const dispPcu = latestEvaluation.displaced_demand_veh_hr || activeDisplacedDemand;
    const delaySaved = scen.delay_saved_veh_hours || 0;

    const payload = {
      incident_id: incidentId,
      edge_id: activeCorridorId,
      edge_name: roadName,
      scenario_id: scen.scenario_id,
      scenario_name: scen.scenario_name,
      detour_route_ids: routeEdgeIds,
      detour_routes: detourRoutes,
      detour_name: scen.scenario_name.split(':')[0],
      displaced_demand_pcu_hr: dispPcu,
      delay_saved_veh_hours: delaySaved,
      advisory_text: `MANGALURU POLICE: Diversion active for ${roadName}. Traffic routed via ${scen.scenario_name.split(':')[0]}. Delay relief: ${delaySaved.toFixed(0)} veh-hrs.`,
      deployed_by: 'Control Room Senior Controller'
    };

    isDeployingDiversion = true;
    updateDeployButtonStatus();
    try {
      const res = await fetch('/api/v1/intelligence/diversions/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const record = await res.json();
        activeDeployedDiversions.set(record.incident_id, record);
        updateDeployButtonStatus();
        updateIncidentQueueDeployedBadges();
        showToast('Diversion deployed successfully! Broadcast to Public 3D Map.');
      } else {
        const responseText = await res.text();
        let detail = responseText;
        try {
          const errorBody = JSON.parse(responseText);
          detail = errorBody.detail || errorBody.message || responseText;
        } catch (_) {}
        console.error(`Diversion deployment failed (${res.status}):`, detail);
        showToast(`Deployment failed (${res.status}): ${String(detail).slice(0, 120)}`);
      }
    } catch (e) {
      console.error('Deploy error:', e);
      showToast('Failed to connect to diversion deployment service');
    } finally {
      isDeployingDiversion = false;
      updateDeployButtonStatus();
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
    const recTitle = document.getElementById('recTitle');
    const recDesc = document.getElementById('recDesc');
    const recTradeoff = document.getElementById('recTradeoff');
    const recRouteAllocations = document.getElementById('recRouteAllocations');
    if (recTitle) recTitle.textContent = `Selected plan: ${sc.scenario_name.split(':')[0]}`;
    if (recDesc) {
      recDesc.textContent = `This option routes ${sc.assigned_demand_pcu.toFixed(0)} PCU/hr with an estimated ${sc.route_travel_time_min.toFixed(1)} minute travel time. It saves ${sc.delay_saved_veh_hours.toFixed(1)} vehicle-hours (${sc.delay_reduction_pct.toFixed(0)}% delay reduction) and has a peak V/C ratio of ${sc.max_vc_ratio.toFixed(2)}.`;
    }
    if (recTradeoff) {
      recTradeoff.textContent = sc.downstream_bottlenecks?.length
        ? `This plan may create ${sc.downstream_bottlenecks.length} downstream bottleneck(s): ${sc.downstream_bottlenecks.join(', ')}.`
        : 'No downstream bottlenecks are predicted for this plan.';
    }
    if (recRouteAllocations) {
      const actions = (sc.actions || []).filter(action => Array.isArray(action.diversion_route_ids) && action.diversion_route_ids.length);
      const labels = actions.map(action => {
        const detour = latestEvaluation.candidate_detours?.find(d =>
          Array.isArray(d.edge_ids) && d.edge_ids.length === action.diversion_route_ids.length &&
          d.edge_ids.every(id => action.diversion_route_ids.includes(id))
        );
        const routeName = detour?.title || 'Recommended corridor';
        const pct = Number(action.diversion_percentage) || 0;
        return `<div class="rec-route-allocation"><span class="rec-route-main"><span class="rec-route-dot rec-route-dot-empty"></span><span class="rec-route-name">${routeName}</span></span><span class="rec-route-volume">${pct ? `${(pct * 100).toFixed(0)}% · ${Math.round(sc.assigned_demand_pcu * pct).toLocaleString()} PCU/hr` : `${sc.assigned_demand_pcu.toFixed(0)} PCU/hr`}</span></div>`;
      });
      recRouteAllocations.innerHTML = `<strong>Traffic allocation</strong>${labels.join('') || `<div class="rec-route-allocation"><span class="rec-route-main"><span class="rec-route-dot rec-route-dot-empty"></span><span class="rec-route-name">${sc.scenario_name.split(':')[0]}</span></span><span class="rec-route-volume">${sc.assigned_demand_pcu.toFixed(0)} PCU/hr</span></div>`}`;
    }

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

  function renderScenarioOnMap(scenario, requestedRouteIndex = 0) {
    if (!scenario || !latestEvaluation) return;
    if (!mapInstance || !isMapReady) {
      pendingScenarioToRender = scenario;
      return;
    }
    pendingScenarioToRender = null;
    ensureScenarioRouteLayer();

    const routeActions = (scenario.actions || []).filter(action =>
      Array.isArray(action.diversion_route_ids) && action.diversion_route_ids.length
    );
    if (!routeActions.length && Array.isArray(scenario.route_edges) && scenario.route_edges.length) {
      routeActions.push({ diversion_route_ids: scenario.route_edges, diversion_percentage: 1 });
    }
    const selectedRouteIndex = routeActions.length
      ? Math.min(Math.max(0, requestedRouteIndex), routeActions.length - 1)
      : -1;
    ['routeLegendA', 'routeLegendB', 'routeLegendC'].forEach((id, index) => {
      const legend = document.getElementById(id);
      if (!legend) return;
      legend.hidden = index >= routeActions.length;
      legend.classList.toggle('active', index === selectedRouteIndex);
      legend.setAttribute('aria-pressed', String(index === selectedRouteIndex));
      const action = routeActions[index];
      const detour = action && latestEvaluation.candidate_detours?.find(candidate =>
        candidate.edge_ids?.length === action.diversion_route_ids.length &&
        candidate.edge_ids.every(edgeId => action.diversion_route_ids.includes(edgeId))
      );
      const letter = String.fromCharCode(65 + index);
      const details = detour
        ? `${Number(detour.total_length_km).toFixed(1)} km · ${Number(detour.loaded_travel_time_min).toFixed(1)} min`
        : '';
      legend.title = details ? `${details} estimated route time` : `Show Route ${letter} only`;
      legend.setAttribute('aria-label', `Show Route ${letter} only${details ? `, ${details}` : ''}`);
      legend.onclick = index < routeActions.length
        ? () => renderScenarioOnMap(scenario, index)
        : null;
    });
    const selectedAction = routeActions[selectedRouteIndex];
    const selectedDetour = selectedAction && latestEvaluation.candidate_detours?.find(candidate =>
      candidate.edge_ids?.length === selectedAction.diversion_route_ids.length &&
      candidate.edge_ids.every(edgeId => selectedAction.diversion_route_ids.includes(edgeId))
    );
    const mapMeta = document.getElementById('mapCardMeta');
    if (mapMeta) {
      if (selectedRouteIndex < 0) {
        mapMeta.textContent = 'No mapped diversion route is available for this plan';
      } else {
        const letter = String.fromCharCode(65 + selectedRouteIndex);
        const routeStats = selectedDetour
          ? ` · ${Number(selectedDetour.total_length_km).toFixed(1)} km · ${Number(selectedDetour.loaded_travel_time_min).toFixed(1)} min`
          : '';
        const nextRouteHint = routeActions.length > 1 ? ' · select another route above to compare' : '';
        mapMeta.textContent = `Route ${letter}${routeStats}${nextRouteHint}`;
      }
    }

    const routeColors = ['#0284c7', '#9333ea', '#10b981'];
    const features = [];
    const fitPoints = [];
    let routeGeometryIssue = '';
    routeActions.forEach((action, routeIndex) => {
      // Composite plans can assign traffic across several detours. Show only
      // the route the operator is inspecting to keep the map unambiguous.
      if (routeIndex !== selectedRouteIndex) return;
      const routeColor = routeColors[routeIndex % routeColors.length];
      const routeIds = action.diversion_route_ids;
      const routeCoordinates = [];
      let previousTargetId = null;
      routeIds.forEach(edgeId => {
        if (routeGeometryIssue) return;
        const edge = currentCorridorsData.find(item => item.id === edgeId);
        // Draw the surveyed road geometry only. Falling back to a straight
        // junction-to-junction chord can put a route through buildings/water.
        if (!edge?.path_coordinates || edge.path_coordinates.length < 2) {
          routeGeometryIssue = 'A road segment has no mapped geometry';
          return;
        }
        let coordinates = toGeoJSONCoords(edge.path_coordinates);
        if (coordinates.length < 2) {
          routeGeometryIssue = 'A road segment has invalid mapped geometry';
          return;
        }
        const sourceNode = currentNodesMap.get(edge.source);
        const targetNode = currentNodesMap.get(edge.target);
        if (!sourceNode || !targetNode) {
          routeGeometryIssue = `${edge.name || 'A road segment'} has no mapped junctions`;
          return;
        }
        if (previousTargetId && edge.source !== previousTargetId) {
          routeGeometryIssue = `${edge.name || 'A road segment'} is disconnected from the selected route`;
          return;
        }
        const sourcePoint = [Number(sourceNode.lng), Number(sourceNode.lat)];
        const targetPoint = [Number(targetNode.lng), Number(targetNode.lat)];
        const forwardGap = geoPointGapMeters(sourcePoint, coordinates[0])
          + geoPointGapMeters(targetPoint, coordinates[coordinates.length - 1]);
        const reverseGap = geoPointGapMeters(sourcePoint, coordinates[coordinates.length - 1])
          + geoPointGapMeters(targetPoint, coordinates[0]);
        if (reverseGap < forwardGap) coordinates = coordinates.reverse();
        if (geoPointGapMeters(sourcePoint, coordinates[0]) > 90
          || geoPointGapMeters(targetPoint, coordinates[coordinates.length - 1]) > 90) {
          routeGeometryIssue = `${edge.name || 'A road segment'} does not match its mapped junctions`;
          return;
        }
        coordinates[0] = sourcePoint;
        coordinates[coordinates.length - 1] = targetPoint;
        // A route action is one connected path. Never draw separated fragments
        // as a MultiLineString: that made stray roads look like part of a detour.
        const hasBadJump = coordinates.some((point, index) => index > 0
          && geoPointGapMeters(coordinates[index - 1], point) > 250);
        if (hasBadJump) {
          routeGeometryIssue = `${edge.name || 'A road segment'} has a disconnected map geometry`;
          return;
        }
        if (!routeCoordinates.length) routeCoordinates.push(...coordinates);
        else if (geoPointGapMeters(routeCoordinates[routeCoordinates.length - 1], coordinates[0]) <= 25) {
          routeCoordinates.push(...coordinates.slice(1));
        } else {
          routeGeometryIssue = `${edge.name || 'A road segment'} does not connect to the previous road`;
          return;
        }
        previousTargetId = edge.target;
      });
      if (routeGeometryIssue || routeCoordinates.length < 2) return;
      routeCoordinates.forEach(point => fitPoints.push(point));
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: routeCoordinates },
        properties: {
          routeIndex,
          routeColor,
          allocation: Number(action.diversion_percentage) || 0
        }
      });
    });

    mapInstance.getSource('active-scenario-routes').setData({ type: 'FeatureCollection', features });
    if (routeGeometryIssue && mapMeta) {
      mapMeta.textContent = `Route not drawn: ${routeGeometryIssue}`;
    }
    if (fitPoints.length > 1 && typeof maplibregl !== 'undefined') {
      const bounds = new maplibregl.LngLatBounds();
      fitPoints.forEach(point => bounds.extend(point));
      mapInstance.fitBounds(bounds, {
        padding: { top: 90, bottom: 90, left: 470, right: 70 },
        maxZoom: 15.5,
        duration: 650
      });
    }
  }

  function ensureScenarioRouteLayer() {
    const emptyData = { type: 'FeatureCollection', features: [] };
    if (!mapInstance.getSource('active-scenario-routes')) {
      mapInstance.addSource('active-scenario-routes', { type: 'geojson', data: emptyData });
    }
    if (!mapInstance.getLayer('active-scenario-route-casing')) {
      mapInstance.addLayer({
        id: 'active-scenario-route-casing',
        type: 'line',
        source: 'active-scenario-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.88 }
      });
    }
    if (!mapInstance.getLayer('active-scenario-route-core')) {
      mapInstance.addLayer({
        id: 'active-scenario-route-core',
        type: 'line',
        source: 'active-scenario-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'routeColor'],
          'line-width': 3.5,
          'line-opacity': 0.96
        }
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
    if (!edge) {
      const hint = document.getElementById('lblNominalBaselineHint');
      if (hint) hint.textContent = 'Nominal: select an incident';
      ['lblNominalFlow', 'lblEffectiveCap', 'lblDisplacedFlow'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = '—';
      });
      activeDisplacedDemand = 0;
      return;
    }
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

  async function loadReportedIncidents() {
    try {
      const res = await fetch('/api/v1/intelligence/incidents');
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.length) return;

      availableIncidents = data;

      // 1. Populate Left Dropdown
      const selectInc = document.getElementById('selectActiveIncident');
      if (selectInc) {
        selectInc.innerHTML = '<option value="" selected disabled>Select an incident to inspect</option>';
        data.forEach(inc => {
          const opt = document.createElement('option');
          opt.value = inc.incident_id;
          const shortBlock = Math.round((inc.capacity_reduction_pct || 0.8) * 100);
          const locationNote = getIncidentRoadPosition(inc) ? '' : ' · GPS unavailable';
          opt.textContent = `${inc.incident_id.replace('INC-MNG-', 'INC-')}: ${inc.road_name.split(' (')[0]} (${shortBlock}%)${locationNote}`;
          selectInc.appendChild(opt);
        });
      }

      // 2. Populate Right Queue Panel
      const queueList = document.getElementById('incidentQueueList');
      if (queueList) {
        queueList.innerHTML = '';
        data.forEach((inc, index) => {
          const card = document.createElement('div');
          card.className = `incident-card ${inc.incident_id === activeIncidentId ? 'active' : ''}`;
          card.dataset.incidentId = inc.incident_id;

          const sev = (inc.severity || 'HIGH').toUpperCase();
          const sevClass = sev === 'CRITICAL' ? 'sev-critical' : (sev === 'HIGH' ? 'sev-high' : 'sev-moderate');
          const blockPct = Math.round((inc.capacity_reduction_pct || 0.8) * 100);
          const timeAgo = ['3m ago', '8m ago', '14m ago', '22m ago', '29m ago', '38m ago', '45m ago'][index % 7];

          // Compute nominal flow
          const edge = currentCorridorsData.find(e => e.id === inc.affected_edge_id);
          const lanes = edge ? (edge.lanes || 2) : 2;
          const nominalCap = lanes * 900.0;
          const baseFlow = (edge && edge.baseline_flow_veh_hr) ? edge.baseline_flow_veh_hr : (nominalCap * 0.7);
          const dispDemand = Math.round(Math.max(0, baseFlow - (nominalCap * (1 - blockPct/100))));

          card.innerHTML = `
            <div class="incident-card-top">
              <span class="inc-badge-id">${inc.incident_id.replace('INC-MNG-', 'INC-')}</span>
              <span class="inc-badge-sev ${sevClass}">${sev} &bull; ${blockPct}% Blocked</span>
              <span class="inc-card-time">${timeAgo}</span>
            </div>
            <div class="incident-card-title">${inc.road_name.split(' (')[0]}</div>
            <div class="incident-card-cause">${inc.description || 'Arterial blockage obstructing vehicle flow.'}</div>
            <div class="incident-card-bottom">
              <span class="incident-card-stats">${Math.round(baseFlow)} Inflow &bull; ~${dispDemand} Displaced</span>
              <button type="button" class="btn-card-action">Inspect incident</button>
            </div>
          `;

          card.addEventListener('click', () => {
            selectIncident(inc.incident_id, false);
          });

          queueList.appendChild(card);
        });
        updateIncidentQueueDeployedBadges();
      }

      renderNetworkOnMap();
      // Put pins on the same corridor geometries shown by the incident overlay.
      renderIncidentPinsOnMap();

      setIncidentControlsEnabled(false);
      const mapMeta = document.getElementById('mapCardMeta');
      if (mapMeta) mapMeta.textContent = 'Select an incident marker to inspect its road';

    } catch (err) {
      console.error('Failed to load reported incidents:', err);
    }
  }

  function selectIncident(incidentId, shouldTriggerEval = false) {
    const inc = availableIncidents.find(i => i.incident_id === incidentId);
    if (!inc) return;
    clearSimulationResults();
    activeIncidentId = incidentId;
    setIncidentControlsEnabled(true);
    const simulationHint = document.getElementById('simulationHint');
    if (simulationHint) simulationHint.textContent = 'Inspect the highlighted road section, adjust incident assumptions if needed, then run the simulation.';
    const mapMeta = document.getElementById('mapCardMeta');
    const roadPosition = getIncidentRoadPosition(inc);
    const hasMappedLocation = Boolean(roadPosition);
    if (mapMeta) mapMeta.textContent = hasMappedLocation
      ? 'GPS location snapped onto the affected road'
      : 'Exact GPS unavailable; this incident is not pinned on the map';

    // 1. Sync Left Dropdown
    const selectInc = document.getElementById('selectActiveIncident');
    if (selectInc && selectInc.value !== incidentId) {
      selectInc.value = incidentId;
    }

    // 2. Sync Left Context Card
    const lblRoad = document.getElementById('lblActiveRoadName');
    const lblEdge = document.getElementById('lblActiveEdgeId');
    const lblCause = document.getElementById('lblActiveCauseText');
    const lblStatusBadge = document.getElementById('lblIncidentStatusBadge');
    const lblBlockedSection = document.getElementById('lblBlockedSection');

    if (lblRoad) lblRoad.textContent = inc.road_name.split(' (')[0];
    if (lblEdge) lblEdge.textContent = inc.affected_edge_id;
    if (lblCause) lblCause.textContent = inc.description || 'Active traffic obstruction.';
    if (lblStatusBadge) lblStatusBadge.textContent = `${inc.severity} INCIDENT`;
    if (lblBlockedSection) lblBlockedSection.textContent = hasMappedLocation
      ? `GPS position: ${Number(inc.lat).toFixed(5)}, ${Number(inc.lng).toFixed(5)} · snapped to ${inc.road_name}`
      : 'Precise incident GPS is unavailable. No map marker or guessed blockage point is shown.';

    // 3. Highlight Card in Right Queue (if present)
    const cards = document.querySelectorAll('.incident-card');
    cards.forEach(c => {
      const isThis = (c.dataset.incidentId === incidentId);
      c.classList.toggle('active', isThis);
      const btn = c.querySelector('.btn-card-action');
      if (btn) btn.textContent = isThis ? 'Selected incident' : 'Inspect incident';
    });

    // 4. Sync Interactive Pins & Popups on 3D Map
    if (activeIncidentPins && activeIncidentPins.length) {
      activeIncidentPins.forEach(marker => {
        const isTarget = (marker._incidentId === incidentId);
        const markerEl = marker.getElement();
        if (markerEl) markerEl.classList.toggle('selected', isTarget);

        const popup = marker.getPopup();
      if (isTarget && roadPosition) {
          if (popup && !popup.isOpen()) {
            marker.togglePopup();
          }
          const popBtn = popup?.getElement()?.querySelector('.btn-map-popup-simulate');
          if (popBtn) {
            popBtn.classList.add('active');
            popBtn.textContent = 'Selected incident';
          }
          if (mapInstance) {
            mapInstance.flyTo({
              center: marker.getLngLat(),
              offset: [-145, 0],
              zoom: Math.max(mapInstance.getZoom(), 15.2),
              pitch: 28,
              bearing: 0,
              duration: 750
            });
          }
        } else {
          // Close other popups to avoid overlapping cards
          if (popup && popup.isOpen()) {
            marker.togglePopup();
          }
          const popBtn = popup?.getElement()?.querySelector('.btn-map-popup-simulate');
          if (popBtn) {
            popBtn.classList.remove('active');
            popBtn.textContent = 'Inspect incident';
          }
        }
      });
    }

    // 5. Update Blockage & Horizon
    const blockPct = Math.round((inc.capacity_reduction_pct || 0.8) * 100);
    const horizonMin = Math.round(inc.estimated_duration_min || 60);

    const selectHoriz = document.getElementById('selectHorizon');
    if (selectHoriz) selectHoriz.value = String(horizonMin);

    // Call unified incident state updater
    setIncidentState(inc.affected_edge_id, blockPct, null, false);
    if (shouldTriggerEval) triggerDiversionEvaluation();
  }

  function setIncidentState(newCorridorId, newBlockagePct, newDemand = null, shouldTriggerEval = false) {
    const corridorChanged = (newCorridorId && newCorridorId !== activeCorridorId);
    if (newCorridorId) activeCorridorId = newCorridorId;
    if (newBlockagePct !== undefined && newBlockagePct !== null) {
      activeBlockagePct = parseInt(newBlockagePct, 10);
    }

    // 1. Sync matching incident metadata if applicable
    const match = availableIncidents.find(i => i.incident_id === activeIncidentId && i.affected_edge_id === activeCorridorId)
      || availableIncidents.find(i => i.affected_edge_id === activeCorridorId);
    if (match) {
      activeIncidentId = match.incident_id;
      const selectInc = document.getElementById('selectActiveIncident');
      if (selectInc && selectInc.value !== match.incident_id) {
        selectInc.value = match.incident_id;
      }
      const lblRoad = document.getElementById('lblActiveRoadName');
      const lblEdge = document.getElementById('lblActiveEdgeId');
      const lblCause = document.getElementById('lblActiveCauseText');
      const lblStatusBadge = document.getElementById('lblIncidentStatusBadge');
      if (lblRoad) lblRoad.textContent = match.road_name.split(' (')[0];
      if (lblEdge) lblEdge.textContent = match.affected_edge_id;
      if (lblCause) lblCause.textContent = match.description || '';
      if (lblStatusBadge) lblStatusBadge.textContent = `${match.severity} INCIDENT`;

      const cards = document.querySelectorAll('.incident-card');
      cards.forEach(c => {
        const isThis = (c.dataset.incidentId === match.incident_id);
        c.classList.toggle('active', isThis);
        const btn = c.querySelector('.btn-card-action');
        if (btn) btn.textContent = isThis ? 'Selected incident' : 'Inspect incident';
      });
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
    clearSimulationResults();
    const simulationHint = document.getElementById('simulationHint');
    if (simulationHint && activeIncidentId) {
      simulationHint.textContent = 'Incident settings changed. Run the simulation to refresh the diversion options.';
    }

    // 6. Update workflow stepper to Stage 1 (Detect)
    updateWorkflowStepper(1);

    // 7. Refresh the GPS-matched blocked section for the selected incident
    if (isMapReady && mapInstance && mapInstance.isStyleLoaded()) {
      renderNetworkOnMap();
    }

    // 8. Trigger evaluation if requested
    if (shouldTriggerEval) {
      triggerDiversionEvaluation();
    }
  }

  // Active Incident Select dropdown change
  const selectActiveIncident = document.getElementById('selectActiveIncident');
  if (selectActiveIncident) {
    selectActiveIncident.addEventListener('change', (e) => {
      selectIncident(e.target.value, false);
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
      clearSimulationResults();
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
      clearSimulationResults();
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
      clearSimulationResults();
    });
  }

  // Simulation Horizon Select
  const selectHorizon = document.getElementById('selectHorizon');
  if (selectHorizon) {
    selectHorizon.addEventListener('change', () => {
      clearSimulationResults();
    });
  }

  // Severity Quick-Chips
  const severityButtons = document.querySelectorAll('.severity-chip');
  severityButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const bPct = parseInt(btn.dataset.block, 10);
      setIncidentState(activeCorridorId, bPct, null, false);
    });
  });

  // Blockage Slider change
  const sliderBlockage = document.getElementById('sliderBlockage');
  if (sliderBlockage) {
    sliderBlockage.addEventListener('input', (e) => {
      setIncidentState(activeCorridorId, e.target.value, null, false);
    });
    sliderBlockage.addEventListener('change', (e) => {
      setIncidentState(activeCorridorId, e.target.value, null, false);
    });
  }

  // Simulate Button
  const btnSimulate = document.getElementById('btnSimulateDiversion');
  if (btnSimulate) {
    btnSimulate.addEventListener('click', () => {
      triggerDiversionEvaluation();
    });
  }

  // Deploy Diversion to Public Map Button
  const btnDeploy = document.getElementById('btnConfirmDeployDiversion');
  if (btnDeploy) {
    btnDeploy.addEventListener('click', () => {
      handleDeployDiversion();
    });
  }

  // Initial sync of deployed diversions
  syncActiveDiversions();
  setInterval(syncActiveDiversions, 8000);

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
  window.addEventListener('resize', () => {
    if (mapInstance && isMapReady) mapInstance.resize();
  }, { passive: true });

  // Concurrently load network data, reported incidents, and initial diversion evaluation
  loadMangaluruNetwork().then(() => {
    loadReportedIncidents();
  });

});
