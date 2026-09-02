const prisma = require('../config/prisma');

/**
 * Atomically allocate the next persistent sequential pothole ID (P001, P002, ...).
 * Uses a single-row counter table so IDs never collide and always survive restarts.
 */
async function allocatePotholeId() {
  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.potholeSequence.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default', current: 0 },
    });
    const next = row.current + 1;
    await tx.potholeSequence.update({
      where: { id: 'default' },
      data: { current: next },
    });
    return next;
  });

  return 'P' + String(result).padStart(3, '0');
}

/**
 * Deterministic backfill: assign a persistent pothole ID to any pothole that
 * lacks one by continuing the sequence. Safe to call repeatedly.
 */
async function ensurePotholeId(potholeId, tx = prisma) {
  if (potholeId) return potholeId;
  return allocatePotholeId();
}

module.exports = { allocatePotholeId, ensurePotholeId };
