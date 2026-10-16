import type { Identity, ProfessorProfile } from "@educai/contracts";
import { useCallback, useEffect, useId, useState } from "react";

import { json, request } from "./api.js";
import { formatDate } from "./labels.js";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api";

type Notice = { kind: "ok" | "error"; text: string } | null;

function NoticeMessage({ value }: { value: Notice }) {
  if (!value) return null;
  return value.kind === "error" ? (
    <p className="notice error" role="alert">
      {value.text}
    </p>
  ) : (
    <p className="form-message" role="status">
      {value.text}
    </p>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return `${parts[0]?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

// The API requires this exact word; typing it avoids a deletion by accident.
const DELETE_WORD = "EXCLUIR";

export function AccountPage({
  identity,
  loggingOut,
  onLogout,
  onNameChange,
  onDeleted,
}: {
  identity: Identity;
  loggingOut: boolean;
  onLogout: () => void;
  onNameChange: (name: string) => void;
  onDeleted: () => void;
}) {
  const id = useId();
  const [profile, setProfile] = useState<ProfessorProfile | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [name, setName] = useState(identity.displayName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const data = await request<ProfessorProfile>("/profile");
      // A malformed answer must not break the page the teacher signs out from.
      if (typeof data?.displayName !== "string" || !data.createdAt)
        throw new Error("profile");
      setProfile(data);
      setName(data.displayName);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Escreva seu nome.");
      return;
    }
    setNameError(null);
    setSavingName(true);
    setNotice(null);
    try {
      const data = await request<ProfessorProfile>(
        "/profile",
        json("PATCH", { displayName: trimmed }),
      );
      setProfile(data);
      setName(data.displayName);
      onNameChange(data.displayName);
      setNotice({ kind: "ok", text: "Nome atualizado." });
    } catch (error) {
      setNotice({ kind: "error", text: (error as Error).message });
    } finally {
      setSavingName(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await request("/privacy/account", {
        ...json("DELETE", { confirmation: DELETE_WORD }),
      });
      onDeleted();
    } catch {
      setDeleteError(
        "Não foi possível excluir sua conta agora. Tente de novo.",
      );
    } finally {
      setDeleting(false);
    }
  };

  const typedCorrectly = confirmText.trim().toUpperCase() === DELETE_WORD;
  const shownName = profile?.displayName ?? identity.displayName;

  return (
    <>
      <NoticeMessage value={notice} />

      <section
        className="timeline-panel stacked-form"
        aria-labelledby={`${id}-dados`}
      >
        <h2 id={`${id}-dados`}>Seus dados</h2>
        {loadFailed && (
          <div className="notice error" role="alert">
            <span>Não conseguimos carregar seus dados agora.</span>
            <button type="button" onClick={() => void load()}>
              Tentar de novo
            </button>
          </div>
        )}
        <div className="account-identity">
          {profile?.profileImageUrl ? (
            <img
              className="avatar large"
              src={profile.profileImageUrl}
              alt=""
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="avatar large" aria-hidden="true">
              {initials(shownName)}
            </span>
          )}
          <div>
            <strong className="card-title">{shownName}</strong>
            <span className="muted-line">
              {profile?.email ?? identity.email}
            </span>
            {profile && (
              <span className="muted-line">
                No EDUC.AI desde {formatDate(profile.createdAt)}
              </span>
            )}
          </div>
        </div>
        <p className="muted-line">
          O e-mail vem da sua conta do Google e não pode ser trocado aqui.
        </p>
        {profile && (
          <>
            <div className="field">
              <label>
                <span>Seu nome</span>
                <input
                  value={name}
                  maxLength={100}
                  onChange={(event) => {
                    setName(event.target.value);
                    setNameError(null);
                  }}
                  {...(nameError
                    ? { "aria-invalid": true, "aria-describedby": `${id}-nome` }
                    : {})}
                />
              </label>
              {nameError && (
                <span className="field-error" id={`${id}-nome`}>
                  {nameError}
                </span>
              )}
            </div>
            <div className="inline-actions">
              <button
                type="button"
                disabled={savingName}
                onClick={() => void saveName()}
              >
                {savingName ? "Salvando…" : "Salvar nome"}
              </button>
            </div>
          </>
        )}
      </section>

      <section
        className="timeline-panel stacked-form"
        aria-labelledby={`${id}-sair`}
      >
        <h2 id={`${id}-sair`}>Sair do EDUC.AI</h2>
        <p className="muted-line">
          Use quando terminar, principalmente em computadores da escola.
        </p>
        <div className="inline-actions">
          <button
            type="button"
            className="secondary-action"
            disabled={loggingOut}
            onClick={onLogout}
          >
            {loggingOut ? "Saindo…" : "Sair"}
          </button>
        </div>
      </section>

      <section
        className="timeline-panel stacked-form"
        aria-labelledby={`${id}-copia`}
      >
        <h2 id={`${id}-copia`}>Cópia dos seus dados</h2>
        <p className="muted-line">
          Um arquivo com seu perfil, turmas, planos, atividades, recados e
          boletins. Senhas e chaves de acesso nunca vão no arquivo.
        </p>
        <div className="inline-actions">
          <a className="secondary-action" href={`${apiBaseUrl}/privacy/export`}>
            Baixar uma cópia dos meus dados
          </a>
        </div>
      </section>

      <section
        className="timeline-panel stacked-form danger-zone"
        aria-labelledby={`${id}-excluir`}
      >
        <h2 id={`${id}-excluir`}>Excluir minha conta</h2>
        <p className="muted-line">
          Seu acesso é removido e seu nome sai do EDUC.AI. Notas e correções já
          entregues aos alunos continuam guardadas, sem o seu nome. Isso não
          pode ser desfeito.
        </p>
        {!deleteOpen ? (
          <div className="inline-actions">
            <button
              type="button"
              className="danger-action"
              onClick={() => setDeleteOpen(true)}
            >
              Excluir minha conta
            </button>
          </div>
        ) : (
          <>
            <div className="field">
              <label>
                <span>Para confirmar, digite {DELETE_WORD}</span>
                <input
                  value={confirmText}
                  autoComplete="off"
                  onChange={(event) => setConfirmText(event.target.value)}
                />
              </label>
            </div>
            {deleteError && (
              <p className="notice error" role="alert">
                {deleteError}
              </p>
            )}
            <div className="inline-actions">
              <button
                type="button"
                className="secondary-action"
                onClick={() => {
                  setDeleteOpen(false);
                  setConfirmText("");
                  setDeleteError(null);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-action"
                disabled={!typedCorrectly || deleting}
                onClick={() => void deleteAccount()}
              >
                {deleting ? "Excluindo…" : "Excluir minha conta para sempre"}
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
