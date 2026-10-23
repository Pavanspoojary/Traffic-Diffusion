// Traffic Diffusion - Ambulance Driver Navigation Engine
// Google Maps Mobile Style PWA Controller

document.addEventListener('DOMContentLoaded', () => {
  // Free OpenStreetMap Tile Layer (100% free, no API key or watermark)
  const map = L.map('driverMap', {
    center: [12.8750, 74.8550], // Mangaluru city center
    zoom: 14,
    zoomControl: false,
    attributionControl: true,
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  // Layers
  const trafficLayer = L.layerGroup().addTo(map);
  const corridorLayer = L.layerGroup().addTo(map);
  const markerLayer = L.layerGroup().addTo(map);

  // DOM Elements
  const turnDistance = document.getElementById('turnDistance');
  const turnStreet = document.getElementById('turnStreet');
  const turnNext = document.getElementById('turnNext');
  const turnIconSvg = document.getElementById('turnIconSvg');
  const driverDestSelect = document.getElementById('driverDestSelect');
  const incidentBanner = document.getElementById('incidentBanner');
  const incidentBannerMsg = document.getElementById('incidentBannerMsg');
  const btnDismissBanner = document.getElementById('btnDismissBanner');
  const speedLimitVal = document.getElementById('speedLimitVal');
  const btnRecenter = document.getElementById('btnRecenter');
  const btnToggleTraffic = document.getElementById('btnToggleTraffic');
  const driverEtaMin = document.getElementById('driverEtaMin');
  const driverDistance = document.getElementById('driverDistance');
  const driverClockEta = document.getElementById('driverClockEta');
  const btnSimulateDrive = document.getElementById('btnSimulateDrive');
  const driveBtnLabel = document.getElementById('driveBtnLabel');
  const preemptedSignalsCount = document.getElementById('preemptedSignalsCount');
  const btnRefreshRoute = document.getElementById('btnRefreshRoute');

  // State
  let currentRoute = null;
  let networkState = null;
  let ambulanceMarker = null;
  let isDriving = false;
  let driveAnimationId = null;
  let showTraffic = true;
  let previousPathSignature = '';

  // 1. Initialize Route
  async function fetchAndRenderRoute() {
    try {
      // First fetch network state to display traffic context
      const netRes = await fetch('/api/v1/navigation/network');
      if (netRes.ok) {
        networkState = await netRes.json();
        renderTrafficEdges(networkState.edges, networkState.nodes);
      }

      // Fetch dynamic emergency green corridor for ambulance
      const destId = driverDestSelect.value;
      const res = await fetch('/api/v1/navigation/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin_node_id: 'EMS_STATE_BANK',
          destination_node_id: destId,
          is_emergency: true,
          avoid_congestion: true,
        }),
      });

      if (!res.ok) throw new Error('Routing failure');
      const routeData = await res.json();
      currentRoute = routeData;

      // Check if route changed due to an incident
      const pathSig = routeData.path_node_ids.join('->');
      if (previousPathSignature && previousPathSignature !== pathSig) {
        showRerouteNotification(routeData);
      }
      previousPathSignature = pathSig;

      renderGreenCorridor(routeData);
      updateNavigationTelemetry(routeData);
    } catch (err) {
      console.error('Failed to update ambulance route:', err);
    }
  }

  // 2. Render Green Corridor (Google Maps Style)
  function renderGreenCorridor(route) {
    corridorLayer.clearLayers();
    markerLayer.clearLayers();

    if (!route.path_coordinates || route.path_coordinates.length < 2) return;

    // Glowing under-layer for ambulance route
    const underglow = L.polyline(route.path_coordinates, {
      color: '#34d399',
      weight: 12,
      opacity: 0.45,
      lineCap: 'round',
      lineJoin: 'round',
    });

    // Core solid Google Maps emergency green navigation route
    const coreRoute = L.polyline(route.path_coordinates, {
      color: '#137333',
      weight: 6,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    });

    corridorLayer.addLayer(underglow);
    corridorLayer.addLayer(coreRoute);

    // Add Destination Hospital Pin
    const destCoord = route.path_coordinates[route.path_coordinates.length - 1];
    const hospitalIcon = L.divIcon({
      className: 'custom-hosp-pin',
      html: `
        <div style="background: #d93025; border: 2.5px solid #ffffff; border-radius: 8px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    L.marker(destCoord, { icon: hospitalIcon }).addTo(markerLayer);

    // Add Ambulance Marker if not already placed
    if (!ambulanceMarker) {
      const startCoord = route.path_coordinates[0];
      const ambIcon = L.divIcon({
        className: 'ambulance-marker-container',
        html: `
          <div class="ambulance-pulse"></div>
          <div class="ambulance-pin">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="12 2 19 21 12 17 5 21 12 2"/>
            </svg>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      ambulanceMarker = L.marker(startCoord, { icon: ambIcon, zIndexOffset: 1000 }).addTo(markerLayer);
    }

    if (!isDriving) {
      map.fitBounds(coreRoute.getBounds(), { padding: [80, 80] });
    }
  }

  // 3. Render Adjacent Road Traffic (Free Flow, Congested, Blocked)
  function renderTrafficEdges(edges, nodes) {
    trafficLayer.clearLayers();
    if (!showTraffic || !edges || !nodes) return;

    const nodeCoordMap = new Map();
    nodes.forEach(n => nodeCoordMap.set(n.id, [n.lat, n.lng]));

    edges.forEach(e => {
      const s = nodeCoordMap.get(e.source);
      const t = nodeCoordMap.get(e.target);
      if (!s || !t) return;

      let color = '#3b82f6';
      let dash = null;
      let weight = 3;

      if (e.has_incident || e.congestion_level === 'BLOCKED') {
        color = '#ef4444';
        dash = '6, 6';
        weight = 5;
      } else if (e.congestion_level === 'HEAVY') {
        color = '#f97316';
        weight = 4;
      } else if (e.congestion_level === 'MODERATE') {
        color = '#f59e0b';
        weight = 3.5;
      }

      const line = L.polyline([s, t], {
        color: color,
        weight: weight,
        opacity: 0.7,
        dashArray: dash,
      });

      if (e.has_incident) {
        line.bindTooltip(`Incident Blockage: ${e.incident_description || e.name}`, { sticky: true });
      }

      trafficLayer.addLayer(line);
    });
  }

  // 4. Update Turn-by-Turn Card & Telemetry
  function updateNavigationTelemetry(route) {
    driverEtaMin.innerHTML = `${Math.ceil(route.estimated_travel_time_min)} <span class="eta-unit">min</span>`;
    driverDistance.textContent = `${route.total_distance_km.toFixed(1)} km`;

    // Calculate arrival clock time
    const now = new Date();
    now.setMinutes(now.getMinutes() + Math.ceil(route.estimated_travel_time_min));
    const hours = now.getHours().toString().padStart(2, '0');
    const mins = now.getMinutes().toString().padStart(2, '0');
    driverClockEta.textContent = `${hours}:${mins} ETA`;

    preemptedSignalsCount.textContent = route.signals_preempted;

    // First maneuver segment
    if (route.segments && route.segments.length > 0) {
      const firstSeg = route.segments[0];
      turnDistance.textContent = `In ${(firstSeg.distance_km * 400).toFixed(0)} m`;
      turnStreet.textContent = `Continue onto ${firstSeg.road_name}`;

      if (route.segments.length > 1) {
        turnNext.textContent = `Then approach ${route.segments[1].road_name}`;
      } else {
        turnNext.textContent = 'Approaching Emergency Medical Intake';
      }

      // Dynamic speed limit based on active corridor
      speedLimitVal.textContent = firstSeg.distance_km > 2 ? '60' : '45';
    }
  }

  // 5. Dynamic Incident Alert Notification
  function showRerouteNotification(route) {
    if (route.time_saved_min > 0) {
      incidentBannerMsg.textContent = `Accident on standard corridor detected by CV. Emergency green corridor rerouted. Saved ${route.time_saved_min} mins.`;
      incidentBanner.classList.remove('hidden');
    }
  }

  btnDismissBanner.addEventListener('click', () => {
    incidentBanner.classList.add('hidden');
  });

  // 6. Smooth Ambulance Drive Simulation
  btnSimulateDrive.addEventListener('click', () => {
    if (isDriving) {
      stopDriveSimulation();
    } else {
      startDriveSimulation();
    }
  });

  function startDriveSimulation() {
    if (!currentRoute || !currentRoute.path_coordinates || currentRoute.path_coordinates.length < 2) return;

    isDriving = true;
    btnSimulateDrive.classList.add('driving');
    driveBtnLabel.textContent = 'End Transit';

    const coords = currentRoute.path_coordinates;
    let currentStep = 0;
    const totalSteps = coords.length - 1;
    let subStep = 0;
    const subStepsBetweenNodes = 35; // Frames between intersections for smooth motion

    function animateMovement() {
      if (!isDriving) return;

      if (currentStep < totalSteps) {
        const start = coords[currentStep];
        const end = coords[currentStep + 1];

        const t = subStep / subStepsBetweenNodes;
        const currentLat = start[0] + (end[0] - start[0]) * t;
        const currentLng = start[1] + (end[1] - start[1]) * t;

        if (ambulanceMarker) {
          ambulanceMarker.setLatLng([currentLat, currentLng]);
          map.panTo([currentLat, currentLng], { animate: true, duration: 0.1 });
        }

        subStep++;
        if (subStep > subStepsBetweenNodes) {
          subStep = 0;
          currentStep++;

          // Dynamically update maneuver header as ambulance enters next segment
          if (currentRoute.segments && currentStep < currentRoute.segments.length) {
            const nextSeg = currentRoute.segments[currentStep];
            turnDistance.textContent = `In ${(nextSeg.distance_km * 250).toFixed(0)} m`;
            turnStreet.textContent = `Turn onto ${nextSeg.road_name}`;
            if (currentStep + 1 < currentRoute.segments.length) {
              turnNext.textContent = `Next: ${currentRoute.segments[currentStep + 1].road_name}`;
            } else {
              turnNext.textContent = 'Approaching Trauma Center Bay';
            }
          }
        }

        driveAnimationId = requestAnimationFrame(animateMovement);
      } else {
        // Arrived at destination hospital
        stopDriveSimulation();
        turnStreet.textContent = 'Arrived at Emergency Intake';
        turnDistance.textContent = 'Destination Reached';
        turnNext.textContent = 'Patient Handover Protocol Active';
        alert('Emergency Corridor Complete: Ambulance safely arrived at Trauma Center.');
      }
    }

    driveAnimationId = requestAnimationFrame(animateMovement);
  }

  function stopDriveSimulation() {
    isDriving = false;
    if (driveAnimationId) {
      cancelAnimationFrame(driveAnimationId);
      driveAnimationId = null;
    }
    btnSimulateDrive.classList.remove('driving');
    driveBtnLabel.textContent = 'Start Transit';
  }

  // 7. Controls Handlers
  btnRecenter.addEventListener('click', () => {
    if (ambulanceMarker) {
      map.setView(ambulanceMarker.getLatLng(), 15, { animate: true });
    } else if (currentRoute && currentRoute.path_coordinates.length > 0) {
      map.setView(currentRoute.path_coordinates[0], 15, { animate: true });
    }
  });

  btnToggleTraffic.addEventListener('click', () => {
    showTraffic = !showTraffic;
    btnToggleTraffic.classList.toggle('active', showTraffic);
    if (networkState) {
      renderTrafficEdges(networkState.edges, networkState.nodes);
    }
  });

  driverDestSelect.addEventListener('change', () => {
    stopDriveSimulation();
    fetchAndRenderRoute();
  });

  btnRefreshRoute.addEventListener('click', () => {
    fetchAndRenderRoute();
  });

  // Background polling every 6 seconds to catch new CCTV-detected incidents automatically
  setInterval(() => {
    if (!isDriving) {
      fetchAndRenderRoute();
    }
  }, 6000);

  // Initial load
  fetchAndRenderRoute();
});
