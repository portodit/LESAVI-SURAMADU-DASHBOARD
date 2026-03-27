import { Router, type IRouter } from "express";
import { db, accountManagersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../../shared/auth";
import { slugify } from "../import/excel";

const router: IRouter = Router();

router.get("/am", requireAuth, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  const ams = await db.select().from(accountManagersTable).orderBy(accountManagersTable.nama);
  res.json(ams.map(am => ({
    ...am,
    telegramConnected: !!am.telegramChatId,
    createdAt: am.createdAt.toISOString(),
  })));
});

router.post("/am", requireAuth, async (req, res): Promise<void> => {
  const { nik, nama, role, divisi, segmen, witel, telegramChatId, kpiActivity } = req.body;
  if (!nik || !nama) {
    res.status(400).json({ error: "NIK dan nama wajib diisi" });
    return;
  }
  const resolvedRole = (role === "MANAGER" ? "MANAGER" : "AM");
  if (resolvedRole === "AM" && !divisi) {
    res.status(400).json({ error: "Divisi wajib diisi untuk role AM" });
    return;
  }

  const slug = slugify(nama);
  const [am] = await db.insert(accountManagersTable).values({
    nik, nama, slug, role: resolvedRole,
    divisi: divisi || "DPS",
    segmen: segmen || null,
    witel: witel || "SURAMADU",
    telegramChatId: telegramChatId || null,
    kpiActivity: kpiActivity || 30,
  }).returning();

  res.status(201).json({ ...am, telegramConnected: !!am.telegramChatId, createdAt: am.createdAt.toISOString() });
});

router.get("/am/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [am] = await db.select().from(accountManagersTable).where(eq(accountManagersTable.id, id));
  if (!am) { res.status(404).json({ error: "AM tidak ditemukan" }); return; }
  res.json({ ...am, telegramConnected: !!am.telegramChatId, createdAt: am.createdAt.toISOString() });
});

router.patch("/am/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { nama, role, divisi, segmen, witel, telegramChatId, kpiActivity } = req.body;

  const updates: Partial<typeof accountManagersTable.$inferInsert> = {};
  if (nama !== undefined) { updates.nama = nama; updates.slug = slugify(nama); }
  if (role !== undefined) updates.role = role === "MANAGER" ? "MANAGER" : "AM";
  if (divisi !== undefined) updates.divisi = divisi;
  if (segmen !== undefined) updates.segmen = segmen;
  if (witel !== undefined) updates.witel = witel;
  if (telegramChatId !== undefined) updates.telegramChatId = telegramChatId;
  if (kpiActivity !== undefined) updates.kpiActivity = kpiActivity;

  const [am] = await db.update(accountManagersTable).set(updates).where(eq(accountManagersTable.id, id)).returning();
  if (!am) { res.status(404).json({ error: "AM tidak ditemukan" }); return; }
  res.json({ ...am, telegramConnected: !!am.telegramChatId, createdAt: am.createdAt.toISOString() });
});

router.delete("/am/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(accountManagersTable).where(eq(accountManagersTable.id, id));
  res.sendStatus(204);
});

export default router;
