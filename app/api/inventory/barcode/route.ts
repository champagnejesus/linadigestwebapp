import { eq, sql } from "drizzle-orm";
import { getCurrentAppUser } from "../../../access";
import { getDb } from "../../../../db";
import { products } from "../../../../db/schema";

export const dynamic = "force-dynamic";

function normalizeBarcode(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const { profile } = await getCurrentAppUser();
    if (!profile) {
      return Response.json({ error: "Debes iniciar sesión" }, { status: 401 });
    }
    if (!profile.canManageUsers) {
      return Response.json(
        { error: "Solo Miguel Angel o Daniela Vasquez pueden vincular el código de barras" },
        { status: 403 },
      );
    }

    const payload = (await request.json()) as { productId?: unknown; barcode?: unknown };
    const productId = Number(payload.productId);
    if (!Number.isInteger(productId) || productId < 1) {
      return Response.json({ error: "Producto no válido" }, { status: 400 });
    }
    const barcode = normalizeBarcode(payload.barcode);
    if (barcode.length < 4 || barcode.length > 64 || /[\u0000-\u001f\u007f]/.test(barcode)) {
      return Response.json({ error: "El código de barras no es válido" }, { status: 400 });
    }

    const db = await getDb();
    try {
      const [existing] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
      if (!existing) {
        return Response.json({ error: "Producto no encontrado" }, { status: 404 });
      }
      
      await db
        .update(products)
        .set({ barcode, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(products.id, productId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("UNIQUE")) {
        return Response.json(
          { error: "Ese código ya está vinculado a otro producto" },
          { status: 409 },
        );
      }
      throw error;
    }

    return Response.json({ ok: true, barcode });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible guardar el código";
    return Response.json({ error: message }, { status: 500 });
  }
}
