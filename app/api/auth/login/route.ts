import { authenticateUser } from "../../../access";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { username?: string; password?: string };
    const username = String(payload.username ?? "").trim();
    const password = String(payload.password ?? "");
    if (!username || !password || password.length > 200) {
      return Response.json({ error: "Ingresa tu usuario y clave" }, { status: 400 });
    }
    const result = await authenticateUser(username, password);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ ok: true, mustChangePassword: result.profile.mustChangePassword });
  } catch (error) {
    console.error("LinaDigest login failed", error);
    return Response.json({ error: "No fue posible iniciar sesión" }, { status: 500 });
  }
}
