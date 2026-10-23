import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any

from backend.app.models.schemas import (
    JunctionCoordinationRequest,
    JunctionCoordinationState,
    CorridorCoordinationPlan,
    CorridorCoordinationStatus,
    HospitalReadiness,
    RoadNode,
)

class GreenCorridorCoordinatorService:
    """
    Manages emergency signal coordination, junction request lifecycles,
    simulated signal controller adapters, and hospital trauma bay readiness.
    """
    def __init__(self):
        # corridor_id -> CorridorCoordinationPlan
        self.active_plans: Dict[str, CorridorCoordinationPlan] = {}
        # Audit log of all junction signal state changes
        self.coordination_audit_log: List[Dict[str, Any]] = []

    def build_corridor_plan(
        self,
        route_id: str,
        path_nodes: List[RoadNode],
        estimated_total_time_min: float
    ) -> CorridorCoordinationPlan:
        """
        Constructs a green corridor coordination plan for all signalized junctions
        along an emergency ambulance path.
        """
        now_iso = datetime.utcnow().isoformat() + "Z"
        junctions: List[JunctionCoordinationRequest] = []

        # Find intersections along the path
        intersection_nodes = [n for n in path_nodes if n.type == "intersection"]
        total_intersections = len(intersection_nodes)

        # Distribute ETAs progressively across junctions
        avg_step_sec = (estimated_total_time_min * 60.0) / max(1, len(path_nodes) - 1)
        running_sec = avg_step_sec

        for idx, node in enumerate(intersection_nodes):
            # First junction: immediately APPROVED or ACTIVE
            # Subsequent junctions: ACKNOWLEDGED or REQUESTED with timed clearance
            if idx == 0:
                init_state = JunctionCoordinationState.ACTIVE
                cleared_at = now_iso
                msg = "Green preemption ACTIVE: immediate corridor wave granted [Simulated Controller]"
            elif idx == 1:
                init_state = JunctionCoordinationState.APPROVED
                cleared_at = None
                msg = f"Priority lock reserved; green window opens at T+{int(running_sec)}s [Simulated Controller]"
            else:
                init_state = JunctionCoordinationState.ACKNOWLEDGED
                cleared_at = None
                msg = f"Priority request acknowledged by local signal agent; ETA {int(running_sec)}s [Simulated Controller]"

            req = JunctionCoordinationRequest(
                junction_id=node.id,
                junction_name=node.name,
                corridor_id=route_id,
                state=init_state,
                eta_seconds=round(running_sec, 1),
                requested_at=now_iso,
                acknowledged_at=now_iso,
                cleared_at=cleared_at,
                controller_type="SIMULATED_ADAPTER",
                is_simulated=True,
                status_message=msg,
            )
            junctions.append(req)
            running_sec += avg_step_sec * 1.2

            # Record audit log
            self.coordination_audit_log.append({
                "timestamp": now_iso,
                "junction_id": node.id,
                "corridor_id": route_id,
                "state": init_state.value,
                "message": msg,
            })

        cleared_count = sum(
            1 for j in junctions
            if j.state in [JunctionCoordinationState.ACTIVE, JunctionCoordinationState.APPROVED]
        )

        if total_intersections == 0:
            status = CorridorCoordinationStatus.COORDINATED
            rationale = "Direct corridor with no intervening signalized junctions."
        elif cleared_count == total_intersections:
            status = CorridorCoordinationStatus.COORDINATED
            rationale = "Full corridor green preemption established across all upcoming junctions."
        elif cleared_count > 0:
            status = CorridorCoordinationStatus.PARTIALLY_COORDINATED
            rationale = f"{cleared_count} of {total_intersections} junctions coordinated; secondary wave in sequence."
        else:
            status = CorridorCoordinationStatus.COORDINATION_PENDING
            rationale = "Signal preemption requests dispatched to local traffic controllers."

        plan = CorridorCoordinationPlan(
            corridor_id=route_id,
            status=status,
            total_junctions=total_intersections,
            cleared_junctions=cleared_count,
            active_junctions=sum(1 for j in junctions if j.state == JunctionCoordinationState.ACTIVE),
            junctions=junctions,
            last_status_change=now_iso,
            status_rationale=rationale,
        )

        self.active_plans[route_id] = plan
        return plan

    def get_hospital_readiness(
        self,
        hospital_node: RoadNode,
        estimated_eta_min: float
    ) -> HospitalReadiness:
        """
        Prepares trauma intake readiness telemetry for the receiving hospital.
        """
        # Determine trauma bay status based on ETA
        if estimated_eta_min <= 5.0:
            bay_status = "READY"
        elif estimated_eta_min <= 12.0:
            bay_status = "PREPARING"
        else:
            bay_status = "STANDBY"

        specialties = ["Emergency Medicine", "Trauma ICU", "Resuscitation Unit"]
        if "KMC" in hospital_node.name or "AJ" in hospital_node.name:
            specialties.extend(["Neurosurgery", "Cath Lab / Cardiac Care"])
        elif "Wenlock" in hospital_node.name:
            specialties.extend(["General Trauma", "Burns Unit"])

        return HospitalReadiness(
            hospital_id=hospital_node.id,
            hospital_name=hospital_node.name,
            eta_minutes=round(estimated_eta_min, 1),
            trauma_bay_status=bay_status,
            triage_level="LEVEL_1_CRITICAL_TRAUMA",
            notification_sent=True,
            specialties_available=specialties,
        )

    def trigger_junction_manual_override(
        self,
        route_id: str,
        junction_id: str,
        target_state: JunctionCoordinationState,
        operator_notes: Optional[str] = None
    ) -> Optional[JunctionCoordinationRequest]:
        """Operator manual preemption override for a specific signalized intersection."""
        plan = self.active_plans.get(route_id)
        if not plan:
            return None

        now_iso = datetime.utcnow().isoformat() + "Z"
        for j in plan.junctions:
            if j.junction_id == junction_id:
                j.state = target_state
                j.status_message = f"Manual operator override: {target_state.value} ({operator_notes or 'Dispatch command'})"
                if target_state == JunctionCoordinationState.ACTIVE:
                    j.cleared_at = now_iso

                self.coordination_audit_log.append({
                    "timestamp": now_iso,
                    "junction_id": junction_id,
                    "corridor_id": route_id,
                    "state": target_state.value,
                    "message": j.status_message,
                })
                return j

        return None

# Global corridor coordinator singleton
corridor_service = GreenCorridorCoordinatorService()
