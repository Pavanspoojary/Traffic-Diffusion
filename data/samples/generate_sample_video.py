import os
from pathlib import Path
import cv2
import numpy as np

def create_traffic_video(output_path: str, vehicle_density: str = "heavy", duration_sec: int = 4, fps: int = 20):
    """
    Generates a synthetic CCTV video of an urban road corridor with simulated moving vehicles.
    Useful for local offline testing and hackathon demonstration.
    """
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    width, height = 640, 360
    total_frames = duration_sec * fps

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(path), fourcc, fps, (width, height))

    # Base vehicle specifications (x, y, speed_x, color, width, height, type)
    if vehicle_density == "heavy":
        vehicles = [
            {"x": 50, "y": 140, "speed": 4, "color": (220, 220, 220), "w": 45, "h": 25},  # Car 1
            {"x": 180, "y": 145, "speed": 3, "color": (180, 50, 50), "w": 42, "h": 24},   # Car 2
            {"x": 320, "y": 135, "speed": 2, "color": (40, 180, 40), "w": 50, "h": 26},   # Car 3
            {"x": 80, "y": 200, "speed": 2, "color": (50, 100, 200), "w": 90, "h": 38},   # Bus
            {"x": 260, "y": 195, "speed": 2, "color": (140, 140, 140), "w": 80, "h": 36}, # Truck
            {"x": 420, "y": 210, "speed": 3, "color": (240, 200, 40), "w": 44, "h": 24},  # Car 4
            {"x": 120, "y": 270, "speed": 5, "color": (200, 40, 180), "w": 40, "h": 22},  # Car 5
            {"x": 290, "y": 275, "speed": 4, "color": (30, 220, 220), "w": 46, "h": 24},  # Car 6
            {"x": 460, "y": 265, "speed": 4, "color": (210, 210, 210), "w": 45, "h": 25}, # Car 7
        ]
    else:
        vehicles = [
            {"x": 100, "y": 150, "speed": 7, "color": (220, 220, 220), "w": 45, "h": 24},
            {"x": 350, "y": 220, "speed": 6, "color": (50, 120, 230), "w": 48, "h": 25},
        ]

    for frame_idx in range(total_frames):
        frame = np.full((height, width, 3), (45, 45, 48), dtype=np.uint8)

        # Draw asphalt roadway
        cv2.rectangle(frame, (0, 110), (width, 320), (60, 60, 65), -1)

        # Draw lane dividing dashed markings
        for lane_y in [180, 250]:
            dash_offset = (frame_idx * 6) % 40
            for dash_x in range(-dash_offset, width, 40):
                cv2.line(frame, (dash_x, lane_y), (dash_x + 20, lane_y), (220, 220, 220), 2)

        # Draw curbs
        cv2.line(frame, (0, 110), (width, 110), (140, 140, 140), 3)
        cv2.line(frame, (0, 320), (width, 320), (140, 140, 140), 3)

        # Draw CCTV timestamp overlay
        cv2.putText(frame, f"CAM-04 | REC: 2026-10-23 | FRM: {frame_idx:04d}", (15, 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1, cv2.LINE_AA)

        # Update and draw vehicles
        for v in vehicles:
            v["x"] = (v["x"] + v["speed"]) % (width + 100)
            draw_x = int(v["x"] - 50)
            draw_y = int(v["y"])
            # Vehicle body
            cv2.rectangle(frame, (draw_x, draw_y), (draw_x + v["w"], draw_y + v["h"]), v["color"], -1)
            # Windshield / windows
            cv2.rectangle(frame, (draw_x + 8, draw_y + 3), (draw_x + v["w"] - 8, draw_y + v["h"] - 3), (30, 30, 30), -1)
            # Headlights
            cv2.circle(frame, (draw_x + v["w"] - 2, draw_y + 4), 2, (0, 255, 255), -1)
            cv2.circle(frame, (draw_x + v["w"] - 2, draw_y + v["h"] - 4), 2, (0, 255, 255), -1)

        out.write(frame)

    out.release()
    print(f"Generated sample video: {path} ({duration_sec}s, {total_frames} frames)")

if __name__ == "__main__":
    samples_dir = Path(__file__).resolve().parent
    create_traffic_video(str(samples_dir / "cctv_sample_heavy.mp4"), vehicle_density="heavy")
    create_traffic_video(str(samples_dir / "cctv_sample_freeflow.mp4"), vehicle_density="freeflow")
