import { asc, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "../db";
import { appSessions, appUsers } from "../db/schema";

export type AppRole = "owner" | "admin" | "warehouse" | "dispatch" | "viewer";

export type AppUserProfile = {
  id: number;
  name: string;
  username: string | null;
  role: AppRole;
  canViewCost: boolean;
  canManageUsers: boolean;
  active: boolean;
  systemAccount: boolean;
  mustChangePassword: boolean;
};

const BOOTSTRAP_USERS = [
  {
    id: 101,
    name: "Bodega",
    username: "bodega",
    passwordEnv: "LINADIGEST_PASSWORD_BODEGA",
    role: "warehouse" as const,
    canViewCost: false,
    canManageUsers: false,
    active: true,
    systemAccount: false,
  },
  {
    id: 102,
    name: "Despacho",
    username: "despacho",
    passwordEnv: "LINADIGEST_PASSWORD_DESPACHO",
    role: "dispatch" as const,
    canViewCost: false,
    canManageUsers: false,
    active: true,
    systemAccount: false,
  },
  {
    id: 103,
    name: "Miguel Angel",
    username: "miguel",
    passwordEnv: "LINADIGEST_PASSWORD_MIGUEL",
    role: "admin" as const,
    canViewCost: true,
    canManageUsers: true,
    active: true,
    systemAccount: false,
  },
  {
    id: 104,
    name: "Daniela Vasquez",
    username: "daniela",
    passwordEnv: "LINADIGEST_PASSWORD_DANIELA",
    role: "admin" as const,
    canViewCost: true,
    canManageUsers: true,
    active: true,
    systemAccount: false,
  },
];

const SESSION_COOKIE = "linadigest_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
// Cloudflare Workers Web Crypto accepts PBKDF2 iteration counts up to 100,000.
// Keeping this value at the platform maximum lets temporary and user-created
// passwords be hashed consistently in production.
const PASSWORD_ITERATIONS = 100_000;

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function hashPassword(password: string, suppliedSalt?: string) {
  const salt = suppliedSalt
    ? base64UrlToBytes(suppliedSalt)
    : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS },
    key,
    256,
  );
  return { hash: bytesToBase64Url(new Uint8Array(bits)), salt: bytesToBase64Url(salt) };
}

async function passwordMatches(password: string, expectedHash: string, salt: string) {
  const calculated = await hashPassword(password, salt);
  if (calculated.hash.length !== expectedHash.length) return false;
  let difference = 0;
  for (let index = 0; index < calculated.hash.length; index += 1) {
    difference |= calculated.hash.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  }
  return difference === 0;
}

function toProfile(user: typeof appUsers.$inferSelect): AppUserProfile {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    canViewCost: user.canViewCost,
    canManageUsers: user.canManageUsers,
    active: user.active,
    systemAccount: user.systemAccount,
    mustChangePassword: user.mustChangePassword,
  };
}

export async function ensureAppUsers() {
  const db = await getDb();
  for (const user of BOOTSTRAP_USERS) {
    await db
      .insert(appUsers)
      .values({
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        canViewCost: user.canViewCost,
        canManageUsers: user.canManageUsers,
        active: user.active,
        systemAccount: user.systemAccount,
      })
      .onConflictDoNothing();

    const [existing] = await db.select().from(appUsers).where(eq(appUsers.id, user.id)).limit(1);
    if (!existing) continue;
    const updates: Partial<typeof appUsers.$inferInsert> = {};
    if (!existing.username) updates.username = user.username;
    const temporaryPassword = String(process.env[user.passwordEnv] || user.username || "");
    if (temporaryPassword && (!existing.passwordHash || !existing.passwordSalt || existing.mustChangePassword)) {
      const credentials = await hashPassword(temporaryPassword);
      updates.passwordHash = credentials.hash;
      updates.passwordSalt = credentials.salt;
      updates.mustChangePassword = true;
      updates.active = true;
      updates.failedLoginAttempts = 0;
      updates.lockedUntil = null;
    }
    if (Object.keys(updates).length) {
      await db
        .update(appUsers)
        .set({ ...updates, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(appUsers.id, user.id));
    }
  }
}

export async function getCurrentAppUser(): Promise<{
  auth: { sessionId: string; userId: number } | null;
  profile: AppUserProfile | null;
}> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { auth: null, profile: null };

  await ensureAppUsers();
  const db = await getDb();
  const sessionId = await sha256(token);
  const [session] = await db.select().from(appSessions).where(eq(appSessions.id, sessionId)).limit(1);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    if (session) await db.delete(appSessions).where(eq(appSessions.id, sessionId));
    return { auth: null, profile: null };
  }
  const [user] = await db.select().from(appUsers).where(eq(appUsers.id, session.userId)).limit(1);
  if (!user || !user.active) return { auth: null, profile: null };
  return { auth: { sessionId, userId: user.id }, profile: toProfile(user) };
}

export async function authenticateUser(usernameInput: string, password: string) {
  await ensureAppUsers();
  const db = await getDb();
  const username = usernameInput.trim().toLowerCase();
  const [user] = await db.select().from(appUsers).where(eq(appUsers.username, username)).limit(1);
  const genericError = "Usuario o clave incorrectos";
  if (!user || !user.active || !user.passwordHash || !user.passwordSalt) {
    await hashPassword(password || "invalid-password");
    return { ok: false as const, error: genericError, status: 401 };
  }

  const lockExpiresAt = user.lockedUntil ? new Date(user.lockedUntil).getTime() : 0;
  if (lockExpiresAt > Date.now()) {
    return { ok: false as const, error: "Acceso bloqueado temporalmente. Intenta nuevamente en 15 minutos.", status: 429 };
  }

  if (!(await passwordMatches(password, user.passwordHash, user.passwordSalt))) {
    const attempts = user.failedLoginAttempts + 1;
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await db
      .update(appUsers)
      .set({ failedLoginAttempts: attempts >= 5 ? 0 : attempts, lockedUntil, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(appUsers.id, user.id));
    return { ok: false as const, error: genericError, status: 401 };
  }

  await db
    .update(appUsers)
    .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: sql`CURRENT_TIMESTAMP`, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(appUsers.id, user.id));
  await createSession(user.id);
  return { ok: true as const, profile: toProfile(user) };
}

async function createSession(userId: number) {
  const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const id = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const db = await getDb();
  await db.insert(appSessions).values({ id, userId, expiresAt });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function signOutCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(appSessions).where(eq(appSessions.id, await sha256(token)));
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function setUserPassword(userId: number, password: string, mustChangePassword = false) {
  const credentials = await hashPassword(password);
  const db = await getDb();
  await db
    .update(appUsers)
    .set({
      passwordHash: credentials.hash,
      passwordSalt: credentials.salt,
      mustChangePassword,
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(appUsers.id, userId));
}

export async function listAppUsers() {
  await ensureAppUsers();
  const db = await getDb();
  return db
    .select({
      id: appUsers.id,
      name: appUsers.name,
      username: appUsers.username,
      role: appUsers.role,
      canViewCost: appUsers.canViewCost,
      canManageUsers: appUsers.canManageUsers,
      active: appUsers.active,
      systemAccount: appUsers.systemAccount,
      mustChangePassword: appUsers.mustChangePassword,
    })
    .from(appUsers)
    .orderBy(asc(appUsers.id));
}

export function allowedActions(role: AppRole): readonly ("entry" | "output")[] {
  if (role === "warehouse") return ["entry"];
  if (role === "dispatch") return ["output"];
  if (role === "admin" || role === "owner") return ["entry", "output"];
  return [];
}
