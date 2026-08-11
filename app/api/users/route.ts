import { eq, sql } from "drizzle-orm";
import { getCurrentAppUser, hashPassword, listAppUsers, setUserPassword, type AppRole } from "../../access";
import { getDb } from "../../../db";
import { appUsers } from "../../../db/schema";

export const dynamic = "force-dynamic";

const ROLES = ["admin", "warehouse", "dispatch", "viewer"] as const;

function normalizedUsername(value: unknown) {
  const username = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9._-]{3,32}$/.test(username) ? username : null;
}

function roleSettings(role: AppRole) {
  return {
    canViewCost: role === "admin",
    canManageUsers: role === "admin",
  };
}

async function requireManager() {
  const { auth, profile } = await getCurrentAppUser();
  if (!auth) {
    return { response: Response.json({ error: "Debes iniciar sesión" }, { status: 401 }) };
  }
  if (!profile?.canManageUsers) {
    return { response: Response.json({ error: "No tienes permiso para administrar usuarios" }, { status: 403 }) };
  }
  return { profile };
}

export async function GET() {
  try {
    const access = await requireManager();
    if ("response" in access) return access.response;
    return Response.json({ accounts: await listAppUsers() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar los usuarios" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireManager();
    if ("response" in access) return access.response;
    const payload = (await request.json()) as { name?: string; username?: string; password?: string; role?: string };
    const name = String(payload.name ?? "").trim();
    const username = normalizedUsername(payload.username);
    const password = String(payload.password ?? "");
    const role = ROLES.includes(payload.role as (typeof ROLES)[number])
      ? (payload.role as AppRole)
      : null;
    if (name.length < 2 || !username || !role || password.length < 8) {
      return Response.json({ error: "Completa nombre, usuario, perfil y una clave de al menos 8 caracteres" }, { status: 400 });
    }

    const db = await getDb();
    const settings = roleSettings(role);
    const credentials = await hashPassword(password);
    const result = await db.insert(appUsers).values({
      name,
      username,
      passwordHash: credentials.hash,
      passwordSalt: credentials.salt,
      mustChangePassword: true,
      role,
      ...settings,
      active: true,
      systemAccount: false,
    }).returning({ id: appUsers.id });
    const account = (await listAppUsers()).find((item) => item.id === result[0].id);
    return Response.json({ account }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible crear el usuario";
    return Response.json({ error: message.includes("UNIQUE") ? "Ese nombre de usuario ya está asignado" : message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireManager();
    if ("response" in access) return access.response;
    const payload = (await request.json()) as {
      id?: number;
      name?: string;
      username?: string;
      password?: string;
      role?: string;
      active?: boolean;
    };
    const id = Number(payload.id);
    const name = String(payload.name ?? "").trim();
    const username = normalizedUsername(payload.username);
    const password = String(payload.password ?? "");
    const role = ROLES.includes(payload.role as (typeof ROLES)[number])
      ? (payload.role as AppRole)
      : null;
    if (!Number.isInteger(id) || name.length < 2 || !username || !role || (password && password.length < 8)) {
      return Response.json({ error: "Completa nombre, usuario y perfil válidos; la clave nueva debe tener al menos 8 caracteres" }, { status: 400 });
    }

    const db = await getDb();
    const [existing] = await db.select().from(appUsers).where(eq(appUsers.id, id)).limit(1);
    if (!existing) return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (existing.systemAccount) {
      return Response.json({ error: "La cuenta propietaria no puede modificarse desde esta pantalla" }, { status: 400 });
    }

    const settings = roleSettings(role);
    const result = await db
      .update(appUsers)
      .set({
        name,
        username,
        role,
        ...settings,
        active: payload.active !== false,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(appUsers.id, id));
    if (password) await setUserPassword(id, password, true);
    const account = (await listAppUsers()).find((item) => item.id === id);
    return Response.json({ account });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible actualizar el usuario";
    return Response.json({ error: message.includes("UNIQUE") ? "Ese nombre de usuario ya está asignado" : message }, { status: 500 });
  }
}
