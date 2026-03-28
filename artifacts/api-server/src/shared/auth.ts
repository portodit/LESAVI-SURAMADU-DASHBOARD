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
  const existing = await db
    .select()
    .from(accountManagersTable)
    .where(eq(accountManagersTable.email, "bliaditdev@gmail.com"));

  if (existing.length === 0) {
    const hash = await hashPassword("admin123");
    await db.insert(accountManagersTable).values({
      nama: "Admin Officer",
      slug: "officer-bliaditdev",
      email: "bliaditdev@gmail.com",
      passwordHash: hash,
      role: "OFFICER",
      tipe: "LESA",
      divisi: "DPS",
      witel: "SURAMADU",
    });
  } else if (existing[0].role !== "OFFICER") {
    await db
      .update(accountManagersTable)
      .set({ role: "OFFICER", tipe: "LESA" })
      .where(eq(accountManagersTable.email, "bliaditdev@gmail.com"));
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const session = (req as any).session;
  if (!session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
