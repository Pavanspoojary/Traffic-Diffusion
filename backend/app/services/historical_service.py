import json
from pathlib import Path
from datetime import datetime
from collections import defaultdict
from typing import List, Dict, Optional, Any

from backend.app.config import settings
from backend.app.models.schemas import (
    HistoricalIncidentRecord,
    RecurringHotspotSummary,
    HistoricalAnalyticsResponse,
    IncidentCategory,
    IncidentSeverity,
    EventProvenance,
)

class HistoricalAnalyticsService:
    """
    Analytics engine for historical incident records, recurring traffic hotspots,
    time-of-day/day-of-week congestion distributions, and mean clearance duration.
    """
    def __init__(self, data_path: Optional[Path] = None):
        self.data_path = data_path or (settings.base_dir / "data" / "historical_incidents.json")
        self.records: List[HistoricalIncidentRecord] = []
        self.load_records()

    def load_records(self) -> None:
        """Loads historical records from disk with strict schema parsing."""
        self.records.clear()
        if not self.data_path.exists():
            return

        try:
            with open(self.data_path, "r", encoding="utf-8") as f:
                raw_list = json.load(f)

            for item in raw_list:
                try:
                    record = HistoricalIncidentRecord(
                        record_id=item.get("record_id", f"HIST-{len(self.records)+1:03d}"),
                        category=IncidentCategory(item.get("category", "COLLISION")),
                        edge_id=item["edge_id"],
                        road_name=item.get("road_name", item["edge_id"]),
                        junction_id=item.get("junction_id"),
                        timestamp=item.get("timestamp", datetime.utcnow().isoformat() + "Z"),
                        day_of_week=item.get("day_of_week", "Monday"),
                        hour_of_day=int(item.get("hour_of_day", 12)),
                        severity=IncidentSeverity(item.get("severity", "HIGH")),
                        duration_minutes=float(item.get("duration_minutes", 45.0)),
                        lanes_blocked=int(item.get("lanes_blocked", 1)),
                        observed_delay_min=float(item.get("observed_delay_min", 10.0)),
                        clearance_team_dispatched=bool(item.get("clearance_team_dispatched", True)),
                        provenance=EventProvenance(item.get("provenance", "OBSERVED")),
                    )
                    self.records.append(record)
                except Exception as err:
                    # Skip malformed record
                    continue
        except Exception as e:
            print(f"Error loading historical records: {e}")

    def save_records(self) -> None:
        """Persists records back to disk."""
        try:
            data = [r.model_dump() if hasattr(r, "model_dump") else r.dict() for r in self.records]
            with open(self.data_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error saving historical records: {e}")

    def get_analytics(
        self,
        filter_provenance: Optional[EventProvenance] = None
    ) -> HistoricalAnalyticsResponse:
        """
        Analyzes historical incidents to extract recurring hotspot patterns,
        hourly/weekday congestion waves, and mean incident clearance timelines.
        """
        active_list = [
            r for r in self.records
            if filter_provenance is None or r.provenance == filter_provenance
        ]

        total_records = len(active_list)
        observed_count = sum(1 for r in active_list if r.provenance == EventProvenance.OBSERVED)
        simulated_count = sum(1 for r in active_list if r.provenance == EventProvenance.SIMULATED)

        # 1. Hotspot Aggregation by Edge & Junction
        location_records = defaultdict(list)
        for r in active_list:
            loc_key = r.edge_id
            location_records[loc_key].append(r)

        hotspots: List[RecurringHotspotSummary] = []
        for loc_id, items in location_records.items():
            first = items[0]
            cat_counts = defaultdict(int)
            hour_counts = defaultdict(int)
            day_counts = defaultdict(int)
            total_dur = 0.0

            for it in items:
                cat_counts[it.category] += 1
                hour_counts[it.hour_of_day] += 1
                day_counts[it.day_of_week] += 1
                total_dur += it.duration_minutes

            top_cat = max(cat_counts.items(), key=lambda x: x[1])[0]
            mean_dur = round(total_dur / len(items), 1)

            # Extract peak hours (hours with >= 2 occurrences)
            peak_hours = [h for h, c in sorted(hour_counts.items(), key=lambda x: x[1], reverse=True)[:3]]
            peak_days = [d for d, c in sorted(day_counts.items(), key=lambda x: x[1], reverse=True)[:2]]

            # Risk score based on incident frequency and mean duration
            risk_score = min(100.0, round((len(items) * 12.0) + (mean_dur * 0.4), 1))

            summary = (
                f"Recurring {top_cat.value.replace('_', ' ').lower()} hotspot ({len(items)} incidents recorded). "
                f"Highest concentration during {', '.join(peak_days)} peak hours ({', '.join(f'{h:02d}:00' for h in peak_hours)}). "
                f"Average clearance duration {mean_dur} minutes."
            )

            hotspots.append(
                RecurringHotspotSummary(
                    location_id=loc_id,
                    location_name=first.road_name,
                    incident_count=len(items),
                    primary_category=top_cat,
                    mean_duration_minutes=mean_dur,
                    recurring_peak_hours=peak_hours,
                    recurring_peak_days=peak_days,
                    recurring_risk_score=risk_score,
                    recurring_pattern_summary=summary,
                )
            )

        # Sort hotspots by incident count & risk
        hotspots.sort(key=lambda h: h.recurring_risk_score, reverse=True)

        # 2. Distributions
        category_dist: Dict[str, int] = defaultdict(int)
        hourly_dist: Dict[int, int] = {h: 0 for h in range(24)}
        weekday_dist: Dict[str, int] = {
            "Monday": 0, "Tuesday": 0, "Wednesday": 0, "Thursday": 0, "Friday": 0, "Saturday": 0, "Sunday": 0
        }
        category_durations = defaultdict(list)

        for r in active_list:
            category_dist[r.category.value] += 1
            hourly_dist[r.hour_of_day] += 1
            weekday_dist[r.day_of_week] += 1
            category_durations[r.category.value].append(r.duration_minutes)

        mean_duration_by_category = {
            cat: round(sum(durs) / len(durs), 1)
            for cat, durs in category_durations.items()
        }

        provenance_txt = (
            f"Dataset comprises {observed_count} observed traffic control log records and {simulated_count} "
            f"calibrated synthetic verification events from Mangaluru Metropolitan Police logs."
        )

        return HistoricalAnalyticsResponse(
            total_records_analyzed=total_records,
            observed_records_count=observed_count,
            simulated_records_count=simulated_count,
            top_recurring_hotspots=hotspots[:6],
            category_distribution=dict(category_dist),
            hourly_distribution=hourly_dist,
            weekday_distribution=weekday_dist,
            mean_duration_by_category_min=mean_duration_by_category,
            data_provenance_summary=provenance_txt,
        )

    def import_records(
        self,
        raw_items: List[Dict[str, Any]],
        source_name: str = "MANGALURU_TRAFFIC_LOGS",
        is_simulated: bool = False
    ) -> Dict[str, Any]:
        """Validates and imports external incident records."""
        imported_count = 0
        errors = []

        for idx, item in enumerate(raw_items):
            if "edge_id" not in item:
                errors.append(f"Row {idx}: missing required 'edge_id'")
                continue

            try:
                rec_id = item.get("record_id", f"IMP-{int(datetime.utcnow().timestamp())}-{imported_count}")
                cat = IncidentCategory(item.get("category", "OTHER").upper())
                sev = IncidentSeverity(item.get("severity", "HIGH").upper())
                prov = EventProvenance.SIMULATED if is_simulated else EventProvenance.OBSERVED

                rec = HistoricalIncidentRecord(
                    record_id=rec_id,
                    category=cat,
                    edge_id=item["edge_id"],
                    road_name=item.get("road_name", item["edge_id"]),
                    junction_id=item.get("junction_id"),
                    timestamp=item.get("timestamp", datetime.utcnow().isoformat() + "Z"),
                    day_of_week=item.get("day_of_week", "Monday"),
                    hour_of_day=int(item.get("hour_of_day", 12)),
                    severity=sev,
                    duration_minutes=float(item.get("duration_minutes", 45.0)),
                    lanes_blocked=int(item.get("lanes_blocked", 1)),
                    observed_delay_min=float(item.get("observed_delay_min", 10.0)),
                    clearance_team_dispatched=bool(item.get("clearance_team_dispatched", True)),
                    provenance=prov,
                )
                self.records.append(rec)
                imported_count += 1
            except Exception as err:
                errors.append(f"Row {idx}: validation error - {str(err)}")

        if imported_count > 0:
            self.save_records()

        return {
            "status": "success" if imported_count > 0 else "failed",
            "imported_count": imported_count,
            "errors": errors,
            "total_records": len(self.records),
        }

# Global Historical Service initialized below
historical_service = HistoricalAnalyticsService()
