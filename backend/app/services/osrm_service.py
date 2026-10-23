import json
import urllib.request
from typing import List, Dict, Any, Optional, Tuple

class OSRMService:
    def __init__(self):
        self.base_url = "https://router.project-osrm.org/route/v1/driving"
        self._cache: Dict[str, Any] = {}

    def get_road_snapped_route(
        self,
        waypoints: List[Tuple[float, float]],
        steps: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        Queries OSRM for real street-snapped, road-following geometry (like Google Maps)
        along a sequence of (lat, lng) waypoints.
        """
        if len(waypoints) < 2:
            return None

        # Build coordinate string for OSRM: lng,lat;lng,lat;...
        coord_str = ";".join([f"{lng:.6f},{lat:.6f}" for lat, lng in waypoints])
        cache_key = f"{coord_str}_{steps}"

        if cache_key in self._cache:
            return self._cache[cache_key]

        url = f"{self.base_url}/{coord_str}?overview=full&geometries=geojson&steps={str(steps).lower()}&continue_straight=true"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "TrafficDiffusion-EmergencyNavigator/1.0",
                "Accept": "application/json"
            }
        )

        try:
            with urllib.request.urlopen(req, timeout=6) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode())
                    if data.get("code") == "Ok" and data.get("routes"):
                        best_route = data["routes"][0]
                        # OSRM geometry coordinates are [lng, lat], convert to [lat, lng] for Leaflet
                        geojson_coords = best_route["geometry"]["coordinates"]
                        lat_lng_coords = [[pt[1], pt[0]] for pt in geojson_coords]

                        # Extract clean maneuvers
                        maneuvers = []
                        if "legs" in best_route:
                            for leg in best_route["legs"]:
                                for s in leg.get("steps", []):
                                    street_name = s.get("name") or "Corridor Road"
                                    m_type = s.get("maneuver", {}).get("type", "continue")
                                    m_modifier = s.get("maneuver", {}).get("modifier", "")
                                    dist_m = s.get("distance", 0)
                                    dur_s = s.get("duration", 0)
                                    maneuvers.append({
                                        "street_name": street_name,
                                        "type": m_type,
                                        "modifier": m_modifier,
                                        "distance_m": round(dist_m, 1),
                                        "duration_s": round(dur_s, 1),
                                    })

                        result = {
                            "coordinates": lat_lng_coords,
                            "distance_meters": best_route.get("distance", 0),
                            "duration_seconds": best_route.get("duration", 0),
                            "maneuvers": maneuvers,
                        }
                        self._cache[cache_key] = result
                        return result
        except Exception as e:
            # Graceful fallback if OSRM public service is throttled
            pass

        return None

osrm_service = OSRMService()
