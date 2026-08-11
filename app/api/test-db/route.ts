import { getDb } from "../../../db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    const result = await db.execute(sql`SELECT 1 as is_connected`);
    return Response.json({ 
      ok: true, 
      result, 
      dbUrl: (process.env.DATABASE_URL || "").replace(/:[^:@]+@/, ":***@") // Hide password 
    });
  } catch (error: any) {
    return Response.json({ 
      ok: false, 
      error: error.message, 
      code: error.code,
      stack: error.stack,
      dbUrl: (process.env.DATABASE_URL || "").replace(/:[^:@]+@/, ":***@") // Hide password 
    }, { status: 500 });
  }
}
