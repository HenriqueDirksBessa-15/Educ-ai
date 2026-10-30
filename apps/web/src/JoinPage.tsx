import type { StudentJoinResult } from "@educai/contracts";
import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";

import { ApiError, json, request } from "./api.js";

export const JOIN_HASH = "#/entrar";

// Off unless the build sets VITE_ENABLE_PUBLIC_JOIN=true (the API needs
// ENABLE_PUBLIC_JOIN=true too).
export function publicJoinEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_PUBLIC_JOIN === "true";
}

// The join page is public: it renders without a professor session.
export function useJoinRoute(): boolean {
  const isJoin = () =>
    publicJoinEnabled() && window.location.hash === JOIN_HASH;
  const [joining, setJoining] = useState(isJoin);
  useEffect(() => {
    const update = () => setJoining(isJoin());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return joining;
}

const resultText: Record<StudentJoinResult["status"], string> = {
  active: "Pronto! Você entrou na turma.",
  pending:
    "Recebemos seu pedido. O professor precisa confirmar sua entrada na turma.",
  restricted:
    "Você já está nesta turma, mas o professor restringiu seu acesso. Fale com ele.",
};

export function JoinPage() {
  const id = useId();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StudentJoinResult | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim() || !name.trim() || !email.trim()) {
      setError("Preencha o código da turma, seu nome e seu e-mail.");
      return;
    }
    if (!privacyAccepted) {
      setError("Leia o aviso de privacidade e marque que está de acordo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResult(
        await request<StudentJoinResult>(
          "/join",
          json("POST", {
            code: code.trim(),
            name: name.trim(),
            email: email.trim(),
            privacyAccepted: true,
          }),
        ),
      );
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.serverMessage
          ? failure.serverMessage
          : (failure as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };

  if (result)
    return (
      <section className="center-card" role="status">
        <h1>{result.className}</h1>
        <p>{resultText[result.status]}</p>
      </section>
    );

  return (
    <section className="center-card">
      <h1 id={`${id}-title`}>Entrar na turma</h1>
      <p>Use o código que o professor passou.</p>
      <form
        className="stacked-form"
        aria-labelledby={`${id}-title`}
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        <label>
          <span>Código da turma</span>
          <input
            value={code}
            autoComplete="off"
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
        <label>
          <span>Seu nome</span>
          <input
            value={name}
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          <span>Seu e-mail</span>
          <input
            type="email"
            value={email}
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <section aria-labelledby={`${id}-privacy`} className="notice">
          <strong id={`${id}-privacy`}>Aviso de privacidade</strong>
          <span>
            Usamos seu nome e seu e-mail só para o professor identificar você
            nesta turma e enviar atividades, notas e recados. Só o professor da
            turma vê esses dados, e eles não são compartilhados com outras
            pessoas. Para corrigir ou apagar seus dados, fale com o professor.
          </span>
        </section>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={privacyAccepted}
            onChange={(event) => setPrivacyAccepted(event.target.checked)}
          />
          Li o aviso de privacidade e estou de acordo
        </label>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? "Entrando…" : "Entrar na turma"}
        </button>
      </form>
    </section>
  );
}
