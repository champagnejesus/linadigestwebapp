import { signOutCurrentUser } from "../../../access";

export const dynamic = "force-dynamic";

export async function POST() {
  await signOutCurrentUser();
  return Response.json({ ok: true });
}
