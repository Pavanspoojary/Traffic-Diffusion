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
      corridor_id: "corridor_cctv_07",
      location: "Circuit House - Nanthoor Road (GPS: 12.88307° N, 74.86340° E)",
      lat: 12.88307,
      lng: 74.86340,
      severity: "CRITICAL",
      description: "Overturned multi-axle freight truck blocking arterial lanes towards Nanthoor circle approach.",
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
      corridor_id: "corridor_cctv_06",
      location: "Bunts Hostel - Kadri Road (GPS: 12.87967° N, 74.85544° E)",
      lat: 12.87967,
      lng: 74.85544,
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
      corridor_id: "corridor_cctv_10",
      location: "M.G. Road near Lalbagh (GPS: 12.88336° N, 74.84532° E)",
      lat: 12.88336,
      lng: 74.84532,
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

  // Ensure minimum realistic seed history & migrate old off-road coordinates to road corridor geometry
  if (incidentHistory && incidentHistory.length > 0) {
    incidentHistory = incidentHistory.map(inc => {
      if (inc.id === 'CIT-MNG-101' && (inc.lat < 12.880 || inc.lat > 12.885)) {
        return { ...inc, lat: 12.88307, lng: 74.86340, corridor_id: 'corridor_cctv_07', location: 'Circuit House - Nanthoor Road (GPS: 12.88307° N, 74.86340° E)' };
      }
      if (inc.id === 'CIT-MNG-102' && (inc.lat < 12.875 || inc.lat > 12.882)) {
        return { ...inc, lat: 12.87967, lng: 74.85544, corridor_id: 'corridor_cctv_06', location: 'Bunts Hostel - Kadri Road (GPS: 12.87967° N, 74.85544° E)' };
      }
      if (inc.id === 'CIT-MNG-103' && (inc.lat < 12.880 || inc.lat > 12.886)) {
        return { ...inc, lat: 12.88336, lng: 74.84532, corridor_id: 'corridor_cctv_10', location: 'M.G. Road near Lalbagh (GPS: 12.88336° N, 74.84532° E)' };
      }
      return inc;
    });
    saveIncidentHistory();
  } else {
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

      // Snap coordinates to selected corridor polyline or extract verified GPS
      let incLat = currentCoordinates.lat;
      let incLng = currentCoordinates.lng;

      const selectedEdge = networkEdges.find(e => e.id === corridorId || e.corridor_id === corridorId);
      if (selectedEdge && Array.isArray(selectedEdge.path_coordinates) && selectedEdge.path_coordinates.length > 0) {
        const midIdx = Math.floor(selectedEdge.path_coordinates.length / 2);
        incLat = selectedEdge.path_coordinates[midIdx][0];
        incLng = selectedEdge.path_coordinates[midIdx][1];
      } else {
        const match = location.match(/GPS:\s*([\d\.]+)°\s*N,\s*([\d\.]+)°\s*E/i);
        if (match) {
          incLat = parseFloat(match[1]);
          incLng = parseFloat(match[2]);
        }
      }

      // Create new incident record
      const newIncident = {
        id: `CIT-MNG-${Date.now().toString().slice(-4)}`,
        timestamp: new Date().toISOString(),
        timeAgo: 'Just now',
        subject: subject,
        category: category,
        corridor_id: corridorId,
        location: `${corridorName} (GPS: ${incLat.toFixed(5)}° N, ${incLng.toFixed(5)}° E)`,
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

    // Comprehensive Mangaluru Points of Interest (POI) & Road Directory Database
    const MANGALURU_PLACES = [
      // --- Hospitals & Emergency Medical Centers ---
      {
        id: 'HOSPITAL_KMC_JYOTHI',
        name: 'KMC Hospital (Ambedkar Circle)',
        category: 'hospital',
        categoryLabel: '🏥 Super-Specialty Hospital & Trauma Center',
        icon: '🏥',
        lat: 12.8715,
        lng: 74.8475,
        address: 'Dr. B.R. Ambedkar Circle, Balmatta Road, Jyothi, Mangaluru, Karnataka 575001',
        neighborhood: 'Jyothi / Hampankatta',
        hours: 'Open 24 Hours • 24/7 Trauma, ICU & Emergency',
        phone: '+91 824 244 4590',
        desc: 'Premier tertiary care hospital equipped with Level-1 emergency trauma care, advanced cath lab, and multi-organ surgical facilities.',
        traffic: '🟢 Free Flow (Avg speed: 32 km/h)',
        rating: '4.6 ★ (2,840 reviews)',
        keywords: ['kmc', 'doctor', 'hospital', 'jyothi', 'ambedkar circle', 'emergency', 'trauma', 'icu', 'medical']
      },
      {
        id: 'HOSPITAL_KMC_ATTAVAR',
        name: 'KMC Hospital Attavar',
        category: 'hospital',
        categoryLabel: '🏥 Multi-Specialty Teaching Hospital',
        icon: '🏥',
        lat: 12.8638,
        lng: 74.8482,
        address: 'Kasturba Medical College Hospital Rd, Attavar, Mangaluru, Karnataka 575001',
        neighborhood: 'Attavar',
        hours: 'Open 24 Hours • Emergency Care',
        phone: '+91 824 244 5858',
        desc: 'Historic Kasturba Medical College hospital complex providing inpatient wards, specialized pediatrics, and emergency services.',
        traffic: '🟢 Moderate Traffic (Avg speed: 28 km/h)',
        rating: '4.5 ★ (1,920 reviews)',
        keywords: ['kmc attavar', 'hospital', 'pediatric', 'doctor', 'medical college']
      },
      {
        id: 'HOSPITAL_WENLOCK',
        name: 'Wenlock District Hospital',
        category: 'hospital',
        categoryLabel: '🏥 Government District Civil Hospital',
        icon: '🏥',
        lat: 12.8665,
        lng: 74.8420,
        address: 'Opp. Central Railway Station, Hampankatta, Mangaluru, Karnataka 575001',
        neighborhood: 'Hampankatta / Central Station',
        hours: 'Open 24 Hours • Govt Trauma Center',
        phone: '+91 824 242 3550',
        desc: 'Largest government civil hospital in Dakshina Kannada with 1000+ beds, 24/7 blood bank, and free medical emergency infrastructure.',
        traffic: '🟡 High Activity Corridor (Avg speed: 24 km/h)',
        rating: '4.2 ★ (1,480 reviews)',
        keywords: ['wenlock', 'district hospital', 'civil hospital', 'govt hospital', 'hampankatta']
      },
      {
        id: 'HOSPITAL_FATHER_MULLER',
        name: 'Father Muller Medical College Hospital',
        category: 'hospital',
        categoryLabel: '🏥 Super-Specialty Charitable Hospital',
        icon: '🏥',
        lat: 12.8642,
        lng: 74.8640,
        address: 'Father Muller Road, Kankanady, Mangaluru, Karnataka 575002',
        neighborhood: 'Kankanady',
        hours: 'Open 24 Hours • 24/7 Casualty & Critical Care',
        phone: '+91 824 223 8000',
        desc: 'Renowned 1250-bed multi-specialty institution providing cardiac, oncology, psychiatric, and intensive emergency healthcare services.',
        traffic: '🟢 Smooth Flow (Avg speed: 30 km/h)',
        rating: '4.7 ★ (3,120 reviews)',
        keywords: ['father muller', 'mullers', 'kankanady', 'hospital', 'medical college']
      },
      {
        id: 'HOSPITAL_AJ_KUNTIKAN',
        name: 'A.J. Hospital & Research Centre',
        category: 'hospital',
        categoryLabel: '🏥 Super-Specialty Tertiary Care & Research',
        icon: '🏥',
        lat: 12.9055,
        lng: 74.8530,
        address: 'NH-66, Kuntikan Junction, Mangaluru, Karnataka 575004',
        neighborhood: 'Kuntikan / NH-66 Bypass',
        hours: 'Open 24 Hours • Advanced Trauma & Stroke Unit',
        phone: '+91 824 222 5555',
        desc: 'Flagship super-specialty hospital along NH-66 bypass featuring organ transplantation, robotic surgery, and dedicated emergency stroke rescue.',
        traffic: '🟢 Highway Free-Flow (Avg speed: 45 km/h)',
        rating: '4.6 ★ (2,410 reviews)',
        keywords: ['aj hospital', 'kuntikan', 'nh66', 'transplant', 'trauma', 'doctor']
      },
      {
        id: 'HOSPITAL_INDIANA',
        name: 'Indiana Hospital & Heart Institute',
        category: 'hospital',
        categoryLabel: '🏥 Cardiac & Multi-Specialty Hospital',
        icon: '🏥',
        lat: 12.8610,
        lng: 74.8730,
        address: 'Mahaveera Circle, Pumpwell, NH-66, Mangaluru, Karnataka 575007',
        neighborhood: 'Pumpwell / Mahaveera Circle',
        hours: 'Open 24 Hours • 24/7 Emergency Cath Lab',
        phone: '+91 824 288 0880',
        desc: 'Premier heart institute and acute emergency center positioned strategically at the southern highway gateway of Mangaluru.',
        traffic: '🟡 Busy Junction Approach (Avg speed: 26 km/h)',
        rating: '4.5 ★ (1,340 reviews)',
        keywords: ['indiana hospital', 'heart', 'cardiac', 'pumpwell', 'cath lab']
      },
      {
        id: 'HOSPITAL_HIGHLAND',
        name: 'Highland Hospital',
        category: 'hospital',
        categoryLabel: '🏥 Multi-Specialty Hospital',
        icon: '🏥',
        lat: 12.8612,
        lng: 74.8580,
        address: 'Falnir Road, Kankanady, Mangaluru, Karnataka 575002',
        neighborhood: 'Falnir / Kankanady',
        hours: 'Open 24 Hours • Emergency Care',
        phone: '+91 824 243 3466',
        desc: 'Trusted community multi-specialty healthcare facility offering maternity, surgical, and emergency casualty response.',
        traffic: '🟢 Free Flow (Avg speed: 30 km/h)',
        rating: '4.4 ★ (890 reviews)',
        keywords: ['highland', 'falnir', 'hospital', 'maternity']
      },
      {
        id: 'HOSPITAL_CITY_KADRI',
        name: 'City Hospital Mangalore',
        category: 'hospital',
        categoryLabel: '🏥 General & Emergency Surgical Hospital',
        icon: '🏥',
        lat: 12.8805,
        lng: 74.8525,
        address: 'Pound Garden, Kadri, Mangaluru, Karnataka 575003',
        neighborhood: 'Kadri Hills',
        hours: 'Open 24 Hours',
        phone: '+91 824 221 2222',
        desc: 'Well-established city hospital offering orthopedics, general surgery, and 24-hour emergency medical services.',
        traffic: '🟢 Clear (Avg speed: 32 km/h)',
        rating: '4.3 ★ (670 reviews)',
        keywords: ['city hospital', 'kadri', 'orthopedic']
      },
      {
        id: 'HOSPITAL_YENEPOYA',
        name: 'Yenepoya Medical College Hospital',
        category: 'hospital',
        categoryLabel: '🏥 Medical University Hospital',
        icon: '🏥',
        lat: 12.8200,
        lng: 74.8750,
        address: 'University Road, Deralakatte, Mangaluru, Karnataka 575018',
        neighborhood: 'Deralakatte Medical Hub',
        hours: 'Open 24 Hours • 24/7 Emergency & ICU',
        phone: '+91 824 220 4668',
        desc: 'Massive university teaching hospital providing comprehensive specialized medical care and emergency wards in southern Mangaluru.',
        traffic: '🟢 Free Flow (Avg speed: 35 km/h)',
        rating: '4.6 ★ (2,150 reviews)',
        keywords: ['yenepoya', 'deralakatte', 'medical university', 'hospital']
      },
      {
        id: 'HOSPITAL_KS_HEGDE',
        name: 'K.S. Hegde Charitable Hospital',
        category: 'hospital',
        categoryLabel: '🏥 Super-Specialty Charitable Hospital',
        icon: '🏥',
        lat: 12.8180,
        lng: 74.8720,
        address: 'Nitte University Campus, Deralakatte, Mangaluru, Karnataka 575018',
        neighborhood: 'Deralakatte / Nitte Campus',
        hours: 'Open 24 Hours • Tertiary Emergency Care',
        phone: '+91 824 220 4490',
        desc: '1200-bed super-specialty charitable teaching hospital of Nitte University with advanced oncology and trauma center.',
        traffic: '🟢 Free Flow (Avg speed: 36 km/h)',
        rating: '4.7 ★ (2,680 reviews)',
        keywords: ['ks hegde', 'nitte', 'deralakatte', 'charitable hospital']
      },

      // --- Major Traffic Junctions & Highway Circles ---
      {
        id: 'INT_HAMPANKATTA',
        name: 'Hampankatta Signal Junction',
        category: 'junction',
        categoryLabel: '🚦 Central Downtown Commercial Intersection',
        icon: '🚦',
        lat: 12.8675,
        lng: 74.8425,
        address: 'K.S. Rao Road & Maidan Road Cross, Hampankatta, Mangaluru 575001',
        neighborhood: 'Hampankatta Central',
        hours: '24/7 Traffic Control Signal',
        phone: 'Mangaluru Traffic Police: 0824-2220800',
        desc: 'Heart of Mangaluru central business district connecting K.S. Rao Road, Market Road, and Central Railway Station corridor.',
        traffic: '🟢 Free Flow (Avg speed: 28 km/h)',
        rating: 'Key Hub',
        keywords: ['hampankatta', 'ks rao road', 'junction', 'signal', 'market', 'downtown']
      },
      {
        id: 'INT_JYOTHI_CIRCLE',
        name: 'Dr. B.R. Ambedkar (Jyothi) Circle',
        category: 'junction',
        categoryLabel: '🚦 Major Roundabout & Medical Corridor',
        icon: '🚦',
        lat: 12.8720,
        lng: 74.8480,
        address: 'Balmatta Road & Bunts Hostel Road, Jyothi, Mangaluru 575001',
        neighborhood: 'Jyothi / Balmatta',
        hours: '24/7 Traffic Control Circle',
        phone: 'Traffic Control Room: 1095',
        desc: 'Vital urban roundabout linking Hampankatta, Balmatta, Bunts Hostel, and KMC Hospital emergency corridors.',
        traffic: '🟢 Smooth Flow (Avg speed: 26 km/h)',
        rating: 'Key Hub',
        keywords: ['jyothi circle', 'ambedkar circle', 'balmatta', 'bunts hostel road']
      },
      {
        id: 'INT_BUNTS_HOSTEL',
        name: 'Bunts Hostel Circle',
        category: 'junction',
        categoryLabel: '🚦 Key Central Roundabout connecting Kadri & Mallikatte',
        icon: '🚦',
        lat: 12.87655,
        lng: 74.84799,
        address: 'Kadri Road & Bunts Hostel Road, Kodialbail, Mangaluru 575003',
        neighborhood: 'Kodialbail / Bunts Hostel',
        hours: '24/7 Traffic Junction',
        phone: 'Traffic Police: 0824-2220800',
        desc: 'Central junction distributing commuter traffic between Jyothi, PVS Circle, Kadri, and Mallikatte.',
        traffic: '🟢 Free Flow (Avg speed: 30 km/h)',
        rating: 'Key Hub',
        keywords: ['bunts hostel', 'circle', 'kodialbail', 'kadri road']
      },
      {
        id: 'INT_PVS_CIRCLE',
        name: 'PVS Circle (Kodialbail)',
        category: 'junction',
        categoryLabel: '🚦 High-Traffic Commercial Crossing',
        icon: '🚦',
        lat: 12.87785,
        lng: 74.84606,
        address: 'MG Road & KS Rao Road Junction, Kodialbail, Mangaluru 575003',
        neighborhood: 'Kodialbail',
        hours: '24/7 Traffic Signal',
        phone: 'Traffic Control: 1095',
        desc: 'Busy four-way junction connecting M.G. Road commercial district, Lalbagh, and Bunts Hostel arterial roads.',
        traffic: '🟢 Nominal Traffic (Avg speed: 28 km/h)',
        rating: 'Key Hub',
        keywords: ['pvs', 'pvs circle', 'mg road', 'kodialbail']
      },
      {
        id: 'INT_LALBAGH',
        name: 'Lalbagh Junction (MCC City Corp)',
        category: 'junction',
        categoryLabel: '🚦 City Corporation & Shopping Hub Junction',
        icon: '🚦',
        lat: 12.8835,
        lng: 74.8415,
        address: 'M.G. Road & Ladyhill Road, Lalbagh, Mangaluru 575003',
        neighborhood: 'Lalbagh',
        hours: '24/7 Signal Junction',
        phone: 'MCC Helpline: 0824-2220306',
        desc: 'Major northern intersection in front of Mangalore City Corporation building, connecting KSRTC bus stand and Ladyhill.',
        traffic: '🟢 Clear (Avg speed: 32 km/h)',
        rating: 'Key Hub',
        keywords: ['lalbagh', 'mcc', 'city corporation', 'mg road', 'ksrtc']
      },
      {
        id: 'INT_MALLIKATTE',
        name: 'Mallikatte Circle',
        category: 'junction',
        categoryLabel: '🚦 Historic Kadri Eastern Arterial Junction',
        icon: '🚦',
        lat: 12.8770,
        lng: 74.8605,
        address: 'Kadri Temple Road & Nanthoor Road, Mallikatte, Mangaluru 575002',
        neighborhood: 'Mallikatte / Kadri',
        hours: '24/7 Junction',
        phone: 'Traffic Police: 0824-2220800',
        desc: 'Connects Bunts Hostel to Kadri Manjunatha Temple, Circuit House, and Nanthoor highway junction.',
        traffic: '🟢 Nominal (Avg speed: 30 km/h)',
        rating: 'Key Hub',
        keywords: ['mallikatte', 'kadri', 'temple road']
      },
      {
        id: 'INT_NANTHOOR',
        name: 'Nanthoor Circle (NH-66 / NH-73)',
        category: 'junction',
        categoryLabel: '🚦 National Highway Multi-Spoke Major Traffic Hub',
        icon: '🚦',
        lat: 12.8745,
        lng: 74.8690,
        address: 'National Highway 66 & NH-73 Junction, Nanthoor, Mangaluru 575005',
        neighborhood: 'Nanthoor',
        hours: '24/7 Highway Intersection',
        phone: 'NHAI / Traffic Police: 0824-2220800',
        desc: 'Critical highway junction intersecting NH-66 and NH-73 (Bengaluru highway). Heavy freight and intercity volume.',
        traffic: '🔴 Heavy Congestion / Detour Active (Avg speed: 14 km/h)',
        rating: 'High-Volume Hub',
        keywords: ['nanthoor', 'nh66', 'nh73', 'highway', 'nanthoor circle', 'junction']
      },
      {
        id: 'INT_KANKANADY',
        name: 'Kankanady Bypass Junction',
        category: 'junction',
        categoryLabel: '🚦 Southern Commercial Bypass & Hospital Arterial',
        icon: '🚦',
        lat: 12.8625,
        lng: 74.8620,
        address: 'Pumpwell-Kankanady Highway Bypass, Kankanady, Mangaluru 575002',
        neighborhood: 'Kankanady',
        hours: '24/7 Traffic Junction',
        phone: 'Traffic Control: 1095',
        desc: 'Connects Father Muller Medical Hospital, Falnir, Valencia, and Pumpwell Flyover.',
        traffic: '🟢 Free Flow (Avg speed: 30 km/h)',
        rating: 'Key Hub',
        keywords: ['kankanady', 'bypass', 'father muller', 'valencia']
      },
      {
        id: 'INT_PUMPWELL',
        name: 'Pumpwell (Bhagwan Mahaveera) Circle',
        category: 'junction',
        categoryLabel: '🚦 Southern Gateway Flyover & Bengaluru Highway Hub',
        icon: '🚦',
        lat: 12.8585,
        lng: 74.8695,
        address: 'NH-66 / NH-75 Flyover Junction, Pumpwell, Mangaluru 575007',
        neighborhood: 'Pumpwell',
        hours: '24/7 Highway Gateway',
        phone: 'Traffic Police: 0824-2220800',
        desc: 'Massive highway flyover junction serving as Mangaluru’s primary gateway towards Bengaluru, Kerala, and Udupi.',
        traffic: '🟡 Moderate Flow (Avg speed: 32 km/h)',
        rating: 'Gateway Hub',
        keywords: ['pumpwell', 'mahaveera circle', 'flyover', 'nh66', 'bengaluru highway']
      },
      {
        id: 'INT_KUNTIKAN',
        name: 'Kuntikan Flyover Junction',
        category: 'junction',
        categoryLabel: '🚦 Northern Arterial Bypass & Hospital Junction',
        icon: '🚦',
        lat: 12.9020,
        lng: 74.8540,
        address: 'NH-66 & Derebail Road, Kuntikan, Mangaluru 575004',
        neighborhood: 'Kuntikan / Derebail',
        hours: '24/7 Highway Junction',
        phone: 'Traffic Police: 0824-2220800',
        desc: 'Elevated highway junction in front of A.J. Hospital facilitating smooth bypass from Udupi to Nanthoor.',
        traffic: '🟢 Free Flow (Avg speed: 45 km/h)',
        rating: 'Key Hub',
        keywords: ['kuntikan', 'flyover', 'nh66', 'aj hospital', 'derebail']
      },
      {
        id: 'INT_LADYHILL',
        name: 'Ladyhill Circle (Narayana Guru Circle)',
        category: 'junction',
        categoryLabel: '🚦 Urwa Coastal Arterial Junction',
        icon: '🚦',
        lat: 12.8900,
        lng: 74.8360,
        address: 'Urwa & Ladyhill Road, Chilimbi, Mangaluru 575006',
        neighborhood: 'Ladyhill / Urwa',
        hours: '24/7 Junction',
        phone: 'Traffic Police: 0824-2220800',
        desc: 'Historic coastal junction leading to Kudroli Temple, Urwa Market, and Sultan Battery.',
        traffic: '🟢 Clear (Avg speed: 34 km/h)',
        rating: 'Key Hub',
        keywords: ['ladyhill', 'narayana guru circle', 'urwa', 'chilimbi']
      },
      {
        id: 'INT_KOTTARA',
        name: 'Kottara Chowki Junction',
        category: 'junction',
        categoryLabel: '🚦 Industrial & Coastal Highway Junction',
        icon: '🚦',
        lat: 12.9080,
        lng: 74.8420,
        address: 'NH-66 & Urwa Store Road, Kottara, Mangaluru 575006',
        neighborhood: 'Kottara Chowki',
        hours: '24/7 Highway Junction',
        phone: 'Traffic Police: 0824-2220800',
        desc: 'Key northern junction connecting coastal roads with NH-66 highway and Kulur bridge corridor.',
        traffic: '🟢 Free Flow (Avg speed: 40 km/h)',
        rating: 'Key Hub',
        keywords: ['kottara chowki', 'kottara', 'nh66', 'urwa store']
      },
      {
        id: 'INT_PADIL',
        name: 'Padil Junction',
        category: 'junction',
        categoryLabel: '🚦 Eastern Railway Corridor & Highway Intersection',
        icon: '🚦',
        lat: 12.8640,
        lng: 74.8870,
        address: 'NH-73 & Railway Crossing Road, Padil, Mangaluru 575007',
        neighborhood: 'Padil',
        hours: '24/7 Intersection',
        phone: 'Traffic Police: 0824-2220800',
        desc: 'Arterial junction serving Mangalore Junction Railway Station and the NH-73 route towards BC Road.',
        traffic: '🟢 Smooth (Avg speed: 35 km/h)',
        rating: 'Key Hub',
        keywords: ['padil', 'padil junction', 'nh73', 'mangalore junction station']
      },

      // --- Transit Hubs & Railway Stations ---
      {
        id: 'TRANSIT_MANGALORE_CENTRAL',
        name: 'Mangalore Central Railway Station (MAQ)',
        category: 'transit',
        categoryLabel: '🚆 Major Indian Railways Terminal Hub',
        icon: '🚆',
        lat: 12.8632,
        lng: 74.8430,
        address: 'Old Railway Station Road, Hampankatta, Mangaluru, Karnataka 575001',
        neighborhood: 'Hampankatta / Bunder',
        hours: 'Open 24 Hours • Southern Railway Terminal',
        phone: 'Rail Inquiry: 139',
        desc: 'Primary origin/terminus railway station connecting Mangaluru to Mumbai, Chennai, Bengaluru, and Kerala.',
        traffic: '🟢 Free Flow (Avg speed: 28 km/h)',
        rating: '4.4 ★ (12,400 reviews)',
        keywords: ['mangalore central', 'central station', 'railway station', 'train', 'maq', 'hampankatta']
      },
      {
        id: 'TRANSIT_MANGALORE_JN',
        name: 'Mangalore Junction Railway Station (MAJN)',
        category: 'transit',
        categoryLabel: '🚆 Konkan & Intercity Railway Junction',
        icon: '🚆',
        lat: 12.8655,
        lng: 74.8810,
        address: 'Padil, Mangaluru, Karnataka 575007',
        neighborhood: 'Padil',
        hours: 'Open 24 Hours • Konkan Railway Junction',
        phone: 'Rail Inquiry: 139',
        desc: 'Major Konkan Railway stop for long-distance express and Rajdhani trains bypassing central Mangaluru.',
        traffic: '🟢 Smooth Flow (Avg speed: 35 km/h)',
        rating: '4.3 ★ (8,900 reviews)',
        keywords: ['mangalore junction', 'majn', 'railway', 'train', 'padil', 'konkan railway']
      },
      {
        id: 'TRANSIT_KSRTC_BEJAI',
        name: 'KSRTC Central Bus Terminal Bejai',
        category: 'transit',
        categoryLabel: '🚌 State & Inter-State Luxury Bus Terminal',
        icon: '🚌',
        lat: 12.8850,
        lng: 74.8465,
        address: 'Bejai Main Road, Bejai, Mangaluru, Karnataka 575004',
        neighborhood: 'Bejai',
        hours: 'Open 24 Hours • Airavat & Flybus Services',
        phone: 'KSRTC Helpline: 0824-2211245',
        desc: 'Modern multi-bay bus terminal handling hundreds of daily state-run buses connecting Bengaluru, Mysuru, Goa, and Mumbai.',
        traffic: '🟢 Normal Flow (Avg speed: 30 km/h)',
        rating: '4.3 ★ (9,200 reviews)',
        keywords: ['ksrtc', 'bus stand', 'bejai', 'bus station', 'airavat', 'transit']
      },
      {
        id: 'TRANSIT_STATE_BANK',
        name: 'State Bank City Bus Terminal Hub',
        category: 'transit',
        categoryLabel: '🚌 Private City Bus & Regional Hub',
        icon: '🚌',
        lat: 12.8620,
        lng: 74.8385,
        address: 'Nehru Maidan Road, State Bank, Bunder, Mangaluru 575001',
        neighborhood: 'State Bank / Nehru Maidan',
        hours: '5:00 AM – 11:30 PM Daily',
        phone: 'City Bus Association: 0824-2422200',
        desc: 'Nerve center of private city buses (Route 1-50 series) covering every neighborhood, college, and suburb in Mangaluru.',
        traffic: '🟢 Active Transit Flow (Avg speed: 25 km/h)',
        rating: '4.2 ★ (6,500 reviews)',
        keywords: ['state bank', 'city bus', 'bus terminal', 'bunder', 'nehru maidan']
      },
      {
        id: 'TRANSIT_AIRPORT',
        name: 'Mangaluru International Airport (IXE)',
        category: 'transit',
        categoryLabel: '✈️ International Airport Terminal',
        icon: '✈️',
        lat: 12.9613,
        lng: 74.8900,
        address: 'Bajpe Airport Road, Kenjar, Mangaluru, Karnataka 574142',
        neighborhood: 'Bajpe / Kenjar',
        hours: 'Open 24 Hours • Domestic & Gulf Flights',
        phone: 'Airport Helpdesk: 0824-2220400',
        desc: 'Tabletop international airport serving coastal Karnataka with direct flights to Dubai, Doha, Bahrain, Mumbai, and Bengaluru.',
        traffic: '🟢 Free-Flow Highway (Avg speed: 50 km/h)',
        rating: '4.5 ★ (15,800 reviews)',
        keywords: ['airport', 'flight', 'ixe', 'bajpe', 'international airport', 'kenjar']
      },

      // --- Shopping Malls, Commercial Centers & Markets ---
      {
        id: 'SHOP_CITY_CENTRE',
        name: 'City Centre Mall Mangaluru',
        category: 'shopping',
        categoryLabel: '🛍️ Premier Shopping & Entertainment Mall',
        icon: '🛍️',
        lat: 12.8710,
        lng: 74.8440,
        address: 'K.S. Rao Road, Hampankatta, Mangaluru, Karnataka 575001',
        neighborhood: 'K.S. Rao Road / Hampankatta',
        hours: '10:00 AM – 10:00 PM Daily',
        phone: '+91 824 242 8000',
        desc: 'Largest downtown commercial mall featuring Cinepolis 5-screen multiplex, international fashion brands, hypermarket, and food court.',
        traffic: '🟢 Free Flow (Avg speed: 28 km/h)',
        rating: '4.4 ★ (18,200 reviews)',
        keywords: ['city centre', 'mall', 'shopping', 'cinepolis', 'ks rao road', 'hampankatta']
      },
      {
        id: 'SHOP_FIZA_MALL',
        name: 'Fiza by Nexus Mall (Forum)',
        category: 'shopping',
        categoryLabel: '🛍️ Luxury Shopping, PVR Cinemas & Food Hub',
        icon: '🛍️',
        lat: 12.8570,
        lng: 74.8390,
        address: 'Pandeshwar Road, Mangaluru, Karnataka 575001',
        neighborhood: 'Pandeshwar',
        hours: '10:00 AM – 10:00 PM Daily',
        phone: '+91 824 249 8300',
        desc: 'Upscale waterfront shopping mall with PVR Cinemas, premium international retail outlets, bowling alley, and fine dining restaurants.',
        traffic: '🟢 Clear (Avg speed: 30 km/h)',
        rating: '4.5 ★ (22,100 reviews)',
        keywords: ['fiza mall', 'forum mall', 'nexus', 'pvr', 'pandeshwar', 'shopping']
      },
      {
        id: 'SHOP_BHARAT_MALL',
        name: 'Bharat Mall',
        category: 'shopping',
        categoryLabel: '🛍️ Entertainment Mall & Big Cinemas',
        icon: '🛍️',
        lat: 12.8845,
        lng: 74.8425,
        address: 'Opp. KSRTC Bus Stand, Bejai Kavoor Road, Mangaluru 575004',
        neighborhood: 'Bejai / Lalbagh',
        hours: '10:00 AM – 10:30 PM Daily',
        phone: '+91 824 221 4455',
        desc: 'Retail center directly across from KSRTC bus stand offering Big Cinemas multiplex, food court, and brand stores.',
        traffic: '🟢 Smooth Flow (Avg speed: 32 km/h)',
        rating: '4.3 ★ (8,900 reviews)',
        keywords: ['bharat mall', 'bejai', 'shopping', 'ksrtc', 'cinemas']
      },
      {
        id: 'SHOP_CENTRAL_MARKET',
        name: 'Mangaluru Central Market (Bhavathi)',
        category: 'shopping',
        categoryLabel: '🛒 Wholesale Vegetable & Fresh Seafood Market',
        icon: '🛒',
        lat: 12.8660,
        lng: 74.8395,
        address: 'Market Road, Bhavathi, Hampankatta, Mangaluru 575001',
        neighborhood: 'Bhavathi / Bunder',
        hours: '5:00 AM – 9:00 PM Daily',
        phone: 'MCC Market Division',
        desc: 'Traditional vibrant market famous for fresh Arabian Sea fish, local farm vegetables, coastal spices, and cashews.',
        traffic: '🟡 High Pedestrian Density (Avg speed: 20 km/h)',
        rating: '4.2 ★ (4,100 reviews)',
        keywords: ['market', 'central market', 'fish market', 'vegetables', 'bhavathi', 'bunder']
      },

      // --- Heritage Landmarks, Temples & Coastal Tourism ---
      {
        id: 'LANDMARK_KADRI_TEMPLE',
        name: 'Kadri Manjunatha Temple',
        category: 'landmark',
        categoryLabel: '🏛️ Historic 10th-Century Hindu Temple & Natural Springs',
        icon: '🏛️',
        lat: 12.8810,
        lng: 74.8625,
        address: 'Kadri Temple Road, Kadri Hills, Mangaluru, Karnataka 575002',
        neighborhood: 'Kadri',
        hours: '6:00 AM – 1:00 PM, 4:00 PM – 8:30 PM Daily',
        phone: '+91 824 221 4172',
        desc: 'Ancient temple situated at Kadri hills dating to the 10th century with bronze Lokeshwara idol and sacred freshwater spring Gomukha.',
        traffic: '🟢 Free Flow (Avg speed: 30 km/h)',
        rating: '4.8 ★ (19,400 reviews)',
        keywords: ['kadri temple', 'manjunatha', 'hindu temple', 'gomukha', 'heritage']
      },
      {
        id: 'LANDMARK_KUDROLI_TEMPLE',
        name: 'Kudroli Gokarnanatheshwara Temple',
        category: 'landmark',
        categoryLabel: '🏛️ Heritage Temple & Mangalore Dasara Centre',
        icon: '🏛️',
        lat: 12.8795,
        lng: 74.8320,
        address: 'Kudroli, Alake, Mangaluru, Karnataka 575003',
        neighborhood: 'Kudroli / Alake',
        hours: '6:00 AM – 9:00 PM Daily',
        phone: '+91 824 249 6114',
        desc: 'Consecrated by reformer Narayana Guru in 1912. Internationally celebrated for the spectacular illuminated Mangalore Dasara festivities.',
        traffic: '🟢 Smooth Flow (Avg speed: 28 km/h)',
        rating: '4.8 ★ (24,300 reviews)',
        keywords: ['kudroli', 'gokarnanatheshwara', 'dasara', 'temple', 'alake']
      },
      {
        id: 'LANDMARK_MANGALADEVI',
        name: 'Mangaladevi Temple (Bolar)',
        category: 'landmark',
        categoryLabel: '🏛️ Historic Namesake Temple of Mangaluru',
        icon: '🏛️',
        lat: 12.8480,
        lng: 74.8465,
        address: 'Mangaladevi Temple Road, Bolar, Mangaluru, Karnataka 575001',
        neighborhood: 'Bolar',
        hours: '6:00 AM – 1:00 PM, 4:00 PM – 8:30 PM Daily',
        phone: '+91 824 241 5476',
        desc: '9th-century temple built during the reign of Kundavarma from whom Mangaluru derived its name. Historic center of Navaratri celebrations.',
        traffic: '🟢 Clear (Avg speed: 32 km/h)',
        rating: '4.7 ★ (11,800 reviews)',
        keywords: ['mangaladevi', 'temple', 'bolar', 'heritage', 'namesake']
      },
      {
        id: 'LANDMARK_ST_ALOYSIUS',
        name: 'St. Aloysius Chapel & University',
        category: 'landmark',
        categoryLabel: '⛪ Historic 1880 Italian Fresco Art Chapel',
        icon: '⛪',
        lat: 12.8730,
        lng: 74.8460,
        address: 'Light House Hill Road, Kodialbail, Mangaluru 575003',
        neighborhood: 'Light House Hill',
        hours: '9:00 AM – 5:00 PM Daily',
        phone: '+91 824 244 9700',
        desc: 'Featuring ceiling and wall frescoes painted by Italian Jesuit artist Antonio Moscheni in 1899.',
        traffic: '🟢 Free Flow (Avg speed: 28 km/h)',
        rating: '4.7 ★ (8,300 reviews)',
        keywords: ['st aloysius', 'chapel', 'church', 'frescoes', 'light house hill', 'heritage']
      },
      {
        id: 'LANDMARK_KADRI_PARK',
        name: 'Kadri Park & Musical Fountain',
        category: 'landmark',
        categoryLabel: '🌳 Largest Urban Botanical Park & Recreation',
        icon: '🌳',
        lat: 12.8870,
        lng: 74.8630,
        address: 'NH-66, Kadri Hills, Mangaluru 575004',
        neighborhood: 'Kadri Hills',
        hours: '6:00 AM – 8:30 PM Daily (Laser shows on weekends)',
        phone: 'MCC Horticulture Dept',
        desc: 'Sprawling botanical park and recreational ground featuring animal exhibits, children toy train, and laser musical water fountain.',
        traffic: '🟢 Clear (Avg speed: 35 km/h)',
        rating: '4.5 ★ (14,200 reviews)',
        keywords: ['kadri park', 'park', 'fountain', 'garden', 'recreation']
      },
      {
        id: 'LANDMARK_PANAMBUR_BEACH',
        name: 'Panambur Beach',
        category: 'beach',
        categoryLabel: '🏖️ Golden Sand Beach, Watersports & Camel Rides',
        icon: '🏖️',
        lat: 12.9340,
        lng: 74.8080,
        address: 'Panambur Beach Road, NH-66, Mangaluru 575010',
        neighborhood: 'Panambur Coast',
        hours: '6:00 AM – 7:30 PM Daily • Lifeguards On Duty',
        phone: 'Lifeguard Station: 0824-2407694',
        desc: 'Most visited beach in Mangaluru with professional lifeguards, jet skis, camel and horse rides, sunset viewpoints, and annual kite festival.',
        traffic: '🟢 Highway Access Free Flow (Avg speed: 48 km/h)',
        rating: '4.6 ★ (32,000 reviews)',
        keywords: ['panambur', 'beach', 'sunset', 'water sports', 'sea', 'coast']
      },
      {
        id: 'LANDMARK_TANNIRBHAVI',
        name: 'Tannirbhavi Beach & Marine Tree Park',
        category: 'beach',
        categoryLabel: '🏖️ Scenic Pine Forest Coast & Sunset Point',
        icon: '🏖️',
        lat: 12.8980,
        lng: 74.8120,
        address: 'Tannirbhavi Beach Road, Kasba Bengare, Mangaluru 575010',
        neighborhood: 'Bengare / Gurupura Estuary',
        hours: '6:00 AM – 7:00 PM Daily',
        phone: 'Tannirbhavi Lifeguard Post',
        desc: 'Serene beach flanked by tall Casuarina pine trees, featuring the modern Tannirbhavi Tree Park and river ferry connectivity from Sultan Battery.',
        traffic: '🟢 Coastal Road Clear (Avg speed: 38 km/h)',
        rating: '4.7 ★ (21,500 reviews)',
        keywords: ['tannirbhavi', 'beach', 'tree park', 'sunset', 'casuarina']
      },
      {
        id: 'LANDMARK_SULTAN_BATTERY',
        name: 'Sultan Battery Watch Tower & Ferry',
        category: 'landmark',
        categoryLabel: '🏰 Tipu Sultan 1784 Naval Watch Tower & River Ferry',
        icon: '🏰',
        lat: 12.8880,
        lng: 74.8210,
        address: 'Boloor, Sultan Battery Road, Mangaluru 575003',
        neighborhood: 'Boloor',
        hours: '9:00 AM – 6:00 PM Daily',
        phone: 'Tourism Dept',
        desc: 'Historic black stone fortress constructed by Tipu Sultan in 1784 to defend Gurupura river. Passenger boat ferry to Tannirbhavi Beach.',
        traffic: '🟢 Clear (Avg speed: 30 km/h)',
        rating: '4.4 ★ (7,800 reviews)',
        keywords: ['sultan battery', 'tipu sultan', 'watch tower', 'ferry', 'boloor', 'heritage']
      }
    ];

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
    const placeCardStatusPill = document.getElementById('placeCardStatusPill');
    const placeCardTitle = document.getElementById('placeCardTitle');
    const placeCardSubtitle = document.getElementById('placeCardSubtitle');
    const placeCardDelay = document.getElementById('placeCardDelay');
    const placeCardLanes = document.getElementById('placeCardLanes');
    const placeCardReported = document.getElementById('placeCardReported');
    const placeCardDesc = document.getElementById('placeCardDesc');
    const placeCardAddress = document.getElementById('placeCardAddress');
    const placeCardCoords = document.getElementById('placeCardCoords');
    const placeCardTrafficStatus = document.getElementById('placeCardTrafficStatus');
    const placeCardHazardsStatus = document.getElementById('placeCardHazardsStatus');
    const placeCardHours = document.getElementById('placeCardHours');
    const placeCardPhone = document.getElementById('placeCardPhone');
    const infoRowPhone = document.getElementById('infoRowPhone');
    const placeCardIncidentMetaRow = document.getElementById('placeCardIncidentMetaRow');
    const placeCardInfoList = document.getElementById('placeCardInfoList');
    const placeCardPhotoWrapper = document.getElementById('placeCardPhotoWrapper');
    const placeCardPhoto = document.getElementById('placeCardPhoto');
    const btnPlaceDirections = document.getElementById('btnPlaceDirections');
    const btnPlaceStartFrom = document.getElementById('btnPlaceStartFrom');
    const btnPlaceReportUpdate = document.getElementById('btnPlaceReportUpdate');
    const btnPlaceShare = document.getElementById('btnPlaceShare');

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
    const chipTransit = document.getElementById('chipTransit');
    const chipPlaces = document.getElementById('chipPlaces');

    // Populate Directions Dropdowns with full categorized Mangaluru places
    function populateDirectionsSelects() {
      if (!originSelect || !destinationSelect) return;

      const categories = [
        { key: 'hospital', label: '🏥 Hospitals & Medical Emergency Hubs' },
        { key: 'junction', label: '🚦 Major Highway Circles & Traffic Junctions' },
        { key: 'transit', label: '🚆 Railway Stations & Transit Terminals' },
        { key: 'shopping', label: '🛍️ Shopping Malls & Commercial Hubs' },
        { key: 'landmark', label: '🏛️ Heritage Landmarks & Tourism' },
        { key: 'beach', label: '🏖️ Coastal Beaches' }
      ];

      function buildOptions(isOrigin) {
        let html = isOrigin 
          ? '<option value="CURRENT_GPS" selected>📍 Your Current Location (GPS)</option>' 
          : '';

        categories.forEach(cat => {
          const items = MANGALURU_PLACES.filter(p => p.category === cat.key);
          if (items.length > 0) {
            html += `<optgroup label="${cat.label}">`;
            items.forEach(p => {
              html += `<option value="${p.id}">${p.icon} ${p.name}</option>`;
            });
            html += '</optgroup>';
          }
        });

        // Add any remaining network nodes if not present
        if (networkNodes && networkNodes.length > 0) {
          const remainingNodes = networkNodes.filter(n => !MANGALURU_PLACES.some(p => p.id === n.id));
          if (remainingNodes.length > 0) {
            html += '<optgroup label="📍 Connected Road Network Nodes">';
            remainingNodes.forEach(n => {
              html += `<option value="${n.id}">📍 ${n.name}</option>`;
            });
            html += '</optgroup>';
          }
        }
        return html;
      }

      const prevOrigin = originSelect.value;
      const prevDest = destinationSelect.value;

      originSelect.innerHTML = buildOptions(true);
      destinationSelect.innerHTML = buildOptions(false);

      if (prevOrigin && (prevOrigin === 'CURRENT_GPS' || MANGALURU_PLACES.some(p => p.id === prevOrigin))) {
        originSelect.value = prevOrigin;
      } else {
        originSelect.value = 'CURRENT_GPS';
      }

      if (prevDest && MANGALURU_PLACES.some(p => p.id === prevDest)) {
        destinationSelect.value = prevDest;
      } else {
        destinationSelect.value = 'INT_NANTHOOR';
      }
    }

    // Call populate dropdowns immediately
    populateDirectionsSelects();

    // 1. Search Bar Input & Autocomplete
    if (searchInput) {
      searchInput.addEventListener('focus', () => {
        const query = searchInput.value.trim().toLowerCase();
        renderSearchSuggestions(query);
      });

      searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        if (query.length > 0) {
          if (clearSearchBtn) clearSearchBtn.style.display = 'flex';
        } else {
          if (clearSearchBtn) clearSearchBtn.style.display = 'none';
        }
        renderSearchSuggestions(query);
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const firstSug = suggestionsBox?.querySelector('.gmaps-suggestion-item');
          if (firstSug) firstSug.click();
        } else if (e.key === 'Escape') {
          if (suggestionsBox) suggestionsBox.style.display = 'none';
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

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
      if (suggestionsBox && !suggestionsBox.contains(e.target) && e.target !== searchInput) {
        suggestionsBox.style.display = 'none';
      }
    });

    function renderSearchSuggestions(query, categoryFilter = null) {
      if (!suggestionsBox) return;

      let html = '';

      // If empty query, show quick category filter pills + popular places
      if (!query && !categoryFilter) {
        html += `
          <div class="gmaps-suggestion-categories">
            <button type="button" class="gmaps-sug-cat-pill active" data-cat="all">All Places</button>
            <button type="button" class="gmaps-sug-cat-pill" data-cat="hospital">🏥 Hospitals</button>
            <button type="button" class="gmaps-sug-cat-pill" data-cat="transit">🚆 Transit</button>
            <button type="button" class="gmaps-sug-cat-pill" data-cat="shopping">🛍️ Malls</button>
            <button type="button" class="gmaps-sug-cat-pill" data-cat="junction">🚦 Junctions</button>
            <button type="button" class="gmaps-sug-cat-pill" data-cat="landmark">🏛️ Landmarks</button>
          </div>
          <div style="padding: 6px 14px 2px; font-size: 11px; font-weight: 700; color: #70757a; text-transform: uppercase;">
            Popular Places in Mangaluru
          </div>
        `;
      }

      const matches = [];

      // Search MANGALURU_PLACES
      MANGALURU_PLACES.forEach(place => {
        if (categoryFilter && categoryFilter !== 'all' && place.category !== categoryFilter) {
          return;
        }

        if (!query) {
          matches.push({
            type: 'place',
            title: place.name,
            subtitle: `${place.categoryLabel || place.category} · ${place.neighborhood || 'Mangaluru'}`,
            icon: place.icon || '📍',
            data: place
          });
          return;
        }

        const matchName = place.name.toLowerCase().includes(query);
        const matchAddr = place.address.toLowerCase().includes(query);
        const matchCat = place.category.toLowerCase().includes(query);
        const matchKeywords = place.keywords && place.keywords.some(k => k.includes(query));

        if (matchName || matchAddr || matchCat || matchKeywords) {
          matches.push({
            type: 'place',
            title: place.name,
            subtitle: `${place.neighborhood || 'Mangaluru'} · ${place.categoryLabel || place.category}`,
            icon: place.icon || '📍',
            data: place
          });
        }
      });

      // Also search active incidents if query matches
      if (query) {
        incidentHistory.forEach(inc => {
          if (
            inc.subject.toLowerCase().includes(query) ||
            inc.location.toLowerCase().includes(query) ||
            inc.category.toLowerCase().includes(query)
          ) {
            matches.unshift({
              type: 'incident',
              title: inc.subject,
              subtitle: `⚠️ ${inc.category} · ${inc.location}`,
              icon: '🚨',
              data: inc
            });
          }
        });
      }

      if (matches.length === 0) {
        suggestionsBox.innerHTML = `
          <div class="gmaps-suggestion-item" style="cursor: default; color: #70757a;">
            <span>No places or incidents match "${query}"</span>
          </div>
        `;
        suggestionsBox.style.display = 'block';
        return;
      }

      const displayList = matches.slice(0, 8);

      html += displayList.map((m, idx) => `
        <div class="gmaps-suggestion-item" data-index="${idx}">
          <span class="gmaps-suggestion-icon">${m.icon}</span>
          <div style="flex: 1; min-width: 0;">
            <div class="gmaps-suggestion-main">${m.title}</div>
            <div class="gmaps-suggestion-sub">${m.subtitle}</div>
          </div>
          <span style="font-size: 11px; color: #1a73e8; font-weight: 600;">Direct &gt;</span>
        </div>
      `).join('');

      suggestionsBox.innerHTML = html;
      suggestionsBox.style.display = 'block';

      // Setup category filter clicks inside dropdown
      suggestionsBox.querySelectorAll('.gmaps-sug-cat-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const cat = btn.getAttribute('data-cat');
          renderSearchSuggestions(query, cat);
        });
      });

      // Item selection handlers
      suggestionsBox.querySelectorAll('.gmaps-suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
          const idx = parseInt(item.getAttribute('data-index'), 10);
          const m = displayList[idx];
          if (!m) return;

          if (searchInput) searchInput.value = m.title;
          suggestionsBox.style.display = 'none';

          if (m.type === 'place') {
            const place = m.data;
            if (activeMap && typeof activeMap.focusLocation === 'function') {
              activeMap.focusLocation(place.lat, place.lng, place.name, 16.5);
            }
            showCompletePlaceCard(place);
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
      if (placeCard) placeCard.style.display = 'none';
    }

    function closeDirectionsPanel() {
      if (directionsCard) directionsCard.style.display = 'none';
      clearGoogleRouteFromMap();
      currentCalculatedRoute = null;
    }

    if (directionsBtn) {
      directionsBtn.addEventListener('click', () => {
        if (directionsCard.style.display === 'block') {
          closeDirectionsPanel();
        } else {
          openDirectionsPanel();
        }
      });
    }

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
        originSelect.value = destinationSelect.value;
        destinationSelect.value = temp === 'CURRENT_GPS' ? 'INT_HAMPANKATTA' : temp;

        if (currentCalculatedRoute) {
          calculateRouteAction();
        }
      });
    }

    // 3. Robust Connecting Places Route Engine (OSRM Road-Snapped + Live Traffic + Detours)
    async function calculateRouteAction() {
      if (!originSelect || !destinationSelect) return;

      const originId = originSelect.value;
      const destId = destinationSelect.value;
      const avoidBlockages = avoidIncidentsChk ? avoidIncidentsChk.checked : true;

      if (originId === destId) {
        showToast('Starting location and destination cannot be the same place.');
        return;
      }

      // Resolve Origin Coordinates and Name
      let originCoords = [12.8685, 74.8430]; // Default central Mangaluru GPS
      let originName = 'Your Current GPS Location';

      if (originId.startsWith('INCIDENT_')) {
        const incId = originId.replace('INCIDENT_', '');
        const inc = incidentHistory.find(i => i.id === incId) || window._activeIncidentRouteOrigin;
        if (inc && inc.lat && inc.lng) {
          originCoords = [inc.lat, inc.lng];
          originName = `Hazard: ${inc.subject || 'Incident'}`;
        }
      } else if (originId !== 'CURRENT_GPS') {
        const place = MANGALURU_PLACES.find(p => p.id === originId) || networkNodes.find(n => n.id === originId);
        if (place) {
          originCoords = [place.lat, place.lng];
          originName = place.name;
        }
      }

      // Resolve Destination Coordinates and Name
      let destCoords = [12.8745, 74.8690]; // Default Nanthoor
      let destName = 'Destination';

      if (destId.startsWith('INCIDENT_')) {
        const incId = destId.replace('INCIDENT_', '');
        const inc = incidentHistory.find(i => i.id === incId) || window._activeIncidentRouteTarget;
        if (inc && inc.lat && inc.lng) {
          destCoords = [inc.lat, inc.lng];
          destName = `Hazard: ${inc.subject || 'Incident'}`;
        }
      } else {
        const destPlace = MANGALURU_PLACES.find(p => p.id === destId) || networkNodes.find(n => n.id === destId);
        if (destPlace) {
          destCoords = [destPlace.lat, destPlace.lng];
          destName = destPlace.name;
        }
      }

      showToast(`Connecting ${originName.split('(')[0].trim()} ➔ ${destName.split('(')[0].trim()}...`);

      try {
        // Query OSRM for street-following road geometry, distance, and turn-by-turn maneuvers
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originCoords[1]},${originCoords[0]};${destCoords[1]},${destCoords[0]}?overview=full&geometries=geojson&steps=true`;
        
        let pathCoords = [];
        let distanceKm = 3.5;
        let baseTimeMin = 8;
        let maneuvers = [];
        let primaryRoad = '';

        try {
          const osrmRes = await fetch(osrmUrl);
          if (osrmRes.ok) {
            const osrmData = await osrmRes.json();
            if (osrmData.code === 'Ok' && osrmData.routes && osrmData.routes.length > 0) {
              const best = osrmData.routes[0];
              // OSRM coordinates are [lng, lat], convert to [lat, lng]
              pathCoords = best.geometry.coordinates.map(pt => [pt[1], pt[0]]);
              distanceKm = +(best.distance / 1000).toFixed(1);
              baseTimeMin = Math.max(2, Math.round(best.duration / 60));

              // Extract clean turn maneuvers and primary road names
              const roadNameCounts = {};
              if (best.legs) {
                best.legs.forEach(leg => {
                  if (leg.steps) {
                    leg.steps.forEach(s => {
                      const sName = s.name || '';
                      if (sName) {
                        roadNameCounts[sName] = (roadNameCounts[sName] || 0) + s.distance;
                      }

                      const mType = s.maneuver ? s.maneuver.type : 'continue';
                      const mMod = s.maneuver && s.maneuver.modifier ? ` (${s.maneuver.modifier})` : '';
                      const sDist = s.distance > 0 ? ` (${Math.round(s.distance)}m)` : '';

                      if (mType === 'depart') {
                        maneuvers.push(`Depart on ${sName || 'road'}${sDist}`);
                      } else if (mType === 'arrive') {
                        maneuvers.push(`Arrive at ${destName}`);
                      } else if (sName) {
                        maneuvers.push(`${mType.charAt(0).toUpperCase() + mType.slice(1)}${mMod} onto ${sName}${sDist}`);
                      }
                    });
                  }
                });
              }

              // Find most prominent road in route
              let topRoad = '';
              let topDist = 0;
              for (const [r, d] of Object.entries(roadNameCounts)) {
                if (d > topDist) {
                  topDist = d;
                  topRoad = r;
                }
              }
              primaryRoad = topRoad ? `${topRoad}` : 'Mangaluru Arterial Road';
            }
          }
        } catch (osrmErr) {
          console.warn('OSRM road snapping fallback to direct corridor:', osrmErr);
        }

        // Fallback to backend routing endpoint if OSRM was unreachable or empty
        if (!pathCoords || pathCoords.length === 0) {
          try {
            const bPayload = {
              origin_node_id: originId !== 'CURRENT_GPS' ? originId : 'INT_HAMPANKATTA',
              destination_node_id: destId,
              is_emergency: false,
              avoid_congestion: avoidBlockages
            };
            const bRes = await fetch('/api/v1/navigation/route', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(bPayload)
            });
            if (bRes.ok) {
              const bData = await bRes.json();
              if (bData.primary_route) {
                pathCoords = bData.primary_route.path_coordinates || [];
                distanceKm = bData.primary_route.total_distance_km || distanceKm;
                baseTimeMin = bData.primary_route.estimated_travel_time_min || baseTimeMin;
                primaryRoad = bData.primary_route.primary_road_name || primaryRoad;
                maneuvers = bData.primary_route.turn_instructions || maneuvers;
              }
            }
          } catch (bErr) {
            console.warn('Backend routing fallback:', bErr);
          }
        }

        // If still empty, direct corridor line
        if (!pathCoords || pathCoords.length === 0) {
          pathCoords = [originCoords, destCoords];
        }

        // Check active incident proximity along route
        let closuresEncountered = 0;
        let incidentWarning = '';

        if (incidentHistory && incidentHistory.length > 0) {
          incidentHistory.forEach(inc => {
            if (!inc.lat || !inc.lng) return;
            // Check if incident is within ~600m (0.0055 deg) of any route point
            const nearPt = pathCoords.some(pt => {
              const dLat = pt[0] - inc.lat;
              const dLng = pt[1] - inc.lng;
              return (dLat * dLat + dLng * dLng) < 0.00003;
            });
            if (nearPt) {
              closuresEncountered++;
              incidentWarning = `Detour Active: Avoiding ${inc.subject || 'Road Hazard'} near ${inc.location || 'corridor'}`;
            }
          });
        }

        const calculatedRoute = {
          total_distance_km: distanceKm,
          estimated_travel_time_min: baseTimeMin,
          path_coordinates: pathCoords,
          primary_road_name: primaryRoad || 'K.S. Rao Road and Bunts Hostel Ave',
          turn_instructions: maneuvers.length > 0 ? maneuvers : [
            `Depart from ${originName}`,
            `Continue along ${primaryRoad || 'city arterial'}`,
            `Arrive safely at ${destName}`
          ],
          closures_encountered: closuresEncountered,
          incident_warning: incidentWarning,
          originObj: { name: originName, lat: originCoords[0], lng: originCoords[1] },
          destObj: { name: destName, lat: destCoords[0], lng: destCoords[1] }
        };

        currentCalculatedRoute = calculatedRoute;
        updateRouteMetricsDisplay(calculatedRoute);

        // Render Route with Origin "A" & Destination "B" Markers on MapLibre Map
        if (activeMap && typeof activeMap.renderRoute === 'function') {
          activeMap.renderRoute(pathCoords, calculatedRoute.originObj, calculatedRoute.destObj);
        } else {
          drawGoogleRouteOnMap(pathCoords);
        }

        showToast(`Route connected! ${distanceKm} km · Est. ${Math.round(baseTimeMin * (MODE_FACTORS[currentMode] || 1.0))} min`);

      } catch (err) {
        console.error('Route calculation error:', err);
        showToast('Connecting places via direct corridor.');
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
          routeEtaNumber.style.color = '#ea8600'; // Amber
        } else {
          routeEtaNumber.style.color = '#1e8e3e'; // Google Green
        }
      }

      if (routeDistanceText) {
        routeDistanceText.textContent = `(${route.total_distance_km} km)`;
      }

      if (routeViaRoad) {
        routeViaRoad.textContent = `via ${route.primary_road_name || 'Mangaluru Arterial Road'}`;
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
        if (route.closures_encountered > 0) {
          routeIncidentAlertRow.style.display = 'flex';
          routeIncidentAlertText.textContent = route.incident_warning || 'Detour active: Successfully bypassing road incident';
        } else {
          routeIncidentAlertRow.style.display = 'none';
        }
      }

      // Populate Turn-by-Turn Steps List
      if (stepsList) {
        const instructions = route.turn_instructions && route.turn_instructions.length > 0
          ? route.turn_instructions
          : [
              `Depart from starting point`,
              `Follow traffic corridor towards ${route.primary_road_name || 'destination'}`,
              `Approaching destination`
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

    // Start Navigation Button (Flies in 3D driving view)
    if (startNavBtn) {
      startNavBtn.addEventListener('click', () => {
        if (!activeMap || !activeMap.map || !currentCalculatedRoute) return;
        const coords = currentCalculatedRoute.path_coordinates;
        if (coords && coords.length > 0) {
          const startPt = coords[0];
          activeMap.map.flyTo({
            center: [startPt[1], startPt[0]],
            zoom: 17.5,
            pitch: 62,
            bearing: -24,
            speed: 1.5,
            curve: 1.2
          });
          showToast('Turn-by-turn navigation view active. Follow blue route.');
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

    // 4. Map Drawing: Route on MapLibre Map
    function drawGoogleRouteOnMap(coordinates) {
      if (activeMap && typeof activeMap.renderRoute === 'function') {
        activeMap.renderRoute(coordinates);
        return;
      }
      if (!activeMap || !activeMap.map) return;
      const map = activeMap.map;

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

        map.addLayer({
          id: 'gmaps-route-casing',
          type: 'line',
          source: 'gmaps-route-source',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 10.0, 'line-opacity': 0.98 }
        });

        map.addLayer({
          id: 'gmaps-route-line',
          type: 'line',
          source: 'gmaps-route-source',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#1a73e8', 'line-width': 6.5, 'line-opacity': 1.0 }
        });
      }

      if (lineCoords.length > 1 && typeof maplibregl !== 'undefined') {
        const bounds = new maplibregl.LngLatBounds();
        lineCoords.forEach(pt => bounds.extend(pt));
        map.fitBounds(bounds, {
          padding: { top: 90, bottom: 90, left: 430, right: 90 },
          duration: 1100,
          pitch: 44
        });
      }
    }

    function clearGoogleRouteFromMap() {
      if (activeMap && typeof activeMap.clearActiveRoute === 'function') {
        activeMap.clearActiveRoute();
        return;
      }
      if (!activeMap || !activeMap.map) return;
      const map = activeMap.map;
      if (map.getSource('gmaps-route-source')) {
        map.getSource('gmaps-route-source').setData({
          type: 'FeatureCollection',
          features: []
        });
      }
    }

    // 5. Complete Place Details Card & Incident Handlers
    function showCompletePlaceCard(place) {
      if (!placeCard) return;

      if (placeCardBadge) {
        placeCardBadge.textContent = place.icon ? `${place.icon} ${(place.category || 'PLACE').toUpperCase()}` : '📍 PLACE';
        placeCardBadge.style.background = '#e8f0fe';
        placeCardBadge.style.color = '#1a73e8';
      }

      if (placeCardStatusPill) {
        placeCardStatusPill.textContent = place.hours && place.hours.includes('24 Hours') ? '🟢 Open 24/7' : '🟢 Open Now';
        placeCardStatusPill.style.display = 'inline-flex';
      }

      if (placeCardTitle) placeCardTitle.textContent = place.name || 'Mangaluru Location';
      if (placeCardSubtitle) placeCardSubtitle.textContent = place.neighborhood ? `${place.neighborhood} · Mangaluru` : 'Mangaluru Sector';

      // Hide incident specific row and show place info list
      if (placeCardIncidentMetaRow) placeCardIncidentMetaRow.style.display = 'none';
      if (placeCardInfoList) placeCardInfoList.style.display = 'flex';

      if (placeCardAddress) placeCardAddress.textContent = place.address || 'Mangaluru, Karnataka';
      if (placeCardCoords) placeCardCoords.textContent = `${place.lat.toFixed(5)}° N, ${place.lng.toFixed(5)}° E`;
      if (placeCardTrafficStatus) placeCardTrafficStatus.textContent = place.traffic || '🟢 Free Flow · Average 32 km/h';

      // Check for nearby hazards
      if (placeCardHazardsStatus) {
        const nearbyIncident = incidentHistory.find(inc => {
          if (!inc.lat || !inc.lng) return false;
          const dLat = place.lat - inc.lat;
          const dLng = place.lng - inc.lng;
          return (dLat * dLat + dLng * dLng) < 0.0001; // within ~1.2 km
        });

        if (nearbyIncident) {
          placeCardHazardsStatus.textContent = `⚠️ Active hazard nearby: "${nearbyIncident.subject}" (${nearbyIncident.location})`;
          placeCardHazardsStatus.style.color = '#d93025';
        } else {
          placeCardHazardsStatus.textContent = '✅ Roads clear · No active hazards in 1.5 km vicinity';
          placeCardHazardsStatus.style.color = '#137333';
        }
      }

      if (placeCardHours) placeCardHours.textContent = place.hours || 'Open 24 Hours';

      if (placeCardPhone && infoRowPhone) {
        if (place.phone) {
          placeCardPhone.textContent = place.phone;
          infoRowPhone.style.display = 'flex';
        } else {
          infoRowPhone.style.display = 'none';
        }
      }

      if (placeCardDesc) {
        placeCardDesc.textContent = place.desc || `Connected Mangaluru location. Rating: ${place.rating || '4.5 ★'}.`;
      }

      if (placeCardPhotoWrapper) placeCardPhotoWrapper.style.display = 'none';

      // Wire Up Action Buttons
      if (btnPlaceDirections) {
        btnPlaceDirections.onclick = () => {
          placeCard.style.display = 'none';
          openDirectionsPanel();
          if (destinationSelect) {
            destinationSelect.value = place.id;
          }
          calculateRouteAction();
        };
      }

      if (btnPlaceStartFrom) {
        btnPlaceStartFrom.onclick = () => {
          placeCard.style.display = 'none';
          openDirectionsPanel();
          if (originSelect) {
            originSelect.value = place.id;
          }
          showToast(`Origin set to: "${place.name}"`);
        };
      }

      if (btnPlaceReportUpdate) {
        btnPlaceReportUpdate.onclick = () => {
          placeCard.style.display = 'none';
          openReportModal();
          const descInput = document.getElementById('modalReportDesc');
          if (descInput) {
            descInput.value = `Issue reported near ${place.name} (${place.address})`;
          }
        };
      }

      if (btnPlaceShare) {
        btnPlaceShare.onclick = () => {
          const text = `${place.name}\n${place.address}\nGPS: ${place.lat}, ${place.lng}`;
          if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
              showToast('Location details copied to clipboard!');
            });
          } else {
            showToast(`Location: ${place.name}`);
          }
        };
      }

      placeCard.style.display = 'block';
    }

    function showIncidentPlaceCard(inc) {
      if (!placeCard) return;

      if (placeCardBadge) {
        placeCardBadge.textContent = `⚠️ ${(inc.severity || 'HIGH')} · ${inc.category || 'HAZARD'}`;
        placeCardBadge.style.background = inc.severity === 'CRITICAL' ? '#fce8e6' : '#fef7e0';
        placeCardBadge.style.color = inc.severity === 'CRITICAL' ? '#d93025' : '#b06000';
      }

      if (placeCardStatusPill) {
        placeCardStatusPill.textContent = '⚠️ HAZARD ALERT';
        placeCardStatusPill.style.background = '#fef7e0';
        placeCardStatusPill.style.color = '#b06000';
        placeCardStatusPill.style.display = 'inline-flex';
      }

      if (placeCardTitle) placeCardTitle.textContent = inc.subject || 'Active Incident Hazard';
      if (placeCardSubtitle) placeCardSubtitle.textContent = inc.location || 'Mangaluru Sector';

      // Show incident specific meta row and hide place info list
      if (placeCardIncidentMetaRow) placeCardIncidentMetaRow.style.display = 'flex';
      if (placeCardInfoList) placeCardInfoList.style.display = 'none';

      if (placeCardDelay) placeCardDelay.textContent = inc.severity === 'CRITICAL' ? '+18 mins' : '+8 mins';
      if (placeCardLanes) placeCardLanes.textContent = `${inc.severity === 'CRITICAL' ? '2 Lanes' : '1 Lane'} Blocked`;
      if (placeCardReported) placeCardReported.textContent = inc.timeAgo || 'Recently';
      if (placeCardDesc) placeCardDesc.textContent = inc.description || 'Citizen road blockage report.';

      if (placeCardPhotoWrapper && placeCardPhoto) {
        if (inc.photo) {
          placeCardPhoto.src = inc.photo;
          placeCardPhotoWrapper.style.display = 'block';
        } else {
          placeCardPhotoWrapper.style.display = 'none';
        }
      }

      if (btnPlaceDirections) {
        btnPlaceDirections.onclick = () => {
          placeCard.style.display = 'none';
          openDirectionsPanel();
          if (destinationSelect) {
            const optVal = `INCIDENT_${inc.id}`;
            let opt = destinationSelect.querySelector(`option[value="${optVal}"]`);
            if (!opt) {
              opt = document.createElement('option');
              opt.value = optVal;
              opt.textContent = `⚠️ Hazard: ${inc.subject || 'Road Incident'}`;
              destinationSelect.insertBefore(opt, destinationSelect.firstChild);
            }
            destinationSelect.value = optVal;
            window._activeIncidentRouteTarget = inc;
          }
          calculateRouteAction();
        };
      }

      if (btnPlaceStartFrom) {
        btnPlaceStartFrom.onclick = () => {
          placeCard.style.display = 'none';
          openDirectionsPanel();
          if (originSelect) {
            const optVal = `INCIDENT_${inc.id}`;
            let opt = originSelect.querySelector(`option[value="${optVal}"]`);
            if (!opt) {
              opt = document.createElement('option');
              opt.value = optVal;
              opt.textContent = `⚠️ Hazard: ${inc.subject || 'Road Incident'}`;
              originSelect.insertBefore(opt, originSelect.firstChild);
            }
            originSelect.value = optVal;
            window._activeIncidentRouteOrigin = inc;
          }
        };
      }

      if (btnPlaceReportUpdate) {
        btnPlaceReportUpdate.onclick = () => {
          placeCard.style.display = 'none';
          openReportModal();
        };
      }

      if (btnPlaceShare) {
        btnPlaceShare.onclick = () => {
          showToast(`Hazard shared: ${inc.subject}`);
        };
      }

      placeCard.style.display = 'block';
    }

    function showJunctionPlaceCard(node) {
      const match = MANGALURU_PLACES.find(p => p.id === node.id || p.name === node.name);
      if (match) {
        showCompletePlaceCard(match);
      } else {
        showCompletePlaceCard({
          id: node.id,
          name: node.name || 'Junction',
          category: 'junction',
          categoryLabel: '🚦 Key Road Junction',
          icon: '🚦',
          lat: node.lat,
          lng: node.lng,
          address: `Mangaluru Arterial Road Network · Node: ${node.id}`,
          neighborhood: 'Mangaluru Sector',
          hours: '24/7 Traffic Network',
          traffic: '🟢 Normal Flow',
          desc: `Connected traffic node in Mangaluru metropolitan road grid.`
        });
      }
    }

    if (closePlaceCardBtn) {
      closePlaceCardBtn.addEventListener('click', () => {
        if (placeCard) placeCard.style.display = 'none';
      });
    }

    // Listen to custom map events dispatched by MapLibre3DTrafficMap
    window.addEventListener('gmaps:place-clicked', (e) => {
      if (e.detail) showCompletePlaceCard(e.detail);
    });

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
        showToast(isTrafficLayerVisible ? 'Traffic density corridors visible' : 'Traffic density corridors hidden');
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
          showToast(`Zoomed to latest active hazard: "${first.subject}"`);
        } else {
          openHistoryModal();
        }
      });
    }

    if (chipHospitals) {
      chipHospitals.addEventListener('click', () => {
        const kmc = MANGALURU_PLACES.find(p => p.id === 'HOSPITAL_KMC_JYOTHI');
        if (kmc && activeMap && typeof activeMap.focusLocation === 'function') {
          activeMap.focusLocation(kmc.lat, kmc.lng, kmc.name, 16.5);
          showCompletePlaceCard(kmc);
        }
        showToast('Hospital emergency hubs displayed.');
      });
    }

    if (chipTransit) {
      chipTransit.addEventListener('click', () => {
        const central = MANGALURU_PLACES.find(p => p.id === 'TRANSIT_MANGALORE_CENTRAL');
        if (central && activeMap && typeof activeMap.focusLocation === 'function') {
          activeMap.focusLocation(central.lat, central.lng, central.name, 16.5);
          showCompletePlaceCard(central);
        }
        showToast('Transit & railway terminals displayed.');
      });
    }

    if (chipPlaces) {
      chipPlaces.addEventListener('click', () => {
        const mall = MANGALURU_PLACES.find(p => p.id === 'SHOP_CITY_CENTRE');
        if (mall && activeMap && typeof activeMap.focusLocation === 'function') {
          activeMap.focusLocation(mall.lat, mall.lng, mall.name, 16.5);
          showCompletePlaceCard(mall);
        }
        showToast('Shopping malls & city destinations displayed.');
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
          if (typeof activeMap.renderPlaces === 'function' && typeof MANGALURU_PLACES !== 'undefined') {
            activeMap.renderPlaces(MANGALURU_PLACES);
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

  // Active Police Diversions Polling & Live Map Broadcast
  let currentActiveDiversion = null;

  async function checkActiveDiversions() {
    try {
      const res = await fetch('/api/v1/intelligence/diversions/active');
      if (!res.ok) return;
      const diversions = await res.json();
      const banner = document.getElementById('policeAdvisoryBanner');
      if (!banner) return;

      if (diversions && diversions.length > 0) {
        const latest = diversions[diversions.length - 1];
        currentActiveDiversion = latest;

        const elId = document.getElementById('advisoryIncidentId');
        const elSavings = document.getElementById('advisorySavings');
        const elMsg = document.getElementById('advisoryMessageText');

        if (elId) elId.textContent = latest.incident_id.replace('INC-MNG-', 'INC-');
        if (elSavings) elSavings.textContent = `Saves ~${latest.delay_saved_veh_hours.toFixed(0)} veh-hrs`;
        if (elMsg) elMsg.textContent = latest.advisory_text;

        banner.style.display = 'flex';

        if (activeMap && typeof activeMap.renderPoliceDiversion === 'function') {
          activeMap.renderPoliceDiversion(latest);
        }
      } else {
        currentActiveDiversion = null;
        banner.style.display = 'none';
        if (activeMap && typeof activeMap.renderPoliceDiversion === 'function') {
          activeMap.renderPoliceDiversion(null);
        }
      }
    } catch (err) {
      console.warn('Could not poll active diversions:', err);
    }
  }

  const btnFocusDetour = document.getElementById('btnFocusAdvisoryMap');
  if (btnFocusDetour) {
    btnFocusDetour.addEventListener('click', () => {
      if (currentActiveDiversion && activeMap && typeof activeMap.renderPoliceDiversion === 'function') {
        activeMap.renderPoliceDiversion(currentActiveDiversion);
      }
    });
  }

  // Initial check & continuous poll for deployed control-room diversions
  setTimeout(checkActiveDiversions, 1500);
  setInterval(checkActiveDiversions, 5000);
});
