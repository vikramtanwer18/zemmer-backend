const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const prismaClientSingleton = () => {
  // 1. Initialize the PostgreSQL connection pool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10, // Production connection limit
  });

  // 2. Wrap the pool in the Prisma adapter
  const adapter = new PrismaPg(pool);

  // 3. Inject the adapter into the Prisma Client
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
};

// Store the Prisma instance on the global object in development
const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;