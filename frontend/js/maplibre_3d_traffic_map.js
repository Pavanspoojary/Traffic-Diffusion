// Traffic Diffusion - MapLibre GL JS 3D Buildings & Urban Traffic Map
// Based on: https://maplibre.org/maplibre-gl-js/docs/examples/display-buildings-in-3d/
// Uses OpenFreeMap planet vector tiles for real-time 3D building extrusions

class MapLibre3DTrafficMap {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.map = null;
    this.isLoaded = false;
    this.nodeMarkers = [];
    this.incidentMarkers = [];
    this.userGpsMarker = null;
    this.nodeMap = new Map();
    this.pendingEdges = null;
    this.pendingNodes = null;
    this.pendingIncidents = null;
    this.popup = null;
  }

  async init() {
    if (typeof maplibregl === 'undefined') {
      console.error('MapLibre GL JS is not loaded.');
      return false;
    }

    return new Promise((resolve, reject) => {
      try {
        // Initialize MapLibre GL map with 3D perspective pitch and OpenFreeMap vector style
        this.map = new maplibregl.Map({
          container: this.containerId,
          style: 'https://tiles.openfreemap.org/styles/bright',
          center: [74.8550, 12.8750], // Mangaluru [lng, lat]
          zoom: 14.8,
          pitch: 52, // 3D tilt perspective
          bearing: -17.6, // Slight rotation for realistic isometric urban view
          canvasContextAttributes: { antialias: true }
        });

        // Add 3D Navigation, Compass & Pitch visualization controls
        this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
        this.map.addControl(new maplibregl.FullscreenControl(), 'top-right');

        this.popup = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: true,
          maxWidth: '300px',
          className: 'maplibre-dark-popup'
        });

        this.map.on('load', () => {
          this._setup3DBuildings();
          this._setupTrafficLayers();
          this.isLoaded = true;

          // Process any pending data
          if (this.pendingNodes && this.pendingEdges) {
            this.renderNetwork(this.pendingNodes, this.pendingEdges);
          }
          if (this.pendingIncidents) {
            this.renderIncidents(this.pendingIncidents);
          }

          resolve(true);
        });

        this.map.on('error', (e) => {
          console.warn('MapLibre GL error event:', e);
        });

      } catch (err) {
        console.error('Failed to instantiate MapLibre GL map:', err);
        reject(err);
      }
    });
  }

  _setup3DBuildings() {
    // Insert the 3D building layer beneath any symbol / text label layer
    const layers = this.map.getStyle().layers;
    let labelLayerId;
    for (let i = 0; i < layers.length; i++) {
      if (layers[i].type === 'symbol' && layers[i].layout && layers[i].layout['text-field']) {
        labelLayerId = layers[i].id;
        break;
      }
    }

    // Add OpenFreeMap planet vector source for 3D building extrusions
    if (!this.map.getSource('openfreemap')) {
      this.map.addSource('openfreemap', {
        url: 'https://tiles.openfreemap.org/planet',
        type: 'vector'
      });
    }

    // Add 3D Buildings fill-extrusion layer
    if (!this.map.getLayer('3d-buildings')) {
      this.map.addLayer(
        {
          id: '3d-buildings',
          source: 'openfreemap',
          'source-layer': 'building',
          type: 'fill-extrusion',
          minzoom: 14,
          filter: ['!=', ['get', 'hide_3d'], true],
          paint: {
            // Futuristic urban styling: gradient from slate-silver to neon cyan and electric blue
            'fill-extrusion-color': [
              'interpolate',
              ['linear'],
              ['get', 'render_height'],
              0, '#94a3b8',
              30, '#60a5fa',
              80, '#3b82f6',
              160, '#1d4ed8'
            ],
            'fill-extrusion-height': [
              'interpolate',
              ['linear'],
              ['zoom'],
              14, 0,
              15.5, ['get', 'render_height']
            ],
            'fill-extrusion-base': [
              'interpolate',
              ['linear'],
              ['zoom'],
              14, 0,
              15.5, ['get', 'render_min_height']
            ],
            'fill-extrusion-opacity': 0.88
          }
        },
        labelLayerId
      );
    }
  }

  _setupTrafficLayers() {
    if (!this.map.getSource('traffic-corridors')) {
      this.map.addSource('traffic-corridors', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });
    }

    // 1. Dark Road Casing for strong contrast against buildings
    if (!this.map.getLayer('traffic-corridors-casing')) {
      this.map.addLayer({
        id: 'traffic-corridors-casing',
        type: 'line',
        source: 'traffic-corridors',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#0f172a',
          'line-width': 9,
          'line-opacity': 0.85
        }
      });
    }

    // 2. Soft Luminous Glow
    if (!this.map.getLayer('traffic-corridors-glow')) {
      this.map.addLayer({
        id: 'traffic-corridors-glow',
        type: 'line',
        source: 'traffic-corridors',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 13,
          'line-opacity': 0.35,
          'line-blur': 4
        }
      });
    }

    // 3. Core Traffic Color Line
    if (!this.map.getLayer('traffic-corridors-core')) {
      this.map.addLayer({
        id: 'traffic-corridors-core',
        type: 'line',
        source: 'traffic-corridors',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 5.5,
          'line-opacity': 0.95
        }
      });
    }

    // Interactive Hover and Click handlers for Traffic Corridors
    this.map.on('mouseenter', 'traffic-corridors-core', () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });

    this.map.on('mouseleave', 'traffic-corridors-core', () => {
      this.map.getCanvas().style.cursor = '';
    });

    this.map.on('click', 'traffic-corridors-core', (e) => {
      if (!e.features || e.features.length === 0) return;
      const feature = e.features[0];
      const props = feature.properties;

      const incidentHtml = props.has_incident
        ? `<div style="margin-top: 6px; color: #ef4444; font-weight: 700; font-size: 11px;">
             ⚠️ HAZARD: ${props.incident_desc || 'Active Blockage'}
           </div>`
        : '';

      const content = `
        <div style="font-family: sans-serif; font-size: 12px; color: #f8fafc; padding: 2px;">
          <div style="font-weight: 800; font-size: 13px; color: #f8fafc; margin-bottom: 4px;">${props.name}</div>
          <div style="margin-bottom: 3px;">
            Status: <strong style="color: ${props.color};">${props.congestion_level}</strong>
          </div>
          <div style="color: #94a3b8; font-size: 11px;">
            Density: <strong>${props.density_pct}%</strong> · Est. Time: <strong>${props.travel_time}m</strong>
          </div>
          ${incidentHtml}
        </div>
      `;

      this.popup
        .setLngLat(e.lngLat)
        .setHTML(content)
        .addTo(this.map);
    });
  }

  // Render Network Nodes and Road-Following Edges
  renderNetwork(nodes, edges) {
    if (!this.isLoaded) {
      this.pendingNodes = nodes;
      this.pendingEdges = edges;
      return;
    }

    this.nodeMap.clear();
    nodes.forEach(n => this.nodeMap.set(n.id, n));

    // Clear previous junction markers
    this.nodeMarkers.forEach(m => m.remove());
    this.nodeMarkers = [];

    // Convert edges to GeoJSON lines using road-snapped path_coordinates
    const features = [];

    edges.forEach(edge => {
      const sourceNode = this.nodeMap.get(edge.source);
      const targetNode = this.nodeMap.get(edge.target);
      if (!sourceNode || !targetNode) return;

      // Extract coordinates as [lng, lat] for MapLibre
      let lineCoords = [];
      if (edge.path_coordinates && Array.isArray(edge.path_coordinates) && edge.path_coordinates.length >= 2) {
        lineCoords = edge.path_coordinates.map(pt => [pt[1], pt[0]]);
      } else {
        lineCoords = [
          [sourceNode.lng, sourceNode.lat],
          [targetNode.lng, targetNode.lat]
        ];
      }

      const color = this._getEdgeColor(edge);

      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: lineCoords
        },
        properties: {
          id: edge.id,
          name: edge.name,
          color: color,
          congestion_level: edge.congestion_level,
          density_pct: Math.round((edge.density_score || 0.2) * 100),
          travel_time: edge.estimated_travel_time_min || 5,
          has_incident: !!edge.has_incident,
          incident_desc: edge.incident_description || ''
        }
      });
    });

    // Update GeoJSON source
    const source = this.map.getSource('traffic-corridors');
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: features
      });
    }

    // Render 3D Junction Markers
    nodes.forEach(node => {
      const el = document.createElement('div');
      el.className = 'maplibre-junction-badge';
      el.style.cssText = `
        background: #1e293b;
        border: 2px solid #3b82f6;
        color: #60a5fa;
        font-family: monospace;
        font-size: 10px;
        font-weight: 800;
        padding: 3px 6px;
        border-radius: 12px;
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.6);
        cursor: pointer;
        transition: transform 0.15s ease;
      `;
      el.textContent = node.name.split(' ')[0].slice(0, 3).toUpperCase();

      el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.2)'; });
      el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([node.lng, node.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 12, className: 'maplibre-dark-popup' })
            .setHTML(`
              <div style="font-family: sans-serif; font-size: 12px; padding: 2px;">
                <div style="font-weight: 800; font-size: 13px; color: #f8fafc;">${node.name}</div>
                <div style="color: #94a3b8; font-size: 11px;">Junction ID: <code>${node.id}</code></div>
                <div style="color: #64748b; font-size: 10px; margin-top: 2px;">Type: ${node.type || 'Intersection'}</div>
              </div>
            `)
        )
        .addTo(this.map);

      this.nodeMarkers.push(marker);
    });
  }

  _getEdgeColor(edge) {
    if (edge.has_incident || edge.congestion_level === 'BLOCKED' || edge.congestion_level === 'HEAVY') {
      return '#ef4444';
    }
    if (edge.congestion_level === 'MODERATE') {
      return '#f59e0b';
    }
    return '#3b82f6';
  }

  // Render Incident SOS Pins on 3D Map
  renderIncidents(incidents) {
    if (!this.isLoaded) {
      this.pendingIncidents = incidents;
      return;
    }

    // Clear previous incident markers
    this.incidentMarkers.forEach(m => m.remove());
    this.incidentMarkers = [];

    incidents.forEach(inc => {
      if (!inc.lat || !inc.lng) return;

      const el = document.createElement('div');
      el.className = 'maplibre-incident-pin';
      el.style.cssText = `
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
        box-shadow: 0 0 16px rgba(239, 68, 68, 0.8), 0 2px 6px rgba(0, 0, 0, 0.5);
        border: 2px solid #ffffff;
        cursor: pointer;
        animation: pulseWarning 2s infinite ease-in-out;
      `;
      el.innerHTML = '⚠️';

      const photoHtml = inc.photo
        ? `<div style="margin-top: 8px; border-radius: 6px; overflow: hidden; max-height: 120px; border: 1px solid #10b981;">
             <img src="${inc.photo}" style="width: 100%; height: 100%; object-fit: cover;" alt="Incident photo"/>
           </div>`
        : '';

      const popupContent = `
        <div style="font-family: sans-serif; font-size: 12px; max-width: 260px; color: #f8fafc; padding: 2px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <span style="background: #ef4444; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700;">${inc.severity || 'HIGH'}</span>
            <span style="color: #94a3b8; font-size: 10px;">${inc.category || 'HAZARD'}</span>
          </div>
          <div style="font-weight: 800; font-size: 13px; color: #f8fafc; margin-bottom: 4px;">${inc.subject || 'Road Incident'}</div>
          <div style="color: #cbd5e1; font-size: 11px; margin-bottom: 4px;">📍 ${inc.location || 'Mangaluru Sector'}</div>
          <div style="color: #64748b; font-size: 10px;">Reported by: ${inc.reporter || 'Citizen'} · ${inc.timeAgo || 'Recently'}</div>
          ${photoHtml}
        </div>
      `;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([inc.lng, inc.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 14, className: 'maplibre-dark-popup' })
            .setHTML(popupContent)
        )
        .addTo(this.map);

      this.incidentMarkers.push(marker);
    });
  }

  // Smooth 3D Camera FlyTo Focus
  focusLocation(lat, lng, label = 'Selected Location', zoomLevel = 16) {
    if (!this.map) return;

    this.map.flyTo({
      center: [lng, lat],
      zoom: zoomLevel,
      pitch: 58,
      bearing: -20,
      speed: 1.4,
      essential: true
    });

    if (this.userGpsMarker) {
      this.userGpsMarker.remove();
    }

    const beacon = document.createElement('div');
    beacon.style.cssText = `
      width: 22px;
      height: 22px;
      background: #3b82f6;
      border-radius: 50%;
      border: 3px solid #ffffff;
      box-shadow: 0 0 20px rgba(59, 130, 246, 0.95);
      animation: pulseBadge 2s infinite ease-in-out;
    `;

    this.userGpsMarker = new maplibregl.Marker({ element: beacon })
      .setLngLat([lng, lat])
      .setPopup(
        new maplibregl.Popup({ offset: 14, className: 'maplibre-dark-popup' })
          .setHTML(`
            <div style="font-family: sans-serif; font-size: 12px; padding: 2px;">
              <div style="font-weight: 800; font-size: 13px; color: #f8fafc;">${label}</div>
              <div style="color: #60a5fa; font-size: 10px; margin-top: 2px;">GPS: ${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E</div>
            </div>
          `)
      )
      .addTo(this.map);

    this.userGpsMarker.togglePopup();
  }
}
