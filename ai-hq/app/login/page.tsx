"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    setBusy(false);
    if (r.ok) {
      const next = params.get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } else setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Erreur ${r.status}`);
  };

  return (
    <main className="login">
      <form className="card" onSubmit={submit}>
        <h1>AI HQ</h1>
        <p className="muted">Accès réservé. Connecte-toi pour piloter Gaspard et ton équipe d&apos;agents.</p>
        <label htmlFor="pwd">Mot de passe</label>
        <input id="pwd" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
        {error && (
          <p className="error small" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy || !password}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
