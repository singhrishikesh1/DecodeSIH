-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'INSPECTOR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STANDBY',
    "assigned_area" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "altitude" DOUBLE PRECISION,
    "speed_km_h" DOUBLE PRECISION,
    "battery_percent" INTEGER,
    "rotor_health" INTEGER,
    "camera_stream" TEXT,
    "last_service_date" TEXT,
    "next_service_due" TEXT,
    "total_flight_hours" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "missions" (
    "id" TEXT NOT NULL,
    "drone_id" TEXT,
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" TEXT NOT NULL,
    "mission_id" TEXT,
    "legacy_id" TEXT,
    "asset_name" TEXT NOT NULL,
    "asset_type" TEXT NOT NULL,
    "location_name" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "altitude" DOUBLE PRECISION,
    "image_url" TEXT,
    "annotated_image_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "error_message" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model_version" TEXT,
    "processing_timestamp" TIMESTAMP(3),
    "title" TEXT,
    "inspector" TEXT,
    "alert_sent" BOOLEAN NOT NULL DEFAULT false,
    "thumbnail_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "potholes" (
    "id" TEXT NOT NULL,
    "inspection_id" TEXT NOT NULL,
    "defect_class" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "area_m2" DOUBLE PRECISION,
    "depth_m" DOUBLE PRECISION,
    "depth_type" TEXT,
    "volume_m3" DOUBLE PRECISION,
    "length_m" DOUBLE PRECISION,
    "width_m" DOUBLE PRECISION,
    "severity" TEXT,
    "risk_score" INTEGER,
    "risk_reasons" JSONB,
    "estimated_cost" DOUBLE PRECISION,
    "cost_currency" TEXT DEFAULT '₹',
    "required_materials" JSONB,
    "recommended_action" TEXT,
    "bbox" JSONB,
    "mask_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "potholes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_configs" (
    "id" TEXT NOT NULL,
    "material_rate" DOUBLE PRECISION,
    "labour_rate" DOUBLE PRECISION,
    "equipment_rate" DOUBLE PRECISION,
    "transport_rate" DOUBLE PRECISION,
    "contingency_rate" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT '₹',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_tickets" (
    "id" TEXT NOT NULL,
    "drone_id" TEXT NOT NULL,
    "drone_name" TEXT NOT NULL,
    "service_type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "technician" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "cost" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "missions_drone_id_idx" ON "missions"("drone_id");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_legacy_id_key" ON "inspections"("legacy_id");

-- CreateIndex
CREATE INDEX "inspections_timestamp_idx" ON "inspections"("timestamp");

-- CreateIndex
CREATE INDEX "inspections_status_idx" ON "inspections"("status");

-- CreateIndex
CREATE INDEX "inspections_asset_type_idx" ON "inspections"("asset_type");

-- CreateIndex
CREATE INDEX "inspections_legacy_id_idx" ON "inspections"("legacy_id");

-- CreateIndex
CREATE INDEX "potholes_inspection_id_idx" ON "potholes"("inspection_id");

-- CreateIndex
CREATE INDEX "potholes_severity_idx" ON "potholes"("severity");

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_drone_id_fkey" FOREIGN KEY ("drone_id") REFERENCES "drones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "potholes" ADD CONSTRAINT "potholes_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
