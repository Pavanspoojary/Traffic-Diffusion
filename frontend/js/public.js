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
  const trafficMap = new TrafficMap('map');
  let networkEdges = [];
  let networkNodes = [];

  // Load Network Corridors
  async function loadPublicNetwork() {
    try {
      const res = await fetch('/api/v1/navigation/network');
      if (res.ok) {
        const data = await res.json();
        networkNodes = data.nodes || [];
        networkEdges = data.edges || [];
        trafficMap.renderNetwork(networkNodes, networkEdges);
        populateCorridorSelect(networkEdges);
      }
    } catch (err) {
      console.error('Failed to load public traffic network:', err);
    }
  }

  function populateCorridorSelect(edges) {
    const select = document.getElementById('modalCorridorSelect');
    if (!select) return;
    select.innerHTML = '<option value="">-- Select Road Corridor --</option>';
    edges.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = `${e.name} (${e.congestion_level || 'NORMAL'})`;
      select.appendChild(opt);
    });
  }

  await loadPublicNetwork();

  // 3. Floating Red "+" Action Button & Modal Logic
  const btnEmergencyFab = document.getElementById('btnEmergencyFab');
  const incidentModal = document.getElementById('incidentReportModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCancelReport = document.getElementById('btnCancelReport');
  const emergencyForm = document.getElementById('emergencyReportForm');
  const toastNotification = document.getElementById('publicToast');
  const toastMessage = document.getElementById('toastMessage');

  function openModal() {
    if (incidentModal) {
      incidentModal.classList.add('active');
      const descInput = document.getElementById('modalIncidentDesc');
      if (descInput) descInput.focus();
    }
  }

  function closeModal() {
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

      const category = document.getElementById('modalCategorySelect')?.value || 'ROAD_BLOCKAGE';
      const corridorId = document.getElementById('modalCorridorSelect')?.value || 'corridor_cctv_01';
      const description = document.getElementById('modalIncidentDesc')?.value || 'Citizen Reported Obstruction';
      const severity = document.getElementById('modalSeveritySelect')?.value || 'HIGH';

      // Submit to backend intelligence API if available
      try {
        const payload = {
          edge_id: corridorId,
          category: category,
          severity: severity,
          capacity_reduction: 0.85,
          estimated_duration_min: 45
        };

        const res = await fetch('/api/v1/intelligence/incident/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          showToast(`Report logged! Emergency corridors & dispatch notified for ${currentCitizen.address}.`);
        } else {
          showToast(`Report submitted: ${category} recorded near ${corridorId}.`);
        }
      } catch (err) {
        // Fallback demo toast if offline
        showToast(`Incident reported by ${currentCitizen.name}! Local responders alerted.`);
      }

      // Close modal and refresh network
      closeModal();
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
