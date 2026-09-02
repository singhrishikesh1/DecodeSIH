const fs = require('fs');
const path = require('path');

// Pre-seeded Pune Infrastructure hackathon demo dataset
const initialSeedDefects = [
  {
    id: "DEF-1001",
    title: "Severe Road Asphalt Degradation & Pothole Cluster",
    assetName: "Viman Nagar Airport Road Flyover (Km 3.4)",
    assetType: "road",
    locationName: "Viman Nagar, Pune",
    lat: 18.5679,
    lng: 73.9143,
    altitude: 42.5,
    riskLevel: "CRITICAL",
    riskScore: 89,
    defectClass: "Pothole Cluster",
    confidence: 0.95,
    volumetric: {
      volume_m3: 0.1420,
      surface_area_m2: 0.92,
      avg_depth_cm: 15.4,
      max_depth_cm: 22.1,
      length_m: 1.25,
      width_m: 0.82
    },
    costEstimation: {
      total_estimated_cost: 9200,
      currency: "₹",
      required_materials: [
        { name: "High-Grade Bitumen Polymer Mix", quantity: "0.165 m³", unit_cost: "₹15,000/m³", cost: 2475 },
        { name: "Bituminous Tack Coat Primer", quantity: "0.5 L", unit_cost: "₹200/L", cost: 100 },
        { name: "Vibratory Roller Compaction Team", quantity: "1 Patch Crew", unit_cost: "₹3,000/job", cost: 3000 },
        { name: "Traffic Management & Barricading", quantity: "1 Shift", unit_cost: "₹3,625/shift", cost: 3625 }
      ],
      recommended_action: "Immediate cold-mix asphalt filling and vibratory roller compaction to prevent multi-vehicle tire blowout risk."
    },
    riskReasons: [
      "Depth (>15 cm) creates immediate vehicular hazard near Pune International Airport approach corridor",
      "Expanding rapidly under monsoon runoff on heavy transit arterial road"
    ],
    timestamp: "2026-08-08T14:15:00Z",
    inspector: "Rajesh Kulkarni (Pune Infrastructure Inspector)",
    status: "OPEN",
    alertSent: true,
    thumbnailUrl: "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=600&q=80"
  },
  {
    id: "DEF-1002",
    title: "Structural Beam Steel Rusting & Cable Corrosion",
    assetName: "Kharadi EON Free Zone Cable Bridge (Span 2)",
    assetType: "bridge",
    locationName: "Kharadi, Pune",
    lat: 18.5515,
    lng: 73.9348,
    altitude: 35.8,
    riskLevel: "HIGH",
    riskScore: 76,
    defectClass: "Steel Beam Corrosion",
    confidence: 0.92,
    volumetric: {
      volume_m3: 0.008,
      surface_area_m2: 4.80,
      avg_depth_cm: 0.5,
      max_depth_cm: 1.1,
      length_m: 2.80,
      width_m: 1.90
    },
    costEstimation: {
      total_estimated_cost: 18400,
      currency: "₹",
      required_materials: [
        { name: "Zinc-Rich Epoxy Structural Primer", quantity: "2.0 L", unit_cost: "₹1,400/L", cost: 2800 },
        { name: "Polyurethane UV Resistant Topcoat", quantity: "2.5 L", unit_cost: "₹1,100/L", cost: 2750 },
        { name: "Hydro-Blast Abrasive Surface Cleaning", quantity: "4.8 m²", unit_cost: "₹450/m²", cost: 2160 },
        { name: "Bridge Inspection Cradle & Crew", quantity: "1 Day", unit_cost: "₹10,690/day", cost: 10690 }
      ],
      recommended_action: "Abrasive blast cleaning, zinc-rich epoxy primer coat, and dual-pack polyurethane protective shell."
    },
    riskReasons: [
      "EON IT Park commuter corridor bridge where unmitigated corrosion threatens structural load capacity",
      "Corrosion localized near main structural cable anchorage joint"
    ],
    timestamp: "2026-08-08T13:40:00Z",
    inspector: "Ananya Deshmukh (Bridge Structural Lead)",
    status: "IN_REVIEW",
    alertSent: true,
    thumbnailUrl: "https://images.unsplash.com/photo-1541888946425-d0fbb186a5b3?w=600&q=80"
  },
  {
    id: "DEF-1003",
    title: "Highway Expansion Joint Crack & Subgrade Sinkage",
    assetName: "Pune-Nagar Highway Expressway (Wagholi Stretch Km 12)",
    assetType: "road",
    locationName: "Wagholi, Pune",
    lat: 18.5808,
    lng: 73.9818,
    altitude: 26.0,
    riskLevel: "CRITICAL",
    riskScore: 94,
    defectClass: "Expansion Joint Crack",
    confidence: 0.97,
    volumetric: {
      volume_m3: 0.210,
      surface_area_m2: 1.45,
      avg_depth_cm: 18.2,
      max_depth_cm: 24.5,
      length_m: 2.10,
      width_m: 0.95
    },
    costEstimation: {
      total_estimated_cost: 21500,
      currency: "₹",
      required_materials: [
        { name: "Elastomeric Joint Sealant Compound", quantity: "18.0 kg", unit_cost: "₹450/kg", cost: 8100 },
        { name: "Concrete Grout Base Injection", quantity: "4.5 Bags", unit_cost: "₹1,200/bag", cost: 5400 },
        { name: "Emergency Highway Repair Crew", quantity: "1 Shift", unit_cost: "₹8,000/shift", cost: 8000 }
      ],
      recommended_action: "High-pressure grout injection into subgrade base followed by hot elastomeric joint re-sealing."
    },
    riskReasons: [
      "CRITICAL subgrade displacement on heavy freight transport corridor (Pune-Ahmednagar Highway)",
      "Deep structural crack expanding towards central median"
    ],
    timestamp: "2026-08-08T12:05:00Z",
    inspector: "Vikram Patil (Highways & Expressways Director)",
    status: "DISPATCHED",
    alertSent: true,
    thumbnailUrl: "https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=600&q=80"
  },
  {
    id: "DEF-1004",
    title: "High-Rise Glass Facade Seal Spalling & Moisture Ingress",
    assetName: "Magarpatta Cybercity Tower 7 Facade",
    assetType: "building",
    locationName: "Hadapsar, Pune",
    lat: 18.5089,
    lng: 73.9259,
    altitude: 48.0,
    riskLevel: "MEDIUM",
    riskScore: 52,
    defectClass: "Facade Seepage & Spalling",
    confidence: 0.88,
    volumetric: {
      volume_m3: 0.005,
      surface_area_m2: 1.85,
      avg_depth_cm: 1.2,
      max_depth_cm: 2.8,
      length_m: 1.60,
      width_m: 0.90
    },
    costEstimation: {
      total_estimated_cost: 8500,
      currency: "₹",
      required_materials: [
        { name: "Structural Silicone Weatherproofing Gasket", quantity: "12 m", unit_cost: "₹250/m", cost: 3000 },
        { name: "Rope Access Glass Technician Team", quantity: "1 Shift", unit_cost: "₹5,500/shift", cost: 5500 }
      ],
      recommended_action: "Rope access facade inspection, removal of degraded weather sealant, and injection of structural silicone."
    },
    riskReasons: [
      "Moisture ingress risk near IT server room electrical ducts on 12th floor facade",
      "Medium priority facade weather-seal degradation"
    ],
    timestamp: "2026-08-08T11:20:00Z",
    inspector: "Neha Joshi (Civil Audit Specialist)",
    status: "RESOLVED",
    alertSent: false,
    thumbnailUrl: "https://images.unsplash.com/photo-1541888946425-d0fbb186a5b3?w=600&q=80"
  }
];

