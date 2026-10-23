// Traffic Diffusion Map Controller
class TrafficMap {
  constructor(containerId) {
    this.map = L.map(containerId, {
      center: [12.9820, 77.5980],
      zoom: 13,
      zoomControl: false,
    });

    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // Free OpenStreetMap Standard Basemap (100% free, no API key or watermark required)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(this.map);

    this.edgeLayers = L.layerGroup().addTo(this.map);
    this.nodeLayers = L.layerGroup().addTo(this.map);
    this.routeLayer = L.layerGroup().addTo(this.map);

    this.nodeMap = new Map();
  }

  renderNetwork(nodes, edges) {
    this.edgeLayers.clearLayers();
    this.nodeLayers.clearLayers();
    this.nodeMap.clear();

    // Cache node coordinates
    nodes.forEach(n => {
      this.nodeMap.set(n.id, n);
    });

    // Draw Edges
    edges.forEach(edge => {
      const sourceNode = this.nodeMap.get(edge.source);
      const targetNode = this.nodeMap.get(edge.target);
      if (!sourceNode || !targetNode) return;

      const latlngs = [
        [sourceNode.lat, sourceNode.lng],
        [targetNode.lat, targetNode.lng]
      ];

      const style = this._getEdgeStyle(edge);
      const polyline = L.polyline(latlngs, style);

      const tooltipContent = `
        <div style="font-family: var(--font-sans); font-size: 11px;">
          <strong>${edge.name}</strong><br/>
          Status: <span style="font-family: var(--font-mono);">${edge.congestion_level}</span><br/>
          Density: ${(edge.density_score * 100).toFixed(0)}% | Est: ${edge.estimated_travel_time_min} min<br/>
          ${edge.has_incident ? `<span style="color: #ef4444; font-weight: bold;">INCIDENT: ${edge.incident_description || 'Blockage'}</span>` : ''}
        </div>
      `;
      polyline.bindTooltip(tooltipContent, { sticky: true });
      this.edgeLayers.addLayer(polyline);
    });

    // Draw Nodes
    nodes.forEach(node => {
      const marker = this._createNodeMarker(node);
      this.nodeLayers.addLayer(marker);
    });
  }

  renderGreenCorridor(pathCoordinates, routeData) {
    this.routeLayer.clearLayers();

    if (!pathCoordinates || pathCoordinates.length < 2) return;

    // Outer luminous glow
    const glowPolyline = L.polyline(pathCoordinates, {
      color: '#10b981',
      weight: 12,
      opacity: 0.35,
      lineCap: 'round',
    });

    // Core Green Corridor Path
    const corePolyline = L.polyline(pathCoordinates, {
      color: '#34d399',
      weight: 6,
      opacity: 0.95,
      dashArray: '8, 8',
      lineCap: 'round',
    });

    this.routeLayer.addLayer(glowPolyline);
    this.routeLayer.addLayer(corePolyline);

    // Pan map to fit active emergency route bounds
    this.map.fitBounds(corePolyline.getBounds(), { padding: [50, 50] });
  }

  _getEdgeStyle(edge) {
    if (edge.has_incident || edge.congestion_level === 'BLOCKED') {
      return { color: '#ef4444', weight: 5, opacity: 0.9, dashArray: '6, 6' };
    }
    if (edge.congestion_level === 'HEAVY') {
      return { color: '#f97316', weight: 4.5, opacity: 0.85 };
    }
    if (edge.congestion_level === 'MODERATE') {
      return { color: '#f59e0b', weight: 3.5, opacity: 0.8 };
    }
    return { color: '#3b82f6', weight: 3, opacity: 0.7 };
  }

  _createNodeMarker(node) {
    let iconHtml = '';
    let markerSize = [24, 24];

    if (node.type === 'ems_station') {
      iconHtml = `
        <div style="background: #0284c7; border: 2px solid #38bdf8; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; color: white; font-size: 11px; font-weight: bold;">
          EMS
        </div>
      `;
      markerSize = [26, 26];
    } else if (node.type === 'hospital') {
      iconHtml = `
        <div style="background: #dc2626; border: 2px solid #f87171; border-radius: 6px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; font-weight: 800;">
          +
        </div>
      `;
      markerSize = [28, 28];
    } else {
      iconHtml = `
        <div style="background: #1e293b; border: 2px solid #64748b; border-radius: 50%; width: 14px; height: 14px;"></div>
      `;
      markerSize = [14, 14];
    }

    const customIcon = L.divIcon({
      html: iconHtml,
      className: 'custom-map-marker',
      iconSize: markerSize,
      iconAnchor: [markerSize[0] / 2, markerSize[1] / 2],
    });

    const marker = L.marker([node.lat, node.lng], { icon: customIcon });
    marker.bindPopup(`
      <div style="font-family: var(--font-sans); font-size: 12px; line-height: 1.4;">
        <strong>${node.name}</strong><br/>
        <span style="color: #64748b; font-size: 10px;">Type: ${node.type.toUpperCase()}</span>
      </div>
    `);
    return marker;
  }
}
