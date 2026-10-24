// Traffic Diffusion Map Controller - Leaflet Engine
// Enforces strict 3-colour scheme:
// - Red (#E53935): Confirmed blocked road segments
// - Blue (#1565FF): Recommended route
// - Orange (#FF9800): Alternative routes
// All unrelated roads retain their normal basemap appearance.

class TrafficMap {
  constructor(containerId) {
    this.map = L.map(containerId, {
      center: [12.8750, 74.8550], // Mangaluru city center
      zoom: 13,
      zoomControl: false,
    });

    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // Free OpenStreetMap Standard Basemap (100% free, normal clean basemap appearance)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(this.map);

    // Explicit Layer Stacking Order to guarantee clean visual hierarchy:
    // 1. Unrelated network edges: Transparent hitboxes for tooltips, NO black or colored lines drawn
    this.edgeLayers = L.layerGroup().addTo(this.map);
    // 2. Alternative routes layer: Orange (#FF9800)
    this.altRouteLayer = L.layerGroup().addTo(this.map);
    // 3. Recommended route layer: Blue (#1565FF) - higher visual prominence
    this.recommendedRouteLayer = L.layerGroup().addTo(this.map);
    // 4. Blocked segments layer: Red (#E53935) - on top so blockage is never obscured
    this.blockageLayer = L.layerGroup().addTo(this.map);
    // 5. Node / Incident Marker layers
    this.incidentMarkerLayer = L.layerGroup().addTo(this.map);
    this.nodeLayers = L.layerGroup().addTo(this.map);
    this.dispatchLayer = L.layerGroup().addTo(this.map);

    // Legacy compatibility reference
    this.routeLayer = this.recommendedRouteLayer;

    this.nodeMap = new Map();
    this.edgeMap = new Map();

    this._addLegend();

    setTimeout(() => {
      this.map.invalidateSize();
    }, 200);
  }

