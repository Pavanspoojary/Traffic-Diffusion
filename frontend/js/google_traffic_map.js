// Traffic Diffusion - Google Maps Platform Controller
// Solution Attribution ID: gmp_git_agentskills_v1

class GoogleTrafficMap {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.map = null;
    this.infoWindow = null;
    this.edgePolylines = [];
    this.nodeMarkers = [];
    this.incidentMarkers = [];
    this.userGpsMarker = null;
    this.nodeMap = new Map();
    this.isReady = false;
    this.AdvancedMarkerElement = null;
    this.PinElement = null;
  }

  async init() {
    try {
      // Dynamic import of Google Maps Platform libraries
      const { Map, InfoWindow } = await google.maps.importLibrary("maps");
      const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");
      this.AdvancedMarkerElement = AdvancedMarkerElement;
      this.PinElement = PinElement;

      // Dark Cyberpunk / Modern Navigation Style Palette
      const darkMapStyles = [
        { elementType: "geometry", stylers: [{ color: "#0f172a" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
        {
          featureType: "administrative.locality",
          elementType: "labels.text.fill",
          stylers: [{ color: "#cbd5e1" }]
        },
        {
          featureType: "poi",
          elementType: "labels.text.fill",
          stylers: [{ color: "#64748b" }]
        },
        {
          featureType: "poi.park",
          elementType: "geometry",
          stylers: [{ color: "#132438" }]
        },
        {
          featureType: "road",
          elementType: "geometry",
          stylers: [{ color: "#1e293b" }]
        },
        {
          featureType: "road",
          elementType: "geometry.stroke",
          stylers: [{ color: "#334155" }]
        },
        {
          featureType: "road.highway",
          elementType: "geometry",
          stylers: [{ color: "#2563eb" }, { lightness: -20 }]
        },
        {
          featureType: "road.highway",
          elementType: "geometry.stroke",
          stylers: [{ color: "#1d4ed8" }]
        },
        {
          featureType: "road.arterial",
          elementType: "geometry",
          stylers: [{ color: "#1e293b" }]
        },
        {
          featureType: "transit",
          elementType: "geometry",
          stylers: [{ color: "#1e293b" }]
        },
        {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ color: "#091224" }]
        },
        {
          featureType: "water",
          elementType: "labels.text.fill",
          stylers: [{ color: "#38bdf8" }]
        }
      ];

      // Initialize Google Map with mandatory attribution ID and DEMO_MAP_ID
      this.map = new Map(this.container, {
        center: { lat: 12.8750, lng: 74.8550 }, // Mangaluru city center
        zoom: 13,
        mapId: "DEMO_MAP_ID", // Required for AdvancedMarkerElement
        styles: darkMapStyles,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        // Mandatory setting per Google Maps Platform developer skill
        internalUsageAttributionIds: ["gmp_git_agentskills_v1"]
      });

      this.infoWindow = new InfoWindow({
        ariaLabel: "Traffic Node Info"
      });

      this.isReady = true;
      return true;
    } catch (err) {
      console.error("Google Maps initialization failed:", err);
      this.renderFallbackError(err);
      return false;
    }
  }

  renderFallbackError(err) {
    if (!this.container) return;
    const isApiKeyError = !localStorage.getItem("GOOGLE_MAPS_API_KEY");
    
    this.container.innerHTML = `
      <div style="height: 100%; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #0f172a; color: #f8fafc; padding: 24px; text-align: center;">
        <div style="width: 52px; height: 52px; border-radius: 50%; background: rgba(59, 130, 246, 0.15); display: flex; align-items: center; justify-content: center; margin-bottom: 16px; border: 1px solid rgba(59, 130, 246, 0.4);">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
            <line x1="8" y1="2" x2="8" y2="18"></line>
            <line x1="16" y1="6" x2="16" y2="22"></line>
          </svg>
        </div>
        <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">Google Maps Live View</h3>
        <p style="font-size: 13px; color: #94a3b8; max-width: 440px; line-height: 1.5; margin-bottom: 18px;">
          ${isApiKeyError 
            ? "To view high-resolution Google Maps tiles with live traffic, please configure your Google Maps API Key or free Maps Demo Key." 
            : "Google Maps loading encountered a network connection or key limit. You can update your key below or retry."}
        </p>
        <div style="display: flex; gap: 10px;">
          <button id="btnFallbackConfigKey" style="padding: 10px 18px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;">
            Enter Google Maps Key
          </button>
          <button id="btnFallbackUseLeaflet" style="padding: 10px 18px; background: #1e293b; color: #cbd5e1; border: 1px solid #334155; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;">
            Switch to OpenStreetMap
          </button>
        </div>
      </div>
    `;

    document.getElementById("btnFallbackConfigKey")?.addEventListener("click", () => {
      document.getElementById("mapsKeyModal")?.classList.add("active");
    });

    document.getElementById("btnFallbackUseLeaflet")?.addEventListener("click", () => {
      location.reload();
    });
  }

  renderNetwork(nodes, edges) {
    if (!this.map || !this.isReady) return;

    // Clear previous polylines & markers
    this.edgePolylines.forEach(p => p.setMap(null));
    this.edgePolylines = [];
    this.nodeMarkers.forEach(m => (m.map = null));
    this.nodeMarkers = [];
    this.nodeMap.clear();

    nodes.forEach(n => this.nodeMap.set(n.id, n));

    // Render Edges as Google Maps Polylines
    edges.forEach(edge => {
      const sourceNode = this.nodeMap.get(edge.source);
      const targetNode = this.nodeMap.get(edge.target);
      if (!sourceNode || !targetNode) return;

      const path = [
        { lat: sourceNode.lat, lng: sourceNode.lng },
        { lat: targetNode.lat, lng: targetNode.lng }
      ];

      const strokeConfig = this._getEdgeColorAndWeight(edge);

      const polyline = new google.maps.Polyline({
        path: path,
        geodesic: true,
        strokeColor: strokeConfig.color,
        strokeOpacity: strokeConfig.opacity,
        strokeWeight: strokeConfig.weight,
        map: this.map
      });

      // Hover / Click info
      polyline.addListener("click", (event) => {
        const content = `
          <div style="color: #0f172a; font-family: sans-serif; font-size: 12px; padding: 4px;">
            <div style="font-weight: 800; font-size: 13px; margin-bottom: 4px; color: #1e293b;">${edge.name}</div>
            <div style="margin-bottom: 2px;">Status: <strong style="color: ${strokeConfig.color};">${edge.congestion_level}</strong></div>
            <div>Density: <strong>${Math.round(edge.density_score * 100)}%</strong> · Travel Time: <strong>${edge.estimated_travel_time_min}m</strong></div>
            ${edge.has_incident ? `<div style="margin-top: 4px; color: #ef4444; font-weight: bold;">⚠️ INCIDENT: ${edge.incident_description || 'Blockage'}</div>` : ''}
          </div>
        `;
        this.infoWindow.setContent(content);
        this.infoWindow.setPosition(event.latLng);
        this.infoWindow.open(this.map);
      });

      this.edgePolylines.push(polyline);
    });

    // Render Junction Nodes with AdvancedMarkerElement
    nodes.forEach(node => {
      const nodeBadge = document.createElement("div");
      nodeBadge.className = "gmp-junction-badge";
      nodeBadge.style.cssText = `
        background: #1e293b;
        border: 2px solid #3b82f6;
        color: #60a5fa;
        font-family: monospace;
        font-size: 10px;
        font-weight: 700;
        padding: 3px 6px;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.6);
        cursor: pointer;
        transition: transform 0.15s ease;
      `;
      nodeBadge.textContent = node.name.split(" ")[0].slice(0, 3).toUpperCase();

      nodeBadge.addEventListener("mouseenter", () => {
        nodeBadge.style.transform = "scale(1.15)";
      });
      nodeBadge.addEventListener("mouseleave", () => {
        nodeBadge.style.transform = "scale(1)";
      });

      const marker = new this.AdvancedMarkerElement({
        map: this.map,
        position: { lat: node.lat, lng: node.lng },
        title: node.name,
        content: nodeBadge
      });

      marker.addListener("click", () => {
        this.infoWindow.setContent(`
          <div style="color: #0f172a; font-family: sans-serif; font-size: 12px; padding: 4px;">
            <div style="font-weight: 800; font-size: 13px; color: #1e293b;">${node.name}</div>
            <div style="color: #64748b; font-size: 11px;">Traffic Signal Junction · ID: ${node.id}</div>
          </div>
        `);
        this.infoWindow.open({
          anchor: marker,
          map: this.map
        });
      });

      this.nodeMarkers.push(marker);
    });
  }

  _getEdgeColorAndWeight(edge) {
    if (edge.has_incident || edge.congestion_level === "BLOCKED" || edge.congestion_level === "HEAVY") {
      return { color: "#ef4444", weight: 6, opacity: 0.95 };
    }
    if (edge.congestion_level === "MODERATE") {
      return { color: "#f59e0b", weight: 5, opacity: 0.85 };
    }
    return { color: "#3b82f6", weight: 4.5, opacity: 0.75 };
  }

  // Render Incident Markers on Google Maps
  renderIncidents(incidents) {
    if (!this.map || !this.isReady || !this.AdvancedMarkerElement) return;

    // Clear existing incident markers
    this.incidentMarkers.forEach(m => (m.map = null));
    this.incidentMarkers = [];

    incidents.forEach(inc => {
      if (!inc.lat || !inc.lng) return;

      const incidentPin = document.createElement("div");
      incidentPin.className = "gmp-incident-pin";
      incidentPin.style.cssText = `
        background: #ef4444;
        color: #ffffff;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        font-weight: 800;
        box-shadow: 0 0 15px rgba(239, 68, 68, 0.75), 0 2px 6px rgba(0,0,0,0.5);
        border: 2px solid #ffffff;
        cursor: pointer;
        animation: pulseWarning 2s infinite ease-in-out;
      `;
      incidentPin.innerHTML = "⚠️";

      const marker = new this.AdvancedMarkerElement({
        map: this.map,
        position: { lat: inc.lat, lng: inc.lng },
        title: inc.subject || "Reported Incident",
        content: incidentPin
      });

      marker.addListener("click", () => {
        const photoHtml = inc.photo
          ? `<div style="margin-top: 8px; border-radius: 6px; overflow: hidden; max-height: 120px;">
               <img src="${inc.photo}" style="width: 100%; height: 100%; object-fit: cover;" alt="Incident photo"/>
             </div>`
          : "";

        const content = `
          <div style="color: #0f172a; font-family: sans-serif; font-size: 12px; max-width: 260px; padding: 4px;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
              <span style="background: #ef4444; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700;">${inc.severity || 'HIGH'}</span>
              <span style="color: #64748b; font-size: 10px;">${inc.category || 'HAZARD'}</span>
            </div>
            <div style="font-weight: 800; font-size: 13px; color: #0f172a; margin-bottom: 4px;">${inc.subject || 'Road Incident'}</div>
            <div style="color: #475569; font-size: 11px; margin-bottom: 4px;">📍 ${inc.location || 'Mangaluru'}</div>
            <div style="color: #64748b; font-size: 10px;">Reported by: ${inc.reporter || 'Citizen'} · ${inc.timeAgo || 'Recently'}</div>
            ${photoHtml}
          </div>
        `;

        this.infoWindow.setContent(content);
        this.infoWindow.open({
          anchor: marker,
          map: this.map
        });
      });

      this.incidentMarkers.push(marker);
    });
  }

  // Focus and Pan to Location (e.g. Current GPS or Incident)
  focusLocation(lat, lng, label = "Selected Location", zoomLevel = 15) {
    if (!this.map) return;

    this.map.panTo({ lat, lng });
    this.map.setZoom(zoomLevel);

    if (this.AdvancedMarkerElement) {
      if (this.userGpsMarker) {
        this.userGpsMarker.map = null;
      }

      const beacon = document.createElement("div");
      beacon.style.cssText = `
        width: 20px;
        height: 20px;
        background: #3b82f6;
        border-radius: 50%;
        border: 3px solid #ffffff;
        box-shadow: 0 0 16px rgba(59, 130, 246, 0.9);
      `;

      this.userGpsMarker = new this.AdvancedMarkerElement({
        map: this.map,
        position: { lat, lng },
        title: label,
        content: beacon
      });

      this.infoWindow.setContent(`
        <div style="color: #0f172a; font-family: sans-serif; font-size: 12px; padding: 4px;">
          <div style="font-weight: 800; font-size: 13px; color: #1e293b;">${label}</div>
          <div style="color: #64748b; font-size: 10px;">GPS: ${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E</div>
        </div>
      `);
      this.infoWindow.open({
        anchor: this.userGpsMarker,
        map: this.map
      });
    }
  }
}
