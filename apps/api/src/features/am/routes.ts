import { Router, type IRouter } from "express";
import { db, accountManagersTable, pendingAmDiscoveriesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../../shared/auth";
import { slugify } from "../import/excel";

const router: IRouter = Router();

router.get("/am", requireAuth, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  const ams = await db.select().from(accountManagersTable).orderBy(accountManagersTable.nama);
  res.json(ams.map(am => ({
    ...am,
    passwordHash: undefined,
    telegramConnected: !!am.telegramChatId,
    createdAt: am.createdAt.toISOString(),
  })));
});

router.post("/am", requireAuth, async (req, res): Promise<void> => {
  const { nik, nama, role, tipe, divisi, segmen, witel, email, telegramChatId, kpiActivity } = req.body;
  if (!nama) {
    res.status(400).json({ error: "Nama wajib diisi" });
    return;
  }

  const resolvedRole = (["OFFICER", "MANAGER", "AM"].includes(role) ? role : "AM") as "OFFICER" | "MANAGER" | "AM";
  const resolvedTipe = (["LESA", "GOVT"].includes(tipe) ? tipe : "LESA") as "LESA" | "GOVT";

  if (resolvedRole === "AM" && !divisi) {
    res.status(400).json({ error: "Divisi wajib diisi untuk role AM" });
    return;
  }
  if (!nik && resolvedRole !== "OFFICER") {
    res.status(400).json({ error: "NIK wajib diisi" });
    return;
  }

  const slug = slugify(nama) + "-" + Date.now().toString(36);

  const [am] = await db.insert(accountManagersTable).values({
    nik: nik || null,
    nama,
    slug,
    email: email || null,
    role: resolvedRole,
    tipe: resolvedTipe,
    divisi: divisi || "DPS",
    segmen: segmen || null,
    witel: witel || "SURAMADU",
    telegramChatId: telegramChatId || null,
    kpiActivity: resolvedRole === "AM" ? (kpiActivity || 30) : 0,
  }).returning();

  res.status(201).json({ ...am, passwordHash: undefined, telegramConnected: !!am.telegramChatId, createdAt: am.createdAt.toISOString() });
});

// ── Pending AM Discoveries (MUST be before /am/:id to avoid param conflict) ──

router.get("/am/pending-discoveries", requireAuth, async (req, res): Promise<void> => {
  const list = await db.select().from(pendingAmDiscoveriesTable)
    .orderBy(desc(pendingAmDiscoveriesTable.createdAt));
  res.json(list.map(r => ({ ...r, createdAt: r.createdAt.toISOString(), reviewedAt: r.reviewedAt?.toISOString() || null })));
});

router.post("/am/pending-discoveries/:id/approve", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const user = (req as any).user;
  if (!user || !["OFFICER", "MANAGER"].includes(user.role)) {
    res.status(403).json({ error: "Hanya Officer atau Manager yang dapat menyetujui" });
    return;
  }

  const [discovery] = await db.select().from(pendingAmDiscoveriesTable).where(eq(pendingAmDiscoveriesTable.id, id));
  if (!discovery) { res.status(404).json({ error: "Data tidak ditemukan" }); return; }
  if (discovery.status !== "pending") { res.status(409).json({ error: "Data sudah diproses sebelumnya" }); return; }

  await db.insert(accountManagersTable).values({
    nik: discovery.nik,
    nama: discovery.nama,
    slug: slugify(discovery.nama) + "-" + Date.now().toString(36),
    divisi: discovery.divisi || "DPS",
    witel: discovery.witel || "SURAMADU",
    role: "AM",
    aktif: true,
  }).onConflictDoNothing();

  const [updated] = await db.update(pendingAmDiscoveriesTable)
    .set({ status: "approved", reviewedBy: user.id, reviewedAt: new Date() })
    .where(eq(pendingAmDiscoveriesTable.id, id))
    .returning();

  res.json({ ...updated, createdAt: updated.createdAt.toISOString(), reviewedAt: updated.reviewedAt?.toISOString() || null });
});

router.post("/am/pending-discoveries/:id/reject", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const user = (req as any).user;
  if (!user || !["OFFICER", "MANAGER"].includes(user.role)) {
    res.status(403).json({ error: "Hanya Officer atau Manager yang dapat menolak" });
    return;
  }

  const [discovery] = await db.select().from(pendingAmDiscoveriesTable).where(eq(pendingAmDiscoveriesTable.id, id));
  if (!discovery) { res.status(404).json({ error: "Data tidak ditemukan" }); return; }
  if (discovery.status !== "pending") { res.status(409).json({ error: "Data sudah diproses sebelumnya" }); return; }

  const [updated] = await db.update(pendingAmDiscoveriesTable)
    .set({ status: "rejected", reviewedBy: user.id, reviewedAt: new Date() })
    .where(eq(pendingAmDiscoveriesTable.id, id))
    .returning();

  res.json({ ...updated, createdAt: updated.createdAt.toISOString(), reviewedAt: updated.reviewedAt?.toISOString() || null });
});

// ── Individual AM CRUD ────────────────────────────────────────────────────────

router.get("/am/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [am] = await db.select().from(accountManagersTable).where(eq(accountManagersTable.id, id));
  if (!am) { res.status(404).json({ error: "Anggota tidak ditemukan" }); return; }
  res.json({ ...am, passwordHash: undefined, telegramConnected: !!am.telegramChatId, createdAt: am.createdAt.toISOString() });
});

router.patch("/am/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { nama, role, tipe, divisi, segmen, witel, telegramChatId, kpiActivity, email } = req.body;

  const updates: Partial<typeof accountManagersTable.$inferInsert> = {};
  if (nama !== undefined) { updates.nama = nama; updates.slug = slugify(nama) + "-" + Date.now().toString(36); }
  if (role !== undefined) updates.role = ["OFFICER", "MANAGER", "AM"].includes(role) ? role : "AM";
  if (tipe !== undefined) updates.tipe = ["LESA", "GOVT"].includes(tipe) ? tipe : "LESA";
  if (divisi !== undefined) updates.divisi = divisi;
  if (segmen !== undefined) updates.segmen = segmen;
  if (witel !== undefined) updates.witel = witel;
  if (telegramChatId !== undefined) updates.telegramChatId = telegramChatId;
  if (kpiActivity !== undefined) updates.kpiActivity = kpiActivity;
  if (email !== undefined) updates.email = email || null;

  const [am] = await db.update(accountManagersTable).set(updates).where(eq(accountManagersTable.id, id)).returning();
  if (!am) { res.status(404).json({ error: "Anggota tidak ditemukan" }); return; }
  res.json({ ...am, passwordHash: undefined, telegramConnected: !!am.telegramChatId, createdAt: am.createdAt.toISOString() });
});

router.delete("/am/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(accountManagersTable).where(eq(accountManagersTable.id, id));
  res.sendStatus(204);
});

export default router;
