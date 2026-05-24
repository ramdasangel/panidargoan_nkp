import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const dummyLoginSchema = z.object({ email: z.string().email() });

if (config.authMode === "dummy") {
  authRouter.get("/dummy/users", async (_req, res) => {
    const users = await prisma.user.findMany({
      select: { email: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
    res.json(users);
  });

  authRouter.post("/dummy", async (req, res) => {
    const parsed = dummyLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    }
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
    );
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  });
}

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});
