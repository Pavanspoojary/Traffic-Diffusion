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
    this.placeMarkers = [];
    this.routeMarkers = [];
    this.userGpsMarker = null;
    this.nodeMap = new Map();
    this.pendingEdges = null;
    this.pendingNodes = null;
    this.pendingIncidents = null;
    this.pendingPlaces = null;
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

        let isResolved = false;
        const safetyTimeout = setTimeout(() => {
          if (!isResolved) {
            console.warn('MapLibre GL tile/style load timed out after 5s; resolving safely.');
            isResolved = true;
            this.isLoaded = true;
            resolve(true);
          }
        }, 5000);

        this.map.on('load', () => {
          if (isResolved) return;
          clearTimeout(safetyTimeout);
          isResolved = true;
          try {
            this._setup3DBuildings();
          } catch (e) {
            console.warn('Could not setup 3D buildings:', e);
          }
          try {
            this._setupTrafficLayers();
          } catch (e) {
            console.warn('Could not setup traffic layers:', e);
          }
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
        resolve(false);
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

    // 4. Native WebGL Junction Source & Layers (Stable, zero-lag, no drifting or flying away)
    if (!this.map.getSource('traffic-junctions')) {
      this.map.addSource('traffic-junctions', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });
    }

    // Junction Soft Luminous Aura
    if (!this.map.getLayer('traffic-junctions-glow')) {
      this.map.addLayer({
        id: 'traffic-junctions-glow',
        type: 'circle',
        source: 'traffic-junctions',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            12, 7,
            15, 13,
            18, 19
          ],
          'circle-color': '#3b82f6',
          'circle-opacity': 0.35,
          'circle-blur': 0.8,
          'circle-pitch-alignment': 'viewport'
        }
      });
    }

    // Junction Sharp Core Node
    if (!this.map.getLayer('traffic-junctions-core')) {
      this.map.addLayer({
        id: 'traffic-junctions-core',
        type: 'circle',
        source: 'traffic-junctions',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            12, 4.5,
            15, 7.5,
            18, 10
          ],
          'circle-color': '#1d4ed8',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
          'circle-pitch-alignment': 'viewport'
        }
      });
    }

    // Junction Label (Legible and cleanly positioned above each junction node)
    if (!this.map.getLayer('traffic-junctions-label')) {
      this.map.addLayer({
        id: 'traffic-junctions-label',
        type: 'symbol',
        source: 'traffic-junctions',
        minzoom: 13.8,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-offset': [0, 1.25],
          'text-anchor': 'top',
          'text-optional': true,
          'text-allow-overlap': false
        },
        paint: {
          'text-color': '#f8fafc',
          'text-halo-color': '#0f172a',
          'text-halo-width': 2.5
        }
      });
    }

    // Interactive Hover and Click handlers for Junctions
    this.map.on('mouseenter', 'traffic-junctions-core', () => {
      this.map.getCanvas().style.cursor = 'pointer';
      this.map.setPaintProperty('traffic-junctions-core', 'circle-color', '#38bdf8');
    });

    this.map.on('mouseleave', 'traffic-junctions-core', () => {
      this.map.getCanvas().style.cursor = '';
      this.map.setPaintProperty('traffic-junctions-core', 'circle-color', '#1d4ed8');
    });

    this.map.on('click', 'traffic-junctions-core', (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;

      window.dispatchEvent(new CustomEvent('gmaps:junction-clicked', { 
        detail: { ...props, lngLat: e.lngLat } 
      }));

      this.popup
        .setLngLat(e.lngLat)
        .setHTML(`
          <div style="font-family: sans-serif; font-size: 12px; color: #f8fafc; padding: 2px;">
            <div style="font-weight: 800; font-size: 13px; color: #f8fafc; margin-bottom: 4px;">${props.name}</div>
            <div style="color: #60a5fa; font-size: 11px; margin-bottom: 2px;">Junction ID: <code>${props.id}</code></div>
            <div style="color: #94a3b8; font-size: 10px;">Classification: ${props.type || 'Key Intersection'}</div>
          </div>
        `)
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

    // Update WebGL Junctions GeoJSON Source (strictly road-snapped, zero drifting, zero off-road placement)
    const junctionFeatures = nodes.map(node => {
      let nodeLng = node.lng;
      let nodeLat = node.lat;

      // Snap blue dot directly onto the road corridor endpoint
      const connectedEdge = edges.find(e => e.source === node.id || e.target === node.id);
      if (connectedEdge && Array.isArray(connectedEdge.path_coordinates) && connectedEdge.path_coordinates.length > 0) {
        if (connectedEdge.source === node.id) {
          const pt = connectedEdge.path_coordinates[0];
          nodeLat = pt[0];
          nodeLng = pt[1];
        } else {
          const pt = connectedEdge.path_coordinates[connectedEdge.path_coordinates.length - 1];
          nodeLat = pt[0];
          nodeLng = pt[1];
        }
      }

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [nodeLng, nodeLat]
        },
        properties: {
          id: node.id,
          name: node.name,
          type: node.type || 'Key Intersection'
        }
      };
    });

    const junctionSource = this.map.getSource('traffic-junctions');
    if (junctionSource) {
      junctionSource.setData({
        type: 'FeatureCollection',
        features: junctionFeatures
      });
    }
    this.edges = edges;
    if (this.lastIncidents && this.lastIncidents.length > 0) {
      this.renderIncidents(this.lastIncidents);
    }
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

  // Snap any coordinate directly onto the closest point of the actual road corridor polyline
  _snapToCorridor(lat, lng, corridorId = null, locationText = '') {
    const edges = this.edges || this.pendingEdges || [];
    if (!edges || edges.length === 0) return [lng, lat];

    let candidates = edges;
    if (corridorId) {
      const match = edges.filter(e => e.id === corridorId || e.corridor_id === corridorId);
      if (match.length > 0) candidates = match;
    } else if (locationText) {
      const lower = locationText.toLowerCase();
      const match = edges.filter(e => {
        if (!e.name) return false;
        const eLower = e.name.toLowerCase();
        const words = eLower.split(/\s+/).filter(w => w.length > 3);
        return words.some(w => lower.includes(w));
      });
      if (match.length > 0) candidates = match;
    }

    let bestDistSq = Infinity;
    let bestCoord = [lng, lat]; // [lng, lat] for MapLibre

    for (const edge of candidates) {
      if (!edge.path_coordinates || !Array.isArray(edge.path_coordinates)) continue;
      for (const pt of edge.path_coordinates) {
        // pt is [lat, lng]
        const dLat = pt[0] - lat;
        const dLng = pt[1] - lng;
        const distSq = dLat * dLat + dLng * dLng;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestCoord = [pt[1], pt[0]]; // [lng, lat]
        }
      }
    }

    // If within ~3km (distSq < 0.0009), snap directly onto the road polyline
    if (bestDistSq < 0.0009) {
      return bestCoord;
    }

    return [lng, lat];
  }

  // Render Incident SOS Pins on 3D Map (Snapped Directly Onto Road Corridors)
  renderIncidents(incidents) {
    this.lastIncidents = incidents;

    if (!this.isLoaded) {
      this.pendingIncidents = incidents;
      return;
    }

    // Clear previous incident markers
    this.incidentMarkers.forEach(m => m.remove());
    this.incidentMarkers = [];

    incidents.forEach(inc => {
      if (!inc.lat || !inc.lng) return;

      // Ensure coordinate is snapped directly onto the actual road corridor polyline
      const snapped = this._snapToCorridor(
        inc.lat, 
        inc.lng, 
        inc.corridor_id || inc.corridorId, 
        inc.location || inc.subject
      );
      const incLng = snapped[0];
      const incLat = snapped[1];

      // Safe Marker Anchor (MapLibre controls transform here without CSS conflict)
      const anchor = document.createElement('div');
      anchor.className = 'maplibre-marker-anchor';

      // Inner element for styling, hover, and glowing effects
      const innerPin = document.createElement('div');
      innerPin.className = 'maplibre-incident-pin-inner';
      innerPin.innerHTML = '⚠️';
      anchor.appendChild(innerPin);

      anchor.addEventListener('click', (e) => {
        window.dispatchEvent(new CustomEvent('gmaps:incident-clicked', { 
          detail: { ...inc, lat: incLat, lng: incLng } 
        }));
      });

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

      const marker = new maplibregl.Marker({ element: anchor, anchor: 'center' })
        .setLngLat([incLng, incLat])
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

    // Snap focus target to corridor if near road
    const snapped = this._snapToCorridor(lat, lng, null, label);
    const targetLng = snapped[0];
    const targetLat = snapped[1];

    this.map.flyTo({
      center: [targetLng, targetLat],
      zoom: zoomLevel,
      pitch: 58,
      bearing: -20,
      speed: 1.4,
      essential: true
    });

    if (this.userGpsMarker) {
      this.userGpsMarker.remove();
    }

    const anchor = document.createElement('div');
    anchor.className = 'maplibre-marker-anchor';

    const beacon = document.createElement('div');
    beacon.className = 'maplibre-gps-beacon-inner';
    anchor.appendChild(beacon);

    this.userGpsMarker = new maplibregl.Marker({ element: anchor, anchor: 'center' })
      .setLngLat([targetLng, targetLat])
      .setPopup(
        new maplibregl.Popup({ offset: 14, className: 'maplibre-dark-popup' })
          .setHTML(`
            <div style="font-family: sans-serif; font-size: 12px; padding: 2px;">
              <div style="font-weight: 800; font-size: 13px; color: #f8fafc;">${label}</div>
              <div style="color: #60a5fa; font-size: 10px; margin-top: 2px;">GPS: ${targetLat.toFixed(5)}° N, ${targetLng.toFixed(5)}° E</div>
            </div>
          `)
      )
      .addTo(this.map);

    this.userGpsMarker.togglePopup();
  }

  // Render Connected Street Route on MapLibre Map with Google Style
  renderRoute(coordinates, originPoint = null, destinationPoint = null) {
    if (!this.map) return;

    // Normalise coordinates to [lng, lat]
    const lineCoords = coordinates.map(pt => {
      if (Array.isArray(pt)) {
        return pt[0] < pt[1] ? [pt[1], pt[0]] : [pt[0], pt[1]];
      }
      return [pt.lng, pt.lat];
    });

    const geojsonData = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: lineCoords
      }
    };

    if (this.map.getSource('gmaps-route-source')) {
      this.map.getSource('gmaps-route-source').setData(geojsonData);
    } else {
      this.map.addSource('gmaps-route-source', {
        type: 'geojson',
        data: geojsonData
      });

      // White outline casing
      this.map.addLayer({
        id: 'gmaps-route-casing',
        type: 'line',
        source: 'gmaps-route-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#ffffff',
          'line-width': 10.0,
          'line-opacity': 0.98
        }
      });

      // Luminous blue core line
      this.map.addLayer({
        id: 'gmaps-route-line',
        type: 'line',
        source: 'gmaps-route-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#1a73e8',
          'line-width': 6.5,
          'line-opacity': 1.0
        }
      });
    }

    // Clear previous route markers
    this.routeMarkers.forEach(m => m.remove());
    this.routeMarkers = [];

    // Origin "A" Green Marker
    const startCoord = originPoint && originPoint.lng && originPoint.lat 
      ? [originPoint.lng, originPoint.lat] 
      : lineCoords[0];
    
    if (startCoord) {
      const originEl = document.createElement('div');
      originEl.className = 'maplibre-route-marker maplibre-marker-origin';
      originEl.innerHTML = 'A';
      originEl.title = originPoint ? originPoint.name : 'Origin';

      const originMarker = new maplibregl.Marker({ element: originEl, anchor: 'center' })
        .setLngLat(startCoord)
        .addTo(this.map);
      this.routeMarkers.push(originMarker);
    }

    // Destination "B" Red Marker
    const endCoord = destinationPoint && destinationPoint.lng && destinationPoint.lat
      ? [destinationPoint.lng, destinationPoint.lat]
      : lineCoords[lineCoords.length - 1];

    if (endCoord) {
      const destEl = document.createElement('div');
      destEl.className = 'maplibre-route-marker maplibre-marker-destination';
      destEl.innerHTML = 'B';
      destEl.title = destinationPoint ? destinationPoint.name : 'Destination';

      const destMarker = new maplibregl.Marker({ element: destEl, anchor: 'center' })
        .setLngLat(endCoord)
        .addTo(this.map);
      this.routeMarkers.push(destMarker);
    }

    // Smooth camera framing
    if (lineCoords.length > 1 && typeof maplibregl !== 'undefined') {
      const bounds = new maplibregl.LngLatBounds();
      lineCoords.forEach(pt => bounds.extend(pt));
      this.map.fitBounds(bounds, {
        padding: { top: 90, bottom: 90, left: 430, right: 90 },
        duration: 1200,
        pitch: 45
      });
    }
  }

  clearActiveRoute() {
    if (!this.map) return;
    if (this.map.getSource('gmaps-route-source')) {
      this.map.getSource('gmaps-route-source').setData({
        type: 'FeatureCollection',
        features: []
      });
    }
    this.routeMarkers.forEach(m => m.remove());
    this.routeMarkers = [];
  }

  // Render Key Place POI Pins on the Map
  renderPlaces(places, force = false) {
    if (!this.map || !Array.isArray(places)) return;

    if (!force && this.placeMarkers && this.placeMarkers.length > 0) {
      return;
    }

    // Clear previous place markers
    this.placeMarkers.forEach(m => m.remove());
    this.placeMarkers = [];

    places.forEach(place => {
      if (!place.lat || !place.lng) return;

      const el = document.createElement('div');
      el.className = 'maplibre-marker-anchor';
      
      const pin = document.createElement('div');
      pin.style.cssText = `
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: #ffffff;
        border: 2px solid #1a73e8;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        cursor: pointer;
        transition: transform 0.15s;
      `;
      pin.innerHTML = place.icon || '📍';
      pin.title = place.name;
      el.appendChild(pin);

      pin.onmouseenter = () => { pin.style.transform = 'scale(1.2)'; };
      pin.onmouseleave = () => { pin.style.transform = 'scale(1)'; };

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('gmaps:place-clicked', { detail: place }));
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([place.lng, place.lat])
        .addTo(this.map);

      this.placeMarkers.push(marker);
    });
  }

  // Render Confirmed Police Diversion on Public 3D Map
  renderPoliceDiversion(diversionRecord) {
    if (!this.map || !this.isLoaded) return;

    if (!diversionRecord || !diversionRecord.detour_path_coordinates || !diversionRecord.detour_path_coordinates.length) {
      if (this.map.getSource('police-diversion-source')) {
        this.map.getSource('police-diversion-source').setData({ type: 'FeatureCollection', features: [] });
      }
      return;
    }

    const lineCoords = diversionRecord.detour_path_coordinates.map(pt => {
      return pt[0] < pt[1] ? [pt[1], pt[0]] : [pt[0], pt[1]];
    });

    const geojsonData = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: lineCoords
      },
      properties: {
        title: diversionRecord.detour_name || 'Official Police Detour'
      }
    };

    if (this.map.getSource('police-diversion-source')) {
      this.map.getSource('police-diversion-source').setData(geojsonData);
    } else {
      this.map.addSource('police-diversion-source', {
        type: 'geojson',
        data: geojsonData
      });

      this.map.addLayer({
        id: 'police-diversion-casing',
        type: 'line',
        source: 'police-diversion-source',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#064e3b',
          'line-width': 9.0,
          'line-opacity': 0.95
        }
      });

      this.map.addLayer({
        id: 'police-diversion-core',
        type: 'line',
        source: 'police-diversion-source',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#10b981',
          'line-width': 5.5,
          'line-opacity': 0.98
        }
      });
    }

    if (lineCoords.length > 1 && typeof maplibregl !== 'undefined') {
      const bounds = new maplibregl.LngLatBounds();
      lineCoords.forEach(c => bounds.extend(c));
      this.map.fitBounds(bounds, { padding: 90, maxZoom: 15.2, duration: 1200 });
    }
  }
}

