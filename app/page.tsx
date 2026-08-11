import InventoryApp from "./inventory-app";
import { getCurrentAppUser } from "./access";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { profile } = await getCurrentAppUser();

  if (!profile) {
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="login-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/linadigest-logo-corporativo.png" alt="LinaDigest" />
          </div>
          <p className="login-kicker">INVENTARIO CENTRALIZADO</p>
          <h1>Control LinaDigest</h1>
          <p>Ingresa con tu usuario y clave de LinaDigest desde cualquier celular o computador.</p>
          <LoginForm />
          <small>Cada movimiento quedará asociado a tu usuario.</small>
        </section>
      </main>
    );
  }

  return <InventoryApp session={{
    name: profile.name,
    username: profile.username ?? "usuario",
    mustChangePassword: profile.mustChangePassword,
  }} />;
}
