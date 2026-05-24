import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const adminRouter = Router();

adminRouter.use(requireAuth);

adminRouter.get("/states", async (_req, res) => {
  const states = await prisma.state.findMany({
    select: { id: true, code: true, name: true, countryId: true },
    orderBy: { name: "asc" },
  });
  res.json(states);
});

adminRouter.get("/districts", async (req, res) => {
  const stateId = typeof req.query.stateId === "string" ? req.query.stateId : undefined;
  const districts = await prisma.district.findMany({
    where: stateId ? { stateId } : undefined,
    select: { id: true, code: true, name: true, stateId: true },
    orderBy: { name: "asc" },
  });
  res.json(districts);
});

adminRouter.get("/talukas", async (req, res) => {
  const districtId = typeof req.query.districtId === "string" ? req.query.districtId : undefined;
  const talukas = await prisma.taluka.findMany({
    where: districtId ? { districtId } : undefined,
    select: { id: true, code: true, name: true, districtId: true },
    orderBy: { name: "asc" },
  });
  res.json(talukas);
});

adminRouter.get("/villages", async (req, res) => {
  const talukaId = typeof req.query.talukaId === "string" ? req.query.talukaId : undefined;
  const villages = await prisma.village.findMany({
    where: talukaId ? { talukaId } : undefined,
    select: {
      id: true,
      code: true,
      name: true,
      talukaId: true,
      population: true,
      cattleCount: true,
      sheepGoatCount: true,
      otherLivestockCount: true,
      avgSlopePercent: true,
    },
    orderBy: { name: "asc" },
  });
  res.json(villages);
});

adminRouter.get("/villages/:id", async (req, res) => {
  const village = await prisma.village.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      code: true,
      name: true,
      talukaId: true,
      population: true,
      cattleCount: true,
      sheepGoatCount: true,
      otherLivestockCount: true,
      avgSlopePercent: true,
    },
  });
  if (!village) return res.status(404).json({ error: "Village not found" });
  res.json(village);
});
