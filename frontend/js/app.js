// Traffic-Diffusion — Predictive Traffic Intelligence & Intervention Planning
// MapLibre GL JS with 3D Buildings Extrusion & Vector Tiles

document.addEventListener('DOMContentLoaded', async () => {

  // =========================================================================
  // 1. Live Digital Clock (Mon, Apr 28, 2025 • 14:32:05)
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
  // 2. State & Sector Data
  // =========================================================================
  let currentCity = 'Bengaluru';
  let activeIncident = {
    road: 'Hosur Road',
    category: 'Accident',
    severity: 'Severe',
    time: '14:20',
    duration: '~ 45 min',
    lanes: '2 lanes blocked',
    trafficLoad: 68,
    activeIncidentsCount: 3,
    avgDelayMin: 12,
    networkRisk: 'Medium',
    peakRiskPct: 92,
    atRiskPct: 72
  };

  // High-fidelity Bengaluru Arterials ([longitude, latitude] GeoJSON format)
  const BENGALURU_NETWORK = {
    center: [77.6255, 12.9110], // Silk Board / Hosur Road / Koramangala
    zoom: 15.2,
    pitch: 45,
    bearing: -17.6,
    corridors: [
      {
        id: 'blr_hosur_01',
        name: 'Hosur Road Arterial (Silk Board - Bommanahalli)',
        coords: [[77.6228, 12.9172], [77.6288, 12.9065], [77.6360, 12.8980]],
        congestion: 'HEAVY',
        hasIncident: true,
        incidentDesc: 'Accident: Overturned truck blocking 2 central lanes'
      },
      {
        id: 'blr_hosur_02',
        name: 'Hosur Road Expressway (Electronic City Phase 1)',
        coords: [[77.6360, 12.8980], [77.6530, 12.8750], [77.6680, 12.8450]],
        congestion: 'MODERATE',
        hasIncident: false
      },
      {
        id: 'blr_sarjapur_01',
        name: 'Sarjapur Main Road (Koramangala to Iblur Junction)',
        coords: [[77.6280, 12.9280], [77.6480, 12.9230], [77.6710, 12.9210]],
        congestion: 'HEAVY',
        hasIncident: false
      },
      {
        id: 'blr_orr_bellandur',
        name: 'Outer Ring Road (Iblur to Bellandur Tech Park)',
        coords: [[77.6710, 12.9210], [77.6840, 12.9310], [77.6960, 12.9410]],
        congestion: 'HEAVY',
        hasIncident: false
      },
      {
        id: 'blr_orr_silkboard',
        name: 'Outer Ring Road (BTM Layout to Silk Board Junction)',
        coords: [[77.6080, 12.9150], [77.6228, 12.9172]],
        congestion: 'HEAVY',
        hasIncident: false
      },
      {
        id: 'blr_koramangala_80ft',
        name: 'Koramangala 80 Feet Road Bypass',
        coords: [[77.6180, 12.9350], [77.6280, 12.9340], [77.6420, 12.9300]],
        congestion: 'MODERATE',
        hasIncident: false
      },
      {
        id: 'blr_inner_ring',
        name: 'Inner Ring Road (Domlur to Koramangala)',
        coords: [[77.6380, 12.9550], [77.6340, 12.9420], [77.6280, 12.9340]],
        congestion: 'SMOOTH',
        hasIncident: false
      },
      {
        id: 'blr_bannerghatta',
        name: 'Bannerghatta Road Link',
        coords: [[77.5980, 12.9250], [77.5960, 12.9050]],
        congestion: 'SMOOTH',
        hasIncident: false
      },
      {
        id: 'blr_old_airport',
        name: 'Old Airport Road',
        coords: [[77.6450, 12.9600], [77.6680, 12.9570], [77.6950, 12.9550]],
        congestion: 'SMOOTH',
        hasIncident: false
      }
    ],
    incidents: [
      { lat: 12.9110, lng: 77.6255, road: 'Hosur Road', type: 'Accident', severity: 'Severe', time: '14:20' },
      { lat: 12.9215, lng: 77.6710, road: 'Outer Ring Road (Iblur)', type: 'Congestion', severity: 'High', time: '14:25' },
      { lat: 12.9240, lng: 77.6420, road: 'Sarjapur Road', type: 'Slowdown', severity: 'Moderate', time: '14:15' }
    ]
  };

  // =========================================================================
  // 3. MapLibre GL JS Map Initialization with 3D Buildings
  // =========================================================================
  let mapInstance = null;
  let activeMarkers = [];

  function initMapLibre() {
    const mapContainer = document.getElementById('liveTrafficMap');
    if (!mapContainer || typeof maplibregl === 'undefined') return;

    mapInstance = new maplibregl.Map({
      container: 'liveTrafficMap',
      // OpenFreeMap dark style (100% free, no API key required, global CDN)
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: BENGALURU_NETWORK.center,
      zoom: BENGALURU_NETWORK.zoom,
      pitch: BENGALURU_NETWORK.pitch,
      bearing: BENGALURU_NETWORK.bearing,
      canvasContextAttributes: { antialias: true }
    });

    // Navigation Controls
    mapInstance.addControl(
      new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }),
      'top-left'
    );

    mapInstance.on('load', () => {
      setup3DBuildings();
      loadCorridorsLayer(BENGALURU_NETWORK.corridors);
      setupIncidentMarkers(BENGALURU_NETWORK.incidents);
    });
  }

  // 3D Buildings Extrusion (Official MapLibre GL JS Pattern)
  function setup3DBuildings() {
    try {
      const layers = mapInstance.getStyle().layers || [];

      // Find top label layer to insert buildings beneath text labels
      let labelLayerId;
      for (let i = 0; i < layers.length; i++) {
        if (layers[i].type === 'symbol' && layers[i].layout && layers[i].layout['text-field']) {
          labelLayerId = layers[i].id;
          break;
        }
      }

      // OpenFreeMap vector tile source
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
      console.warn('3D buildings initialization:', e);
    }
  }

  // Corridors GeoJSON Source & Layers
  function loadCorridorsLayer(corridorsList) {
    const geojsonData = {
      type: 'FeatureCollection',
      features: corridorsList.map(c => ({
        type: 'Feature',
        properties: {
          id: c.id,
          name: c.name,
          congestion: c.congestion,
          color: c.congestion === 'HEAVY' ? '#ef4444' : (c.congestion === 'MODERATE' ? '#fbbf24' : '#22c55e')
        },
        geometry: {
          type: 'LineString',
          coordinates: c.coords
        }
      }))
    };

    if (mapInstance.getSource('traffic-corridors')) {
      mapInstance.getSource('traffic-corridors').setData(geojsonData);
    } else {
      mapInstance.addSource('traffic-corridors', {
        type: 'geojson',
        data: geojsonData
      });

      // Outer glow line layer
      mapInstance.addLayer({
        id: 'corridors-glow',
        type: 'line',
        source: 'traffic-corridors',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 8,
          'line-opacity': 0.35
        }
      });

      // Core crisp line layer
      mapInstance.addLayer({
        id: 'corridors-core',
        type: 'line',
        source: 'traffic-corridors',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 4.5,
          'line-opacity': 0.95
        }
      });

      // Interactivity
      mapInstance.on('click', 'corridors-core', (e) => {
        if (e.features && e.features[0]) {
          const props = e.features[0].properties;
          selectCorridor(props.name, props.congestion);
        }
      });

      mapInstance.on('mouseenter', 'corridors-core', () => {
        mapInstance.getCanvas().style.cursor = 'pointer';
      });
      mapInstance.on('mouseleave', 'corridors-core', () => {
        mapInstance.getCanvas().style.cursor = '';
      });
    }
  }

  // HTML Markers on 3D Map
  function setupIncidentMarkers(incidentsList) {
    activeMarkers.forEach(m => m.remove());
    activeMarkers = [];

    incidentsList.forEach((inc, idx) => {
      const el = document.createElement('div');
      
      if (idx === 1) {
        // Purple Incident Car Marker
        el.innerHTML = `
          <div style="
            width: 28px; height: 28px; border-radius: 50%;
            background: #8b5cf6; border: 2.5px solid #ffffff;
            box-shadow: 0 0 16px rgba(139,92,246,0.95);
            display: flex; align-items: center; justify-content: center;
            color: #ffffff; cursor: pointer;
          ">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5">
              <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H7.5a1 1 0 0 0-.8.4L4 11l-5.16.86a1 1 0 0 0-.84.99V16h3m14 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm-10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"></path>
            </svg>
          </div>
        `;
      } else {
        // Red Alert Circle with Exclamation
        el.innerHTML = `
          <div style="
            width: 28px; height: 28px; border-radius: 50%;
            background: #ef4444; border: 2.5px solid #ffffff;
            box-shadow: 0 0 16px rgba(239,68,68,0.95);
            display: flex; align-items: center; justify-content: center;
            color: #ffffff; font-weight: 800; font-size: 14px; font-family: sans-serif;
            cursor: pointer;
          ">!</div>
        `;
      }

      el.addEventListener('click', () => {
        selectCorridor(inc.road, inc.severity || 'Critical');
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([inc.lng, inc.lat])
        .addTo(mapInstance);

      activeMarkers.push(marker);
    });
  }

  function selectCorridor(roadName, status) {
    const overlayRoad = document.getElementById('overlayRoadName');
    const incRoad = document.getElementById('incRoadPrimary');
    if (overlayRoad) overlayRoad.textContent = roadName;
    if (incRoad) incRoad.textContent = roadName;
    showToast(`Inspecting corridor: ${roadName}`);
  }

  initMapLibre();

  // =========================================================================
  // 4. City Sector Toggle (Bengaluru <-> Mangaluru)
  // =========================================================================
  const btnCityToggle = document.getElementById('btnCityToggle');
  const currentCityName = document.getElementById('currentCityName');
  const mapCardTitle = document.getElementById('mapCardTitle');

  if (btnCityToggle) {
    btnCityToggle.addEventListener('click', async () => {
      if (currentCity === 'Bengaluru') {
        currentCity = 'Mangaluru';
        if (currentCityName) currentCityName.textContent = 'Mangaluru';
        if (mapCardTitle) mapCardTitle.textContent = 'Live Traffic Map – Mangaluru Metro';
        showToast('Switched sector to Mangaluru Metropolitan Arterials (3D)');
        await loadMangaluruNetwork3D();
      } else {
        currentCity = 'Bengaluru';
        if (currentCityName) currentCityName.textContent = 'Bengaluru';
        if (mapCardTitle) mapCardTitle.textContent = 'Live Traffic Map – Bengaluru';
        showToast('Switched sector to Bengaluru Highway Corridors (3D)');
        if (mapInstance) {
          mapInstance.flyTo({
            center: BENGALURU_NETWORK.center,
            zoom: BENGALURU_NETWORK.zoom,
            pitch: BENGALURU_NETWORK.pitch,
            bearing: BENGALURU_NETWORK.bearing,
            essential: true
          });
          loadCorridorsLayer(BENGALURU_NETWORK.corridors);
          setupIncidentMarkers(BENGALURU_NETWORK.incidents);
        }
      }
    });
  }

  async function loadMangaluruNetwork3D() {
    try {
      const res = await fetch('/api/v1/navigation/network');
      if (!res.ok) return;
      const data = await res.json();

      const nodesMap = new Map();
      data.nodes.forEach(n => nodesMap.set(n.id, n));

      const mngCorridors = [];
      const mngIncidents = [];

      data.edges.forEach(edge => {
        const s = nodesMap.get(edge.source);
        const t = nodesMap.get(edge.target);
        if (!s || !t) return;

        let cong = 'SMOOTH';
        if (edge.congestion_level === 'BLOCKED' || edge.has_incident) {
          cong = 'HEAVY';
          mngIncidents.push({
            lat: (s.lat + t.lat) / 2,
            lng: (s.lng + t.lng) / 2,
            road: edge.name,
            severity: 'Critical'
          });
        } else if (edge.congestion_level === 'HEAVY') {
          cong = 'HEAVY';
        } else if (edge.congestion_level === 'MODERATE') {
          cong = 'MODERATE';
        }

        mngCorridors.push({
          id: edge.id,
          name: edge.name,
          coords: [[s.lng, s.lat], [t.lng, t.lat]],
          congestion: cong
        });
      });

      if (mapInstance) {
        mapInstance.flyTo({
          center: [74.8550, 12.8750],
          zoom: 14.6,
          pitch: 45,
          bearing: -15,
          essential: true
        });
        loadCorridorsLayer(mngCorridors);
        setupIncidentMarkers(mngIncidents.slice(0, 3));
      }
    } catch (err) {
      console.warn('Failed to load Mangaluru 3D network:', err);
    }
  }

  // =========================================================================
  // 5. Intervention Options Selection
  // =========================================================================
  const btnSelect0 = document.getElementById('btnSelect0');
  const btnSelect1 = document.getElementById('btnSelect1');
  const btnSelect2 = document.getElementById('btnSelect2');

  const interventions = [
    { title: 'Divert via Bellandur', delay: '+2 min', directive: 'Enforce upstream VMS diversion via Bellandur bypass' },
    { title: 'Increase Police Patrol', delay: '+4 min', directive: 'Deploy quick-response patrol interceptor for manual lane clearance' },
    { title: 'Signal Adjustment (ORR)', delay: '+1 min', directive: 'Grant adaptive green-wave priority phase on Outer Ring Road' }
  ];

  function activateIntervention(index, btnEl) {
    const item = interventions[index];
    btnEl.textContent = 'Active';
    btnEl.style.backgroundColor = '#1d4ed8';

    fetch('/api/v1/intelligence/dispatches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        incident_id: 'INC-HOSUR-ACCIDENT-01',
        target_location_id: 'LOC_BELLANDUR',
        target_location_name: item.title,
        resource_type: 'TRAFFIC_POLICE_OFFICER',
        units_assigned: 2,
        directive: item.directive,
        priority: 'CRITICAL',
        eta_minutes: 3.5,
        notes: `Selected from operator console: ${item.delay}`
      })
    }).catch(e => console.warn('Dispatch save error:', e));

    showToast(`Intervention activated: "${item.title}" (${item.delay} delay saved)`);
  }

  if (btnSelect0) btnSelect0.addEventListener('click', () => activateIntervention(0, btnSelect0));
  if (btnSelect1) btnSelect1.addEventListener('click', () => activateIntervention(1, btnSelect1));
  if (btnSelect2) btnSelect2.addEventListener('click', () => activateIntervention(2, btnSelect2));

  // =========================================================================
  // 6. Citizen Reports Feed Modal
  // =========================================================================
  const incidentModal = document.getElementById('incidentModal');
  const btnViewAllIncidents = document.getElementById('btnViewAllIncidents');
  const btnCompareInterventions = document.getElementById('btnCompareInterventions');
  const btnCloseIncidentModal = document.getElementById('btnCloseIncidentModal');
  const citizenFeedList = document.getElementById('citizenFeedList');
  const tabIncidentAnalysis = document.getElementById('tabIncidentAnalysis');
  const tabDashboard = document.getElementById('tabDashboard');

  function openIncidentModal() {
    if (incidentModal) incidentModal.classList.remove('hidden');
    loadCitizenReportsModal();
  }

  function closeIncidentModal() {
    if (incidentModal) incidentModal.classList.add('hidden');
  }

  if (btnViewAllIncidents) btnViewAllIncidents.addEventListener('click', openIncidentModal);
  if (btnCompareInterventions) btnCompareInterventions.addEventListener('click', openIncidentModal);
  if (tabIncidentAnalysis) tabIncidentAnalysis.addEventListener('click', openIncidentModal);
  if (btnCloseIncidentModal) btnCloseIncidentModal.addEventListener('click', closeIncidentModal);

  if (tabDashboard) {
    tabDashboard.addEventListener('click', () => {
      closeIncidentModal();
      showToast('Dashboard overview active');
    });
  }

  async function loadCitizenReportsModal() {
    try {
      const res = await fetch('/api/v1/intelligence/citizen-reports');
      if (!res.ok) return;
      const reports = await res.json();

      citizenFeedList.innerHTML = '';
      if (reports.length === 0) {
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
            <span class="feed-badge ${isVerified ? 'badge-verified' : 'badge-pending'}">${isVerified ? 'VERIFIED' : 'PENDING'}</span>
          </div>
          <div class="feed-card-desc">${rep.description} &bull; ${rep.category.replace(/_/g, ' ')} (${rep.lanes_affected}L)</div>
          <div class="feed-card-actions">
            <span style="font-size: 10px; color: var(--text-dim);">${rep.report_id}</span>
            ${!isVerified ? `
              <button type="button" class="btn-action-small btn-modal-verify" data-id="${rep.report_id}" data-edge="${rep.road_segment_id}" data-road="${rep.road_name}">
                Verify &amp; Forecast
              </button>
            ` : `
              <button type="button" class="btn-action-small btn-modal-load" data-id="${rep.report_id}" data-edge="${rep.road_segment_id}" data-road="${rep.road_name}">
                Inspect On Map
              </button>
            `}
          </div>
        `;
        citizenFeedList.appendChild(card);
      });

      document.querySelectorAll('.btn-modal-verify').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.dataset.id;
          const road = e.currentTarget.dataset.road;
          await fetch(`/api/v1/intelligence/citizen-reports/${id}/verify?verified=true`, { method: 'POST' });
          showToast(`Report ${id} on ${road} verified!`);
          closeIncidentModal();
          selectCorridor(road, 'Critical');
        });
      });

      document.querySelectorAll('.btn-modal-load').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const road = e.currentTarget.dataset.road;
          closeIncidentModal();
          selectCorridor(road, 'Critical');
        });
      });

    } catch (err) {
      console.warn('Citizen modal fetch error:', err);
    }
  }

  // =========================================================================
  // 7. Background Data Polling for Live Citizen Ingestion (3s interval)
  // =========================================================================
  async function pollLiveIncidents() {
    try {
      const res = await fetch('/api/v1/intelligence/citizen-reports');
      if (!res.ok) return;
      const reports = await res.json();
      
      const activeCountEl = document.getElementById('kpiActiveIncidents');
      if (activeCountEl) {
        activeCountEl.textContent = Math.max(3, reports.length);
      }
    } catch (e) {}
  }
  setInterval(pollLiveIncidents, 3500);

  // =========================================================================
  // 8. Global Action Toast Notification
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

});
