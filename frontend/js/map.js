// Traffic Diffusion Map Controller
class TrafficMap {
  constructor(containerId) {
    this.map = L.map(containerId, {
      center: [12.8750, 74.8550], // Mangaluru city center
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

  renderGreenCorridor(pathCoordinates, routeData, altCoordinates = null) {
    this.routeLayer.clearLayers();

    // Draw Alternative Route in subtle dashed slate/cyan if present
    if (altCoordinates && altCoordinates.length >= 2) {
      const altPolyline = L.polyline(altCoordinates, {
        color: '#64748b',
        weight: 4,
        opacity: 0.75,
        dashArray: '6, 10',
        lineCap: 'round',
      });
      altPolyline.bindTooltip('<div style="font-size: 11px;"><strong>Alternative Backup Corridor</strong></div>', { sticky: true });
      this.routeLayer.addLayer(altPolyline);
    }

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

  // Render Predictive Cascading Impact Forecast across selected horizon
  renderPredictiveForecast(snapshot, nodes, activeIncident = null) {
    this.edgeLayers.clearLayers();
    this.routeLayer.clearLayers();

    // Cache nodes
    nodes.forEach(n => this.nodeMap.set(n.id, n));

    snapshot.edge_impacts.forEach(impact => {
      const sourceNode = this.nodeMap.get(impact.source);
      const targetNode = this.nodeMap.get(impact.target);
      if (!sourceNode || !targetNode) return;

      const latlngs = [
        [sourceNode.lat, sourceNode.lng],
        [targetNode.lat, targetNode.lng]
      ];

      let color = '#475569';
      let weight = 3;
      let opacity = 0.7;
      let dashArray = null;

      if (impact.impact_type === 'DIRECT_INCIDENT') {
        color = '#ef4444';
        weight = 7;
        opacity = 1.0;
        dashArray = '8, 6';
      } else if (impact.impact_type === 'UPSTREAM_SPILLBACK') {
        color = '#f97316';
        weight = 5.5;
        opacity = 0.95;
      } else if (impact.impact_type === 'DIVERSION_LOADED') {
        color = '#06b6d4';
        weight = 4.5;
        opacity = 0.9;
        dashArray = '6, 6';
      } else if (impact.impact_type === 'DOWNSTREAM_BOTTLENECK') {
        color = '#a855f7';
        weight = 4;
        opacity = 0.85;
      } else {
        color = impact.predicted_volume_capacity_ratio > 0.85 ? '#eab308' : '#334155';
        weight = 2.5;
        opacity = 0.65;
      }

      const polyline = L.polyline(latlngs, {
        color: color,
        weight: weight,
        opacity: opacity,
        dashArray: dashArray,
        lineCap: 'round',
      });

      const tooltipContent = `
        <div style="font-family: var(--font-sans); font-size: 11px; line-height: 1.4;">
          <div style="font-weight: 800; color: #fff;">${impact.road_name}</div>
          <div style="color: ${color}; font-weight: 700; font-size: 10px;">${impact.impact_type.replace(/_/g, ' ')} [T+${snapshot.horizon_minutes}m]</div>
          <div style="color: #94a3b8; margin-top: 2px;">
            Pred Travel Time: <strong>${impact.predicted_travel_time_min.toFixed(1)} min</strong> (+${impact.expected_delay_min.toFixed(1)}m delay)<br/>
            V/C Load: <strong>${impact.predicted_volume_capacity_ratio.toFixed(2)}</strong> | Queue: <strong>${Math.round(impact.queue_length_meters)}m</strong><br/>
            Risk Score: <strong>${impact.risk_score.toFixed(1)} / 100</strong>
          </div>
        </div>
      `;
      polyline.bindTooltip(tooltipContent, { sticky: true });
      this.edgeLayers.addLayer(polyline);
    });

    // Highlight Saturated Junctions
    snapshot.junction_saturations.forEach(junc => {
      const node = this.nodeMap.get(junc.junction_id);
      if (!node) return;

      if (junc.saturation_index >= 0.70) {
        const satPercent = Math.round(junc.saturation_index * 100);
        const satIcon = L.divIcon({
          className: 'saturated-junc-icon',
          html: `
            <div style="background: #ef4444; border: 2px solid #ffffff; color: white; border-radius: 6px; padding: 2px 5px; font-weight: 800; font-size: 10px; font-family: var(--font-mono); box-shadow: 0 2px 10px rgba(0,0,0,0.5);">
              ${satPercent}% SAT
            </div>
          `,
          iconSize: [52, 22],
          iconAnchor: [26, 11],
        });
        L.marker([node.lat, node.lng], { icon: satIcon })
          .bindTooltip(`<strong>${junc.junction_name}</strong><br/>Gridlock Risk: ${junc.inflow_spillback_risk}<br/>Saturation: ${satPercent}%`)
          .addTo(this.routeLayer);
      }
    });
  }
}
