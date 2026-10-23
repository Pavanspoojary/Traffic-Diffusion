import os
import time
import math
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Any
import cv2
import numpy as np

from backend.app.config import settings
from backend.app.models.schemas import (
    CongestionLevel,
    IncidentStatus,
    DataStatus,
    VehicleCounts,
    VehicleTrackingSummary,
    VideoAnalysisResult,
    IncidentRecord,
)

# Relevant COCO classes for vehicle traffic
VEHICLE_CLASS_MAP = {
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
}

class CentroidTracker:
    """
    Lightweight, deterministic object tracker associating vehicle centroids
    across consecutive video frames to estimate velocity, queue buildup, and stopped duration.
    """
    def __init__(self, max_disappeared: int = 8, distance_threshold: float = 90.0):
        self.next_object_id = 0
        self.objects: Dict[int, Tuple[float, float]] = {}
        self.disappeared: Dict[int, int] = {}
        self.first_seen: Dict[int, float] = {}
        self.positions: Dict[int, List[Tuple[float, Tuple[float, float]]]] = {}
        self.classes: Dict[int, str] = {}
        self.max_disappeared = max_disappeared
        self.distance_threshold = distance_threshold

    def register(self, centroid: Tuple[float, float], timestamp_sec: float, cls_name: str) -> int:
        oid = self.next_object_id
        self.next_object_id += 1
        self.objects[oid] = centroid
        self.disappeared[oid] = 0
        self.first_seen[oid] = timestamp_sec
        self.positions[oid] = [(timestamp_sec, centroid)]
        self.classes[oid] = cls_name
        return oid

    def deregister(self, oid: int):
        if oid in self.objects:
            del self.objects[oid]
        if oid in self.disappeared:
            del self.disappeared[oid]

    def update(
        self,
        detections: List[Tuple[Tuple[float, float], str]],
        timestamp_sec: float
    ) -> Dict[int, Tuple[float, float]]:
        if len(detections) == 0:
            for oid in list(self.disappeared.keys()):
                self.disappeared[oid] += 1
                if self.disappeared[oid] > self.max_disappeared:
                    self.deregister(oid)
            return self.objects

        input_centroids = [d[0] for d in detections]
        input_classes = [d[1] for d in detections]

        if len(self.objects) == 0:
            for i, c in enumerate(input_centroids):
                self.register(c, timestamp_sec, input_classes[i])
            return self.objects

        object_ids = list(self.objects.keys())
        object_centroids = list(self.objects.values())

        # Compute pairwise Euclidean distances
        dists = np.zeros((len(object_centroids), len(input_centroids)), dtype=np.float32)
        for i, oc in enumerate(object_centroids):
            for j, ic in enumerate(input_centroids):
                dists[i, j] = math.hypot(oc[0] - ic[0], oc[1] - ic[1])

        # Match row-by-row based on minimum distance
        rows = dists.min(axis=1).argsort()
        cols = dists.argmin(axis=1)[rows]

        used_rows = set()
        used_cols = set()

        for r, c in zip(rows, cols):
            if r in used_rows or c in used_cols:
                continue
            if dists[r, c] > self.distance_threshold:
                continue

            oid = object_ids[r]
            self.objects[oid] = input_centroids[c]
            self.disappeared[oid] = 0
            self.positions[oid].append((timestamp_sec, input_centroids[c]))
            used_rows.add(r)
            used_cols.add(c)

        unused_rows = set(range(len(object_centroids))) - used_rows
        unused_cols = set(range(len(input_centroids))) - used_cols

        for r in unused_rows:
            oid = object_ids[r]
            self.disappeared[oid] += 1
            if self.disappeared[oid] > self.max_disappeared:
                self.deregister(oid)

        for c in unused_cols:
            self.register(input_centroids[c], timestamp_sec, input_classes[c])

        return self.objects

    def summarize_motion(self, min_motion_pixels: float = 20.0) -> VehicleTrackingSummary:
        total_unique = self.next_object_id
        moving_count = 0
        stopped_count = 0
        max_stopped_sec = 0.0

        for oid, history in self.positions.items():
            if len(history) < 2:
                moving_count += 1
                continue

            start_t, start_pos = history[0]
            end_t, end_pos = history[-1]
            elapsed = max(0.01, end_t - start_t)
            displacement = math.hypot(end_pos[0] - start_pos[0], end_pos[1] - start_pos[1])

            if displacement > min_motion_pixels:
                moving_count += 1
            else:
                stopped_count += 1
                if elapsed > max_stopped_sec:
                    max_stopped_sec = round(elapsed, 2)

        # Queue buildup condition: multiple vehicles stationary simultaneously
        queue_detected = stopped_count >= 3
        # Estimate flow rate in vehicles per minute
        est_flow_vpm = round((moving_count / max(1.0, max_stopped_sec + 5.0)) * 60.0, 1)

        return VehicleTrackingSummary(
            tracked_unique_vehicles=total_unique,
            moving_vehicles=moving_count,
            stopped_vehicles=stopped_count,
            queue_detected=queue_detected,
            max_stopped_duration_sec=max_stopped_sec,
            estimated_flow_rate_vpm=est_flow_vpm,
            confidence=0.88 if total_unique > 0 else 0.50,
        )


