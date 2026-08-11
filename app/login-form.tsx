"use client";

import { FormEvent, useState } from "react";

export default function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "No fue posible ingresar");
      window.location.reload();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "No fue posible ingresar");
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label>
        Usuario
        <select
          aria-label="Usuario"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        >
          <option value="" disabled>Selecciona tu usuario</option>
          <option value="bodega">Bodega</option>
          <option value="despacho">Despacho</option>
          <option value="miguel">Miguel Angel</option>
          <option value="daniela">Daniela Vasquez</option>
        </select>
      </label>
      <label>
        Clave
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Ingresa tu clave"
          required
        />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary login-button" type="submit" disabled={loading}>
        {loading ? "Ingresando…" : "Ingresar al inventario"}
      </button>
    </form>
  );
}
