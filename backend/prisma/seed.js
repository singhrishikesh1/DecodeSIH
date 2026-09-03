require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // ─── CostConfig ─────────────────────────────────────────────────────────
  const costConfig = await prisma.costConfig.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      materialRate: 14500,
      labourRate: 3000,
      equipmentRate: 2500,
      transportRate: 1500,
      contingencyRate: 0.1,
      currency: '₹',
    },
  });
  console.log('  ✓ CostConfig seeded');

  // ─── Drones ─────────────────────────────────────────────────────────────
  const drone1 = await prisma.drone.upsert({
    where: { id: 'DRONE-PUNE-01' },
    update: {},
    create: {
      id: 'DRONE-PUNE-01',
      name: 'SkyGuardian-X1 Pro',
      model: 'Matrice 300 RTK Industrial',
      status: 'FLYING',
      assignedArea: 'Viman Nagar Flyover Sector',
      lat: 18.5679,
      lng: 73.9143,
      altitude: 48.5,
      speedKmH: 24.2,
      batteryPercent: 88,
      rotorHealth: 96,
      cameraStream: 'HD Thermal + LiDAR Scan Active',
      lastServiceDate: '2026-07-20',
      nextServiceDue: '2026-08-25',
      totalFlightHours: 142.5,
    },
  });

  const drone2 = await prisma.drone.upsert({
    where: { id: 'DRONE-PUNE-02' },
    update: {},
    create: {
      id: 'DRONE-PUNE-02',
      name: 'AeroFalcon-P2 Autonomous',
      model: 'Skydio X2D Autonomous Inspector',
      status: 'FLYING',
      assignedArea: 'Kharadi EON Bridge Sector',
      lat: 18.5515,
      lng: 73.9348,
      altitude: 38.0,
      speedKmH: 18.5,
      batteryPercent: 74,
      rotorHealth: 92,
      cameraStream: 'AI Visual Defect Detector (YOLOv8)',
      lastServiceDate: '2026-07-15',
      nextServiceDue: '2026-08-20',
      totalFlightHours: 198.0,
    },
  });

  const drone3 = await prisma.drone.upsert({
    where: { id: 'DRONE-PUNE-03' },
    update: {},
    create: {
      id: 'DRONE-PUNE-03',
      name: 'TerraRover-D3 Heavy Payload',
      model: 'Freefly Alta X Aerial Mapper',
      status: 'CHARGING',
      assignedArea: 'Wagholi Highway Base Station',
      lat: 18.5808,
      lng: 73.9818,
      altitude: 0.0,
      speedKmH: 0.0,
      batteryPercent: 99,
      rotorHealth: 98,
      cameraStream: '3D Photogrammetry Mesh Generator',
      lastServiceDate: '2026-08-01',
      nextServiceDue: '2026-09-01',
      totalFlightHours: 89.2,
    },
  });
  console.log('  ✓ 3 drones seeded');

  // ─── Users ──────────────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { email: 'admin@droneinfrastructure.org' },
    update: {},
    create: {
      name: 'Pune Drone Operations Admin',
      email: 'admin@droneinfrastructure.org',
      role: 'ADMIN',
    },
  });

  await prisma.user.upsert({
    where: { email: 'engineer@pmc.gov.in' },
    update: {},
    create: {
      name: 'Field Infrastructure Engineer',
      email: 'engineer@pmc.gov.in',
      role: 'INSPECTOR',
    },
  });
  console.log('  ✓ 2 users seeded');

  // ─── Inspections (from existing demo defects) ───────────────────────────

  // DEF-1001: Road pothole cluster
  const insp1 = await prisma.inspection.upsert({
    where: { legacyId: 'DEF-1001' },
    update: {},
    create: {
      legacyId: 'DEF-1001',
      assetName: 'Viman Nagar Airport Road Flyover (Km 3.4)',
      assetType: 'road',
      locationName: 'Viman Nagar, Pune',
      latitude: 18.5679,
      longitude: 73.9143,
      altitude: 42.5,
      status: 'COMPLETED',
      timestamp: new Date('2026-08-08T14:15:00Z'),
      title: 'Severe Road Asphalt Degradation & Pothole Cluster',
      inspector: 'Rajesh Kulkarni (Pune Infrastructure Inspector)',
      alertSent: true,
      thumbnailUrl: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=600&q=80',
      potholes: {
        create: {
          potholeId: 'P001',
          defectClass: 'Pothole Cluster',
          confidence: 0.95,
          areaM2: 0.92,
          depthM: 0.154,
          depthType: 'estimated',
          volumeM3: 0.142,
          lengthM: 1.25,
          widthM: 0.82,
          severity: 'CRITICAL',
          riskScore: 89,
          riskReasons: [
            'Depth (>15 cm) creates immediate vehicular hazard near Pune International Airport approach corridor',
            'Expanding rapidly under monsoon runoff on heavy transit arterial road',
          ],
          gpsAvailable: true,
          gpsStatus: 'available',
          materialType: 'Bitumen Polymer Mix',
          materialQuantity: '0.165 m³',
          materialCost: 2475,
          labourCost: 3000,
          equipmentCost: 3625,
          totalRepairCost: 9200,
          estimatedCost: 9200,
          costCurrency: '₹',
          requiredMaterials: [
            { name: 'High-Grade Bitumen Polymer Mix', quantity: '0.165 m³', unit_cost: '₹15,000/m³', cost: 2475 },
            { name: 'Bituminous Tack Coat Primer', quantity: '0.5 L', unit_cost: '₹200/L', cost: 100 },
            { name: 'Vibratory Roller Compaction Team', quantity: '1 Patch Crew', unit_cost: '₹3,000/job', cost: 3000 },
            { name: 'Traffic Management & Barricading', quantity: '1 Shift', unit_cost: '₹3,625/shift', cost: 3625 },
          ],
          recommendedAction: 'Immediate cold-mix asphalt filling and vibratory roller compaction to prevent multi-vehicle tire blowout risk.',
        },
      },
    },
  });

  // DEF-1002: Bridge corrosion
  const insp2 = await prisma.inspection.upsert({
    where: { legacyId: 'DEF-1002' },
    update: {},
    create: {
      legacyId: 'DEF-1002',
      assetName: 'Kharadi EON Free Zone Cable Bridge (Span 2)',
      assetType: 'bridge',
      locationName: 'Kharadi, Pune',
      latitude: 18.5515,
      longitude: 73.9348,
      altitude: 35.8,
      status: 'COMPLETED',
      timestamp: new Date('2026-08-08T13:40:00Z'),
      title: 'Structural Beam Steel Rusting & Cable Corrosion',
      inspector: 'Ananya Deshmukh (Bridge Structural Lead)',
      alertSent: true,
      thumbnailUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb186a5b3?w=600&q=80',
      potholes: {
        create: {
          potholeId: 'P002',
          defectClass: 'Steel Beam Corrosion',
          confidence: 0.92,
          areaM2: 4.80,
          depthM: 0.005,
          depthType: 'estimated',
          volumeM3: 0.008,
          lengthM: 2.80,
          widthM: 1.90,
          severity: 'HIGH',
          riskScore: 76,
          riskReasons: [
            'EON IT Park commuter corridor bridge where unmitigated corrosion threatens structural load capacity',
            'Corrosion localized near main structural cable anchorage joint',
          ],
          gpsAvailable: true,
          gpsStatus: 'available',
          materialType: 'Zinc-Rich Epoxy + PU Topcoat',
          materialQuantity: '4.5 L',
          materialCost: 5550,
          labourCost: 10690,
          equipmentCost: 2160,
          totalRepairCost: 18400,
          estimatedCost: 18400,
          costCurrency: '₹',
          requiredMaterials: [
            { name: 'Zinc-Rich Epoxy Structural Primer', quantity: '2.0 L', unit_cost: '₹1,400/L', cost: 2800 },
            { name: 'Polyurethane UV Resistant Topcoat', quantity: '2.5 L', unit_cost: '₹1,100/L', cost: 2750 },
            { name: 'Hydro-Blast Abrasive Surface Cleaning', quantity: '4.8 m²', unit_cost: '₹450/m²', cost: 2160 },
            { name: 'Bridge Inspection Cradle & Crew', quantity: '1 Day', unit_cost: '₹10,690/day', cost: 10690 },
          ],
          recommendedAction: 'Abrasive blast cleaning, zinc-rich epoxy primer coat, and dual-pack polyurethane protective shell.',
        },
      },
    },
  });

  // DEF-1003: Highway crack
  const insp3 = await prisma.inspection.upsert({
    where: { legacyId: 'DEF-1003' },
    update: {},
    create: {
      legacyId: 'DEF-1003',
      assetName: 'Pune-Nagar Highway Expressway (Wagholi Stretch Km 12)',
      assetType: 'road',
      locationName: 'Wagholi, Pune',
      latitude: 18.5808,
      longitude: 73.9818,
      altitude: 26.0,
      status: 'COMPLETED',
      timestamp: new Date('2026-08-08T12:05:00Z'),
      title: 'Highway Expansion Joint Crack & Subgrade Sinkage',
      inspector: 'Vikram Patil (Highways & Expressways Director)',
      alertSent: true,
      thumbnailUrl: 'https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=600&q=80',
      potholes: {
        create: {
          potholeId: 'P003',
          defectClass: 'Expansion Joint Crack',
          confidence: 0.97,
          areaM2: 1.45,
          depthM: 0.182,
          depthType: 'estimated',
          volumeM3: 0.210,
          lengthM: 2.10,
          widthM: 0.95,
          severity: 'CRITICAL',
          riskScore: 94,
          riskReasons: [
            'CRITICAL subgrade displacement on heavy freight transport corridor (Pune-Ahmednagar Highway)',
            'Deep structural crack expanding towards central median',
          ],
          gpsAvailable: true,
          gpsStatus: 'available',
          materialType: 'Elastomeric Joint Sealant + Grout',
          materialQuantity: '22.5 kg',
          materialCost: 13500,
          labourCost: 8000,
          equipmentCost: 0,
          totalRepairCost: 21500,
          estimatedCost: 21500,
          costCurrency: '₹',
          requiredMaterials: [
            { name: 'Elastomeric Joint Sealant Compound', quantity: '18.0 kg', unit_cost: '₹450/kg', cost: 8100 },
            { name: 'Concrete Grout Base Injection', quantity: '4.5 Bags', unit_cost: '₹1,200/bag', cost: 5400 },
            { name: 'Emergency Highway Repair Crew', quantity: '1 Shift', unit_cost: '₹8,000/shift', cost: 8000 },
          ],
          recommendedAction: 'High-pressure grout injection into subgrade base followed by hot elastomeric joint re-sealing.',
        },
      },
    },
  });

  // DEF-1004: Building facade
  const insp4 = await prisma.inspection.upsert({
    where: { legacyId: 'DEF-1004' },
    update: {},
    create: {
      legacyId: 'DEF-1004',
      assetName: 'Magarpatta Cybercity Tower 7 Facade',
      assetType: 'building',
      locationName: 'Hadapsar, Pune',
      latitude: 18.5089,
      longitude: 73.9259,
      altitude: 48.0,
      status: 'COMPLETED',
      timestamp: new Date('2026-08-08T11:20:00Z'),
      title: 'High-Rise Glass Facade Seal Spalling & Moisture Ingress',
      inspector: 'Neha Joshi (Civil Audit Specialist)',
      alertSent: false,
      thumbnailUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb186a5b3?w=600&q=80',
      potholes: {
        create: {
          potholeId: 'P004',
          defectClass: 'Facade Seepage & Spalling',
          confidence: 0.88,
          areaM2: 1.85,
          depthM: 0.012,
          depthType: 'estimated',
          volumeM3: 0.005,
          lengthM: 1.60,
          widthM: 0.90,
          severity: 'MEDIUM',
          riskScore: 52,
          riskReasons: [
            'Moisture ingress risk near IT server room electrical ducts on 12th floor facade',
            'Medium priority facade weather-seal degradation',
          ],
          gpsAvailable: true,
          gpsStatus: 'available',
          materialType: 'Structural Silicone Weatherproofing',
          materialQuantity: '12 m',
          materialCost: 3000,
          labourCost: 5500,
          equipmentCost: 0,
          totalRepairCost: 8500,
          estimatedCost: 8500,
          costCurrency: '₹',
          requiredMaterials: [
            { name: 'Structural Silicone Weatherproofing Gasket', quantity: '12 m', unit_cost: '₹250/m', cost: 3000 },
            { name: 'Rope Access Glass Technician Team', quantity: '1 Shift', unit_cost: '₹5,500/shift', cost: 5500 },
          ],
          recommendedAction: 'Rope access facade inspection, removal of degraded weather sealant, and injection of structural silicone.',
        },
      },
    },
  });

  // Mark DEF-1004 as RESOLVED (matching original store data)
  await prisma.inspection.update({
    where: { legacyId: 'DEF-1004' },
    data: { status: 'RESOLVED' },
  });

  // Mark DEF-1002 as IN_REVIEW
  await prisma.inspection.update({
    where: { legacyId: 'DEF-1002' },
    data: { status: 'IN_REVIEW' },
  });

  // Mark DEF-1003 as DISPATCHED
  await prisma.inspection.update({
    where: { legacyId: 'DEF-1003' },
    data: { status: 'DISPATCHED' },
  });

  console.log('  ✓ 4 inspections + potholes seeded');

  // Sync the persistent P001/P002/... sequence counter to the number of potholes
  // so any subsequent backend-created pothole continues sequentially (P005, ...).
  const potholeCount = await prisma.pothole.count();
  await prisma.potholeSequence.upsert({
    where: { id: 'default' },
    update: { current: potholeCount },
    create: { id: 'default', current: potholeCount },
  });

  console.log('  ✓ Pothole sequence synced to', potholeCount);
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
