import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.use(requireRole("admin"));

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, googleSub: true, createdAt: true },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });
  res.json(users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    hasGoogle: Boolean(u.googleSub),
    createdAt: u.createdAt,
  })));
});

const createSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().max(200).optional(),
  role: z.nativeEnum(Role),
});

usersRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
  const lcEmail = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: lcEmail } });
  if (existing) return res.status(409).json({ error: "User with that email already exists" });

  const user = await prisma.user.create({
    data: {
      email: lcEmail,
      name: parsed.data.name?.trim() || lcEmail.split("@")[0],
      role: parsed.data.role,
    },
    select: { id: true, email: true, name: true, role: true },
  });
  res.status(201).json({ ...user, hasGoogle: false });
});

const updateSchema = z.object({
  role: z.nativeEnum(Role).optional(),
  name: z.string().min(1).max(200).optional(),
});

usersRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "User not found" });

  // Safety: can't demote the last admin
  if (parsed.data.role && parsed.data.role !== Role.admin && target.role === Role.admin) {
    const adminCount = await prisma.user.count({ where: { role: Role.admin } });
    if (adminCount <= 1) return res.status(400).json({ error: "Cannot demote the last admin" });
  }

  await prisma.user.update({ where: { id: req.params.id }, data: parsed.data });
  res.json({ ok: true });
});

usersRouter.delete("/:id", async (req, res) => {
  // Safety: can't delete your own account
  if (req.user!.sub === req.params.id) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "User not found" });

  // Safety: can't delete the last admin
  if (target.role === Role.admin) {
    const adminCount = await prisma.user.count({ where: { role: Role.admin } });
    if (adminCount <= 1) return res.status(400).json({ error: "Cannot delete the last admin" });
  }

  await prisma.user.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
