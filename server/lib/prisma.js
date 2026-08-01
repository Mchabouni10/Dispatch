const { PrismaClient } = require('@prisma/client');

// Singleton PrismaClient instance to prevent database connection leaks
const prisma = new PrismaClient();

module.exports = prisma;
