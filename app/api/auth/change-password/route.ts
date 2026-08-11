import { getCurrentAppUser, setUserPassword } from "../../../access";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { profile } = await getCurrentAppUser();
  if (!profile) return Response.json({ error: "Debes iniciar sesión" }, { status: 401 });
  const payload = (await request.json()) as { password?: string; confirmation?: string };
  const password = String(payload.password ?? "");
  const confirmation = String(payload.confirmation ?? "");
  if (password.length < 8 || password.length > 100) {
    return Response.json({ error: "La nueva clave debe tener al menos 8 caracteres" }, { status: 400 });
  }
  if (password !== confirmation) {
    return Response.json({ error: "Las claves no coinciden" }, { status: 400 });
  }
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(password) || !/\d/.test(password)) {
    return Response.json({ error: "Usa al menos una letra y un número" }, { status: 400 });
  }
  await setUserPassword(profile.id, password, false);
  return Response.json({ ok: true });
}
