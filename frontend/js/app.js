// Traffic-Diffusion — Predictive Traffic Intelligence & Intervention Planning
// Production Dashboard Controller matching Design Specification

document.addEventListener('DOMContentLoaded', async () => {

  // =========================================================================
  // 1. Live Digital Clock (Formatted: Mon, Apr 28, 2025 • 14:32:05)
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
  // 2. State & Sector Corridors Definition
  // =========================================================================
  let currentCity = 'Bengaluru'; // Default city matching visual design
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

  // High-fidelity Bengaluru Arterial Network (Coordinates covering Silk Board, Hosur Rd, ORR, Bellandur, Sarjapur Rd)
  const BENGALURU_NETWORK = {
    center: [12.9230, 77.6400],
    zoom: 13,
    corridors: [
      {
        id: 'blr_hosur_01',
        name: 'Hosur Road Arterial (Silk Board &ndash; Bommanahalli)',
        latlngs: [[12.9172, 77.6228], [12.9065, 77.6288], [12.8980, 77.6360]],
        congestion: 'HEAVY', // Heavy congested arterial
        hasIncident: true,
        incidentDesc: 'Accident: Overturned truck blocking 2 central lanes'
      },
      {
        id: 'blr_hosur_02',
        name: 'Hosur Road Expressway (Electronic City Phase 1)',
        latlngs: [[12.8980, 77.6360], [12.8750, 77.6530], [12.8450, 77.6680]],
        congestion: 'MODERATE',
        hasIncident: false
      },
      {
        id: 'blr_sarjapur_01',
        name: 'Sarjapur Main Road (Koramangala to Iblur Junction)',
        latlngs: [[12.9280, 77.6280], [12.9230, 77.6480], [12.9210, 77.6710]],
        congestion: 'HEAVY',
        hasIncident: false
      },
      {
        id: 'blr_orr_bellandur',
        name: 'Outer Ring Road (Iblur to Bellandur Tech Park)',
        latlngs: [[12.9210, 77.6710], [12.9310, 77.6840], [12.9410, 77.6960]],
        congestion: 'HEAVY',
        hasIncident: false
      },
      {
        id: 'blr_orr_silkboard',
        name: 'Outer Ring Road (BTM Layout to Silk Board Junction)',
        latlngs: [[12.9150, 77.6080], [12.9172, 77.6228]],
        congestion: 'HEAVY',
        hasIncident: false
      },
      {
        id: 'blr_koramangala_80ft',
        name: 'Koramangala 80 Feet Road Bypass',
        latlngs: [[12.9350, 77.6180], [12.9340, 77.6280], [12.9300, 77.6420]],
        congestion: 'MODERATE',
        hasIncident: false
      },
      {
        id: 'blr_inner_ring',
        name: 'Inner Ring Road (Domlur to Koramangala)',
        latlngs: [[12.9550, 77.6380], [12.9420, 77.6340], [12.9340, 77.6280]],
        congestion: 'SMOOTH',
        hasIncident: false
      },
      {
        id: 'blr_bannerghatta',
        name: 'Bannerghatta Road Link',
        latlngs: [[12.9250, 77.5980], [12.9050, 77.5960]],
        congestion: 'SMOOTH',
        hasIncident: false
      },
      {
        id: 'blr_old_airport',
        name: 'Old Airport Road',
        latlngs: [[12.9600, 77.6450], [12.9570, 77.6680], [12.9550, 77.6950]],
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
  // 3. Leaflet Map Initialization (Dark Theme)
  // =========================================================================
  let mapInstance = null;
  let corridorPolylines = [];
  let markerLayers = [];

  function initMap() {
    const mapEl = document.getElementById('liveTrafficMap');
    if (!mapEl) return;

    mapInstance = L.map('liveTrafficMap', {
      center: BENGALURU_NETWORK.center,
      zoom: BENGALURU_NETWORK.zoom,
      zoomControl: true,
      attributionControl: false
    });

    // Sleek Dark Tile Layer (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(mapInstance);

    renderNetworkCorridors(BENGALURU_NETWORK);
  }

  function renderNetworkCorridors(networkData) {
    // Clear previous layers
    corridorPolylines.forEach(p => mapInstance.removeLayer(p));
    markerLayers.forEach(m => mapInstance.removeLayer(m));
    corridorPolylines = [];
    markerLayers = [];

    // Render Road Polylines
    networkData.corridors.forEach(corr => {
      let strokeColor = '#22c55e'; // Smooth green
      let weight = 3.5;
      let dashArray = null;

      if (corr.congestion === 'HEAVY') {
        strokeColor = '#ef4444'; // Heavy red
        weight = 5.0;
      } else if (corr.congestion === 'MODERATE') {
        strokeColor = '#fbbf24'; // Moderate yellow
        weight = 4.0;
      }

      if (corr.hasIncident) {
        dashArray = '6, 6';
      }

      // Outer Glow Polyline
      const glowLine = L.polyline(corr.latlngs, {
        color: strokeColor,
        weight: weight + 3,
        opacity: 0.35,
        lineCap: 'round'
      }).addTo(mapInstance);

      // Core Polyline
      const coreLine = L.polyline(corr.latlngs, {
        color: strokeColor,
        weight: weight,
        opacity: 0.95,
        dashArray: dashArray,
        lineCap: 'round'
      }).addTo(mapInstance);

      coreLine.bindTooltip(`<strong>${corr.name}</strong><br/>Status: ${corr.congestion}`, { sticky: true });
      coreLine.on('click', () => {
        selectCorridor(corr.name, corr.congestion);
      });

      corridorPolylines.push(glowLine, coreLine);
    });

    // Render Incident Markers (Matching Design Image Red & Purple Circles)
    networkData.incidents.forEach((inc, idx) => {
      let iconHtml = `
        <div style="
          width: 26px; height: 26px; border-radius: 50%;
          background: #ef4444; border: 2.5px solid #ffffff;
          box-shadow: 0 0 14px rgba(239,68,68,0.9);
          display: flex; align-items: center; justify-content: center;
          color: #ffffff; font-weight: 800; font-size: 13px; font-family: sans-serif;
        ">!</div>
      `;

      if (idx === 1) {
        // Purple Incident Car Icon
        iconHtml = `
          <div style="
            width: 26px; height: 26px; border-radius: 50%;
            background: #8b5cf6; border: 2.5px solid #ffffff;
            box-shadow: 0 0 14px rgba(139,92,246,0.9);
            display: flex; align-items: center; justify-content: center;
            color: #ffffff; font-size: 11px;
          ">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5">
              <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H7.5a1 1 0 0 0-.8.4L4 11l-5.16.86a1 1 0 0 0-.84.99V16h3m14 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm-10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"></path>
            </svg>
          </div>
        `;
      }

      const customIcon = L.divIcon({
        className: 'custom-traffic-marker',
        html: iconHtml,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });

      const marker = L.marker([inc.lat, inc.lng], { icon: customIcon }).addTo(mapInstance);
      marker.on('click', () => {
        selectCorridor(inc.road, inc.severity);
      });
      markerLayers.push(marker);
    });
  }

  function selectCorridor(roadName, status) {
    document.getElementById('overlayRoadName').textContent = roadName;
    document.getElementById('incRoadPrimary').textContent = roadName;
    showToast(`Inspecting corridor: ${roadName}`);
  }

  initMap();

  // =========================================================================
  // 4. City Sector Toggle (Bengaluru <-> Mangaluru)
  // =========================================================================
  const btnCityToggle = document.getElementById('btnCityToggle');
  const currentCityName = document.getElementById('currentCityName');
  const mapCardTitle = document.getElementById('mapCardTitle');

  btnCityToggle.addEventListener('click', async () => {
    if (currentCity === 'Bengaluru') {
      currentCity = 'Mangaluru';
      currentCityName.textContent = 'Mangaluru';
      mapCardTitle.textContent = 'Live Traffic Map – Mangaluru Metro';
      showToast('Switched sector to Mangaluru Metropolitan Arterials');
      await loadMangaluruNetwork();
    } else {
      currentCity = 'Bengaluru';
      currentCityName.textContent = 'Bengaluru';
      mapCardTitle.textContent = 'Live Traffic Map – Bengaluru';
      showToast('Switched sector to Bengaluru Highway Corridors');
      mapInstance.setView(BENGALURU_NETWORK.center, BENGALURU_NETWORK.zoom);
      renderNetworkCorridors(BENGALURU_NETWORK);
    }
  });

  async function loadMangaluruNetwork() {
    try {
      const res = await fetch('/api/v1/navigation/network');
      if (!res.ok) return;
      const data = await res.json();
      
      const nodesMap = new Map();
      data.nodes.forEach(n => nodesMap.set(n.id, n));

      corridorPolylines.forEach(p => mapInstance.removeLayer(p));
      markerLayers.forEach(m => mapInstance.removeLayer(m));
      corridorPolylines = [];
      markerLayers = [];

      mapInstance.setView([12.8750, 74.8550], 13);

      data.edges.forEach(edge => {
        const s = nodesMap.get(edge.source);
        const t = nodesMap.get(edge.target);
        if (!s || !t) return;

        let strokeColor = '#22c55e';
        let weight = 3.5;
        let dashArray = null;

        if (edge.congestion_level === 'BLOCKED' || edge.has_incident) {
          strokeColor = '#ef4444';
          weight = 5.0;
          dashArray = '6, 6';
        } else if (edge.congestion_level === 'HEAVY') {
          strokeColor = '#f43f5e';
          weight = 4.5;
        } else if (edge.congestion_level === 'MODERATE') {
          strokeColor = '#fbbf24';
          weight = 4.0;
        }

        const line = L.polyline([[s.lat, s.lng], [t.lat, t.lng]], {
          color: strokeColor,
          weight: weight,
          opacity: 0.95,
          dashArray: dashArray
        }).addTo(mapInstance);

        line.bindTooltip(`<strong>${edge.name}</strong><br/>Status: ${edge.congestion_level}`, { sticky: true });
        line.on('click', () => {
          selectCorridor(edge.name, edge.congestion_level);
        });
        corridorPolylines.push(line);
      });
    } catch (err) {
      console.warn('Failed to load Mangaluru network:', err);
    }
  }

  // =========================================================================
  // 5. Intervention Buttons (Select Action)
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

    // Send dispatch to backend
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
  // 6. Citizen Reports Feed Modal & Real-Time Sync
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

      // If a recent verified incident arrived, reflect it on the card
      if (reports.length > 0) {
        const latest = reports[0];
        if (latest.verification_status === 'VERIFIED') {
          const roadEl = document.getElementById('incRoadPrimary');
          const overlayRoad = document.getElementById('overlayRoadName');
          if (roadEl && overlayRoad && latest.road_name) {
            // Keep user informed if report matches active
          }
        }
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
