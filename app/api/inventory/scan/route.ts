import { eq, sql } from "drizzle-orm";
import { allowedActions, getCurrentAppUser } from "../../../access";
import { getDb } from "../../../../db";
import { movements, products } from "../../../../db/schema";

export const dynamic = "force-dynamic";

function normalizeBarcode(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function currentStock(productId: number) {
  const db = await getDb();
  const [product] = await db
    .select({ stock: products.stock })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  return product?.stock ?? 0;
}

export async function POST(request: Request) {
  try {
    const { profile } = await getCurrentAppUser();
    if (!profile) {
      return Response.json({ error: "Debes iniciar sesión" }, { status: 401 });
    }
    if (!allowedActions(profile.role).includes("output")) {
      return Response.json(
        { error: "Tu perfil no tiene permiso para descontar productos" },
        { status: 403 },
      );
    }

    const payload = (await request.json()) as { barcode?: unknown; scanId?: unknown };
    const barcode = normalizeBarcode(payload.barcode);
    const scanId = typeof payload.scanId === "string" ? payload.scanId.trim() : "";
    if (barcode.length < 4 || barcode.length > 64 || /[\u0000-\u001f\u007f]/.test(barcode)) {
      return Response.json({ error: "Código de barras no válido" }, { status: 400 });
    }
    if (!/^scan-[a-zA-Z0-9-]{8,100}$/.test(scanId)) {
      return Response.json({ error: "Identificador de lectura no válido" }, { status: 400 });
    }

    const db = await getDb();
    const [existingScan] = await db
      .select({ productId: movements.productId })
      .from(movements)
      .where(eq(movements.reference, scanId))
      .limit(1);
    if (existingScan) {
      return Response.json({
        ok: true,
        duplicate: true,
        stock: await currentStock(existingScan.productId),
      });
    }

    const [product] = await db
      .select({ id: products.id, name: products.name, stock: products.stock })
      .from(products)
      .where(eq(products.barcode, barcode))
      .limit(1);

    if (!product) {
      return Response.json(
        { error: "Código no reconocido. Revisa el código vinculado a LinaDigest.", code: "unknown_barcode" },
        { status: 404 },
      );
    }
    if (product.stock < 1) {
      return Response.json({ error: "No queda stock disponible", code: "out_of_stock" }, { status: 409 });
    }

    try {
      await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ id: products.id, stock: products.stock })
          .from(products)
          .where(eq(products.id, product.id))
          .limit(1);

        if (!current || current.stock < 1) {
          throw new Error("out_of_stock");
        }

        const [existingMovement] = await tx
          .select({ id: movements.id })
          .from(movements)
          .where(eq(movements.reference, scanId))
          .limit(1);

        if (existingMovement) return;

        await tx.insert(movements).values({
          productId: product.id,
          type: "output",
          quantity: 1,
          delta: -1,
          reason: "Salida por escáner",
          note: `Código ${barcode}`,
          source: "scanner",
          reference: scanId,
          userId: String(profile.id),
          userName: profile.name,
        });

        await tx.update(products)
          .set({ stock: current.stock - 1, updatedAt: sql`CURRENT_TIMESTAMP` })
          .where(eq(products.id, product.id));
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "out_of_stock") {
         return Response.json({ error: "No queda stock disponible", code: "out_of_stock" }, { status: 409 });
      }
      throw e;
    }

    const [recordedScan] = await db
      .select({ productId: movements.productId })
      .from(movements)
      .where(eq(movements.reference, scanId))
      .limit(1);
    if (!recordedScan) {
      return Response.json({ error: "No queda stock disponible", code: "out_of_stock" }, { status: 409 });
    }

    return Response.json({
      ok: true,
      product: product.name,
      stock: await currentStock(product.id),
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible registrar la lectura";
    return Response.json({ error: message }, { status: 500 });
  }
}