  _addLegend() {
    const legendControl = L.control({ position: 'topright' });
    legendControl.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-traffic-legend');
      div.innerHTML = `
        <div style="background: rgba(15, 23, 42, 0.94); border: 1px solid #334155; border-radius: 8px; padding: 10px 14px; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 11px; color: #f8fafc; box-shadow: 0 4px 14px rgba(0,0,0,0.45); backdrop-filter: blur(8px); min-width: 230px;">
          <div style="font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
            <span>Route &amp; Disruption Legend</span>
            <span style="font-size: 9px; background: #1e293b; padding: 2px 5px; border-radius: 4px; border: 1px solid #475569; color: #38bdf8;">3-COLOUR</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <span style="display: inline-block; width: 22px; height: 5px; background: #E53935; border-radius: 2px; border: 1px solid #ffffff; box-shadow: 0 0 4px rgba(229,57,53,0.5);"></span>
            <span style="font-weight: 600; color: #f87171;">Red (#E53935): Confirmed Blockage</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <span style="display: inline-block; width: 22px; height: 5px; background: #1565FF; border-radius: 2px; border: 1px solid #ffffff; box-shadow: 0 0 4px rgba(21,101,255,0.5);"></span>
            <span style="font-weight: 600; color: #60a5fa;">Blue (#1565FF): Recommended Route</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 22px; height: 4px; background: #FF9800; border-radius: 2px; border-top: 2px dashed #FF9800; box-shadow: 0 0 4px rgba(255,152,0,0.5);"></span>
            <span style="font-weight: 600; color: #fbbf24;">Orange (#FF9800): Alternative Route</span>
          </div>
        </div>
      `;
      return div;
    };
    legendControl.addTo(this.map);
  }

  renderNetwork(nodes, edges) {
    this.edgeLayers.clearLayers();
    this.nodeLayers.clearLayers();
    this.blockageLayer.clearLayers();
    this.incidentMarkerLayer.clearLayers();
    this.nodeMap.clear();
    this.edgeMap.clear();

    // Cache node coordinates
    nodes.forEach(n => {
      this.nodeMap.set(n.id, n);
    });

    // Cache edges
    edges.forEach(e => {
      this.edgeMap.set(e.id, e);
    });

    // Draw Edges:
    // IMPORTANT: Unrelated roads must retain normal basemap appearance.
    // They are rendered with transparent strokes (opacity: 0) as interactive hitboxes
    // so no thick dark or black lines obscure the map.
    // Confirmed blocked segments are rendered in exact RED (#E53935) with white halo casing.
    edges.forEach(edge => {
      const sourceNode = this.nodeMap.get(edge.source);
      const targetNode = this.nodeMap.get(edge.target);
      if (!sourceNode || !targetNode) return;

      const latlngs = (edge.path_coordinates && Array.isArray(edge.path_coordinates) && edge.path_coordinates.length >= 2)
        ? edge.path_coordinates
        : [
            [sourceNode.lat, sourceNode.lng],
            [targetNode.lat, targetNode.lng]
          ];

      const isBlocked = (edge.has_incident || edge.congestion_level === 'BLOCKED');

      if (isBlocked) {
        this.renderBlockedSegment(latlngs, edge);
      } else {
        // Transparent interaction hitbox (valid hex + 0 opacity ensures no black fallback)
        const hitbox = L.polyline(latlngs, {
          color: '#ffffff',
          weight: 12,
          opacity: 0,
        });

        const tooltipContent = `
          <div style="font-family: var(--font-sans); font-size: 11px;">
            <strong>${edge.name}</strong><br/>
            Status: <span style="font-family: var(--font-mono);">${edge.congestion_level}</span><br/>
            Transit: ${edge.estimated_travel_time_min} min
          </div>
        `;
        hitbox.bindTooltip(tooltipContent, { sticky: true });
        this.edgeLayers.addLayer(hitbox);
      }
    });

    // Draw key emergency destination / origin node markers
    nodes.forEach(node => {
      if (node.type === 'ems_station' || node.type === 'hospital') {
        const marker = this._createNodeMarker(node);
        this.nodeLayers.addLayer(marker);
      }
    });
  }

  renderBlockedSegment(latlngs, edge) {
    if (!latlngs || latlngs.length < 2) return;

    // 1. White high-contrast halo casing so blockage remains completely visible
    // even when overlapping recommended or alternative routes
    const whiteCasing = L.polyline(latlngs, {
      color: '#FFFFFF',
      weight: 12,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    });

    // 2. Core Confirmed Blockage segment in exact RED (#E53935)
    const redCore = L.polyline(latlngs, {
      color: '#E53935',
      weight: 7.5,
      opacity: 1.0,
      lineCap: 'round',
      lineJoin: 'round',
    });

    const tooltipContent = `
      <div style="font-family: var(--font-sans); font-size: 12px; line-height: 1.4;">
        <strong style="color: #E53935;">⛔ CONFIRMED ROAD BLOCKAGE</strong><br/>
        <strong>${edge.name || 'Blocked Segment'}</strong><br/>
        <span>${edge.incident_description || 'Impassable closure - diversion active'}</span>
      </div>
    `;
    redCore.bindTooltip(tooltipContent, { sticky: true });

    this.blockageLayer.addLayer(whiteCasing);
    this.blockageLayer.addLayer(redCore);

    // Midpoint Closed Badge Marker
    const midIdx = Math.floor(latlngs.length / 2);
    const midCoord = latlngs[midIdx] || latlngs[0];
    const incidentBadge = L.divIcon({
      className: 'confirmed-blockage-marker',
      html: `
        <div style="background: #E53935; border: 2px solid #FFFFFF; color: #FFFFFF; border-radius: 12px; padding: 2px 7px; font-weight: 800; font-size: 10px; font-family: var(--font-mono); box-shadow: 0 2px 8px rgba(0,0,0,0.5); white-space: nowrap; display: flex; align-items: center; gap: 4px;">
          <span>⛔</span><span>CLOSED</span>
        </div>
      `,
      iconSize: [68, 22],
      iconAnchor: [34, 11],
    });
    const badgeMarker = L.marker(midCoord, { icon: incidentBadge, zIndexOffset: 2000 });
    badgeMarker.bindTooltip(tooltipContent);
    this.incidentMarkerLayer.addLayer(badgeMarker);
  }

  // Render Routes adhering strictly to 3-colour scheme:
  // - Recommended route: Blue (#1565FF), solid, higher visual prominence
  // - Alternative routes: Orange (#FF9800), dashed/distinguishable
  // - Blocked segment: Red (#E53935), on top layer
  renderRoutes(routeData) {
    // Clear obsolete route layers
    this.recommendedRouteLayer.clearLayers();
    this.altRouteLayer.clearLayers();

    if (!routeData) return;

    const primary = routeData.primary_route || routeData;
    const alternatives = routeData.alternative_routes || [];

    const boundsGroup = L.featureGroup();

    // 1. Draw Alternative Routes FIRST (Orange #FF9800)
    // Placed below recommended route in layer stacking order
    alternatives.forEach((alt, idx) => {
      const altCoords = alt.path_coordinates;
      if (altCoords && altCoords.length >= 2) {
        // Subtle white halo casing
        const altCasing = L.polyline(altCoords, {
          color: '#FFFFFF',
          weight: 7.5,
          opacity: 0.85,
          lineCap: 'round',
          lineJoin: 'round',
        });

        // Core Alternative line in exact ORANGE (#FF9800)
        const altPolyline = L.polyline(altCoords, {
          color: '#FF9800',
          weight: 4.5,
          opacity: 0.95,
          dashArray: '7, 9',
          lineCap: 'round',
          lineJoin: 'round',
        });

        const tooltip = `
          <div style="font-family: var(--font-sans); font-size: 11px;">
            <strong style="color: #FF9800;">Alternative Route ${idx + 1}</strong>: ${alt.label || alt.primary_road_name || 'Detour corridor'}<br/>
            Transit: <strong>${alt.estimated_travel_time_min?.toFixed(1) || '?'} min</strong> &bull; Distance: <strong>${alt.total_distance_km?.toFixed(1) || '?'} km</strong>
          </div>
        `;
        altPolyline.bindTooltip(tooltip, { sticky: true });

        this.altRouteLayer.addLayer(altCasing);
        this.altRouteLayer.addLayer(altPolyline);
        boundsGroup.addLayer(altPolyline);
      }
    });

    // 2. Draw Recommended Route (Blue #1565FF)
    // Clearly visible solid line with higher visual prominence
    const primaryCoords = primary.path_coordinates || routeData.path_coordinates;
    if (primaryCoords && primaryCoords.length >= 2) {
      // Crisp white casing border
      const primaryCasing = L.polyline(primaryCoords, {
        color: '#FFFFFF',
        weight: 10,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      });

      // Core Recommended route line in exact BLUE (#1565FF)
      const primaryCore = L.polyline(primaryCoords, {
        color: '#1565FF',
        weight: 6.5,
        opacity: 1.0,
        lineCap: 'round',
        lineJoin: 'round',
      });

      const tooltip = `
        <div style="font-family: var(--font-sans); font-size: 11px;">
          <strong style="color: #1565FF;">Recommended Route</strong>: ${primary.label || primary.primary_road_name || 'Fastest viable path'}<br/>
          Transit: <strong>${primary.estimated_travel_time_min?.toFixed(1) || routeData.estimated_travel_time_min?.toFixed(1) || '?'} min</strong> &bull; Distance: <strong>${primary.total_distance_km?.toFixed(1) || routeData.total_distance_km?.toFixed(1) || '?'} km</strong>
        </div>
      `;
      primaryCore.bindTooltip(tooltip, { sticky: true });

      this.recommendedRouteLayer.addLayer(primaryCasing);
      this.recommendedRouteLayer.addLayer(primaryCore);
      boundsGroup.addLayer(primaryCore);
    }

    // Include any active blocked segments in bounds
    this.blockageLayer.eachLayer(l => boundsGroup.addLayer(l));

    // Pan map to fit active scenario bounds smoothly
    this.map.invalidateSize();
    if (boundsGroup.getLayers().length > 0) {
      this.map.fitBounds(boundsGroup.getBounds(), { padding: [50, 50], maxZoom: 15 });
    }
  }

  // Backward-compatible alias for existing callers
  renderGreenCorridor(pathCoordinates, routeData, altCoordinates = null) {
    const formattedData = {
      path_coordinates: pathCoordinates,
      primary_route: routeData && routeData.primary_route ? routeData.primary_route : { path_coordinates: pathCoordinates, label: 'Recommended Route' },
      alternative_routes: altCoordinates ? [{ path_coordinates: altCoordinates, label: 'Alternative Route' }] : (routeData && routeData.alternative_routes ? routeData.alternative_routes : [])
    };
    this.renderRoutes(formattedData);
  }

  _getEdgeStyle(edge) {
    if (edge.has_incident || edge.congestion_level === 'BLOCKED') {
      return { color: '#E53935', weight: 7, opacity: 1.0 };
    }
    // Unrelated roads retain normal basemap appearance (opacity 0 prevents black line fallback)
    return { color: '#ffffff', weight: 10, opacity: 0 };
  }

  _createNodeMarker(node) {
    let iconHtml = '';
    let markerSize = [24, 24];

    if (node.type === 'ems_station') {
      iconHtml = `
        <div style="background: #1565FF; border: 2px solid #FFFFFF; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: bold; box-shadow: 0 2px 8px rgba(21,101,255,0.5);">
          EMS
        </div>
      `;
      markerSize = [26, 26];
    } else if (node.type === 'hospital') {
      iconHtml = `
        <div style="background: #E53935; border: 2px solid #FFFFFF; border-radius: 6px; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; font-weight: 800; box-shadow: 0 2px 8px rgba(229,57,53,0.5);">
          +
        </div>
      `;
      markerSize = [26, 26];
    } else {
      iconHtml = `
        <div style="background: #1e293b; border: 2px solid #64748b; border-radius: 50%; width: 12px; height: 12px;"></div>
      `;
      markerSize = [12, 12];
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

  // Render Predictive Cascading Impact Forecast without black lines across unrelated roads
  renderPredictiveForecast(snapshot, nodes, activeIncident = null) {
    this.edgeLayers.clearLayers();
    this.blockageLayer.clearLayers();

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

      if (impact.impact_type === 'DIRECT_INCIDENT') {
        this.renderBlockedSegment(latlngs, {
          name: impact.road_name,
          incident_description: `Direct Incident [T+${snapshot.horizon_minutes}m]`
        });
      } else {
        // Unrelated roads retain normal basemap appearance
        const polyline = L.polyline(latlngs, {
          color: '#ffffff',
          weight: 12,
          opacity: 0,
        });

        const tooltipContent = `
          <div style="font-family: var(--font-sans); font-size: 11px; line-height: 1.4;">
            <div style="font-weight: 800; color: #fff;">${impact.road_name}</div>
            <div style="color: #94a3b8; margin-top: 2px;">
              Pred Transit: <strong>${impact.predicted_travel_time_min.toFixed(1)} min</strong><br/>
              V/C Load: <strong>${impact.predicted_volume_capacity_ratio.toFixed(2)}</strong>
            </div>
          </div>
        `;
        polyline.bindTooltip(tooltipContent, { sticky: true });
        this.edgeLayers.addLayer(polyline);
      }
    });
  }

  renderDispatches(dispatches) {
    if (!this.dispatchLayer) {
      this.dispatchLayer = L.layerGroup().addTo(this.map);
    }
    this.dispatchLayer.clearLayers();

    dispatches.forEach(d => {
      const node = this.nodeMap.get(d.target_location_id);
      const latlng = node ? [node.lat, node.lng] : [12.8790, 74.8650];

      let badgeColor = '#1565FF';
      let label = 'POLICE';
      if (d.resource_type === 'HEAVY_TOW_UNIT') {
        badgeColor = '#FF9800';
        label = 'TOW CRANE';
      } else if (d.resource_type === 'PATROL_INTERCEPTOR') {
        badgeColor = '#06b6d4';
        label = 'PATROL';
      }

      const icon = L.divIcon({
        className: 'dispatch-marker-icon',
        html: `
          <div style="background: ${badgeColor}; color: white; border: 2px solid #ffffff; border-radius: 6px; padding: 2px 6px; font-weight: 800; font-size: 10px; font-family: var(--font-mono); box-shadow: 0 4px 12px rgba(0,0,0,0.6); white-space: nowrap;">
            ${label} · ${d.status}
          </div>
        `,
        iconSize: [95, 24],
        iconAnchor: [47, 12],
      });

      L.marker(latlng, { icon })
        .bindTooltip(`<strong>${d.resource_type.replace(/_/g, ' ')}</strong><br/>Target: ${d.target_location_name}<br/>Directive: ${d.directive}<br/>Status: ${d.status}${d.eta_minutes > 0 ? ` (ETA ${d.eta_minutes.toFixed(0)}m)` : ''}`)
        .addTo(this.dispatchLayer);
    });
  }
}