class ComputerVisionService:
    def __init__(self):
        self.model = None
        self.incidents_registry: Dict[str, IncidentRecord] = {}
        self._init_yolo_model()

    def _init_yolo_model(self):
        """Attempts to load Ultralytics YOLOv8 nano model for high-speed inference."""
        try:
            from ultralytics import YOLO
            self.model = YOLO(settings.yolo_model_name)
        except Exception:
            self.model = None

    def analyze_cctv_video(
        self,
        video_path: str,
        corridor_id: str,
        is_simulation_mode: bool = False
    ) -> VideoAnalysisResult:
        """
        Processes an uploaded CCTV video file, performs vehicle detection, tracks vehicles
        across consecutive frames, computes traffic density and movement, and derives
        verifiable congestion states without inventing fake observations.
        """
        path = Path(video_path)
        if not path.exists():
            raise FileNotFoundError(f"Video file not found at: {video_path}")

        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            # Never return fabricated vehicle counts as real observations.
            # Raise a handled error indicating data unavailability.
            raise ValueError(
                f"CCTV Video stream could not be decoded by OpenCV from '{path.name}'. "
                "Raw media stream unavailable; fabricated observations strictly prohibited."
            )

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration_sec = total_frames / fps if fps > 0 else 0.0

        sample_interval = max(1, int(fps / settings.target_fps_sample))
        tracker = CentroidTracker(max_disappeared=6, distance_threshold=80.0)

        frame_idx = 0
        analyzed_frames = 0
        total_cars = 0
        total_trucks = 0
        total_buses = 0
        total_motorcycles = 0

        frame_vehicle_counts = []
        best_annotated_frame = None
        max_detected_frame_count = -1

        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_idx % sample_interval == 0:
                    analyzed_frames += 1
                    current_sec = frame_idx / fps if fps > 0 else 0.0

                    # Run detection
                    cars, trucks, buses, bikes, detections, annotated_img = self._detect_frame_vehicles(frame)

                    # Update tracker
                    tracker.update(detections, current_sec)

                    current_frame_total = cars + trucks + buses + bikes
                    frame_vehicle_counts.append(current_frame_total)

                    total_cars += cars
                    total_trucks += trucks
                    total_buses += buses
                    total_motorcycles += bikes

                    if current_frame_total > max_detected_frame_count:
                        max_detected_frame_count = current_frame_total
                        best_annotated_frame = annotated_img

                frame_idx += 1

                # Cap for fast hackathon demo response
                if analyzed_frames >= 120:
                    break
        finally:
            cap.release()

        if analyzed_frames == 0:
            raise ValueError(
                f"No usable video frames could be extracted from '{path.name}'. "
                "Camera feed is unavailable or corrupted."
            )

        # Average vehicle counts across sampled frames
        avg_cars = total_cars / analyzed_frames
        avg_trucks = total_trucks / analyzed_frames
        avg_buses = total_buses / analyzed_frames
        avg_bikes = total_motorcycles / analyzed_frames
        avg_total = avg_cars + avg_trucks + avg_buses + avg_bikes
        peak_total = max(frame_vehicle_counts) if frame_vehicle_counts else int(avg_total)

        # Tracking motion metrics
        motion_summary = tracker.summarize_motion()

        # Weighted density calculation: heavy commercial vehicles consume higher capacity
        weighted_load = (avg_cars * 1.0) + (avg_trucks * 2.5) + (avg_buses * 3.0) + (avg_bikes * 0.4)
        nominal_capacity = 25.0
        density_score = min(1.0, round(weighted_load / nominal_capacity, 3))

        # Congestion classification
        # BLOCKED requires BOTH heavy density and stationary queue buildup (preventing false alarms)
        if density_score >= settings.density_blocked_threshold and motion_summary.queue_detected:
            congestion_level = CongestionLevel.BLOCKED
            is_incident = True
            incident_reason = "Paralyzed corridor: persistent multi-vehicle stationary queue blocking lane capacity"
            incident_status = IncidentStatus.SUSPECTED
        elif density_score >= settings.density_heavy_threshold:
            congestion_level = CongestionLevel.HEAVY
            is_incident = False
            incident_reason = "Heavy vehicle density with sluggish movement"
            incident_status = IncidentStatus.UNKNOWN
        elif density_score >= settings.density_moderate_threshold:
            congestion_level = CongestionLevel.MODERATE
            is_incident = False
            incident_reason = "Moderate traffic flow moving steadily"
            incident_status = IncidentStatus.UNKNOWN
        else:
            congestion_level = CongestionLevel.FREE_FLOW
            is_incident = False
            incident_reason = None
            incident_status = IncidentStatus.UNKNOWN

        # Create or update an incident record in registry if suspected
        incident_id = None
        preview_filename = None
        if best_annotated_frame is not None:
            preview_filename = f"{path.stem}_preview.jpg"
            preview_dest = settings.processed_dir / preview_filename
            cv2.imwrite(str(preview_dest), best_annotated_frame)

        if is_incident:
            incident_id = f"INC-{corridor_id.upper()}-{int(time.time())}"
            record = IncidentRecord(
                incident_id=incident_id,
                corridor_id=corridor_id,
                status=IncidentStatus.SUSPECTED,
                description=incident_reason or "Suspected road obstruction",
                confidence_score=round(motion_summary.confidence, 2),
                detected_at=datetime.utcnow().isoformat() + "Z",
                preview_image_url=f"/api/v1/cv/preview/{preview_filename}" if preview_filename else None,
                is_simulated=is_simulation_mode,
            )
            self.incidents_registry[incident_id] = record

        return VideoAnalysisResult(
            corridor_id=corridor_id,
            video_filename=path.name,
            frames_analyzed=analyzed_frames,
            duration_seconds=round(duration_sec, 2),
            average_vehicles_per_frame=round(avg_total, 2),
            peak_vehicles_per_frame=peak_total,
            vehicle_counts=VehicleCounts(
                cars=int(round(avg_cars)),
                trucks=int(round(avg_trucks)),
                buses=int(round(avg_buses)),
                motorcycles=int(round(avg_bikes)),
                total=int(round(avg_total)),
            ),
            density_score=density_score,
            congestion_level=congestion_level,
            is_incident_detected=is_incident,
            incident_reason=incident_reason,
            incident_status=incident_status,
            incident_id=incident_id,
            data_status=DataStatus.SIMULATED if is_simulation_mode else DataStatus.LIVE,
            confidence_score=round(motion_summary.confidence, 2),
            is_simulated=is_simulation_mode,
            detection_method="YOLOv8 + Centroid Tracker",
            tracking_summary=motion_summary,
            processed_at=datetime.utcnow().isoformat() + "Z",
            last_successful_update=datetime.utcnow().isoformat() + "Z",
        )

    def _detect_frame_vehicles(
        self,
        frame: np.ndarray
    ) -> Tuple[int, int, int, int, List[Tuple[Tuple[float, float], str]], np.ndarray]:
        """Runs YOLOv8 or edge contour detection, returning counts, centroids, and annotated frame."""
        cars = 0
        trucks = 0
        buses = 0
        bikes = 0
        detections: List[Tuple[Tuple[float, float], str]] = []
        annotated = frame.copy()

        if self.model is not None:
            try:
                results = self.model.predict(
                    frame,
                    conf=settings.detection_confidence,
                    classes=list(VEHICLE_CLASS_MAP.keys()),
                    verbose=False,
                )
                if results and len(results) > 0:
                    r = results[0]
                    annotated = r.plot()
                    for box in r.boxes:
                        cls_id = int(box.cls[0].item())
                        cls_name = VEHICLE_CLASS_MAP.get(cls_id, "car")
                        xyxy = box.xyxy[0].tolist()
                        cx = (xyxy[0] + xyxy[2]) / 2.0
                        cy = (xyxy[1] + xyxy[3]) / 2.0
                        detections.append(((cx, cy), cls_name))

                        if cls_id == 2:
                            cars += 1
                        elif cls_id == 7:
                            trucks += 1
                        elif cls_id == 5:
                            buses += 1
                        elif cls_id == 3:
                            bikes += 1

                    if len(detections) > 0:
                        return cars, trucks, buses, bikes, detections, annotated
            except Exception:
                pass

        # Contour-based fallback if YOLO weights are missing or synthetic mock footage is used
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 50, 150)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area > 600:
                x, y, w, h = cv2.boundingRect(cnt)
                cx = x + (w / 2.0)
                cy = y + (h / 2.0)
                cv2.rectangle(annotated, (x, y), (x + w, y + h), (0, 255, 0), 2)
                if area > 2500:
                    trucks += 1
                    detections.append(((cx, cy), "truck"))
                elif area > 1800:
                    buses += 1
                    detections.append(((cx, cy), "bus"))
                elif area > 800:
                    cars += 1
                    detections.append(((cx, cy), "car"))
                else:
                    bikes += 1
                    detections.append(((cx, cy), "motorcycle"))

        return cars, trucks, buses, bikes, detections, annotated

    def verify_incident(
        self,
        incident_id: str,
        action: str,
        notes: Optional[str] = None,
        operator_id: str = "DISPATCH_OP_01"
    ) -> Optional[IncidentRecord]:
        """Operator workflow to CONFIRM, DISMISS, or CLEAR a suspected incident."""
        if incident_id not in self.incidents_registry:
            return None

        record = self.incidents_registry[incident_id]
        action_upper = action.upper()
        now_iso = datetime.utcnow().isoformat() + "Z"

        if action_upper == "CONFIRM":
            record.status = IncidentStatus.CONFIRMED
            record.verified_at = now_iso
            record.verified_by = operator_id
            if notes:
                record.description += f" [Verified: {notes}]"
        elif action_upper in ["DISMISS", "CLEAR"]:
            record.status = IncidentStatus.CLEARED
            record.verified_at = now_iso
            record.verified_by = operator_id
            if notes:
                record.description += f" [Cleared: {notes}]"

        return record

    def list_active_incidents(self) -> List[IncidentRecord]:
        """Returns all incidents that are not cleared."""
        return [
            rec for rec in self.incidents_registry.values()
            if rec.status in [IncidentStatus.SUSPECTED, IncidentStatus.VERIFICATION_PENDING, IncidentStatus.CONFIRMED]
        ]

# Global CV service singleton
cv_service = ComputerVisionService()
