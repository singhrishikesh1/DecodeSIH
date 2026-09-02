/**
 * In-memory live-view store.
 * Holds only the LATEST frame + current detections/GPS (single snapshot, replaced
 * on each push). This backs the frontend Live view and is NOT a database; confirmed
 * potholes go to the DB via the persistence path in liveService.js.
 *
 * This is explicitly NOT Redis. The separate /api/redis/stats mock remains untouched.
 */
const STATE = {
  frameJpegBase64: null,
  detections: [],
  gps: null,
  modelLoaded: false,
  gpsLinkUp: false,
  timestamp: null,
  updatedAt: null,
};

function push(state) {
  STATE.frameJpegBase64 = state.frameJpegBase64 ?? STATE.frameJpegBase64;
  STATE.detections = Array.isArray(state.detections) ? state.detections : STATE.detections;
  STATE.gps = state.gps !== undefined ? state.gps : STATE.gps;
  STATE.modelLoaded = state.modelLoaded !== undefined ? state.modelLoaded : STATE.modelLoaded;
  STATE.gpsLinkUp = state.gpsLinkUp !== undefined ? state.gpsLinkUp : STATE.gpsLinkUp;
  STATE.timestamp = state.timestamp ?? Date.now();
  STATE.updatedAt = Date.now();
}

function get() {
  return { ...STATE };
}

module.exports = { push, get };
