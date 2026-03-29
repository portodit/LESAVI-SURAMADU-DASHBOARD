import { Router, type IRouter } from "express";
import { db, masterCustomerTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../../shared/auth";

const router: IRouter = Router();

router.get("/corporate-customers", requireAuth, async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        ce->>'pelanggan'  AS nama,
        ce->>'nip'        AS nipnas,
        ce->>'lsegmen'    AS lsegmen,
        ce->>'ssegmen'    AS ssegmen,
        SUM((ce->>'realTotal')::numeric)    AS total_revenue,
        SUM((ce->>'targetTotal')::numeric)  AS total_target,
        COUNT(DISTINCT pd.id)              AS data_count
      FROM performance_data pd,
           jsonb_array_elements(pd.komponen_detail::jsonb) AS ce
      WHERE pd.komponen_detail IS NOT NULL
        AND pd.komponen_detail <> 'null'
        AND (ce->>'pelanggan') IS NOT NULL
        AND (ce->>'pelanggan') <> ''
        AND (ce->>'pelanggan') <> '–'
      GROUP BY ce->>'pelanggan', ce->>'nip', ce->>'lsegmen', ce->>'ssegmen'
      ORDER BY total_revenue DESC NULLS LAST
    `);

    const masterCustomers = await db.select().from(masterCustomerTable);
    const masterMap = new Map(masterCustomers.map(c => [c.nama, c]));

    const customers = (result.rows as any[]).map(row => {
      const master = masterMap.get(row.nama as string);
      return {
        nama:         row.nama as string,
        nipnas:       (row.nipnas as string) || null,
        segmen:       master?.segmen || (row.lsegmen as string) || null,
        ssegmen:      (row.ssegmen as string) || null,
        totalRevenue: parseFloat(row.total_revenue as string) || 0,
        totalTarget:  parseFloat(row.total_target as string) || 0,
      };
    });

    res.json({ customers, total: customers.length });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil data corporate customer" });
  }
});

export default router;
