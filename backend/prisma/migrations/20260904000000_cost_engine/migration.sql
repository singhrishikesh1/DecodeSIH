-- Cost engine: rate catalog, persisted estimate snapshots, and pothole cost/road columns.
-- Additive only — does not alter or drop existing tables/columns/data.

-- 1) Rate catalog (material / labour / equipment / transport), region-scoped, versioned.
--    Historical rates are kept (effective_from / effective_to); never hard-deleted.
CREATE TABLE IF NOT EXISTS "cost_rates" (
    "id"              TEXT PRIMARY KEY,
    "category"        TEXT NOT NULL,            -- MATERIAL | LABOUR | EQUIPMENT | TRANSPORT
    "name"            TEXT NOT NULL,            -- display name, e.g. "Hot Mix Asphalt (BC)"
    "specification"   TEXT,                     -- grade / specification, e.g. "VG30 / BC gradation"
    "unit"            TEXT NOT NULL,            -- kg | m3 | L | hr | tonne-km | bag | job
    "rate"            DOUBLE PRECISION NOT NULL, -- unit rate in currency
    "currency"        TEXT NOT NULL DEFAULT 'INR',
    "state"           TEXT,
    "city"            TEXT,
    "authority"       TEXT,                     -- NHAI | State PWD | Municipal | Market | National
    "source"          TEXT,                     -- display source label, e.g. "Maharashtra PWD SOR (reference)"
    "source_reference" TEXT,
    "effective_from"  TIMESTAMP(3),
    "effective_to"    TIMESTAMP(3),
    "is_active"       BOOLEAN NOT NULL DEFAULT true,
    "sort_order"      INTEGER NOT NULL DEFAULT 0,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2) Persisted cost-estimate snapshot for one pothole. The full input + rate
--    snapshot is stored so an old estimate stays reproducible after the rate
--    catalog changes.
CREATE TABLE IF NOT EXISTS "cost_estimates" (
    "id"                TEXT PRIMARY KEY,
    "pothole_id"        TEXT,
    "road_material"     TEXT,       -- BITUMINOUS | CONCRETE | WMM | OTHER
    "road_type"         TEXT,       -- NATIONAL_HIGHWAY | STATE_HIGHWAY | MUNICIPAL | RURAL | OTHER
    "repair_method"     TEXT,       -- e.g. HOT_MIX_PATCH
    "region_state"      TEXT,
    "region_city"       TEXT,
    "road_authority"    TEXT,       -- NHAI | STATE_PWD | MUNICIPAL | NATIONAL_REF
    "geometry"          JSONB,      -- measurement snapshot
    "rate_snapshot"     JSONB,      -- full rate snapshot used (reproducibility)
    "rates_materials"   JSONB,
    "rates_labour"      JSONB,
    "rates_equipment"   JSONB,
    "rates_transport"   JSONB,
    "materials"         JSONB,      -- BOQ line items
    "labour"            JSONB,
    "equipment"         JSONB,
    "transport"         JSONB,
    "material_subtotal" DOUBLE PRECISION,
    "labour_subtotal"   DOUBLE PRECISION,
    "equipment_subtotal" DOUBLE PRECISION,
    "transport_subtotal" DOUBLE PRECISION,
    "allowance"         DOUBLE PRECISION,
    "subtotal"          DOUBLE PRECISION,
    "tax"               DOUBLE PRECISION,
    "contingency"       DOUBLE PRECISION,
    "total"             DOUBLE PRECISION,
    "currency"          TEXT NOT NULL DEFAULT 'INR',
    "rate_source"       TEXT,
    "rate_effective_date" TEXT,
    "formula"           JSONB,
    "calculation_status" TEXT NOT NULL DEFAULT 'CALCULATED',
    "calculated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cost_estimates_pothole_potholeId_fkey" FOREIGN KEY ("pothole_id") REFERENCES "potholes"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "cost_estimates_pothole_id_unique" ON "cost_estimates"("pothole_id");
CREATE INDEX IF NOT EXISTS "cost_estimates_potholeId_idx" ON "cost_estimates"("pothole_id");

-- 3) New pothole columns for road/material/repair selection and the linked estimate.
ALTER TABLE "potholes" ADD COLUMN IF NOT EXISTS "road_material" TEXT;
ALTER TABLE "potholes" ADD COLUMN IF NOT EXISTS "road_type" TEXT;
ALTER TABLE "potholes" ADD COLUMN IF NOT EXISTS "repair_method" TEXT;
ALTER TABLE "potholes" ADD COLUMN IF NOT EXISTS "region_state" TEXT;
ALTER TABLE "potholes" ADD COLUMN IF NOT EXISTS "region_city" TEXT;
ALTER TABLE "potholes" ADD COLUMN IF NOT EXISTS "cost_estimate_id" TEXT;
ALTER TABLE "potholes" ADD COLUMN IF NOT EXISTS "avg_depth_cm" DOUBLE PRECISION;
ALTER TABLE "potholes" ADD COLUMN IF NOT EXISTS "max_depth_cm" DOUBLE PRECISION;
ALTER TABLE "potholes" ADD COLUMN IF NOT EXISTS "road_authority" TEXT;
