import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { Role } from "@prisma/client";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

function signToken(user: { id: string; email: string; role: Role }): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
  );
}

const dummyLoginSchema = z.object({ email: z.string().email() });

// Public meta endpoint so the frontend knows which login methods to render
// without leaking secrets.
authRouter.get("/methods", (_req, res) => {
  res.json({
    authMode: config.authMode,
    googleClientId: config.googleClientId || null,
  });
});

if (config.authMode === "dummy" || config.authMode === "both") {
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

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  });
}

if ((config.authMode === "google" || config.authMode === "both") && config.googleClientId) {
  const googleClient = new OAuth2Client();
  const googleSchema = z.object({ credential: z.string().min(20) });

  authRouter.post("/google", async (req, res) => {
    const parsed = googleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body" });
    }
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: parsed.data.credential,
        audience: config.googleClientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload?.email || !payload.email_verified) {
        return res.status(401).json({ error: "Google account email is not verified" });
      }
      const email = payload.email.toLowerCase();
      const sub = payload.sub;
      const name = payload.name ?? email.split("@")[0];

      // Upsert by googleSub; fall back to email if a dummy-seeded user already
      // exists with this email (so re-using admin@demo.local etc. doesn't break).
      let user = await prisma.user.findUnique({ where: { googleSub: sub } });
      if (!user) {
        const byEmail = await prisma.user.findUnique({ where: { email } });
        if (byEmail) {
          user = await prisma.user.update({
            where: { id: byEmail.id },
            data: { googleSub: sub, name: byEmail.name || name },
          });
        } else {
          const role = config.adminEmails.includes(email) ? Role.admin : Role.viewer;
          user = await prisma.user.create({
            data: { email, googleSub: sub, name, role },
          });
        }
      }

      const token = signToken(user);
      res.json({
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    } catch (e) {
      console.error("Google verify failed:", e);
      res.status(401).json({ error: "Invalid Google credential" });
    }
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
