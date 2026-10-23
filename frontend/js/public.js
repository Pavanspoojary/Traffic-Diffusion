// Public Citizen Portal & Emergency Map Controller
// Supports Google Maps Platform integration (internalUsageAttributionIds: gmp_git_agentskills_v1)
// with live Incident History logging and counter tracking.

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Authenticate / Check Citizen Session
  const citizenDataRaw = localStorage.getItem('trafficCitizenUser');
  let currentCitizen = { name: 'Citizen User', age: '-', address: 'Mangaluru Sector' };

  if (citizenDataRaw) {
    try {
      currentCitizen = JSON.parse(citizenDataRaw);
    } catch (e) {
      console.warn('Could not parse stored citizen data:', e);
    }
  }

  // Populate User Chip in Nav
  const userNameElem = document.getElementById('citizenDisplayName');
  const userAddressElem = document.getElementById('citizenDisplayAddress');
  const userAvatarElem = document.getElementById('citizenAvatarInitials');

  if (userNameElem) userNameElem.textContent = currentCitizen.name;
  if (userAddressElem) userAddressElem.textContent = `${currentCitizen.address} (Age: ${currentCitizen.age || '-'})`;
  if (userAvatarElem) {
    const initials = currentCitizen.name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'C';
    userAvatarElem.textContent = initials;
  }

  // 2. Incident History Seed & State Management
  const SEED_INCIDENTS = [
    {
      id: "CIT-MNG-101",
      timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      timeAgo: "15 mins ago",
      subject: "Heavy Commercial Freight Rollover",
      category: "COLLISION",
      location: "Circuit House - Nanthoor Road (GPS: 12.87850° N, 74.86200° E)",
      lat: 12.87850,
      lng: 74.86200,
      severity: "CRITICAL",
      description: "Overturned multi-axle freight truck blocking both arterial lanes towards Nanthoor circle approach.",
      reporter: "Citizen Commuter",
      reporterAddress: "Hampankatta",
      verified: true,
      photo: null
    },
    {
      id: "CIT-MNG-102",
      timestamp: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
      timeAgo: "32 mins ago",
      subject: "Severe Monsoon Flash Flooding",
      category: "WEATHER_WATERLOGGING",
      location: "Bunts Hostel - Kadri Road (GPS: 12.87350° N, 74.85400° E)",
      lat: 12.87350,
      lng: 74.85400,
      severity: "HIGH",
      description: "Severe stormwater accumulation inundating left and central lanes; traffic crawling at 5 km/h.",
      reporter: "Auto Rickshaw Driver",
      reporterAddress: "Kadri",
      verified: true,
      photo: null
    },
    {
      id: "CIT-MNG-103",
      timestamp: new Date(Date.now() - 58 * 60 * 1000).toISOString(),
      timeAgo: "58 mins ago",
      subject: "Disabled Intercity Transit Bus",
      category: "VEHICLE_BREAKDOWN",
      location: "M.G. Road near Lalbagh (GPS: 12.87900° N, 74.84600° E)",
      lat: 12.87900,
      lng: 74.84600,
      severity: "MODERATE",
      description: "Stalled intercity bus blocking right two lanes near Lalbagh junction, causing feeder congestion.",
      reporter: "Local Commuter",
      reporterAddress: "Lalbagh",
      verified: true,
      photo: null
    }
  ];

  let incidentHistory = [];
  try {
    const rawHistory = localStorage.getItem('trafficCitizenIncidentHistory');
    if (rawHistory) {
      incidentHistory = JSON.parse(rawHistory);
    }
  } catch (e) {
    console.warn('Could not read stored incident history:', e);
  }

  // Ensure minimum realistic seed history
  if (!incidentHistory || incidentHistory.length === 0) {
    incidentHistory = SEED_INCIDENTS;
    saveIncidentHistory();
  }

  function saveIncidentHistory() {
    try {
      localStorage.setItem('trafficCitizenIncidentHistory', JSON.stringify(incidentHistory));
    } catch (e) {}
    updateIncidentCounters();
  }

  function formatRelativeTime(isoString) {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffMins = Math.floor(diffMs / (60 * 1000));
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${Math.floor(diffHours / 24)}d ago`;
    } catch (e) {
      return 'Recently';
    }
  }

  function updateIncidentCounters() {
    const total = incidentHistory.length;
    const critical = incidentHistory.filter(i => i.severity === 'CRITICAL').length;
    const myReports = incidentHistory.filter(i => i.reporter === currentCitizen.name).length;
    const collisions = incidentHistory.filter(i => i.category === 'COLLISION').length;
    const blockages = incidentHistory.filter(i => i.category === 'ROAD_BLOCKAGE').length;
    const waters = incidentHistory.filter(i => i.category === 'WEATHER_WATERLOGGING').length;
    const breakdowns = incidentHistory.filter(i => i.category === 'VEHICLE_BREAKDOWN').length;

    // Badges & Overlay Stats
    const navBadge = document.getElementById('navIncidentCountBadge');
    const statTotal = document.getElementById('statTotalIncidents');
    const statCrit = document.getElementById('statCriticalIncidents');
    const statMy = document.getElementById('statMyIncidents');
    const statLatest = document.getElementById('statLatestTitle');
    const historyModalCount = document.getElementById('historyModalCountBadge');

    if (navBadge) navBadge.textContent = total;
    if (statTotal) statTotal.textContent = total;
    if (statCrit) statCrit.textContent = critical;
    if (statMy) statMy.textContent = myReports;
    if (statLatest && incidentHistory.length > 0) {
      statLatest.textContent = incidentHistory[0].subject || 'Recent Alert';
    }
    if (historyModalCount) historyModalCount.textContent = `${total} Posted`;

    // Filter Chips Counts
    const countAll = document.getElementById('countFilterAll');
    const countCollision = document.getElementById('countFilterCollision');
    const countBlockage = document.getElementById('countFilterBlockage');
    const countWater = document.getElementById('countFilterWater');
    const countBreakdown = document.getElementById('countFilterBreakdown');
    const countMy = document.getElementById('countFilterMy');

    if (countAll) countAll.textContent = total;
    if (countCollision) countCollision.textContent = collisions;
    if (countBlockage) countBlockage.textContent = blockages;
    if (countWater) countWater.textContent = waters;
    if (countBreakdown) countBreakdown.textContent = breakdowns;
    if (countMy) countMy.textContent = myReports;
  }

  // 3. Initialize MapLibre GL JS 3D Traffic Map
  let activeMap = null;
  let networkEdges = [];
  let networkNodes = [];

  try {
    if (typeof MapLibre3DTrafficMap !== 'undefined') {
      activeMap = new MapLibre3DTrafficMap('map');
      await activeMap.init();
      console.info('MapLibre GL JS 3D Traffic Map initialized successfully.');
    }
  } catch (err) {
    console.warn('MapLibre GL 3D Map initialization error:', err);
  }

  // Load Road Network
  async function loadPublicNetwork() {
    try {
      let netData = null;
      try {
        const res = await fetch('/api/v1/navigation/network');
        if (res.ok) {
          netData = await res.json();
        }
      } catch (e) {}

      if (!netData) {
        try {
          const fallbackRes = await fetch('/data/seed_network.json');
          if (fallbackRes.ok) {
            netData = await fallbackRes.json();
          }
        } catch (e) {}
      }

      if (netData) {
        networkNodes = netData.nodes || [];
        networkEdges = netData.edges || [];

        if (activeMap) {
          activeMap.renderNetwork(networkNodes, networkEdges);
          if (typeof activeMap.renderIncidents === 'function') {
            activeMap.renderIncidents(incidentHistory);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load public traffic network:', err);
    }
  }

  await loadPublicNetwork();
  updateIncidentCounters();

  // 4. Incident History Modal Management
  const btnOpenHistoryModal = document.getElementById('btnOpenHistoryModal');
  const btnQuickViewHistory = document.getElementById('btnQuickViewHistory');
  const incidentHistoryModal = document.getElementById('incidentHistoryModal');
  const btnCloseHistoryModal = document.getElementById('btnCloseHistoryModal');
  const btnCloseHistoryBtn = document.getElementById('btnCloseHistoryBtn');
  const btnReportFromHistory = document.getElementById('btnReportFromHistory');
  const incidentHistoryList = document.getElementById('incidentHistoryList');
  let currentHistoryFilter = 'ALL';

  function openHistoryModal() {
    renderIncidentHistoryList(currentHistoryFilter);
    if (incidentHistoryModal) {
      incidentHistoryModal.classList.add('active');
    }
  }

  function closeHistoryModal() {
    if (incidentHistoryModal) {
      incidentHistoryModal.classList.remove('active');
    }
  }

  if (btnOpenHistoryModal) btnOpenHistoryModal.addEventListener('click', openHistoryModal);
  if (btnQuickViewHistory) btnQuickViewHistory.addEventListener('click', openHistoryModal);
  if (btnCloseHistoryModal) btnCloseHistoryModal.addEventListener('click', closeHistoryModal);
  if (btnCloseHistoryBtn) btnCloseHistoryBtn.addEventListener('click', closeHistoryModal);

  if (incidentHistoryModal) {
    incidentHistoryModal.addEventListener('click', (e) => {
      if (e.target === incidentHistoryModal) closeHistoryModal();
    });
  }

  // Filter Chips Listeners
  const filterChips = document.querySelectorAll('.filter-chip');
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentHistoryFilter = chip.getAttribute('data-filter') || 'ALL';
      renderIncidentHistoryList(currentHistoryFilter);
    });
  });

  function renderIncidentHistoryList(filter = 'ALL') {
    if (!incidentHistoryList) return;

    let items = [...incidentHistory];
    if (filter === 'MY_REPORTS') {
      items = items.filter(i => i.reporter === currentCitizen.name);
    } else if (filter !== 'ALL') {
      items = items.filter(i => i.category === filter);
    }

    if (items.length === 0) {
      incidentHistoryList.innerHTML = `
        <div class="history-empty-state">
          <div style="font-size: 32px; margin-bottom: 8px;">📋</div>
          <div style="font-weight: 700; color: #cbd5e1; font-size: 14px; margin-bottom: 4px;">No Incidents Found</div>
          <p style="font-size: 12px; margin-bottom: 14px;">No incident reports matching this filter are logged.</p>
          <button type="button" id="btnEmptyReport" style="padding: 6px 14px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
            + Post an Incident
          </button>
        </div>
      `;
      document.getElementById('btnEmptyReport')?.addEventListener('click', () => {
        closeHistoryModal();
        openReportModal();
      });
      return;
    }

    incidentHistoryList.innerHTML = items.map(inc => {
      const severityClass = (inc.severity || 'HIGH').toLowerCase();
      const relativeTime = formatRelativeTime(inc.timestamp);
      const photoHtml = inc.photo
        ? `<div style="margin-top: 8px; border-radius: 8px; overflow: hidden; max-height: 120px; border: 1px solid #10b981;">
             <img src="${inc.photo}" style="width: 100%; height: 100%; object-fit: cover;" alt="Camera photo"/>
           </div>`
        : '';

      return `
        <div class="incident-card ${severityClass}" data-id="${inc.id}">
          <div class="incident-card-header">
            <div class="incident-card-tags">
              <span class="incident-tag tag-severity-${severityClass}">${inc.severity || 'HIGH'}</span>
              <span class="incident-tag tag-category">${inc.category || 'HAZARD'}</span>
              ${inc.photo ? '<span class="incident-tag" style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #34d399;">📸 Photo Verified</span>' : ''}
            </div>
            <span class="incident-card-time">${relativeTime}</span>
          </div>

          <div class="incident-card-title">${inc.subject || 'Incident Alert'}</div>
          <div class="incident-card-loc">📍 ${inc.location || 'Mangaluru Sector'}</div>
          ${inc.description ? `<div class="incident-card-desc">${inc.description}</div>` : ''}
          ${photoHtml}

          <div class="incident-card-footer">
            <span class="incident-card-reporter">Reported by: <strong>${inc.reporter || 'Citizen'}</strong></span>
            <button type="button" class="btn-locate-map" data-lat="${inc.lat || 12.875}" data-lng="${inc.lng || 74.855}" data-title="${encodeURIComponent(inc.subject || 'Incident')}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <span>Locate on Map</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach "Locate on Map" listeners
    const locateButtons = incidentHistoryList.querySelectorAll('.btn-locate-map');
    locateButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const lat = parseFloat(btn.getAttribute('data-lat'));
        const lng = parseFloat(btn.getAttribute('data-lng'));
        const title = decodeURIComponent(btn.getAttribute('data-title') || 'Incident');

        closeHistoryModal();

        if (activeMap && typeof activeMap.focusLocation === 'function') {
          activeMap.focusLocation(lat, lng, title, 16);
        } else if (activeMap && activeMap.map) {
          activeMap.map.setView([lat, lng], 16);
        }

        showToast(`Centered map on: "${title}"`);
      });
    });
  }

  // 5. Emergency SOS / Incident Reporting Modal
  const btnEmergencyFab = document.getElementById('btnEmergencyFab');
  const incidentModal = document.getElementById('incidentReportModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCancelReport = document.getElementById('btnCancelReport');
  const emergencyForm = document.getElementById('emergencyReportForm');
  const toastNotification = document.getElementById('publicToast');
  const toastMessage = document.getElementById('toastMessage');

  const modalCategorySelect = document.getElementById('modalCategorySelect');
  const modalIncidentSubject = document.getElementById('modalIncidentSubject');
  const modalIncidentLocation = document.getElementById('modalIncidentLocation');
  const btnUseCurrentLocation = document.getElementById('btnUseCurrentLocation');
  const gpsActivePill = document.getElementById('gpsActivePill');

  // Camera Elements
  const cameraInput = document.getElementById('cameraInput');
  const btnStartLiveCamera = document.getElementById('btnStartLiveCamera');
  const btnSnapPhoto = document.getElementById('btnSnapPhoto');
  const btnStopLiveCamera = document.getElementById('btnStopLiveCamera');
  const btnTriggerNativeCamera = document.getElementById('btnTriggerNativeCamera');
  const cameraStreamWrapper = document.getElementById('cameraStreamWrapper');
  const cameraVideo = document.getElementById('cameraVideo');
  const cameraCanvas = document.getElementById('cameraCanvas');
  const photoPreviewCard = document.getElementById('photoPreviewCard');
  const photoPreviewImg = document.getElementById('photoPreviewImg');
  const btnRemovePhoto = document.getElementById('btnRemovePhoto');

  let activeMediaStream = null;
  let capturedPhotoBase64 = null;
  let currentCoordinates = { lat: 12.8750, lng: 74.8550 };

  // Live Camera Logic
  async function startLiveCamera() {
    try {
      if (activeMediaStream) stopLiveCamera();
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      activeMediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (cameraVideo) {
        cameraVideo.srcObject = activeMediaStream;
        cameraStreamWrapper.classList.add('active');
        if (btnStartLiveCamera) btnStartLiveCamera.style.display = 'none';
        if (btnSnapPhoto) btnSnapPhoto.style.display = 'inline-flex';
        if (btnStopLiveCamera) btnStopLiveCamera.style.display = 'inline-flex';
      }
    } catch (err) {
      console.warn('Live camera stream inaccessible, falling back to device camera:', err);
      if (cameraInput) cameraInput.click();
    }
  }

  function stopLiveCamera() {
    if (activeMediaStream) {
      activeMediaStream.getTracks().forEach(t => t.stop());
      activeMediaStream = null;
    }
    if (cameraVideo) cameraVideo.srcObject = null;
    if (cameraStreamWrapper) cameraStreamWrapper.classList.remove('active');
    if (btnStartLiveCamera) btnStartLiveCamera.style.display = 'inline-flex';
    if (btnSnapPhoto) btnSnapPhoto.style.display = 'none';
    if (btnStopLiveCamera) btnStopLiveCamera.style.display = 'none';
  }

  function snapPhotoFromStream() {
    if (!cameraVideo || !cameraCanvas) return;
    const width = cameraVideo.videoWidth || 640;
    const height = cameraVideo.videoHeight || 480;

    cameraCanvas.width = width;
    cameraCanvas.height = height;
    const ctx = cameraCanvas.getContext('2d');
    ctx.drawImage(cameraVideo, 0, 0, width, height);

    capturedPhotoBase64 = cameraCanvas.toDataURL('image/jpeg', 0.85);
    setPhotoPreview(capturedPhotoBase64);
    stopLiveCamera();
  }

  function setPhotoPreview(src) {
    capturedPhotoBase64 = src;
    if (photoPreviewImg && photoPreviewCard) {
      photoPreviewImg.src = src;
      photoPreviewCard.classList.add('active');
    }
  }

  function clearPhotoPreview() {
    capturedPhotoBase64 = null;
    if (photoPreviewImg) photoPreviewImg.src = '';
    if (photoPreviewCard) photoPreviewCard.classList.remove('active');
    if (cameraInput) cameraInput.value = '';
  }

  if (btnStartLiveCamera) btnStartLiveCamera.addEventListener('click', startLiveCamera);
  if (btnSnapPhoto) btnSnapPhoto.addEventListener('click', snapPhotoFromStream);
  if (btnStopLiveCamera) btnStopLiveCamera.addEventListener('click', stopLiveCamera);

  if (btnTriggerNativeCamera && cameraInput) {
    btnTriggerNativeCamera.addEventListener('click', () => cameraInput.click());
    cameraInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setPhotoPreview(event.target.result);
          stopLiveCamera();
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (btnRemovePhoto) btnRemovePhoto.addEventListener('click', clearPhotoPreview);

  // GPS Current Location Logic
  if (btnUseCurrentLocation) {
    btnUseCurrentLocation.addEventListener('click', () => {
      if (modalIncidentLocation) modalIncidentLocation.placeholder = 'Acquiring GPS fix...';

      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = Math.round(position.coords.accuracy || 15);
            currentCoordinates = { lat, lng };

            if (modalIncidentLocation) {
              modalIncidentLocation.value = `GPS: ${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E (±${accuracy}m)`;
            }
            if (gpsActivePill) gpsActivePill.style.display = 'inline-block';

            if (activeMap && typeof activeMap.focusLocation === 'function') {
              activeMap.focusLocation(lat, lng, 'Your Current GPS Location');
            } else if (activeMap && activeMap.map) {
              activeMap.map.setView([lat, lng], 15);
            }
          },
          (error) => {
            console.warn('Geolocation fallback:', error);
            if (modalIncidentLocation) {
              modalIncidentLocation.value = currentCitizen.address || 'Mangaluru Sector';
            }
            if (gpsActivePill) {
              gpsActivePill.textContent = 'Approx Location';
              gpsActivePill.style.display = 'inline-block';
            }
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      }
    });
  }

  function openReportModal() {
    if (incidentModal) {
      incidentModal.classList.add('active');
      if (modalIncidentSubject) modalIncidentSubject.focus();
      if (modalIncidentLocation && !modalIncidentLocation.value) {
        modalIncidentLocation.value = currentCitizen.address || '';
      }
    }
  }

  function closeReportModal() {
    stopLiveCamera();
    if (incidentModal) incidentModal.classList.remove('active');
  }

  if (btnEmergencyFab) btnEmergencyFab.addEventListener('click', openReportModal);
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeReportModal);
  if (btnCancelReport) btnCancelReport.addEventListener('click', closeReportModal);
  if (btnReportFromHistory) {
    btnReportFromHistory.addEventListener('click', () => {
      closeHistoryModal();
      openReportModal();
    });
  }

  if (incidentModal) {
    incidentModal.addEventListener('click', (e) => {
      if (e.target === incidentModal) closeReportModal();
    });
  }

  // 6. Handle SOS Form Submission & Append to Live Incident History
  if (emergencyForm) {
    emergencyForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const category = modalCategorySelect?.value || 'ROAD_BLOCKAGE';
      const subject = modalIncidentSubject?.value.trim() || 'Citizen Incident';
      const location = modalIncidentLocation?.value.trim() || currentCitizen.address || 'Mangaluru Sector';
      const description = document.getElementById('modalIncidentDesc')?.value || '';
      const severity = document.getElementById('modalSeveritySelect')?.value || 'HIGH';

      // Parse or generate realistic coordinates near Mangaluru
      let incLat = currentCoordinates.lat;
      let incLng = currentCoordinates.lng;
      const match = location.match(/GPS:\s*([\d\.]+)°\s*N,\s*([\d\.]+)°\s*E/i);
      if (match) {
        incLat = parseFloat(match[1]);
        incLng = parseFloat(match[2]);
      } else {
        // Random offset near city center
        incLat = 12.8750 + (Math.random() - 0.5) * 0.015;
        incLng = 74.8550 + (Math.random() - 0.5) * 0.015;
      }

      // Create new incident record
      const newIncident = {
        id: `CIT-MNG-${Date.now().toString().slice(-4)}`,
        timestamp: new Date().toISOString(),
        timeAgo: 'Just now',
        subject: subject,
        category: category,
        location: location,
        lat: incLat,
        lng: incLng,
        severity: severity,
        description: description,
        reporter: currentCitizen.name,
        reporterAddress: currentCitizen.address,
        verified: true,
        photo: capturedPhotoBase64
      };

      // Prepend to history & save
      incidentHistory.unshift(newIncident);
      saveIncidentHistory();

      // Submit to backend citizen report API if active
      try {
        const payload = {
          reporter_name: currentCitizen.name,
          contact_number: currentCitizen.age ? `Age ${currentCitizen.age}` : null,
          road_segment_id: "corridor_cctv_01",
          category: category === 'OTHER' ? 'COLLISION' : category,
          description: `${subject} at ${location}: ${description}`,
          lanes_affected: severity === 'CRITICAL' ? 2 : 1
        };

        await fetch('/api/v1/intelligence/citizen-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.warn('Backend report ingestion fallback:', err);
      }

      // Update Map Pins
      if (activeMap && typeof activeMap.renderIncidents === 'function') {
        activeMap.renderIncidents(incidentHistory);
        activeMap.focusLocation(incLat, incLng, subject, 16);
      }

      // Show success toast with new total count
      showToast(`Incident #${incidentHistory.length} posted to live log! Dispatched to Control Room.`);

      // Reset & Clean up
      closeReportModal();
      clearPhotoPreview();
      emergencyForm.reset();
    });
  }

  // 7. MapLibre 3D Building Extrusions Perspective View Toggle
  const btnToggle3DView = document.getElementById('btnToggle3DView');
  const label3DView = document.getElementById('label3DView');
  let is3DActive = true;

  if (btnToggle3DView) {
    btnToggle3DView.addEventListener('click', () => {
      if (!activeMap || !activeMap.map) return;
      is3DActive = !is3DActive;
      if (is3DActive) {
        btnToggle3DView.classList.add('active');
        if (label3DView) label3DView.textContent = '3D Buildings';
        activeMap.map.easeTo({ pitch: 52, bearing: -17.6, duration: 800 });
        showToast('Switched to 3D Isometric View with building extrusions.');
      } else {
        btnToggle3DView.classList.remove('active');
        if (label3DView) label3DView.textContent = '2D Top-Down';
        activeMap.map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
        showToast('Switched to 2D Top-Down View.');
      }
    });
  }

  // Toast Function
  function showToast(msg) {
    if (!toastNotification || !toastMessage) return;
    toastMessage.textContent = msg;
    toastNotification.classList.add('show');
    setTimeout(() => {
      toastNotification.classList.remove('show');
    }, 4500);
  }
});