const initialDrones = [
  {
    id: "DRONE-PUNE-01",
    name: "SkyGuardian-X1 Pro",
    model: "Matrice 300 RTK Industrial",
    status: "FLYING",
    assignedArea: "Viman Nagar Flyover Sector",
    lat: 18.5679,
    lng: 73.9143,
    altitude: 48.5,
    speedKmH: 24.2,
    batteryPercent: 88,
    rotorHealth: 96,
    cameraStream: "HD Thermal + LiDAR Scan Active",
    lastServiceDate: "2026-07-20",
    nextServiceDue: "2026-08-25",
    totalFlightHours: 142.5
  },
  {
    id: "DRONE-PUNE-02",
    name: "AeroFalcon-P2 Autonomous",
    model: "Skydio X2D Autonomous Inspector",
    status: "FLYING",
    assignedArea: "Kharadi EON Bridge Sector",
    lat: 18.5515,
    lng: 73.9348,
    altitude: 38.0,
    speedKmH: 18.5,
    batteryPercent: 74,
    rotorHealth: 92,
    cameraStream: "AI Visual Defect Detector (YOLOv8)",
    lastServiceDate: "2026-07-15",
    nextServiceDue: "2026-08-20",
    totalFlightHours: 198.0
  },
  {
    id: "DRONE-PUNE-03",
    name: "TerraRover-D3 Heavy Payload",
    model: "Freefly Alta X Aerial Mapper",
    status: "CHARGING",
    assignedArea: "Wagholi Highway Base Station",
    lat: 18.5808,
    lng: 73.9818,
    altitude: 0.0,
    speedKmH: 0.0,
    batteryPercent: 99,
    rotorHealth: 98,
    cameraStream: "3D Photogrammetry Mesh Generator",
    lastServiceDate: "2026-08-01",
    nextServiceDue: "2026-09-01",
    totalFlightHours: 89.2
  }
];

