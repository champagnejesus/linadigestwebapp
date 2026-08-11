import { desc, eq } from "drizzle-orm";
import { getCurrentAppUser } from "../../../access";
import { getDb } from "../../../../db";
import { movements } from "../../../../db/schema";

export const dynamic = "force-dynamic";

const MOVEMENT_TYPES = new Set(["initial", "entry", "output"]);

export async function GET(request: Request) {
  try {
    const { profile } = await getCurrentAppUser();
    if (!profile) {
      return Response.json({ error: "Debes iniciar sesión para exportar movimientos." }, { status: 401 });
    }

    const requestedType = new URL(request.url).searchParams.get("type");
    const db = await getDb();
    const baseQuery = db
      .select()
      .from(movements)
      .where(eq(movements.productId, 1))
      .orderBy(desc(movements.createdAt), desc(movements.id));
    const history = await baseQuery;
    const filteredHistory = requestedType && MOVEMENT_TYPES.has(requestedType)
      ? history.filter((movement) => movement.type === requestedType)
      : history;

    return Response.json({ history: filteredHistory });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No fue posible preparar la exportación" },
      { status: 500 },
    );
  }
}
