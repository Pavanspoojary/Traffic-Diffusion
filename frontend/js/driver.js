// Traffic Diffusion - Ambulance Driver Navigation Engine
// Google Maps Mobile Style PWA Controller with Real Road-Snapped Geometry

document.addEventListener('DOMContentLoaded', () => {
  // Free OpenStreetMap Tile Layer (100% free, no API key or watermark)
  const map = L.map('driverMap', {
    center: [12.8750, 74.8550], // Mangaluru city center
    zoom: 15,
    zoomControl: false,
    attributionControl: true,
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  // Map Layers
  const trafficLayer = L.layerGroup().addTo(map);
  const corridorLayer = L.layerGroup().addTo(map);
  const markerLayer = L.layerGroup().addTo(map);

  // DOM Elements
  const turnDistance = document.getElementById('turnDistance');
  const turnStreet = document.getElementById('turnStreet');
  const turnNext = document.getElementById('turnNext');
  const turnIconSvg = document.getElementById('turnIconSvg');
  const driverDestSelect = document.getElementById('driverDestSelect');
  const driverViaRoad = document.getElementById('driverViaRoad');
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

  // 1. Fetch & Render Route
  async function fetchAndRenderRoute() {
    try {
      const netRes = await fetch('/api/v1/navigation/network');
      if (netRes.ok) {
        networkState = await netRes.json();
        renderIncidentMarkers(networkState.edges, networkState.nodes);
      }

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

  // 2. Render Green Corridor (Google Maps Visual Style)
  function renderGreenCorridor(route) {
    corridorLayer.clearLayers();
    markerLayer.clearLayers();

    if (!route.path_coordinates || route.path_coordinates.length < 2) return;

    // A. Outer White Halo Casing Border
    const casingBorder = L.polyline(route.path_coordinates, {
      color: '#FFFFFF',
      weight: 10,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    });

    // B. Core Recommended Route: Blue (#1565FF)
    const coreRoute = L.polyline(route.path_coordinates, {
      color: '#1565FF',
      weight: 6,
      opacity: 1.0,
      lineCap: 'round',
      lineJoin: 'round',
    });

    corridorLayer.addLayer(casingBorder);
    corridorLayer.addLayer(coreRoute);

    // D. Google Maps Floating Callout Badge on Route (matching Image 2: "1 min · 500m")
    const midIndex = Math.floor(route.path_coordinates.length / 2);
    const midCoord = route.path_coordinates[midIndex];
    const calloutIcon = L.divIcon({
      className: 'gmaps-route-pill-wrap',
      html: `
        <div class="gmaps-route-pill">
          <span class="pill-time">${Math.ceil(route.estimated_travel_time_min)} min</span>
          <span class="pill-dist">${route.total_distance_km.toFixed(1)} km</span>
        </div>
      `,
      iconSize: [60, 32],
      iconAnchor: [30, 16],
    });
    L.marker(midCoord, { icon: calloutIcon, interactive: false }).addTo(corridorLayer);

    // E. Google Maps Origin Pin (Blue dot inside white circle)
    const startCoord = route.path_coordinates[0];
    const originIcon = L.divIcon({
      className: 'custom-start-pin',
      html: `<div class="gmaps-start-pin" title="Origin: ${route.origin.name}"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    L.marker(startCoord, { icon: originIcon }).addTo(markerLayer);

    // F. Google Maps Red Teardrop Destination Pin (matching Image 2)
    const destCoord = route.path_coordinates[route.path_coordinates.length - 1];
    const destIcon = L.divIcon({
      className: 'custom-dest-pin',
      html: `
        <div class="gmaps-end-pin" title="Destination: ${route.destination.name}">
          <svg width="26" height="34" viewBox="0 0 24 24" fill="#d93025">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
        </div>
      `,
      iconSize: [26, 34],
      iconAnchor: [13, 34],
    });
    L.marker(destCoord, { icon: destIcon }).addTo(markerLayer);

    // G. Ambulance Live Vehicle Marker
    if (!ambulanceMarker) {
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
    } else {
      ambulanceMarker.setLatLng(startCoord);
    }

    if (!isDriving) {
      map.fitBounds(coreRoute.getBounds(), { padding: [70, 70] });
    }
  }

  // 3. Render Incident Markers (Replaces cluttered diagonal spiderweb lines)
  function renderIncidentMarkers(edges, nodes) {
    trafficLayer.clearLayers();
    if (!showTraffic || !edges || !nodes) return;

    const nodeCoordMap = new Map();
    nodes.forEach(n => nodeCoordMap.set(n.id, [n.lat, n.lng]));

    edges.filter(e => e.has_incident || e.congestion_level === 'BLOCKED').forEach(e => {
      const coord = nodeCoordMap.get(e.target);
      if (coord) {
        const incidentIcon = L.divIcon({
          className: 'incident-badge-icon',
          html: `
            <div style="background: #E53935; border: 2px solid #ffffff; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.35); font-weight: 800; font-size: 13px;">
              !
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker(coord, { icon: incidentIcon })
          .bindPopup(`<strong>Incident Blockage:</strong><br/>${e.incident_description || e.name}`)
          .addTo(trafficLayer);
      }
    });
  }

  // 4. Update Turn-by-Turn Card & Navigation Telemetry
  function updateNavigationTelemetry(route) {
    driverEtaMin.innerHTML = `${Math.ceil(route.estimated_travel_time_min)} <span class="eta-unit">min</span>`;
    driverDistance.textContent = `${route.total_distance_km.toFixed(1)} km`;

    // Google Maps Primary Road (matching "via MG Rd" in Image 2)
    if (driverViaRoad) {
      driverViaRoad.textContent = route.primary_road_name || 'via MG Rd';
    }

    // Arrival clock time
    const now = new Date();
    now.setMinutes(now.getMinutes() + Math.ceil(route.estimated_travel_time_min));
    const hours = now.getHours().toString().padStart(2, '0');
    const mins = now.getMinutes().toString().padStart(2, '0');
    driverClockEta.textContent = `${hours}:${mins} ETA`;

    preemptedSignalsCount.textContent = route.signals_preempted;

    const clearanceHeading = document.getElementById('clearanceHeading');
    const clearanceDetails = document.getElementById('clearanceDetails');
    if (clearanceHeading && route.coordination_plan) {
      clearanceHeading.textContent = `${route.coordination_plan.status.replace(/_/g, ' ')} CORRIDOR`;
    }
    if (clearanceDetails && route.hospital_readiness) {
      const cleanHosp = route.hospital_readiness.hospital_name.split('(')[0].trim();
      clearanceDetails.innerHTML = `${cleanHosp} Trauma Bay: <strong>${route.hospital_readiness.trauma_bay_status}</strong> &bull; ${route.signals_preempted} signals cleared [Simulated]`;
    }

    // Use detailed OSRM maneuvers if available
    if (route.turn_instructions && route.turn_instructions.length > 0) {
      const m1 = route.turn_instructions[0];
      const m2 = route.turn_instructions.length > 1 ? route.turn_instructions[1] : null;

      const d = m1.distance_m || 200;
      turnDistance.textContent = d >= 1000 ? `In ${(d / 1000).toFixed(1)} km` : `In ${Math.round(d)} m`;

      const mod = (m1.modifier || '').toLowerCase();
      const stName = m1.street_name || (route.segments[0] ? route.segments[0].road_name : 'Corridor Road');

      if (mod.includes('left')) {
        turnStreet.textContent = `Turn left onto ${stName}`;
        setTurnIcon('left');
      } else if (mod.includes('right')) {
        turnStreet.textContent = `Turn right onto ${stName}`;
        setTurnIcon('right');
      } else {
        turnStreet.textContent = `Continue onto ${stName}`;
        setTurnIcon('straight');
      }

      if (m2) {
        const m2Mod = m2.modifier ? `${m2.modifier} onto ` : '';
        turnNext.textContent = `Then ${m2Mod}${m2.street_name || 'destination'}`;
      } else {
        turnNext.textContent = 'Approaching Emergency Intake';
      }
    } else if (route.segments && route.segments.length > 0) {
      const firstSeg = route.segments[0];
      turnDistance.textContent = `In ${(firstSeg.distance_km * 350).toFixed(0)} m`;
      turnStreet.textContent = `Continue onto ${firstSeg.road_name}`;
      setTurnIcon('straight');

      if (route.segments.length > 1) {
        turnNext.textContent = `Then continue onto ${route.segments[1].road_name}`;
      } else {
        turnNext.textContent = 'Approaching Emergency Medical Intake';
      }
    }

    // Speed Limit
    speedLimitVal.textContent = route.total_distance_km > 5 ? '60' : '45';
  }

  function setTurnIcon(direction) {
    if (direction === 'left') {
      turnIconSvg.innerHTML = `
        <polyline points="15 18 9 12 15 6"></polyline>
      `;
    } else if (direction === 'right') {
      turnIconSvg.innerHTML = `
        <polyline points="9 18 15 12 9 6"></polyline>
      `;
    } else {
      turnIconSvg.innerHTML = `
        <line x1="12" y1="19" x2="12" y2="5"></line>
        <polyline points="5 12 12 5 19 12"></polyline>
      `;
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
    let currentIdx = 0;
    const totalPoints = coords.length;

    // Step rate adjusted for smooth road following
    const stepIncrement = Math.max(1, Math.floor(totalPoints / 180));

    function driveStep() {
      if (!isDriving) return;

      if (currentIdx < totalPoints) {
        const pt = coords[currentIdx];
        if (ambulanceMarker) {
          ambulanceMarker.setLatLng(pt);
          map.panTo(pt, { animate: true, duration: 0.08 });
        }

        currentIdx += stepIncrement;
        driveAnimationId = setTimeout(driveStep, 50);
      } else {
        stopDriveSimulation();
        turnStreet.textContent = 'Arrived at Emergency Intake';
        turnDistance.textContent = 'Destination Reached';
        turnNext.textContent = 'Patient Handover Protocol Active';
        alert('Emergency Corridor Complete: Ambulance safely arrived at Trauma Center.');
      }
    }

    driveStep();
  }

  function stopDriveSimulation() {
    isDriving = false;
    if (driveAnimationId) {
      clearTimeout(driveAnimationId);
      driveAnimationId = null;
    }
    btnSimulateDrive.classList.remove('driving');
    driveBtnLabel.textContent = 'Start Transit';
  }

  // 7. Controls Handlers
  btnRecenter.addEventListener('click', () => {
    if (ambulanceMarker) {
      map.setView(ambulanceMarker.getLatLng(), 16, { animate: true });
    } else if (currentRoute && currentRoute.path_coordinates.length > 0) {
      map.setView(currentRoute.path_coordinates[0], 16, { animate: true });
    }
  });

  btnToggleTraffic.addEventListener('click', () => {
    showTraffic = !showTraffic;
    btnToggleTraffic.classList.toggle('active', showTraffic);
    if (networkState) {
      renderIncidentMarkers(networkState.edges, networkState.nodes);
    }
  });

  driverDestSelect.addEventListener('change', () => {
    stopDriveSimulation();
    fetchAndRenderRoute();
  });

  btnRefreshRoute.addEventListener('click', () => {
    fetchAndRenderRoute();
  });

  // Background polling every 8s
  setInterval(() => {
    if (!isDriving) {
      fetchAndRenderRoute();
    }
  }, 8000);

  // Initial load
  fetchAndRenderRoute();
});
