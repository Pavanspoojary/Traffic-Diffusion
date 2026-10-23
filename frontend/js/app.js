// Traffic Diffusion Client Application
document.addEventListener('DOMContentLoaded', () => {
  const trafficMap = new TrafficMap('map');

  // DOM Elements
  const activeIncidentsCount = document.getElementById('activeIncidentsCount');
  const btnResetNetwork = document.getElementById('btnResetNetwork');

  const corridorSelect = document.getElementById('corridorSelect');
  const videoFileInput = document.getElementById('videoFileInput');
  const uploadForm = document.getElementById('uploadForm');
  const btnUploadSubmit = document.getElementById('btnUploadSubmit');
  const btnLoadHeavySample = document.getElementById('btnLoadHeavySample');
  const btnLoadFreeflowSample = document.getElementById('btnLoadFreeflowSample');

  const cvResultsBox = document.getElementById('cvResultsBox');
  const resCorridorId = document.getElementById('resCorridorId');
  const resFrames = document.getElementById('resFrames');
  const resDensityScore = document.getElementById('resDensityScore');
  const densityProgressBar = document.getElementById('densityProgressBar');
  const resCars = document.getElementById('resCars');
  const resTrucks = document.getElementById('resTrucks');
  const resBuses = document.getElementById('resBuses');
  const resBikes = document.getElementById('resBikes');
  const resCongestionBadge = document.getElementById('resCongestionBadge');
  const previewContainer = document.getElementById('previewContainer');
  const previewImage = document.getElementById('previewImage');

  const originSelect = document.getElementById('originSelect');
  const destinationSelect = document.getElementById('destinationSelect');
  const chkAvoidCongestion = document.getElementById('chkAvoidCongestion');
  const chkPreemption = document.getElementById('chkPreemption');
  const btnComputeRoute = document.getElementById('btnComputeRoute');

  const simEdgeSelect = document.getElementById('simEdgeSelect');
  const btnInjectBlockage = document.getElementById('btnInjectBlockage');
  const btnClearBlockage = document.getElementById('btnClearBlockage');

  const valDistance = document.getElementById('valDistance');
  const valEmsTime = document.getElementById('valEmsTime');
  const valStandardTime = document.getElementById('valStandardTime');
  const valTimeSaved = document.getElementById('valTimeSaved');
  const valSignals = document.getElementById('valSignals');

  // Application State
  let currentNetworkState = null;

  // 1. Initial Data Fetch
  async function loadNetworkState() {
    try {
      const res = await fetch('/api/v1/navigation/network');
      if (!res.ok) throw new Error('Failed to fetch network state');
      currentNetworkState = await res.json();

      trafficMap.renderNetwork(currentNetworkState.nodes, currentNetworkState.edges);
      activeIncidentsCount.textContent = currentNetworkState.active_incidents_count;

      populateEdgeDropdown(currentNetworkState.edges);
    } catch (err) {
      console.error('Error loading network state:', err);
    }
  }

  function populateEdgeDropdown(edges) {
    simEdgeSelect.innerHTML = '';
    edges.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = `${e.name} (${e.id}) [${e.congestion_level}]`;
      simEdgeSelect.appendChild(opt);
    });
  }

  // 2. Video Analysis Handlers
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = videoFileInput.files[0];
    const corridorId = corridorSelect.value;

    if (!file) {
      alert('Please select a video file or use one of the sample buttons.');
      return;
    }

    const formData = new FormData();
    formData.append('video_file', file);
    formData.append('corridor_id', corridorId);

    btnUploadSubmit.disabled = true;
    btnUploadSubmit.textContent = 'Processing Video Frames...';

    try {
      const res = await fetch('/api/v1/cv/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Analysis failed');
      }

      const result = await res.json();
      displayCvResults(result);
      await loadNetworkState();
    } catch (err) {
      alert('Error during CV analysis: ' + err.message);
    } finally {
      btnUploadSubmit.disabled = false;
      btnUploadSubmit.textContent = 'Analyze Video Stream';
    }
  });

  async function triggerSampleAnalysis(sampleType) {
    const corridorId = corridorSelect.value;
    btnUploadSubmit.disabled = true;
    btnUploadSubmit.textContent = `Analyzing ${sampleType.toUpperCase()} Sample...`;

    try {
      const res = await fetch(`/api/v1/cv/analyze-sample?sample_type=${sampleType}&corridor_id=${corridorId}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to analyze sample');
      const result = await res.json();
      displayCvResults(result);
      await loadNetworkState();
    } catch (err) {
      alert('Sample analysis error: ' + err.message);
    } finally {
      btnUploadSubmit.disabled = false;
      btnUploadSubmit.textContent = 'Analyze Video Stream';
    }
  }

  btnLoadHeavySample.addEventListener('click', () => triggerSampleAnalysis('heavy'));
  btnLoadFreeflowSample.addEventListener('click', () => triggerSampleAnalysis('freeflow'));

  function displayCvResults(result) {
    cvResultsBox.classList.remove('hidden');
    resCorridorId.textContent = result.corridor_id;
    resFrames.textContent = result.frames_analyzed;
    resDensityScore.textContent = result.density_score.toFixed(2);

    const percent = Math.min(100, Math.round(result.density_score * 100));
    densityProgressBar.style.width = `${percent}%`;

    if (result.congestion_level === 'BLOCKED') {
      densityProgressBar.style.backgroundColor = 'var(--accent-red)';
    } else if (result.congestion_level === 'HEAVY') {
      densityProgressBar.style.backgroundColor = 'var(--accent-amber)';
    } else {
      densityProgressBar.style.backgroundColor = 'var(--accent-green)';
    }

    resCars.textContent = result.vehicle_counts.cars;
    resTrucks.textContent = result.vehicle_counts.trucks;
    resBuses.textContent = result.vehicle_counts.buses;
    resBikes.textContent = result.vehicle_counts.motorcycles;

    resCongestionBadge.textContent = result.congestion_level;
    resCongestionBadge.className = `status-tag tag-${result.congestion_level.toLowerCase().replace('_', '')}`;

    // Load annotated frame preview
    const previewFilename = `${result.video_filename.replace(/\.[^/.]+$/, "")}_preview.jpg`;
    previewImage.src = `/api/v1/cv/preview/${previewFilename}`;
    previewContainer.classList.remove('hidden');
  }

  // 3. Emergency Routing Handler
  btnComputeRoute.addEventListener('click', async () => {
    const originId = originSelect.value;
    const destId = destinationSelect.value;
    const avoidCongestion = chkAvoidCongestion.checked;

    btnComputeRoute.disabled = true;
    btnComputeRoute.textContent = 'Calculating Corridor...';

    try {
      const res = await fetch('/api/v1/navigation/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin_node_id: originId,
          destination_node_id: destId,
          is_emergency: true,
          avoid_congestion: avoidCongestion,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Route calculation failed');
      }

      const routeData = await res.json();
      trafficMap.renderGreenCorridor(routeData.path_coordinates, routeData);

      // Update metrics banner
      valDistance.textContent = `${routeData.total_distance_km.toFixed(2)} km`;
      valEmsTime.textContent = `${routeData.estimated_travel_time_min.toFixed(1)} min`;
      valStandardTime.textContent = `${routeData.standard_travel_time_min.toFixed(1)} min`;
      valTimeSaved.textContent = `${routeData.time_saved_min.toFixed(1)} min`;
      valSignals.textContent = routeData.signals_preempted;
    } catch (err) {
      alert('Routing error: ' + err.message);
    } finally {
      btnComputeRoute.disabled = false;
      btnComputeRoute.textContent = 'Dispatch Green Corridor';
    }
  });

  // 4. Incident Simulator Handlers
  btnInjectBlockage.addEventListener('click', async () => {
    const edgeId = simEdgeSelect.value;
    try {
      const res = await fetch('/api/v1/navigation/simulate-incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edge_id: edgeId,
          congestion_level: 'BLOCKED',
          has_incident: true,
          incident_description: 'Major collision blocking roadway; police diversion active',
        }),
      });
      if (!res.ok) throw new Error('Failed to inject incident');
      await loadNetworkState();
      // Auto-recalculate active route if one exists
      btnComputeRoute.click();
    } catch (err) {
      alert('Simulator error: ' + err.message);
    }
  });

  btnClearBlockage.addEventListener('click', async () => {
    const edgeId = simEdgeSelect.value;
    try {
      const res = await fetch('/api/v1/navigation/simulate-incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edge_id: edgeId,
          congestion_level: 'FREE_FLOW',
          has_incident: false,
          incident_description: '',
        }),
      });
      if (!res.ok) throw new Error('Failed to clear incident');
      await loadNetworkState();
      btnComputeRoute.click();
    } catch (err) {
      alert('Simulator error: ' + err.message);
    }
  });

  btnResetNetwork.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/v1/navigation/reset', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to reset');
      await loadNetworkState();
      btnComputeRoute.click();
    } catch (err) {
      alert('Reset error: ' + err.message);
    }
  });

  // Startup initialization
  loadNetworkState().then(() => {
    // Initial auto-route on startup
    btnComputeRoute.click();
  });
});
