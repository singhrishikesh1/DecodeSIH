"""Deterministic persistence-client tests for physical pothole identity.

The backend is the source of truth for the persistent pothole id; this test
exercises the ai_engine PersistenceClient with a fake backend transport that
mirrors the backend's physics-dedup decision (GPS tolerance + conservative bbox
fallback), covering scenarios A-H deterministically WITHOUT a network or DB.
Needed because the real /api/live/potholes requires a live backend + Postgres.

Scenarios:
  A  Continuous detection of the same physical pothole
  B  Temporary detection loss (track restarted)
  C  New tracker ID for the same physical pothole (the P009-P016 bug)
  D  GPS temporarily unavailable -> conservative bbox fallback
  E  Two potholes farther apart than the tolerance
  F  Two potholes at the tolerance boundary
  G  Concurrent persistence is thread-safe (no duplicate creation)
  H  GPS stale then recovering keeps a single record

Run from ai_engine/:  python -m unittest tests -v
"""
import math
import os
import sys
import threading
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from persistence import PersistenceClient  # noqa: E402

PUNE = (18.5204, 73.8567)
TOL_M = 0.5
IOU_THRESHOLD = 0.7
WINDOW_S = 30.0
BBOX = [100.0, 100.0, 300.0, 260.0]


def haversine(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = (math.sin(dp / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


def bbox_iou(a, b):
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    if inter <= 0:
        return 0.0
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


class FakeBackend:
    """In-memory mirror of liveService.persistLivePothole's dedup decision."""

    def __init__(self):
        self.rows = []  # list of dicts: {id, anchor, bbox, last_seen}
        self.seq = 0
        self.post_count = 0
        self.lock = threading.Lock()

    def gps_anchor_of(self, row):
        return row.get("anchor")

    def decide(self, payload):
        gps = payload.get("gps") or {}
        gps_valid = (
            isinstance(gps, dict)
            and gps.get("latitude") is not None
            and gps.get("longitude") is not None
        )
        bbox = payload.get("bbox")
        now = time.time()

        tolerance = payload.get("positionToleranceM", TOL_M)
        iou_thr = payload.get("bboxFallbackIouThreshold", IOU_THRESHOLD)
        window = payload.get("bboxFallbackWindowS", WINDOW_S)

        if gps_valid:
            best, best_d = None, float("inf")
            for row in self.rows:
                anchor = self.gps_anchor_of(row)
                if not anchor:
                    continue
                d = haversine(gps["latitude"], gps["longitude"],
                              anchor["latitude"], anchor["longitude"])
                if d < best_d:
                    best_d, best = d, row
            if best and best_d <= tolerance:
                return best, "gps", best_d

        if bbox:
            best, best_iou = None, 0.0
            for row in self.rows:
                if gps_valid and self.gps_anchor_of(row):
                    continue
                rb = row.get("bbox")
                last = row.get("last_seen")
                if not rb or last is None:
                    continue
                if now - last > window:
                    continue
                iou = bbox_iou(
                    [bbox["x1"], bbox["y1"], bbox["x2"], bbox["y2"]],
                    [rb["x1"], rb["y1"], rb["x2"], rb["y2"]],
                )
                if iou > best_iou:
                    best_iou, best = iou, row
            if best and best_iou >= iou_thr:
                return best, "bbox", best_iou

        return None, None, None

    def post(self, payload):
        with self.lock:
            self.post_count += 1
            match, method, _scalar = self.decide(payload)
            gps = payload.get("gps") or {}
            gps_valid = (
                isinstance(gps, dict)
                and gps.get("latitude") is not None
                and gps.get("longitude") is not None
            )
            if match:
                # association: update in place, no new record
                match["last_seen"] = time.time()
                gps_dist = None
                if gps_valid:
                    if not match.get("anchor"):
                        match["anchor"] = {
                            "latitude": gps["latitude"],
                            "longitude": gps["longitude"],
                        }
                    gps_dist = haversine(
                        gps["latitude"], gps["longitude"],
                        match["anchor"]["latitude"], match["anchor"]["longitude"])
                return {
                    "pothole": {
                        "potholeId": match["id"],
                        "imagePath": match.get("imagePath"),
                        "associated": True,
                        "method": method,
                        "distanceM": gps_dist,
                        "inspectionId": "insp-1",
                    },
                    "success": True,
                }
            self.seq += 1
            row = {
                "id": "P%03d" % self.seq,
                "anchor": {"latitude": gps["latitude"],
                           "longitude": gps["longitude"]} if gps_valid else None,
                "bbox": payload.get("bbox"),
                "last_seen": time.time(),
            }
            self.rows.append(row)
            return {
                "pothole": {
                    "potholeId": row["id"],
                    "imagePath": "/uploads/potholes/pothole_%s.jpg" % row["id"],
                    "associated": False,
                    "method": None,
                    "distanceM": None,
                    "inspectionId": "insp-1",
                },
                "success": True,
            }

    def attach(self, client):
        client._post_json = lambda path, payload: (
            self.post(payload) if path.endswith("/api/live/potholes") else None
        )


def make_client(**kwargs):
    dedup = {
        "position_tolerance_m": kwargs.pop("tolerance", TOL_M),
        "bbox_fallback_iou_threshold": kwargs.pop("iou_threshold", IOU_THRESHOLD),
        "bbox_fallback_window_s": kwargs.pop("window_s", WINDOW_S),
    }
    return PersistenceClient("http://fake", "DRONE-PUNE-01", physical_dedup=dedup)


def track(tid, gps=None, bbox=None, conf=0.9):
    return {
        "track_id": tid,
        "bbox": tuple(bbox or BBOX),
        "confidence": conf,
        "severity": {"severity": "HIGH", "severity_status": "ASSESSED"},
        "measurement": {"calibrated": False},
        "best_frame": None,
    }


def gps_dict(lat=None, lon=None):
    if lat is None and lon is None:
        return None
    return {"latitude": lat, "longitude": lon}


class PhysicalIdentityTests(unittest.TestCase):
    def setUp(self):
        self.backend = FakeBackend()
        self.client = make_client()
        self.backend.attach(self.client)
        self.meta = {"asset_name": "X", "asset_type": "road",
                     "location_name": "Y"}

    def _persist(self, tid, lat=18.5204, lon=73.8567, bbox=None, gps=None):
        if gps is None and lat is not None:
            gps = gps_dict(lat, lon)
        return self.client.persist_pothole(track(tid, gps=gps, bbox=bbox),
                                           gps, self.meta)

    def test_A_same_pothole_continuous(self):
        r1 = self._persist("track-1")
        self.assertTrue(r1 and not r1.get("associated"))
        # same transient track re-observed -> rejected duplicate, no extra POST
        r2 = self.client.persist_pothole(track("track-1", gps=gps_dict(*PUNE)),
                                         gps_dict(*PUNE), self.meta)
        self.assertIsNone(r2)
        self.assertEqual(len(self.backend.rows), 1)
        self.assertEqual(self.backend.post_count, 1)

    def test_B_temporary_detection_loss_new_track_same_pothole(self):
        r1 = self._persist("track-1")
        # tracker drops the detection, then the SAME pothole restarts a new track
        r2 = self._persist("track-2")
        self.assertIsNotNone(r2)
        self.assertTrue(r2.get("associated"))
        self.assertEqual(r1["potholeId"], r2["potholeId"])
        self.assertEqual(len(self.backend.rows), 1)

    def test_C_new_tracker_id_same_physical(self):
        # the exact P009-P016 scenario: many new track ids, one physical pothole
        first_id = None
        for tid in ["track-1", "track-10", "track-11", "track-12",
                    "track-13", "track-14", "track-15", "track-16"]:
            r = self._persist(tid)
            self.assertIsNotNone(r)
            if first_id is None:
                first_id = r["potholeId"]
            else:
                self.assertEqual(r["potholeId"], first_id)
                self.assertTrue(r.get("associated"))
        self.assertEqual(len(self.backend.rows), 1)

    def test_D_gps_unavailable_bbox_fallback(self):
        r1 = self._persist("track-1", lat=None, lon=None)
        self.assertFalse(r1.get("associated"))
        self.assertIsNone(self.backend.rows[0]["anchor"])  # no invented GPS
        # GPS still down, same spot, new track -> bbox fallback associates
        r2 = self._persist("track-2", lat=None, lon=None, bbox=[102, 102, 302, 262])
        self.assertTrue(r2.get("associated"))
        self.assertEqual(r1["potholeId"], r2["potholeId"])
        self.assertEqual(len(self.backend.rows), 1)

    def test_E_two_potholes_farther_than_tolerance(self):
        r1 = self._persist("track-1", lat=18.5204, lon=73.8567)
        # ~111 m away (> tolerance)
        r2 = self._persist("track-2", lat=18.5214, lon=73.8567)
        self.assertFalse(r2.get("associated"))
        self.assertNotEqual(r1["potholeId"], r2["potholeId"])
        self.assertEqual(len(self.backend.rows), 2)

    def test_F_tolerance_boundary(self):
        meters_per_deg = 6371000.0 * (math.pi / 180.0)
        r1 = self._persist("track-1", lat=18.5204, lon=73.8567)
        # 0.49 m -> same pothole
        r2 = self._persist("track-2",
                           lat=18.5204 + (0.49 / meters_per_deg), lon=73.8567)
        self.assertTrue(r2.get("associated"))
        self.assertEqual(r1["potholeId"], r2["potholeId"])
        # 0.51 m -> different pothole
        r3 = self._persist("track-3",
                           lat=18.5204 + (0.51 / meters_per_deg), lon=73.8567)
        self.assertFalse(r3.get("associated"))
        self.assertNotEqual(r1["potholeId"], r3["potholeId"])
        self.assertEqual(len(self.backend.rows), 2)

    def test_G_concurrent_persistence_thread_safe(self):
        backend = FakeBackend()
        results = []
        errors = []
        results_lock = threading.Lock()

        def worker(tid):
            client = make_client()
            backend.attach(client)
            try:
                with results_lock:
                    results.append(tid)
                client.persist_pothole(
                    track(tid, gps=gps_dict(*PUNE)), gps_dict(*PUNE),
                    {"asset_name": "X", "asset_type": "road", "location_name": "Y"})
            except Exception as e:  # noqa: BLE001
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(f"track-{i}",))
                   for i in range(1, 9)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertFalse(errors)
        self.assertEqual(len(backend.rows), 1, "concurrent posts must not duplicate")
        self.assertGreaterEqual(len(results), 8)

    def test_H_gps_stale_then_recovering(self):
        # 1) GPS stale: record persisted without GPS
        r1 = self._persist("track-1", lat=None, lon=None)
        self.assertIsNone(self.backend.rows[0]["anchor"])
        # 2) still stale, new track -> bbox fallback associates
        r2 = self._persist("track-2", lat=None, lon=None)
        self.assertTrue(r2.get("associated"))
        # 3) GPS recovers at the same spot, new track -> same physical pothole
        r3 = self._persist("track-3", lat=18.5204, lon=73.8567)
        self.assertTrue(r3.get("associated"))
        self.assertEqual(r1["potholeId"], r3["potholeId"])
        self.assertEqual(len(self.backend.rows), 1)

    def test_I_engine_restart_gps_unavailable_no_duplicate(self):
        """Regression: AI-engine restart (new client) re-observing the same GPS-less
        pothole must map to ONE record, even past the old 30s bbox window.
        Reproduces the P042->P046 bug (same bbox, same track id, 27 min apart)."""
        # Session-length bbox fallback window (matches config.yaml now).
        client1 = make_client(window_s=7200.0)
        self.backend.attach(client1)
        r1 = client1.persist_pothole(
            track("track-3", gps=None, bbox=list(BBOX)), None, self.meta)
        self.assertIsNotNone(r1)
        self.assertFalse(r1.get("associated"))
        self.assertEqual(len(self.backend.rows), 1)

        # Simulate a >30s (but within-session) gap BEFORE the restart re-observation.
        for row in self.backend.rows:
            row["last_seen"] -= 27 * 60  # 27 minutes ago, as in P042->P046

        # A fresh client models an AI-engine restart (track ids reset; local
        # _track_to_physical is empty). Same track id 3 re-created.
        client2 = make_client(window_s=7200.0)
        self.backend.attach(client2)
        r2 = client2.persist_pothole(
            track("track-3", gps=None, bbox=list(BBOX)), None, self.meta)
        self.assertIsNotNone(r2)
        self.assertTrue(r2.get("associated"),
                        "restart re-observation must associate, not duplicate")
        self.assertEqual(r1["potholeId"], r2["potholeId"])
        self.assertEqual(len(self.backend.rows), 1,
                         "same physical pothole must remain a single record")

    def test_J_old_30s_window_would_duplicate(self):
        """Guards the old behaviour: with the old 30s window, a gap past 30s DOES
        create a duplicate. We keep this as documentation of WHY the window was
        widened, not as desired behaviour."""
        client = make_client(window_s=30.0)
        self.backend.attach(client)
        client.persist_pothole(track("track-1", gps=None, bbox=list(BBOX)),
                               None, self.meta)
        for row in self.backend.rows:
            row["last_seen"] -= 60  # 60s gap > 30s window
        c2 = make_client(window_s=30.0)
        self.backend.attach(c2)
        r2 = c2.persist_pothole(track("track-1", gps=None, bbox=list(BBOX)),
                                None, self.meta)
        self.assertFalse(r2.get("associated"))
        self.assertEqual(len(self.backend.rows), 2)


if __name__ == "__main__":
    unittest.main()