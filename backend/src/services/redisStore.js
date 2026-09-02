class RedisStoreService {
  constructor() {
    this.connected = true;
    this.memoryUsedMb = 24.8;
    this.totalKeys = 1420;
    this.opsPerSec = 485;
    this.pubSubChannels = ['drone:telemetry:pune', 'drone:alerts:critical', 'drone:service:events'];
    this.uptimeSeconds = 34820;
    
    // Live Telemetry key stream
    this.recentKeys = [
      { key: "drone:telemetry:pune:X1", type: "hash", ttl: 30, val: "{ lat: 18.5679, lng: 73.9143, alt: 48.5, batt: 88% }" },
      { key: "drone:telemetry:pune:P2", type: "hash", ttl: 30, val: "{ lat: 18.5515, lng: 73.9348, alt: 38.0, batt: 74% }" },
      { key: "drone:cache:analytics:summary", type: "string", ttl: 300, val: "{ totalInspections: 4, critical: 2, budget: 57600 }" },
      { key: "drone:events:stream", type: "stream", ttl: 86400, val: "XADD drone:events * defect DEF-1003 detected" },
      { key: "drone:pubsub:alerts", type: "pubsub", ttl: -1, val: "CHANNEL drone:alerts:critical ACTIVE (2 subscribers)" }
    ];

    // Periodically update dynamic telemetry stream
    setInterval(() => {
      this.opsPerSec = 450 + Math.floor(Math.random() * 80);
      this.memoryUsedMb = +(24.8 + (Math.random() * 0.4)).toFixed(2);
      this.totalKeys += Math.random() > 0.6 ? 1 : 0;
    }, 2000);
  }

  getStats() {
    return {
      status: "connected",
      mode: "standalone / cluster-ready",
      version: "7.2.4-drone-infra",
      memoryUsedMb: this.memoryUsedMb,
      totalKeys: this.totalKeys,
      opsPerSec: this.opsPerSec,
      connectedClients: 8,
      pubSubChannels: this.pubSubChannels,
      recentKeys: this.recentKeys,
      telemetryStream: {
        channel: "drone:telemetry:pune",
        activePayload: {
          timestamp: new Date().toISOString(),
          activeDronesCount: 3,
          puneBoundCenter: { lat: 18.5204, lng: 73.8567 },
          packetsProcessed: 148290,
          cacheHitRatio: "99.4%"
        }
      }
    };
  }
}

module.exports = new RedisStoreService();
