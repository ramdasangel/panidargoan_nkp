import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { cached, invalidate } from "../cache.js";

export const watershedsRouter = Router();

watershedsRouter.use(requireAuth);

const patchSchema = z.object({ name: z.string().min(1).max(120).trim() });

watershedsRouter.patch("/:id", requireRole("admin"), async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });

  const existing = await prisma.watershed.findUnique({
    where: { id: req.params.id },
    select: { id: true, code: true },
  });
  if (!existing) return res.status(404).json({ error: "Watershed not found" });

  const updated = await prisma.watershed.update({
    where: { id: req.params.id },
    data: { name: parsed.data.name },
    select: { id: true, code: true, name: true, kind: true, level: true, parentId: true, areaKm2: true },
  });

  // Bust the cached tree + boundaries so the new name shows up immediately.
  await invalidate("watersheds:*");
  await invalidate("boundaries:watersheds*");
  res.json(updated);
});

watershedsRouter.get("/", async (req, res) => {
  const parentId = typeof req.query.parentId === "string" ? req.query.parentId : undefined;
  const level = typeof req.query.level === "string" ? Number(req.query.level) : undefined;
  const items = await prisma.watershed.findMany({
    where: {
      ...(parentId !== undefined ? { parentId: parentId === "null" ? null : parentId } : {}),
      ...(level !== undefined && !Number.isNaN(level) ? { level } : {}),
    },
    select: { id: true, code: true, name: true, kind: true, level: true, parentId: true, areaKm2: true },
    orderBy: [{ level: "asc" }, { name: "asc" }],
  });
  res.json(items);
});

// ?root=<code> filters the tree to a subtree rooted at the watershed with
// the given code. Default = full tree. The sidebar passes
// root=WS-UPPER-BHIMA to scope visibility to the project area.
watershedsRouter.get("/tree", async (req, res) => {
  const rootCode = typeof req.query.root === "string" ? req.query.root : null;
  const cacheKey = `watersheds:tree:${rootCode ?? "all"}`;

  const tree = await cached(cacheKey, 3600, async () => {
    const all = await prisma.watershed.findMany({
      select: { id: true, code: true, name: true, kind: true, level: true, parentId: true, areaKm2: true },
      orderBy: [{ level: "asc" }, { name: "asc" }],
    });

    type Node = (typeof all)[number] & { children: Node[] };
    const byId = new Map<string, Node>();
    for (const w of all) byId.set(w.id, { ...w, children: [] });

    const roots: Node[] = [];
    for (const node of byId.values()) {
      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    if (!rootCode) return roots;
    const found = all.find((w) => w.code === rootCode);
    if (!found) return [];
    return [byId.get(found.id)!];
  });
  res.json(tree);
});

watershedsRouter.get("/:id", async (req, res) => {
  const item = await prisma.watershed.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, code: true, name: true, kind: true, level: true,
      parentId: true, areaKm2: true,
    },
  });
  if (!item) return res.status(404).json({ error: "Watershed not found" });
  res.json(item);
});

watershedsRouter.get("/:id/descendants", async (req, res) => {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; code: string; name: string; kind: string; level: number; parent_id: string | null; depth: number }>
  >(
    `WITH RECURSIVE tree AS (
       SELECT id, code, name, kind, level, "parentId", 0 AS depth FROM "Watershed" WHERE id = $1
       UNION ALL
       SELECT w.id, w.code, w.name, w.kind, w.level, w."parentId", t.depth + 1
         FROM "Watershed" w JOIN tree t ON w."parentId" = t.id
     )
     SELECT id, code, name, kind, level, "parentId" AS parent_id, depth FROM tree ORDER BY depth, name`,
    req.params.id
  );
  res.json(rows);
});
