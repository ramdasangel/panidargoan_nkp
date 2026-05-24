import {
  PrismaClient, Role, WaterSourceType, ResourceType,
  ProjectStatus, TaskStatus, CostCategory, GeoTargetType,
} from "@prisma/client";

const prisma = new PrismaClient();

// Rough centroids (approximations) for placeholder boundaries.
// Real boundaries will be imported from DataMeet in a later slice.
type VillageSeed = { code: string; name: string; lat: number; lon: number; pop: number; cattle: number; sheepGoat: number; slope: number };

const ambegaonVillages: VillageSeed[] = [
  { code: "MH-PUN-AMB-001", name: "Ghodegaon",   lat: 19.115, lon: 73.886, pop: 5800, cattle: 420, sheepGoat: 310, slope: 6.5 },
  { code: "MH-PUN-AMB-002", name: "Manchar",     lat: 19.001, lon: 73.946, pop: 12500, cattle: 680, sheepGoat: 540, slope: 4.0 },
  { code: "MH-PUN-AMB-003", name: "Pargaon",     lat: 19.072, lon: 73.952, pop: 3200, cattle: 290, sheepGoat: 180, slope: 7.2 },
  { code: "MH-PUN-AMB-004", name: "Avsari Khurd",lat: 19.045, lon: 73.997, pop: 4100, cattle: 350, sheepGoat: 220, slope: 5.8 },
  { code: "MH-PUN-AMB-005", name: "Loni Dhamani",lat: 19.130, lon: 73.812, pop: 2700, cattle: 240, sheepGoat: 165, slope: 8.4 },
];

const shirurVillages: VillageSeed[] = [
  { code: "MH-PUN-SHR-001", name: "Shirur",     lat: 18.831, lon: 74.376, pop: 18200, cattle: 760, sheepGoat: 610, slope: 2.1 },
  { code: "MH-PUN-SHR-002", name: "Ranjangaon", lat: 18.760, lon: 74.247, pop: 9400,  cattle: 520, sheepGoat: 410, slope: 2.8 },
  { code: "MH-PUN-SHR-003", name: "Talegaon Dhamdhere", lat: 18.749, lon: 74.099, pop: 7100, cattle: 480, sheepGoat: 360, slope: 3.0 },
  { code: "MH-PUN-SHR-004", name: "Karde",      lat: 18.852, lon: 74.408, pop: 2400, cattle: 220, sheepGoat: 150, slope: 3.5 },
  { code: "MH-PUN-SHR-005", name: "Pabal",      lat: 18.835, lon: 74.057, pop: 6800, cattle: 460, sheepGoat: 340, slope: 2.6 },
];

// Build a rough rectangular polygon around a point (deg). Pure placeholder.
function rectAround(lat: number, lon: number, halfSizeDeg = 0.025): string {
  const w = lon - halfSizeDeg;
  const e = lon + halfSizeDeg;
  const s = lat - halfSizeDeg;
  const n = lat + halfSizeDeg;
  // MultiPolygon WKT
  return `MULTIPOLYGON(((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s})))`;
}

function unionBox(coords: VillageSeed[], pad = 0.05): string {
  const lats = coords.map((c) => c.lat);
  const lons = coords.map((c) => c.lon);
  const s = Math.min(...lats) - pad;
  const n = Math.max(...lats) + pad;
  const w = Math.min(...lons) - pad;
  const e = Math.max(...lons) + pad;
  return `MULTIPOLYGON(((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s})))`;
}

async function setBoundary(table: string, id: string, wkt: string) {
  await prisma.$executeRawUnsafe(
    `UPDATE "${table}" SET boundary = ST_GeogFromText($1) WHERE id = $2`,
    `SRID=4326;${wkt}`,
    id
  );
}

