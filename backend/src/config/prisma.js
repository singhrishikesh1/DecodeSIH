const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

let prisma;

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

if (process.env.NODE_ENV === 'production') {
  prisma = createClient();
} else {
  if (!global.__prisma) {
    global.__prisma = createClient();
  }
  prisma = global.__prisma;
}

module.exports = prisma;
