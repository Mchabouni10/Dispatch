const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Count how many trips you currently have in the database
  const count = await prisma.trip.count();
  
  // Set the sequence counter to match your current count
  await prisma.tripSequence.upsert({
    where: { id: 1 },
    update: { lastUsed: count },
    create: { id: 1, lastUsed: count },
  });
  
  console.log(`✅ TripSequence initialized! Next trip will be #${count + 1}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());