async function main() {
  console.log("Seeding users...");
  const users = [
    { email: "admin@demo.local",  name: "Admin User",        role: Role.admin },
    { email: "pm@demo.local",     name: "Project Manager",   role: Role.project_manager },
    { email: "field@demo.local",  name: "Field Worker",      role: Role.field_user },
    { email: "viewer@demo.local", name: "Viewer",            role: Role.viewer },
  ];
  for (const u of users) {
    await prisma.user.upsert({ where: { email: u.email }, update: {}, create: u });
  }

  console.log("Seeding admin hierarchy...");
  const country = await prisma.country.upsert({
    where: { code: "IN" },
    update: { name: "India" },
    create: { code: "IN", name: "India" },
  });

  const state = await prisma.state.upsert({
    where: { code: "MH" },
    update: { name: "Maharashtra", countryId: country.id },
    create: { code: "MH", name: "Maharashtra", countryId: country.id },
  });

  const district = await prisma.district.upsert({
    where: { code: "MH-PUN" },
    update: { name: "Pune", stateId: state.id },
    create: { code: "MH-PUN", name: "Pune", stateId: state.id },
  });

  const ambegaon = await prisma.taluka.upsert({
    where: { code: "MH-PUN-AMB" },
    update: { name: "Ambegaon", districtId: district.id },
    create: { code: "MH-PUN-AMB", name: "Ambegaon", districtId: district.id },
  });

  const shirur = await prisma.taluka.upsert({
    where: { code: "MH-PUN-SHR" },
    update: { name: "Shirur", districtId: district.id },
    create: { code: "MH-PUN-SHR", name: "Shirur", districtId: district.id },
  });

  console.log("Seeding villages with placeholder boundaries...");
  for (const v of [...ambegaonVillages, ...shirurVillages]) {
    const talukaId = v.code.startsWith("MH-PUN-AMB") ? ambegaon.id : shirur.id;
    const created = await prisma.village.upsert({
      where: { code: v.code },
      update: {
        name: v.name,
        talukaId,
        population: v.pop,
        cattleCount: v.cattle,
        sheepGoatCount: v.sheepGoat,
        otherLivestockCount: 0,
        avgSlopePercent: v.slope,
      },
      create: {
        code: v.code,
        name: v.name,
        talukaId,
        population: v.pop,
        cattleCount: v.cattle,
        sheepGoatCount: v.sheepGoat,
        otherLivestockCount: 0,
        avgSlopePercent: v.slope,
      },
    });
    await setBoundary("Village", created.id, rectAround(v.lat, v.lon));
  }

  console.log("Setting taluka & district placeholder boundaries...");
  await setBoundary("Taluka", ambegaon.id, unionBox(ambegaonVillages));
  await setBoundary("Taluka", shirur.id, unionBox(shirurVillages));
  await setBoundary("District", district.id, unionBox([...ambegaonVillages, ...shirurVillages], 0.15));

  console.log("Seeding watershed hierarchy (Bhima → Ghod)...");
  // All Ambegaon + Shirur villages drain into the Ghod river, a tributary of the Bhima.
  const bhima = await prisma.watershed.upsert({
    where: { code: "WS-BHIMA" },
    update: { name: "Bhima Basin", kind: "river_basin", level: 1, areaKm2: 48631 },
    create: { code: "WS-BHIMA", name: "Bhima Basin", kind: "river_basin", level: 1, areaKm2: 48631 },
  });
  await setBoundary("Watershed", bhima.id, unionBox([...ambegaonVillages, ...shirurVillages], 0.30));

  const ghod = await prisma.watershed.upsert({
    where: { code: "WS-BHIMA-GHOD" },
    update: { name: "Ghod Sub-basin", kind: "sub_basin", level: 2, parentId: bhima.id, areaKm2: 3608 },
    create: { code: "WS-BHIMA-GHOD", name: "Ghod Sub-basin", kind: "sub_basin", level: 2, parentId: bhima.id, areaKm2: 3608 },
  });
  await setBoundary("Watershed", ghod.id, unionBox([...ambegaonVillages, ...shirurVillages], 0.18));

  const ambegaonMicro = await prisma.watershed.upsert({
    where: { code: "WS-GHOD-MW-001" },
    update: { name: "Ambegaon Micro-watershed", kind: "micro_watershed", level: 5, parentId: ghod.id, areaKm2: 184 },
    create: { code: "WS-GHOD-MW-001", name: "Ambegaon Micro-watershed", kind: "micro_watershed", level: 5, parentId: ghod.id, areaKm2: 184 },
  });
  await setBoundary("Watershed", ambegaonMicro.id, unionBox(ambegaonVillages, 0.04));

  const shirurMicro = await prisma.watershed.upsert({
    where: { code: "WS-GHOD-MW-002" },
    update: { name: "Shirur Micro-watershed", kind: "micro_watershed", level: 5, parentId: ghod.id, areaKm2: 211 },
    create: { code: "WS-GHOD-MW-002", name: "Shirur Micro-watershed", kind: "micro_watershed", level: 5, parentId: ghod.id, areaKm2: 211 },
  });
  await setBoundary("Watershed", shirurMicro.id, unionBox(shirurVillages, 0.04));

  console.log("Seeding water sources...");
  type SourceSeed = {
    code: string;
    name: string;
    type: WaterSourceType;
    watershedId: string;
    capacityM3?: number;
    depthM?: number;
    condition?: string;
    wkt: string;
  };
  const sources: SourceSeed[] = [
    {
      code: "WS-SRC-001", name: "Ghod River (Ambegaon segment)", type: WaterSourceType.river,
      watershedId: ambegaonMicro.id, condition: "perennial",
      wkt: "LINESTRING(73.812 19.130, 73.886 19.115, 73.952 19.072, 73.997 19.045)",
    },
    {
      code: "WS-SRC-002", name: "Ghod River (Shirur segment)", type: WaterSourceType.river,
      watershedId: shirurMicro.id, condition: "perennial",
      wkt: "LINESTRING(74.057 18.835, 74.099 18.749, 74.247 18.760, 74.376 18.831, 74.450 18.886)",
    },
    {
      code: "WS-SRC-003", name: "Manchar Check Dam", type: WaterSourceType.check_dam,
      watershedId: ambegaonMicro.id, capacityM3: 45000, condition: "operational",
      wkt: "POINT(73.946 19.001)",
    },
    {
      code: "WS-SRC-004", name: "Pargaon Percolation Tank", type: WaterSourceType.percolation_tank,
      watershedId: ambegaonMicro.id, capacityM3: 28000, depthM: 4.5, condition: "operational",
      wkt: "POLYGON((73.949 19.069, 73.957 19.069, 73.957 19.076, 73.949 19.076, 73.949 19.069))",
    },
    {
      code: "WS-SRC-005", name: "Ranjangaon Borewell Cluster", type: WaterSourceType.borewell,
      watershedId: shirurMicro.id, depthM: 120, condition: "operational",
      wkt: "POINT(74.247 18.760)",
    },
    {
      code: "WS-SRC-006", name: "Pabal Farm Pond", type: WaterSourceType.farm_pond,
      watershedId: shirurMicro.id, capacityM3: 3200, depthM: 3.0, condition: "operational",
      wkt: "POLYGON((74.055 18.833, 74.060 18.833, 74.060 18.837, 74.055 18.837, 74.055 18.833))",
    },
    {
      code: "WS-SRC-007", name: "Karde Bandhara", type: WaterSourceType.bandhara,
      watershedId: shirurMicro.id, capacityM3: 18000, condition: "needs_repair",
      wkt: "POINT(74.450 18.886)",
    },
  ];

  for (const s of sources) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "WaterSource" (code, name, type, "watershedId", "capacityM3", "depthM", condition, geom)
       VALUES ($1, $2, $3::"WaterSourceType", $4, $5, $6, $7, ST_GeogFromText($8))
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         "watershedId" = EXCLUDED."watershedId",
         "capacityM3" = EXCLUDED."capacityM3",
         "depthM" = EXCLUDED."depthM",
         condition = EXCLUDED.condition,
         geom = EXCLUDED.geom`,
      s.code, s.name, s.type, s.watershedId,
      s.capacityM3 ?? null, s.depthM ?? null, s.condition ?? null,
      `SRID=4326;${s.wkt}`
    );
  }

  console.log("Seeding resources...");
  const resourceSeeds = [
    { code: "RES-001", name: "JCB Excavator",          type: ResourceType.equipment,   unit: "hour", rateInr: 1500 },
    { code: "RES-002", name: "Concrete M20",           type: ResourceType.material,    unit: "m3",   rateInr: 7200 },
    { code: "RES-003", name: "Cement bag 50kg",        type: ResourceType.material,    unit: "bag",  rateInr: 380 },
    { code: "RES-004", name: "Skilled labor",          type: ResourceType.labor_crew,  unit: "day",  rateInr: 700 },
    { code: "RES-005", name: "Unskilled labor",        type: ResourceType.labor_crew,  unit: "day",  rateInr: 400 },
    { code: "RES-006", name: "Site engineer",          type: ResourceType.person,      unit: "day",  rateInr: 2500 },
    { code: "RES-007", name: "Neem sapling",           type: ResourceType.material,    unit: "unit", rateInr: 35 },
  ];
  const resources = new Map<string, string>();
  for (const r of resourceSeeds) {
    const created = await prisma.resource.upsert({
      where: { code: r.code },
      update: { name: r.name, type: r.type, unit: r.unit, rateInr: r.rateInr },
      create: r,
    });
    resources.set(r.code, created.id);
  }

  const pmUser = await prisma.user.findUnique({ where: { email: "pm@demo.local" } });
  const fieldUser = await prisma.user.findUnique({ where: { email: "field@demo.local" } });

  // Look up seeded geo targets we'll link tasks to.
  const villages = await prisma.village.findMany({ select: { id: true, code: true } });
  const villageByCode = new Map(villages.map((v) => [v.code, v.id]));
  const waterSources = await prisma.waterSource.findMany({ select: { id: true, code: true } });
  const sourceByCode = new Map(waterSources.map((s) => [s.code, s.id]));
  const watersheds = await prisma.watershed.findMany({ select: { id: true, code: true } });
  const watershedByCode = new Map(watersheds.map((w) => [w.code, w.id]));

  console.log("Seeding projects, tasks, allocations, cost entries, and geo links...");

  type GeoLinkSeed =
    | { type: "village"; code: string }
    | { type: "water_source"; code: string }
    | { type: "watershed"; code: string };
  type AllocSeed = { resCode: string; qty: number };
  type CostSeed = { date: string; amount: number; category: CostCategory; vendor?: string; resCode?: string; qty?: number };
  type TaskSeed = {
    code: string;
    name: string;
    status: TaskStatus;
    startDate: string; endDate: string;
    actualStart?: string; actualEnd?: string;
    plannedCostInr: number;
    geoLinks: GeoLinkSeed[];
    allocations: AllocSeed[];
    costs: CostSeed[];
  };
  type ProjectSeed = {
    code: string; name: string; description: string;
    status: ProjectStatus; sponsor: string;
    startDate: string; endDate: string;
    budgetInr: number;
    tasks: TaskSeed[];
  };

  const projectSeeds: ProjectSeed[] = [
    {
      code: "PRJ-001",
      name: "Ambegaon Watershed Rejuvenation FY26",
      description: "Multi-village watershed treatment program: check dam, percolation tank, farm bunds, and capacity assessment.",
      status: ProjectStatus.active,
      sponsor: "MGNREGA + Pune ZP",
      startDate: "2026-04-01", endDate: "2026-12-31",
      budgetInr: 4_500_000,
      tasks: [
        {
          code: "TSK-001-01", name: "Manchar check dam construction",
          status: TaskStatus.in_progress,
          startDate: "2026-04-15", endDate: "2026-08-31", actualStart: "2026-04-20",
          plannedCostInr: 1_200_000,
          geoLinks: [
            { type: "water_source", code: "WS-SRC-003" },
            { type: "village", code: "MH-PUN-AMB-002" },
          ],
          allocations: [
            { resCode: "RES-001", qty: 120 },
            { resCode: "RES-002", qty: 95 },
            { resCode: "RES-004", qty: 80 },
            { resCode: "RES-005", qty: 200 },
          ],
          costs: [
            { date: "2026-04-22", amount: 180000, category: CostCategory.equipment, vendor: "Bharat Earthmovers", resCode: "RES-001", qty: 40 },
            { date: "2026-05-10", amount: 144000, category: CostCategory.materials, vendor: "UltraTech Cement", resCode: "RES-002", qty: 20 },
            { date: "2026-05-25", amount: 56000,  category: CostCategory.labor,     resCode: "RES-005", qty: 140 },
          ],
        },
        {
          code: "TSK-001-02", name: "Pargaon percolation tank desilting",
          status: TaskStatus.completed,
          startDate: "2026-04-10", endDate: "2026-05-30",
          actualStart: "2026-04-12", actualEnd: "2026-05-22",
          plannedCostInr: 280_000,
          geoLinks: [
            { type: "water_source", code: "WS-SRC-004" },
            { type: "village", code: "MH-PUN-AMB-003" },
          ],
          allocations: [
            { resCode: "RES-001", qty: 80 },
            { resCode: "RES-005", qty: 220 },
          ],
          costs: [
            { date: "2026-04-15", amount: 120000, category: CostCategory.equipment, vendor: "Bharat Earthmovers", resCode: "RES-001", qty: 80 },
            { date: "2026-05-05", amount: 88000,  category: CostCategory.labor,     resCode: "RES-005", qty: 220 },
            { date: "2026-05-20", amount: 72000,  category: CostCategory.transport, vendor: "Local trucking" },
          ],
        },
        {
          code: "TSK-001-03", name: "Ambegaon micro-watershed farm bund + plantation",
          status: TaskStatus.in_progress,
          startDate: "2026-06-01", endDate: "2026-11-30", actualStart: "2026-06-05",
          plannedCostInr: 850_000,
          geoLinks: [{ type: "watershed", code: "WS-GHOD-MW-001" }],
          allocations: [
            { resCode: "RES-005", qty: 800 },
            { resCode: "RES-007", qty: 6000 },
            { resCode: "RES-006", qty: 90 },
          ],
          costs: [
            { date: "2026-06-15", amount: 210000, category: CostCategory.materials, vendor: "Krishi Nursery", resCode: "RES-007", qty: 6000 },
            { date: "2026-07-10", amount: 80000,  category: CostCategory.labor,     resCode: "RES-005", qty: 200 },
            { date: "2026-08-01", amount: 30000,  category: CostCategory.overhead,  vendor: "Site supervision" },
          ],
        },
        {
          code: "TSK-001-04", name: "Ghodegaon village water audit",
          status: TaskStatus.completed,
          startDate: "2026-04-01", endDate: "2026-04-30",
          actualStart: "2026-04-02", actualEnd: "2026-04-28",
          plannedCostInr: 60_000,
          geoLinks: [{ type: "village", code: "MH-PUN-AMB-001" }],
          allocations: [{ resCode: "RES-006", qty: 22 }],
          costs: [
            { date: "2026-04-30", amount: 55000, category: CostCategory.labor, resCode: "RES-006", qty: 22 },
          ],
        },
      ],
    },
    {
      code: "PRJ-002",
      name: "Shirur Drought Mitigation 2026",
      description: "Bandhara repair, farm pond expansion, and contour bunding across Shirur micro-watershed.",
      status: ProjectStatus.active,
      sponsor: "Krishi Vibhag, GoM",
      startDate: "2026-03-01", endDate: "2026-11-30",
      budgetInr: 2_800_000,
      tasks: [
        {
          code: "TSK-002-01", name: "Karde bandhara repair",
          status: TaskStatus.in_progress,
          startDate: "2026-03-15", endDate: "2026-07-31", actualStart: "2026-03-20",
          plannedCostInr: 650_000,
          geoLinks: [
            { type: "water_source", code: "WS-SRC-007" },
            { type: "village", code: "MH-PUN-SHR-004" },
          ],
          allocations: [
            { resCode: "RES-001", qty: 60 },
            { resCode: "RES-002", qty: 45 },
            { resCode: "RES-005", qty: 180 },
          ],
          costs: [
            { date: "2026-04-01", amount: 90000,  category: CostCategory.equipment, vendor: "Bharat Earthmovers", resCode: "RES-001", qty: 60 },
            { date: "2026-04-25", amount: 252000, category: CostCategory.materials, vendor: "UltraTech Cement", resCode: "RES-002", qty: 35 },
            { date: "2026-06-05", amount: 68000,  category: CostCategory.labor,     resCode: "RES-005", qty: 170 },
          ],
        },
        {
          code: "TSK-002-02", name: "Pabal farm-pond network expansion",
          status: TaskStatus.completed,
          startDate: "2026-03-01", endDate: "2026-06-15",
          actualStart: "2026-03-08", actualEnd: "2026-06-10",
          plannedCostInr: 480_000,
          geoLinks: [
            { type: "water_source", code: "WS-SRC-006" },
            { type: "village", code: "MH-PUN-SHR-005" },
          ],
          allocations: [
            { resCode: "RES-001", qty: 140 },
            { resCode: "RES-005", qty: 320 },
          ],
          costs: [
            { date: "2026-03-30", amount: 210000, category: CostCategory.equipment, vendor: "Bharat Earthmovers", resCode: "RES-001", qty: 140 },
            { date: "2026-05-15", amount: 128000, category: CostCategory.labor,     resCode: "RES-005", qty: 320 },
            { date: "2026-06-05", amount: 95000,  category: CostCategory.materials, vendor: "Hardware Mart" },
          ],
        },
        {
          code: "TSK-002-03", name: "Shirur micro-watershed contour bunding",
          status: TaskStatus.in_progress,
          startDate: "2026-05-01", endDate: "2026-10-31", actualStart: "2026-05-12",
          plannedCostInr: 1_100_000,
          geoLinks: [{ type: "watershed", code: "WS-GHOD-MW-002" }],
          allocations: [
            { resCode: "RES-001", qty: 200 },
            { resCode: "RES-005", qty: 950 },
            { resCode: "RES-006", qty: 110 },
          ],
          costs: [
            { date: "2026-05-20", amount: 180000, category: CostCategory.equipment, vendor: "Bharat Earthmovers", resCode: "RES-001", qty: 120 },
            { date: "2026-06-30", amount: 105000, category: CostCategory.labor,     resCode: "RES-005", qty: 260 },
          ],
        },
      ],
    },
  ];

  for (const ps of projectSeeds) {
    const project = await prisma.project.upsert({
      where: { code: ps.code },
      update: {
        name: ps.name, description: ps.description, status: ps.status, sponsor: ps.sponsor,
        startDate: new Date(ps.startDate), endDate: new Date(ps.endDate),
        budgetInr: ps.budgetInr, createdById: pmUser?.id,
      },
      create: {
        code: ps.code, name: ps.name, description: ps.description, status: ps.status, sponsor: ps.sponsor,
        startDate: new Date(ps.startDate), endDate: new Date(ps.endDate),
        budgetInr: ps.budgetInr, createdById: pmUser?.id,
      },
    });

    for (const ts of ps.tasks) {
      const task = await prisma.task.upsert({
        where: { code: ts.code },
        update: {
          name: ts.name, projectId: project.id, status: ts.status,
          startDate: new Date(ts.startDate), endDate: new Date(ts.endDate),
          actualStart: ts.actualStart ? new Date(ts.actualStart) : null,
          actualEnd: ts.actualEnd ? new Date(ts.actualEnd) : null,
          plannedCostInr: ts.plannedCostInr, assigneeId: fieldUser?.id,
        },
        create: {
          code: ts.code, name: ts.name, projectId: project.id, status: ts.status,
          startDate: new Date(ts.startDate), endDate: new Date(ts.endDate),
          actualStart: ts.actualStart ? new Date(ts.actualStart) : null,
          actualEnd: ts.actualEnd ? new Date(ts.actualEnd) : null,
          plannedCostInr: ts.plannedCostInr, assigneeId: fieldUser?.id,
        },
      });

      await prisma.taskGeoLink.deleteMany({ where: { taskId: task.id } });
      for (const g of ts.geoLinks) {
        if (g.type === "village") {
          const vid = villageByCode.get(g.code);
          if (vid) await prisma.taskGeoLink.create({ data: { taskId: task.id, targetType: GeoTargetType.village, villageId: vid } });
        } else if (g.type === "water_source") {
          const sid = sourceByCode.get(g.code);
          if (sid) await prisma.taskGeoLink.create({ data: { taskId: task.id, targetType: GeoTargetType.water_source, waterSourceId: sid } });
        } else if (g.type === "watershed") {
          const wid = watershedByCode.get(g.code);
          if (wid) await prisma.taskGeoLink.create({ data: { taskId: task.id, targetType: GeoTargetType.watershed, watershedId: wid } });
        }
      }

      await prisma.taskResourceAllocation.deleteMany({ where: { taskId: task.id } });
      for (const a of ts.allocations) {
        const rid = resources.get(a.resCode);
        const rate = resourceSeeds.find((r) => r.code === a.resCode)!.rateInr;
        if (rid) {
          await prisma.taskResourceAllocation.create({
            data: { taskId: task.id, resourceId: rid, plannedQuantity: a.qty, plannedUnitRateInr: rate },
          });
        }
      }

      await prisma.costEntry.deleteMany({ where: { taskId: task.id } });
      for (const c of ts.costs) {
        const rid = c.resCode ? resources.get(c.resCode) : undefined;
        const rate = c.resCode ? resourceSeeds.find((r) => r.code === c.resCode)!.rateInr : undefined;
        await prisma.costEntry.create({
          data: {
            taskId: task.id, resourceId: rid ?? null,
            entryDate: new Date(c.date),
            quantity: c.qty ?? null,
            unitRateInr: rate ?? null,
            amountInr: c.amount, category: c.category, vendor: c.vendor ?? null,
            recordedById: fieldUser?.id,
          },
        });
      }
    }
  }

  console.log("Seed complete.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
