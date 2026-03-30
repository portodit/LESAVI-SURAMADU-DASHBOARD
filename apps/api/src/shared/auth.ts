import bcrypt from "bcryptjs";
import { db, accountManagersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function ensureDefaultAdmin(): Promise<void> {
  const OFFICER_EMAIL = "bliadiitdev@gmail.com";
  const OFFICER_NIK   = "160203";

  const existing = await db
    .select()
    .from(accountManagersTable)
    .where(eq(accountManagersTable.email, OFFICER_EMAIL));

  if (existing.length === 0) {
    // Cek apakah ada entry dengan NIK yang sama (email lama mungkin berbeda)
    const byNik = await db
      .select()
      .from(accountManagersTable)
      .where(eq(accountManagersTable.nik, OFFICER_NIK));

    if (byNik.length > 0) {
      const hash = byNik[0].passwordHash ?? await hashPassword("admin123");
      await db
        .update(accountManagersTable)
        .set({ email: OFFICER_EMAIL, role: "OFFICER", passwordHash: hash })
        .where(eq(accountManagersTable.nik, OFFICER_NIK));
    } else {
      const hash = await hashPassword("admin123");
      await db.insert(accountManagersTable).values({
        nik: OFFICER_NIK,
        nama: "Admin Officer",
        slug: "officer-bliadiitdev",
        email: OFFICER_EMAIL,
        passwordHash: hash,
        role: "OFFICER",
        tipe: "LESA",
        divisi: "DPS",
        witel: "SURAMADU",
      });
    }
  } else {
    const rec = existing[0];
    const needsUpdate = rec.role !== "OFFICER" || !rec.passwordHash || rec.nik !== OFFICER_NIK;
    if (needsUpdate) {
      const hash = rec.passwordHash ?? await hashPassword("admin123");
      await db
        .update(accountManagersTable)
        .set({ role: "OFFICER", nik: OFFICER_NIK, passwordHash: hash })
        .where(eq(accountManagersTable.email, OFFICER_EMAIL));
    }
  }
}

/**
 * Middleware: pastikan user sudah login.
 * Menyuntikkan req.user dari sesi agar route handler bisa baca role.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const session = (req as any).session;
  if (!session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).user = {
    id: session.userId,
    email: session.userEmail,
    role: session.userRole,
    nama: session.userNama,
    tipe: session.userTipe,
  };
  next();
}

/**
 * Middleware: hanya MANAGER dan OFFICER yang boleh mengakses.
 * Role "AM" hanya bisa melihat halaman presentasi, bukan dashboard penuh.
 * Harus dipasang SETELAH requireAuth.
 */
export function requireManagerOrOfficer(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!["OFFICER", "MANAGER"].includes(user.role)) {
    res.status(403).json({ error: "Akses ditolak. Hanya Manager dan Officer yang dapat mengakses fitur ini." });
    return;
  }
  next();
}
