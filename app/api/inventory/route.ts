import { desc, eq, sql } from "drizzle-orm";
import { allowedActions, getCurrentAppUser, listAppUsers } from "../../access";
import { getDb } from "../../../db";
import { movements, products } from "../../../db/schema";

export const dynamic = "force-dynamic";

type MovementType = "entry" | "output";
const INITIAL_QUANTITY = 2029;

async function ensureInitialInventory() {
  const db = await getDb();
  await db
    .insert(products)
    .values({
      id: 1,
      name: "LinaDigest",
      sku: "LD-400G",
      stock: 1438,
      cost: 12000,
      price: 29990,
      minStock: 300,
      unit: "frasco 400 g",
    })
    .onConflictDoNothing();

  await db
    .insert(movements)
    .values({
      id: 1,
      productId: 1,
      type: "initial",
      quantity: INITIAL_QUANTITY,
      delta: INITIAL_QUANTITY,
      reason: "Stock inicial",
      note: "Inventario de apertura",
      userId: "system",
      userName: "Sistema LinaDigest",
    })
    .onConflictDoNothing();

  // Correct the opening quantity without changing the current available stock.
  await db
    .update(movements)
    .set({
      quantity: INITIAL_QUANTITY,
      delta: INITIAL_QUANTITY,
      note: "Cantidad inicial corregida; saldo disponible conservado",
    })
    .where(eq(movements.id, 1));
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Error inesperado";
  if (message.includes("no such table")) {
    return "La base de inventario se está preparando. Intenta nuevamente en unos segundos.";
  }
  return message;
}

function accessError(authenticated: boolean) {
  return Response.json(
    {
      error: authenticated
        ? "Tu cuenta todavía no está habilitada. Pide a un administrador que asigne tu correo a un perfil."
        : "Debes iniciar sesión para acceder al inventario.",
      code: authenticated ? "not_allowed" : "not_signed_in",
    },
    { status: authenticated ? 403 : 401 },
  );
}

export async function GET() {
  try {
    const { auth, profile } = await getCurrentAppUser();
    if (!profile) return accessError(Boolean(auth));

    await ensureInitialInventory();
    const db = await getDb();
    const [product] = await db.select().from(products).where(eq(products.id, 1));
    const history = await db
      .select()
      .from(movements)
      .where(eq(movements.productId, 1))
      .orderBy(desc(movements.createdAt), desc(movements.id))
      .limit(500);

    if (!product) {
      return Response.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const entries = history
      .filter((movement) => movement.type === "entry")
      .reduce((sum, movement) => sum + movement.quantity, 0);
    const outputs = history
      .filter((movement) => movement.type === "output")
      .reduce((sum, movement) => sum + movement.quantity, 0);
    const accounts = profile.canManageUsers ? await listAppUsers() : [];

    return Response.json({
      currentUser: {
        id: profile.id,
        name: profile.name,
        username: profile.username,
        role: profile.role,
        canViewCost: profile.canViewCost,
        canManageUsers: profile.canManageUsers,
        mustChangePassword: profile.mustChangePassword,
      },
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        stock: product.stock,
        initialStock: INITIAL_QUANTITY,
        cost: profile.canViewCost ? product.cost : null,
        price: product.price,
        minStock: product.minStock,
        unit: product.unit,
        stockValue: profile.canViewCost ? product.stock * product.cost : null,
        projectedMargin: profile.canViewCost
          ? product.stock * (product.price - product.cost)
          : null,
        updatedAt: product.updatedAt,
      },
      history,
      accounts,
      stats: { entries, outputs },
      permissions: {
        canViewCost: profile.canViewCost,
        canManageUsers: profile.canManageUsers,
        allowed: allowedActions(profile.role),
      },
    });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { auth, profile } = await getCurrentAppUser();
    if (!profile) return accessError(Boolean(auth));

    const payload = (await request.json()) as {
      type?: string;
      quantity?: number;
      reason?: string;
      lot?: string;
      expirationDate?: string;
      note?: string;
    };

    if (payload.type !== "entry" && payload.type !== "output") {
      return Response.json({ error: "Tipo de movimiento no válido" }, { status: 400 });
    }

    const type = payload.type as MovementType;
    if (!allowedActions(profile.role).includes(type)) {
      return Response.json(
        { error: "Tu perfil no tiene permiso para registrar ese movimiento" },
        { status: 403 },
      );
    }

    const quantity = Number(payload.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000000) {
      return Response.json({ error: "Ingresa una cantidad válida" }, { status: 400 });
    }

    await ensureInitialInventory();
    const db = await getDb();
    const [product] = await db.select().from(products).where(eq(products.id, 1));
    if (!product) {
      return Response.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const delta = type === "entry" ? quantity : -quantity;
    const newStock = product.stock + delta;
    if (newStock < 0) {
      return Response.json(
        { error: `Stock insuficiente. Disponibles: ${product.stock}` },
        { status: 409 },
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(products)
        .set({ stock: newStock, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(products.id, 1));
      await tx.insert(movements).values({
        productId: 1,
        type,
        quantity,
        delta,
        reason: payload.reason?.trim() || (type === "entry" ? "Entrada" : "Salida"),
        lot: payload.lot?.trim() || null,
        expirationDate: payload.expirationDate || null,
        note: payload.note?.trim() || null,
        userId: String(profile.id),
        userName: profile.name,
      });
    });

    return Response.json({ ok: true, stock: newStock }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
