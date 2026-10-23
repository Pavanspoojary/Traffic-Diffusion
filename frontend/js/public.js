// Public Citizen Portal & Emergency Map Controller
// Supports MapLibre GL JS 3D vector map with 3D buildings, road-following traffic corridors,
// WebGL junction nodes, camera photo capture, live incident history, and emergency SOS dispatch.

document.addEventListener('DOMContentLoaded', () => {
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

  // Populate User Chip in Nav safely
  const userNameElem = document.getElementById('citizenDisplayName');
  const userAddressElem = document.getElementById('citizenDisplayAddress');
  const userAvatarElem = document.getElementById('citizenAvatarInitials');

  if (userNameElem) userNameElem.textContent = currentCitizen.name || 'Citizen User';
  if (userAddressElem) userAddressElem.textContent = `${currentCitizen.address || 'Mangaluru Sector'} (Age: ${currentCitizen.age || '-'})`;
  if (userAvatarElem) {
    const rawName = (currentCitizen.name || 'Citizen User').trim();
    const parts = rawName.split(/\s+/).filter(Boolean);
    const initials = parts.length > 0 
      ? parts.map(p => p[0]).join('').toUpperCase().slice(0, 2)
      : 'CU';
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

  // 3. Modals and Core UI Binding (Synchronous & Immediate)
  const incidentModal = document.getElementById('incidentReportModal');
  const btnEmergencyFab = document.getElementById('btnEmergencyFab');
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

  // History Modal Elements
  const btnOpenHistoryModal = document.getElementById('btnOpenHistoryModal');
  const btnQuickViewHistory = document.getElementById('btnQuickViewHistory');
  const incidentHistoryModal = document.getElementById('incidentHistoryModal');
  const btnCloseHistoryModal = document.getElementById('btnCloseHistoryModal');
  const btnCloseHistoryBtn = document.getElementById('btnCloseHistoryBtn');
  const btnReportFromHistory = document.getElementById('btnReportFromHistory');
  const incidentHistoryList = document.getElementById('incidentHistoryList');
  let currentHistoryFilter = 'ALL';

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

  // Toast Function
  function showToast(msg) {
    if (!toastNotification || !toastMessage) return;
    toastMessage.textContent = msg;
    toastNotification.classList.add('show');
    setTimeout(() => {
      toastNotification.classList.remove('show');
    }, 4500);
  }

  // Incident Reporting Modal Open / Close
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

  // Globally expose for inline click handlers as a failsafe
  window.openCitizenReportModal = openReportModal;
  window.closeCitizenReportModal = closeReportModal;

  // Bind Emergency FAB & Modal Buttons Immediately
  if (btnEmergencyFab) {
    btnEmergencyFab.addEventListener('click', (e) => {
      e.stopPropagation();
      openReportModal();
    });
  }
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeReportModal);
  if (btnCancelReport) btnCancelReport.addEventListener('click', closeReportModal);
  if (incidentModal) {
    incidentModal.addEventListener('click', (e) => {
      if (e.target === incidentModal) closeReportModal();
    });
  }

  // History Modal Handlers
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

  window.openCitizenHistoryModal = openHistoryModal;
  window.closeCitizenHistoryModal = closeHistoryModal;

  if (btnOpenHistoryModal) btnOpenHistoryModal.addEventListener('click', openHistoryModal);
  if (btnQuickViewHistory) btnQuickViewHistory.addEventListener('click', openHistoryModal);
  if (btnCloseHistoryModal) btnCloseHistoryModal.addEventListener('click', closeHistoryModal);
  if (btnCloseHistoryBtn) btnCloseHistoryBtn.addEventListener('click', closeHistoryModal);
  if (btnReportFromHistory) {
    btnReportFromHistory.addEventListener('click', () => {
      closeHistoryModal();
      openReportModal();
    });
  }
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

  // Handle Category Select Change
  if (modalCategorySelect) {
    modalCategorySelect.addEventListener('change', () => {
      const selectedVal = modalCategorySelect.value;
      const subjectInput = document.getElementById('modalIncidentSubject');
      const subjectHint = document.getElementById('subjectHint');

      if (selectedVal === 'OTHER') {
        if (subjectInput) {
          subjectInput.placeholder = 'Please specify custom incident subject...';
          subjectInput.focus();
        }
        if (subjectHint) subjectHint.textContent = 'Custom Subject (Required)';
      } else {
        if (subjectInput) subjectInput.placeholder = 'e.g. Fallen electrical wire blocking junction';
        if (subjectHint) subjectHint.textContent = 'Required';
      }
    });
  }

  // Live Camera Handlers
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

  // GPS Current Location Handlers
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
              activeMap.focusLocation(lat, lng, 'Your Current GPS Location', 16);
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

  // Handle SOS Form Submission & Live Sync
  if (emergencyForm) {
    emergencyForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const category = modalCategorySelect?.value || 'ROAD_BLOCKAGE';
      const subject = modalIncidentSubject?.value.trim() || 'Citizen Incident';
      const location = modalIncidentLocation?.value.trim() || currentCitizen.address || 'Mangaluru Sector';
      const description = document.getElementById('modalIncidentDesc')?.value.trim() || '';
      const severity = document.getElementById('modalSeveritySelect')?.value || 'HIGH';

      const corridorSelect = document.getElementById('modalCorridorSelect');
      const corridorId = corridorSelect?.value || 'corridor_cctv_07';
      const corridorName = corridorSelect?.options[corridorSelect.selectedIndex]?.text || corridorId;

      const lanesSelect = document.getElementById('modalLanesSelect');
      const lanesAffected = parseInt(lanesSelect?.value || '1', 10);

      const fullDetails = `${subject} (${location}) ${description ? '— ' + description : ''}`.trim();

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
        description: description || fullDetails,
        reporter: currentCitizen.name || 'Citizen Commuter',
        reporterAddress: currentCitizen.address,
        verified: true,
        photo: capturedPhotoBase64
      };

      // Prepend to history & save locally
      incidentHistory.unshift(newIncident);
      saveIncidentHistory();

      // Submit to backend intelligence API
      try {
        const payload = {
          incident_id: newIncident.id,
          corridor_id: corridorId,
          road_segment_id: corridorId || 'corridor_cctv_07',
          category: category,
          incident_type: category,
          severity: severity,
          description: fullDetails,
          lat: incLat,
          lng: incLng,
          location: location,
          lanes_affected: lanesAffected,
          reporter_name: currentCitizen.name || 'Citizen Commuter',
          citizen_name: currentCitizen.name || 'Citizen Commuter',
          citizen_address: currentCitizen.address || 'Mangaluru',
          has_photo: !!capturedPhotoBase64
        };

        const res = await fetch('/api/v1/intelligence/citizen-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          showToast(`Emergency alert submitted: "${subject}" on ${corridorName}! Control room notified.`);
        } else {
          showToast(`Incident #${incidentHistory.length} posted to live log! Dispatched to Control Room.`);
        }
      } catch (err) {
        showToast(`Incident #${incidentHistory.length} posted to live log! Dispatched to Control Room.`);
      }

      // Update Map Pins if active
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

  // 3D Building Extrusions Perspective View Toggle
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

  // Initial count update
  updateIncidentCounters();

  // ========================================================================
  // Google Maps Authentic Navigation & Interactive Controls Controller
  // ========================================================================
  function initGoogleMapsInterface() {
    let currentMode = 'driving';
    let currentCalculatedRoute = null;
    let isTrafficLayerVisible = true;

    // Mode Speed Multipliers for realistic ETAs
    const MODE_FACTORS = {
      driving: 1.0,
      two_wheeler: 0.8,
      transit: 1.35,
      walking: 4.2
    };

    // DOM Elements
    const searchInput = document.getElementById('gmapsSearchInput');
    const clearSearchBtn = document.getElementById('btnClearSearch');
    const suggestionsBox = document.getElementById('gmapsSearchSuggestions');
    const directionsCard = document.getElementById('gmapsDirectionsCard');
    const directionsBtn = document.getElementById('btnGmapsDirections');
    const closeDirectionsBtn = document.getElementById('btnCloseDirections');
    const modeTabs = document.querySelectorAll('.gmaps-mode-tab');
    const originSelect = document.getElementById('gmapsOriginSelect');
    const destinationSelect = document.getElementById('gmapsDestinationSelect');
    const swapPointsBtn = document.getElementById('btnSwapRoutePoints');
    const calculateRouteBtn = document.getElementById('btnCalculateRoute');
    const avoidIncidentsChk = document.getElementById('chkAvoidIncidents');
    const routeResults = document.getElementById('gmapsRouteResults');
    const routeEtaNumber = document.getElementById('routeEtaNumber');
    const routeDistanceText = document.getElementById('routeDistanceText');
    const routeTrafficBadge = document.getElementById('routeTrafficBadge');
    const routeViaRoad = document.getElementById('routeViaRoad');
    const routeIncidentAlertRow = document.getElementById('routeIncidentAlertRow');
    const routeIncidentAlertText = document.getElementById('routeIncidentAlertText');
    const startNavBtn = document.getElementById('btnStartNavigation');
    const toggleStepsBtn = document.getElementById('btnToggleTurnSteps');
    const clearRouteBtn = document.getElementById('btnClearRouteDisplay');
    const stepsList = document.getElementById('gmapsStepsList');

    // Place Card Elements
    const placeCard = document.getElementById('gmapsPlaceCard');
    const closePlaceCardBtn = document.getElementById('btnClosePlaceCard');
    const placeCardBadge = document.getElementById('placeCardSeverityBadge');
    const placeCardTitle = document.getElementById('placeCardTitle');
    const placeCardSubtitle = document.getElementById('placeCardSubtitle');
    const placeCardDelay = document.getElementById('placeCardDelay');
    const placeCardLanes = document.getElementById('placeCardLanes');
    const placeCardReported = document.getElementById('placeCardReported');
    const placeCardDesc = document.getElementById('placeCardDesc');
    const placeCardPhotoWrapper = document.getElementById('placeCardPhotoWrapper');
    const placeCardPhoto = document.getElementById('placeCardPhoto');
    const btnPlaceDirections = document.getElementById('btnPlaceDirections');
    const btnPlaceReportUpdate = document.getElementById('btnPlaceReportUpdate');

    // Floating Map Controls
    const btnCompassReset = document.getElementById('btnCompassReset');
    const btnMyLocation = document.getElementById('btnGmapsMyLocation');
    const btnMapLayers = document.getElementById('btnGmapsLayers');
    const btnZoomIn = document.getElementById('btnGmapsZoomIn');
    const btnZoomOut = document.getElementById('btnGmapsZoomOut');

    // Filter Chips
    const chipTraffic = document.getElementById('chipTraffic');
    const chipIncidents = document.getElementById('chipIncidents');
    const chipHospitals = document.getElementById('chipHospitals');

    // 1. Search Bar Input & Autocomplete
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        if (query.length > 0) {
          if (clearSearchBtn) clearSearchBtn.style.display = 'flex';
          renderSearchSuggestions(query);
        } else {
          if (clearSearchBtn) clearSearchBtn.style.display = 'none';
          if (suggestionsBox) suggestionsBox.style.display = 'none';
        }
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const firstSug = suggestionsBox?.querySelector('.gmaps-suggestion-item');
          if (firstSug) firstSug.click();
        }
      });
    }

    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        clearSearchBtn.style.display = 'none';
        if (suggestionsBox) suggestionsBox.style.display = 'none';
        clearGoogleRouteFromMap();
        if (placeCard) placeCard.style.display = 'none';
      });
    }

    function renderSearchSuggestions(query) {
      if (!suggestionsBox) return;

      const matches = [];

      // Search junctions / nodes
      networkNodes.forEach(node => {
        if (node.name.toLowerCase().includes(query) || (node.type && node.type.toLowerCase().includes(query))) {
          matches.push({
            type: 'node',
            title: node.name,
            subtitle: node.type || 'Key Intersection',
            icon: '📍',
            data: node
          });
        }
      });

      // Search active incidents
      incidentHistory.forEach(inc => {
        if (
          inc.subject.toLowerCase().includes(query) ||
          inc.location.toLowerCase().includes(query) ||
          inc.category.toLowerCase().includes(query)
        ) {
          matches.push({
            type: 'incident',
            title: inc.subject,
            subtitle: `⚠️ ${inc.category} · ${inc.location}`,
            icon: '🚨',
            data: inc
          });
        }
      });

      if (matches.length === 0) {
        suggestionsBox.innerHTML = `
          <div class="gmaps-suggestion-item" style="cursor: default; color: #70757a;">
            <span>No places or incidents match "${query}"</span>
          </div>
        `;
        suggestionsBox.style.display = 'block';
        return;
      }

      suggestionsBox.innerHTML = matches.slice(0, 6).map(m => `
        <div class="gmaps-suggestion-item" data-type="${m.type}">
          <span class="gmaps-suggestion-icon">${m.icon}</span>
          <div>
            <div class="gmaps-suggestion-main">${m.title}</div>
            <div class="gmaps-suggestion-sub">${m.subtitle}</div>
          </div>
        </div>
      `).join('');

      suggestionsBox.style.display = 'block';

      // Item selection handlers
      const items = suggestionsBox.querySelectorAll('.gmaps-suggestion-item');
      items.forEach((item, index) => {
        item.addEventListener('click', () => {
          const m = matches[index];
          if (!m) return;

          if (searchInput) searchInput.value = m.title;
          suggestionsBox.style.display = 'none';

          if (m.type === 'node') {
            const node = m.data;
            if (activeMap && typeof activeMap.focusLocation === 'function') {
              activeMap.focusLocation(node.lat, node.lng, node.name, 16);
            }
            showJunctionPlaceCard(node);
          } else if (m.type === 'incident') {
            const inc = m.data;
            if (activeMap && typeof activeMap.focusLocation === 'function') {
              activeMap.focusLocation(inc.lat, inc.lng, inc.subject, 16);
            }
            showIncidentPlaceCard(inc);
          }
        });
      });
    }

    // 2. Directions Panel & Trigger
    function openDirectionsPanel() {
      if (directionsCard) {
        directionsCard.style.display = 'block';
        if (destinationSelect) destinationSelect.focus();
      }
      if (suggestionsBox) suggestionsBox.style.display = 'none';
    }

    function closeDirectionsPanel() {
      if (directionsCard) directionsCard.style.display = 'none';
      clearGoogleRouteFromMap();
      currentCalculatedRoute = null;
    }

    if (directionsBtn) directionsBtn.addEventListener('click', () => {
      if (directionsCard.style.display === 'block') {
        closeDirectionsPanel();
      } else {
        openDirectionsPanel();
      }
    });

    if (closeDirectionsBtn) closeDirectionsBtn.addEventListener('click', closeDirectionsPanel);

    // Mode Selector Tabs (Driving, Two-Wheeler, Transit, Walking)
    modeTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        modeTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentMode = tab.getAttribute('data-mode') || 'driving';

        // Re-display route with updated mode factor if already computed
        if (currentCalculatedRoute) {
          updateRouteMetricsDisplay(currentCalculatedRoute);
        }
      });
    });

    // Swap Origin & Destination
    if (swapPointsBtn) {
      swapPointsBtn.addEventListener('click', () => {
        if (!originSelect || !destinationSelect) return;
        const temp = originSelect.value;
        // If origin was GPS, set destination to default Hampankatta
        originSelect.value = destinationSelect.value;
        destinationSelect.value = temp === 'CURRENT_GPS' ? 'INT_HAMPANKATTA' : temp;

        if (currentCalculatedRoute) {
          calculateRouteAction();
        }
      });
    }

    // 3. Route Calculation Action
    async function calculateRouteAction() {
      if (!originSelect || !destinationSelect) return;

      let originId = originSelect.value;
      const destId = destinationSelect.value;
      const avoidBlockages = avoidIncidentsChk ? avoidIncidentsChk.checked : true;

      // Handle GPS starting point by defaulting to closest primary central junction
      if (originId === 'CURRENT_GPS') {
        originId = 'INT_HAMPANKATTA';
      }

      if (originId === destId) {
        showToast('Origin and Destination cannot be the same junction.');
        return;
      }

      showToast('Calculating fastest street route avoiding incidents...');

      try {
        const payload = {
          origin_node_id: originId,
          destination_node_id: destId,
          is_emergency: false,
          avoid_congestion: avoidBlockages
        };

        const res = await fetch('/api/v1/navigation/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          throw new Error(`Route computation failed with status ${res.status}`);
        }

        const data = await res.json();
        const primary = data.primary_route;

        if (!primary) {
          showToast('No viable street route found between selected points.');
          return;
        }

        currentCalculatedRoute = primary;
        updateRouteMetricsDisplay(primary);

        // Draw Google blue route line on MapLibre map
        if (primary.path_coordinates && primary.path_coordinates.length > 0) {
          drawGoogleRouteOnMap(primary.path_coordinates);
        }

        showToast(`Route found: ${primary.total_distance_km} km via ${primary.primary_road_name || 'Mangaluru Arterial'}`);

      } catch (err) {
        console.error('Route calculation error:', err);
        showToast('Error calculating route. Falling back to direct corridor.');
      }
    }

    function updateRouteMetricsDisplay(route) {
      if (!routeResults) return;

      const factor = MODE_FACTORS[currentMode] || 1.0;
      const baseTime = route.estimated_travel_time_min || 8;
      const computedMin = Math.max(2, Math.round(baseTime * factor));

      if (routeEtaNumber) {
        routeEtaNumber.textContent = `${computedMin} min`;
        // Color coding based on congestion
        if (computedMin > baseTime * 1.3) {
          routeEtaNumber.style.color = '#ea8600'; // Amber/Orange
        } else {
          routeEtaNumber.style.color = '#1e8e3e'; // Google Green
        }
      }

      if (routeDistanceText) {
        routeDistanceText.textContent = `(${route.total_distance_km} km)`;
      }

      if (routeViaRoad) {
        routeViaRoad.textContent = `via ${route.primary_road_name || 'K.S. Rao Road / Bunts Hostel Ave'}`;
      }

      if (routeTrafficBadge) {
        if (route.closures_encountered > 0) {
          routeTrafficBadge.textContent = 'Incident detour active';
          routeTrafficBadge.style.background = '#fef7e0';
          routeTrafficBadge.style.color = '#b06000';
        } else {
          routeTrafficBadge.textContent = 'Fastest route now';
          routeTrafficBadge.style.background = '#e6f4ea';
          routeTrafficBadge.style.color = '#137333';
        }
      }

      // Incident warning alert row
      if (routeIncidentAlertRow && routeIncidentAlertText) {
        if (route.closures_encountered > 0 || (route.congestion_points && route.congestion_points.length > 0)) {
          routeIncidentAlertRow.style.display = 'flex';
          routeIncidentAlertText.textContent = route.closures_encountered > 0
            ? 'Detour active: Successfully bypassing blocked commercial freight zone'
            : 'Caution: Moderate congestion detected along secondary arterial';
        } else {
          routeIncidentAlertRow.style.display = 'none';
        }
      }

      // Populate Turn-by-Turn Steps List
      if (stepsList) {
        const instructions = route.turn_instructions && route.turn_instructions.length > 0
          ? route.turn_instructions
          : [
              `Depart towards ${route.primary_road_name || 'City Arterial'}`,
              'Follow green traffic flow corridor',
              'Approaching destination junction'
            ];

        stepsList.innerHTML = instructions.map((step, idx) => `
          <div class="gmaps-step-item">
            <span class="gmaps-step-num">${idx + 1}</span>
            <span>${step}</span>
          </div>
        `).join('');
      }

      routeResults.style.display = 'block';
    }

    if (calculateRouteBtn) calculateRouteBtn.addEventListener('click', calculateRouteAction);

    // Start Navigation Button
    if (startNavBtn) {
      startNavBtn.addEventListener('click', () => {
        if (!activeMap || !activeMap.map || !currentCalculatedRoute) return;
        const coords = currentCalculatedRoute.path_coordinates;
        if (coords && coords.length > 0) {
          const startPt = coords[0];
          activeMap.map.flyTo({
            center: [startPt[1], startPt[0]],
            zoom: 17,
            pitch: 62,
            bearing: -22,
            speed: 1.5,
            curve: 1.2
          });
          showToast('Turn-by-turn navigation started! Follow blue route line.');
        }
      });
    }

    // Toggle Turn Steps Accordion
    if (toggleStepsBtn && stepsList) {
      toggleStepsBtn.addEventListener('click', () => {
        const isHidden = stepsList.style.display === 'none';
        stepsList.style.display = isHidden ? 'block' : 'none';
        toggleStepsBtn.textContent = isHidden ? 'Hide Steps' : 'Details & Steps';
      });
    }

    // Clear Route Display
    if (clearRouteBtn) {
      clearRouteBtn.addEventListener('click', () => {
        clearGoogleRouteFromMap();
        if (routeResults) routeResults.style.display = 'none';
        currentCalculatedRoute = null;
        showToast('Route cleared from map.');
      });
    }

    // 4. Map Drawing: Draw Google Route on MapLibre Map
    function drawGoogleRouteOnMap(coordinates) {
      if (!activeMap || !activeMap.map) return;
      const map = activeMap.map;

      // MapLibre requires [lng, lat]
      const lineCoords = coordinates.map(pt => [pt[1], pt[0]]);

      const geojsonData = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: lineCoords
        }
      };

      if (map.getSource('gmaps-route-source')) {
        map.getSource('gmaps-route-source').setData(geojsonData);
      } else {
        map.addSource('gmaps-route-source', {
          type: 'geojson',
          data: geojsonData
        });

        // Crisp white casing
        map.addLayer({
          id: 'gmaps-route-casing',
          type: 'line',
          source: 'gmaps-route-source',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#ffffff',
            'line-width': 9.5,
            'line-opacity': 0.98
          }
        });

        // Google Maps Blue Polyline
        map.addLayer({
          id: 'gmaps-route-line',
          type: 'line',
          source: 'gmaps-route-source',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#1a73e8',
            'line-width': 6.0,
            'line-opacity': 1.0
          }
        });
      }

      // Smoothly fit bounds
      if (lineCoords.length > 1 && typeof maplibregl !== 'undefined') {
        const bounds = new maplibregl.LngLatBounds();
        lineCoords.forEach(pt => bounds.extend(pt));
        map.fitBounds(bounds, {
          padding: { top: 90, bottom: 90, left: 420, right: 80 },
          duration: 1100,
          pitch: 44
        });
      }
    }

    function clearGoogleRouteFromMap() {
      if (!activeMap || !activeMap.map) return;
      const map = activeMap.map;
      if (map.getSource('gmaps-route-source')) {
        map.getSource('gmaps-route-source').setData({
          type: 'FeatureCollection',
          features: []
        });
      }
    }

    // 5. Place Card (Slide-up Bottom Sheet) Handlers
    function showIncidentPlaceCard(inc) {
      if (!placeCard) return;

      if (placeCardBadge) {
        placeCardBadge.textContent = `⚠️ ${(inc.severity || 'HIGH')} · ${inc.category || 'HAZARD'}`;
        placeCardBadge.style.background = inc.severity === 'CRITICAL' ? '#fce8e6' : '#fef7e0';
        placeCardBadge.style.color = inc.severity === 'CRITICAL' ? '#d93025' : '#b06000';
      }

      if (placeCardTitle) placeCardTitle.textContent = inc.subject || 'Active Incident';
      if (placeCardSubtitle) placeCardSubtitle.textContent = inc.location || 'Mangaluru Sector';
      if (placeCardDelay) placeCardDelay.textContent = inc.severity === 'CRITICAL' ? '+18 mins' : '+8 mins';
      if (placeCardLanes) placeCardLanes.textContent = `${inc.severity === 'CRITICAL' ? '2 Lanes' : '1 Lane'} Blocked`;
      if (placeCardReported) placeCardReported.textContent = inc.timeAgo || 'Recently';
      if (placeCardDesc) placeCardDesc.textContent = inc.description || 'Road disruption reported by citizen.';

      if (placeCardPhotoWrapper && placeCardPhoto) {
        if (inc.photo) {
          placeCardPhoto.src = inc.photo;
          placeCardPhotoWrapper.style.display = 'block';
        } else {
          placeCardPhotoWrapper.style.display = 'none';
        }
      }

      // Directions button sets destination and opens directions card
      if (btnPlaceDirections) {
        btnPlaceDirections.onclick = () => {
          placeCard.style.display = 'none';
          openDirectionsPanel();
          if (destinationSelect) {
            destinationSelect.value = 'INT_NANTHOOR'; // Default or matching junction
          }
          calculateRouteAction();
        };
      }

      if (btnPlaceReportUpdate) {
        btnPlaceReportUpdate.onclick = () => {
          placeCard.style.display = 'none';
          openReportModal();
        };
      }

      placeCard.style.display = 'block';
    }

    function showJunctionPlaceCard(node) {
      if (!placeCard) return;

      if (placeCardBadge) {
        placeCardBadge.textContent = '📍 KEY INTERSECTION';
        placeCardBadge.style.background = '#e8f0fe';
        placeCardBadge.style.color = '#1a73e8';
      }

      if (placeCardTitle) placeCardTitle.textContent = node.name || 'Junction';
      if (placeCardSubtitle) placeCardSubtitle.textContent = `Mangaluru Road Network · ID: ${node.id}`;
      if (placeCardDelay) placeCardDelay.textContent = 'Nominal Traffic';
      if (placeCardLanes) placeCardLanes.textContent = 'All Lanes Open';
      if (placeCardReported) placeCardReported.textContent = 'Live Sensor Feed';
      if (placeCardDesc) placeCardDesc.textContent = `Connected arterial junction. Latitude: ${node.lat.toFixed(5)}, Longitude: ${node.lng.toFixed(5)}.`;
      if (placeCardPhotoWrapper) placeCardPhotoWrapper.style.display = 'none';

      if (btnPlaceDirections) {
        btnPlaceDirections.onclick = () => {
          placeCard.style.display = 'none';
          openDirectionsPanel();
          if (destinationSelect) {
            destinationSelect.value = node.id;
          }
          calculateRouteAction();
        };
      }

      if (btnPlaceReportUpdate) {
        btnPlaceReportUpdate.onclick = () => {
          placeCard.style.display = 'none';
          openReportModal();
        };
      }

      placeCard.style.display = 'block';
    }

    if (closePlaceCardBtn) {
      closePlaceCardBtn.addEventListener('click', () => {
        if (placeCard) placeCard.style.display = 'none';
      });
    }

    // Listen to custom map events dispatched by MapLibre3DTrafficMap
    window.addEventListener('gmaps:incident-clicked', (e) => {
      if (e.detail) showIncidentPlaceCard(e.detail);
    });

    window.addEventListener('gmaps:junction-clicked', (e) => {
      if (e.detail) showJunctionPlaceCard(e.detail);
    });

    // 6. Floating Category Filter Chips Listeners
    if (chipTraffic) {
      chipTraffic.addEventListener('click', () => {
        if (!activeMap || !activeMap.map) return;
        isTrafficLayerVisible = !isTrafficLayerVisible;
        const visibility = isTrafficLayerVisible ? 'visible' : 'none';

        if (activeMap.map.getLayer('traffic-corridors-core')) {
          activeMap.map.setLayoutProperty('traffic-corridors-core', 'visibility', visibility);
        }
        if (activeMap.map.getLayer('traffic-corridors-glow')) {
          activeMap.map.setLayoutProperty('traffic-corridors-glow', 'visibility', visibility);
        }

        chipTraffic.classList.toggle('active', isTrafficLayerVisible);
        showToast(isTrafficLayerVisible ? 'Traffic density layer enabled' : 'Traffic density layer hidden');
      });
    }

    if (chipIncidents) {
      chipIncidents.addEventListener('click', () => {
        if (incidentHistory.length > 0) {
          const first = incidentHistory[0];
          if (activeMap && typeof activeMap.focusLocation === 'function') {
            activeMap.focusLocation(first.lat, first.lng, first.subject, 16);
          }
          showIncidentPlaceCard(first);
          showToast(`Zoomed to latest critical incident: "${first.subject}"`);
        } else {
          openHistoryModal();
        }
      });
    }

    if (chipHospitals) {
      chipHospitals.addEventListener('click', () => {
        const hospitalNode = networkNodes.find(n => n.id.includes('HOSPITAL')) || {
          lat: 12.8710,
          lng: 74.8510,
          name: 'KMC Hospital (Ambedkar Circle)'
        };

        if (activeMap && typeof activeMap.focusLocation === 'function') {
          activeMap.focusLocation(hospitalNode.lat, hospitalNode.lng, hospitalNode.name, 16.5);
        }
        showJunctionPlaceCard(hospitalNode);
        showToast(`Located hospital hub: "${hospitalNode.name}"`);
      });
    }

    // 7. Right-Hand Floating Map Controls
    if (btnCompassReset) {
      btnCompassReset.addEventListener('click', () => {
        if (!activeMap || !activeMap.map) return;
        activeMap.map.easeTo({
          bearing: 0,
          pitch: 0,
          duration: 600
        });
        showToast('Reset map orientation to North (2D).');
      });
    }

    if (btnMyLocation) {
      btnMyLocation.addEventListener('click', () => {
        if (!activeMap) return;
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              activeMap.focusLocation(pos.coords.latitude, pos.coords.longitude, 'My Current GPS Location', 16);
              showToast('Centered on verified GPS coordinates.');
            },
            () => {
              // Fallback to Mangaluru city center
              activeMap.focusLocation(12.8750, 74.8550, 'Current Location · Mangaluru', 16);
              showToast('Centered on Mangaluru Sector.');
            }
          );
        } else {
          activeMap.focusLocation(12.8750, 74.8550, 'Current Location · Mangaluru', 16);
        }
      });
    }

    if (btnMapLayers) {
      let layerCycle = 0;
      btnMapLayers.addEventListener('click', () => {
        if (!activeMap || !activeMap.map) return;
        layerCycle = (layerCycle + 1) % 3;
        if (layerCycle === 0) {
          activeMap.map.easeTo({ pitch: 52, bearing: -17.6, duration: 600 });
          showToast('Layer: 3D Isometric Urban Buildings');
        } else if (layerCycle === 1) {
          activeMap.map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
          showToast('Layer: Clean 2D Cartographic View');
        } else {
          activeMap.map.easeTo({ pitch: 60, bearing: 30, duration: 600 });
          showToast('Layer: Perspective Traffic Corridor View');
        }
      });
    }

    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', () => {
        if (activeMap && activeMap.map) activeMap.map.zoomIn();
      });
    }

    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', () => {
        if (activeMap && activeMap.map) activeMap.map.zoomOut();
      });
    }
  }

  // 4. Background Initialization of MapLibre 3D Map & Network (Non-blocking)
  let activeMap = null;
  let networkEdges = [];
  let networkNodes = [];

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
        populateCorridorSelect(networkEdges);
      }
    } catch (err) {
      console.error('Failed to load public traffic network:', err);
    }
  }

  function populateCorridorSelect(edges) {
    const select = document.getElementById('modalCorridorSelect');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Select Road Corridor --</option>';
    edges.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = `${e.name} (${e.congestion_level || 'NORMAL'})`;
      select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
  }

  // Launch MapLibre GL JS in background
  if (typeof MapLibre3DTrafficMap !== 'undefined') {
    try {
      activeMap = new MapLibre3DTrafficMap('map');
      activeMap.init().then(() => {
        console.info('MapLibre GL JS 3D Traffic Map ready.');
        loadPublicNetwork().then(() => {
          initGoogleMapsInterface();
        });
      }).catch(err => {
        console.warn('MapLibre 3D map initialization warning:', err);
        loadPublicNetwork().then(() => {
          initGoogleMapsInterface();
        });
      });
    } catch (err) {
      console.warn('MapLibre GL initialization error:', err);
      loadPublicNetwork().then(() => {
        initGoogleMapsInterface();
      });
    }
  } else {
    loadPublicNetwork().then(() => {
      initGoogleMapsInterface();
    });
  }

  // Periodic network refresh
  setInterval(loadPublicNetwork, 8000);
});
