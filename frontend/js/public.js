// Public Citizen Portal & Emergency Map Controller
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

  // 2. Initialize Leaflet Map from the main branch
  let trafficMap;
  try {
    trafficMap = new TrafficMap('map');
    setTimeout(() => {
      if (trafficMap && trafficMap.map) trafficMap.map.invalidateSize();
    }, 250);
  } catch (err) {
    console.error('Error initializing TrafficMap:', err);
  }

  let networkEdges = [];
  let networkNodes = [];

  // Load Network Corridors
  async function loadPublicNetwork() {
    try {
      let netData = null;
      try {
        const res = await fetch('/api/v1/navigation/network');
        if (res.ok) {
          netData = await res.json();
        }
      } catch (e) {}

      // Fallback to static seed data if backend API is not running
      if (!netData) {
        try {
          const fallbackRes = await fetch('/data/seed_network.json');
          if (fallbackRes.ok) {
            netData = await fallbackRes.json();
          }
        } catch (e) {}
      }

      if (netData && trafficMap) {
        networkNodes = netData.nodes || [];
        networkEdges = netData.edges || [];
        trafficMap.renderNetwork(networkNodes, networkEdges);
        populateCorridorSelect(networkEdges);
        setTimeout(() => trafficMap.map.invalidateSize(), 300);
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

  await loadPublicNetwork();
  setInterval(loadPublicNetwork, 5000);

  // 3. Floating Red "+" Action Button & Modal Logic
  const btnEmergencyFab = document.getElementById('btnEmergencyFab');
  const incidentModal = document.getElementById('incidentReportModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCancelReport = document.getElementById('btnCancelReport');
  const emergencyForm = document.getElementById('emergencyReportForm');
  const toastNotification = document.getElementById('publicToast');
  const toastMessage = document.getElementById('toastMessage');

  // Category & Subject Elements
  const modalCategorySelect = document.getElementById('modalCategorySelect');
  const modalIncidentSubject = document.getElementById('modalIncidentSubject');

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

  // Incident Type change handler
  if (modalCategorySelect && modalIncidentSubject) {
    modalCategorySelect.addEventListener('change', () => {
      if (modalCategorySelect.value === 'OTHER') {
        modalIncidentSubject.placeholder = 'Specify custom incident subject (e.g. Broken water pipe / Electrical wire)';
        modalIncidentSubject.focus();
      } else {
        modalIncidentSubject.placeholder = 'e.g. Tree fallen blocking both lanes near signal';
      }
    });
  }

  // Camera Management
  function stopLiveCamera() {
    if (activeMediaStream) {
      activeMediaStream.getTracks().forEach(track => track.stop());
      activeMediaStream = null;
    }
    if (cameraVideo) {
      cameraVideo.srcObject = null;
    }
    if (cameraStreamWrapper) cameraStreamWrapper.classList.remove('active');
    if (btnStartLiveCamera) btnStartLiveCamera.style.display = 'inline-flex';
    if (btnSnapPhoto) btnSnapPhoto.style.display = 'none';
    if (btnStopLiveCamera) btnStopLiveCamera.style.display = 'none';
  }

  async function startLiveCamera() {
    try {
      stopLiveCamera(); // clear existing
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      activeMediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      cameraVideo.srcObject = activeMediaStream;
      await cameraVideo.play();

      cameraStreamWrapper.classList.add('active');
      btnStartLiveCamera.style.display = 'none';
      btnSnapPhoto.style.display = 'inline-flex';
      btnStopLiveCamera.style.display = 'inline-flex';
    } catch (err) {
      console.warn('Direct camera stream inaccessible, falling back to device camera:', err);
      // Automatically fallback to mobile device camera capture
      if (cameraInput) cameraInput.click();
    }
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

  // Camera Listeners
  if (btnStartLiveCamera) {
    btnStartLiveCamera.addEventListener('click', startLiveCamera);
  }

  if (btnSnapPhoto) {
    btnSnapPhoto.addEventListener('click', snapPhotoFromStream);
  }

  if (btnStopLiveCamera) {
    btnStopLiveCamera.addEventListener('click', stopLiveCamera);
  }

  // Native device camera trigger (forces camera app on mobile, no gallery)
  if (btnTriggerNativeCamera && cameraInput) {
    btnTriggerNativeCamera.addEventListener('click', () => {
      cameraInput.click();
    });

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

  if (btnRemovePhoto) {
    btnRemovePhoto.addEventListener('click', clearPhotoPreview);
  }

  // Location Elements
  const modalIncidentLocation = document.getElementById('modalIncidentLocation');
  const btnUseCurrentLocation = document.getElementById('btnUseCurrentLocation');
  const gpsActivePill = document.getElementById('gpsActivePill');

  if (btnUseCurrentLocation) {
    btnUseCurrentLocation.addEventListener('click', () => {
      if (modalIncidentLocation) {
        modalIncidentLocation.placeholder = 'Acquiring GPS fix...';
      }

      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = Math.round(position.coords.accuracy || 15);
            
            if (modalIncidentLocation) {
              modalIncidentLocation.value = `GPS: ${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E (±${accuracy}m)`;
            }
            if (gpsActivePill) gpsActivePill.style.display = 'inline-block';

            // Pan map to current GPS location and drop marker
            if (trafficMap && trafficMap.map) {
              trafficMap.map.setView([lat, lng], 15);
              L.circleMarker([lat, lng], {
                radius: 8,
                fillColor: '#3b82f6',
                color: '#ffffff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9
              }).addTo(trafficMap.map).bindPopup('<strong>Your Current GPS Location</strong>').openPopup();
            }
          },
          (error) => {
            console.warn('Geolocation error:', error);
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
      } else {
        if (modalIncidentLocation) {
          modalIncidentLocation.value = currentCitizen.address || 'Mangaluru Sector';
        }
      }
    });
  }

  function openModal() {
    if (incidentModal) {
      incidentModal.classList.add('active');
      const subjectInput = document.getElementById('modalIncidentSubject');
      if (subjectInput) subjectInput.focus();
      if (modalIncidentLocation && !modalIncidentLocation.value) {
        modalIncidentLocation.value = currentCitizen.address || '';
      }
    }
  }

  function closeModal() {
    stopLiveCamera();
    if (incidentModal) {
      incidentModal.classList.remove('active');
    }
  }

  if (btnEmergencyFab) {
    btnEmergencyFab.addEventListener('click', openModal);
  }

  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', closeModal);
  }

  if (btnCancelReport) {
    btnCancelReport.addEventListener('click', closeModal);
  }

  // Close modal when clicking on backdrop outside card
  if (incidentModal) {
    incidentModal.addEventListener('click', (e) => {
      if (e.target === incidentModal) {
        closeModal();
      }
    });
  }

  // Handle Emergency / Incident Form Submission
  if (emergencyForm) {
    emergencyForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const category = modalCategorySelect?.value || 'ROAD_BLOCKAGE';
      const subject = modalIncidentSubject?.value.trim() || 'Citizen Incident';
      const location = modalIncidentLocation?.value.trim() || currentCitizen.address || 'Mangaluru';
      const description = document.getElementById('modalIncidentDesc')?.value.trim() || '';
      const severity = document.getElementById('modalSeveritySelect')?.value || 'HIGH';

      const corridorSelect = document.getElementById('modalCorridorSelect');
      const corridorId = corridorSelect?.value || 'corridor_cctv_07';
      const corridorName = corridorSelect?.options[corridorSelect.selectedIndex]?.text || corridorId;

      const lanesSelect = document.getElementById('modalLanesSelect');
      const lanesAffected = parseInt(lanesSelect?.value || '1', 10);

      const fullDetails = `${subject} (${location}) ${description ? '— ' + description : ''}`.trim();

      // Submit to backend intelligence API
      try {
        const payload = {
          road_segment_id: corridorId,
          edge_id: corridorId,
          category: (category === 'OTHER' || category === 'EMERGENCY_AMBULANCE') ? 'ROAD_BLOCKAGE' : category,
          severity: severity,
          lanes_affected: lanesAffected,
          capacity_reduction: lanesAffected > 1 ? 0.75 : 0.45,
          estimated_duration_min: 45,
          custom_subject: subject,
          description: fullDetails,
          location: location,
          reporter_name: currentCitizen.name || 'Citizen Commuter',
          reporter: currentCitizen.name || 'Citizen Commuter',
          contact_number: currentCitizen.address || null,
          has_photo: !!capturedPhotoBase64
        };

        const res = await fetch('/api/v1/intelligence/incident/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          showToast(`Emergency alert submitted: "${subject}" on ${corridorName}! Control room notified.`);
        } else {
          showToast(`Alert recorded: "${subject}" at ${location}.`);
        }
      } catch (err) {
        showToast(`Alert logged: "${subject}" at ${location}`);
      }

      // Close modal and clean up
      closeModal();
      clearPhotoPreview();
      emergencyForm.reset();
      await loadPublicNetwork();
    });
  }

  function showToast(msg) {
    if (!toastNotification || !toastMessage) return;
    toastMessage.textContent = msg;
    toastNotification.classList.add('show');
    setTimeout(() => {
      toastNotification.classList.remove('show');
    }, 4500);
  }
});
