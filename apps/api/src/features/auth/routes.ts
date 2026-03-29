import { Router, type IRouter } from "express";
import { db, accountManagersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { comparePassword, requireAuth } from "../../shared/auth";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email/NIK dan password wajib diisi" });
    return;
  }

  const identifier = String(email).trim();

  const [user] = await db
    .select()
    .from(accountManagersTable)
    .where(or(
      eq(accountManagersTable.email, identifier),
      eq(accountManagersTable.nik, identifier),
    ));

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Email/NIK atau password salah" });
    return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Email/NIK atau password salah" });
    return;
  }

  (req as any).session.userId = user.id;
  (req as any).session.userEmail = user.email;
  (req as any).session.userRole = user.role;
  (req as any).session.userNama = user.nama;
  (req as any).session.userTipe = user.tipe;

  res.json({ id: user.id, email: user.email, role: user.role, nama: user.nama, tipe: user.tipe });
});

router.post("/auth/logout", (req, res): void => {
  (req as any).session.destroy(() => {
    res.json({ message: "Logged out" });
  });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const session = (req as any).session;
  res.json({
    id: session.userId,
    email: session.userEmail,
    role: session.userRole,
    nama: session.userNama,
    tipe: session.userTipe,
  });
});

export default router;
