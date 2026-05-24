/**
 * Deletes all demo / dummy data while keeping the real geographic skeleton
 * (admin hierarchy, watersheds, villages, users, resource catalog).
 *
 * Run after a fresh seed when you want to start capturing real project +
 * water-source data without the placeholders.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Cleaning up dummy data...");

  const tgl = await prisma.taskGeoLink.deleteMany({});
  const ce  = await prisma.costEntry.deleteMany({});
  const tra = await prisma.taskResourceAllocation.deleteMany({});
  const tk  = await prisma.task.deleteMany({});
  const pr  = await prisma.project.deleteMany({});
  const ws  = await prisma.waterSource.deleteMany({});

  console.log(`  ✓ TaskGeoLink: ${tgl.count}`);
  console.log(`  ✓ CostEntry: ${ce.count}`);
  console.log(`  ✓ TaskResourceAllocation: ${tra.count}`);
  console.log(`  ✓ Task: ${tk.count}`);
  console.log(`  ✓ Project: ${pr.count}`);
  console.log(`  ✓ WaterSource: ${ws.count}`);

  // Invalidate caches so the next API request reflects the cleanup.
  try {
    const cache = await import("../src/cache.js");
    await cache.invalidate("boundaries:water-sources:*");
    await cache.invalidate("reports:*");
    await cache.disconnect();
    console.log("  ✓ cache invalidated");
  } catch {
    // no-op if cache module unavailable
  }

  console.log("\nKept: users, country/state/district/taluka/village, watershed hierarchy, resources.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