const initialServiceLogs = [
  {
    id: "SRV-901",
    droneId: "DRONE-PUNE-02",
    droneName: "AeroFalcon-P2 Autonomous",
    serviceType: "Motor Calibration & Gimbal Alignment",
    date: "2026-07-15",
    technician: "Suresh More (Cert. Drone Engineer)",
    status: "COMPLETED",
    cost: "₹4,500",
    notes: "Replaced Rotor #3 bearing set and recalibrated 4K optical thermal camera sensor."
  },
  {
    id: "SRV-902",
    droneId: "DRONE-PUNE-01",
    droneName: "SkyGuardian-X1 Pro",
    serviceType: "Battery Pack Cycle & Propeller Inspection",
    date: "2026-07-20",
    technician: "Amit Shinde (Avionics Tech)",
    status: "COMPLETED",
    cost: "₹3,200",
    notes: "High-voltage battery telemetry check normal. Rotors balanced to 99.8% precision."
  }
];

class DataStore {
  constructor() {
    this.defects = [...initialSeedDefects];
    this.drones = [...initialDrones];
    this.serviceLogs = [...initialServiceLogs];
    this.users = [
      { id: "usr-1", name: "Pune Drone Operations Admin", email: "admin@droneinfrastructure.org", passwordHash: "password123", role: "ADMIN" },
      { id: "usr-2", name: "Field Infrastructure Engineer", email: "engineer@pmc.gov.in", passwordHash: "password123", role: "INSPECTOR" }
    ];
  }

  getAllDefects() {
    return this.defects;
  }

  getDefectById(id) {
    return this.defects.find(d => d.id === id);
  }

  addDefect(defectData) {
    const newDefect = {
      id: `DEF-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString(),
      status: "OPEN",
      alertSent: defectData.riskLevel === "CRITICAL",
      ...defectData
    };
    this.defects.unshift(newDefect);
    return newDefect;
  }

  updateDefectStatus(id, newStatus) {
    const defect = this.defects.find(d => d.id === id);
    if (defect) {
      defect.status = newStatus;
      return defect;
    }
    return null;
  }

  getAllDrones() {
    return this.drones;
  }

  getDroneById(id) {
    return this.drones.find(d => d.id === id);
  }

  getAllServiceLogs() {
    return this.serviceLogs;
  }

  addServiceRequest(serviceData) {
    const newRecord = {
      id: `SRV-${Date.now().toString().slice(-3)}`,
      date: new Date().toISOString().split('T')[0],
      status: "SCHEDULED",
      cost: "₹5,000",
      ...serviceData
    };
    this.serviceLogs.unshift(newRecord);
    return newRecord;
  }

  getAnalyticsSummary() {
    const totalInspections = this.defects.length;
    const criticalCount = this.defects.filter(d => d.riskLevel === "CRITICAL").length;
    const highCount = this.defects.filter(d => d.riskLevel === "HIGH").length;
    const resolvedCount = this.defects.filter(d => d.status === "RESOLVED").length;
    const totalCost = this.defects.reduce((acc, d) => acc + (d.costEstimation?.total_estimated_cost || 0), 0);

    const byAssetType = {
      road: this.defects.filter(d => d.assetType === "road").length,
      bridge: this.defects.filter(d => d.assetType === "bridge").length,
      railway: this.defects.filter(d => d.assetType === "railway").length,
      building: this.defects.filter(d => d.assetType === "building").length
    };

    return {
      totalInspections,
      criticalRisks: criticalCount,
      highRisks: highCount,
      resolvedProblems: resolvedCount,
      totalEstimatedBudget: totalCost,
      currency: "₹",
      byAssetType
    };
  }
}

module.exports = new DataStore();

