-- Add persistent P001-style pothole ID, GPS availability, cost breakdown, and image association fields.

-- AlterTable potholes
ALTER TABLE "potholes" ADD COLUMN "pothole_id" TEXT;
ALTER TABLE "potholes" ADD COLUMN "gps_available" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "potholes" ADD COLUMN "gps_status" TEXT DEFAULT 'unavailable';
ALTER TABLE "potholes" ADD COLUMN "material_type" TEXT;
ALTER TABLE "potholes" ADD COLUMN "material_quantity" TEXT;
ALTER TABLE "potholes" ADD COLUMN "material_cost" DOUBLE PRECISION;
ALTER TABLE "potholes" ADD COLUMN "labour_cost" DOUBLE PRECISION;
ALTER TABLE "potholes" ADD COLUMN "equipment_cost" DOUBLE PRECISION;
ALTER TABLE "potholes" ADD COLUMN "total_repair_cost" DOUBLE PRECISION;
ALTER TABLE "potholes" ADD COLUMN "image_path" TEXT;

-- Backfill persistent IDs for existing potholes (P001, P002, ...) ordered by creation time.
WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY "created_at", "id") AS rn
  FROM "potholes"
)
UPDATE "potholes" p
SET "pothole_id" = 'P' || lpad(ranked.rn::text, 3, '0')
FROM ranked
WHERE p.id = ranked.id;

-- Create unique index on pothole_id
CREATE UNIQUE INDEX "potholes_pothole_id_key" ON "potholes"("pothole_id");

-- CreateTable pothole_sequences
CREATE TABLE "pothole_sequences" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "current_value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "pothole_sequences_pkey" PRIMARY KEY ("id")
);

-- Seed the sequence counter with the current max rn so new IDs continue correctly.
INSERT INTO "pothole_sequences" ("id", "current_value")
SELECT 'default', COUNT(*) FROM "potholes"
ON CONFLICT ("id") DO NOTHING;
