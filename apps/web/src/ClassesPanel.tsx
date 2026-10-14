import type {
  ClassDetail,
  ClassSummary,
  EducationStage,
} from "@educai/contracts";
import { useState } from "react";
import type { FormEvent } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api";

type DataEnvelope<T> = { data: T };

export function ClassesPanel({
  classes,
  reload,
}: {
  classes: ClassSummary[];
  reload: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<ClassDetail | null>(null);
  const [name, setName] = useState("");
  const [schoolYear, setSchoolYear] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [stage, setStage] = useState<EducationStage>("elementary_2");
  const [components, setComponents] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const request = async (url: string, init: RequestInit = {}) => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`${apiBaseUrl}${url}`, {
        credentials: "include",
        ...init,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message || "Operação não concluída.");
      }
      return response;
    } finally {
      setSaving(false);
    }
  };

  const loadDetail = async (classId: string) => {
    try {
      const response = await request(`/classes/${classId}`);
      const body = (await response.json()) as DataEnvelope<ClassDetail>;
      setSelected(body.data);
      setSchoolYear(body.data.curriculum?.schoolYear ?? body.data.schoolYear);
      setStage(body.data.curriculum?.educationStage ?? "elementary_2");
      setComponents(
        body.data.curriculum?.curricularComponents.join(", ") ?? "",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Falha ao abrir turma.",
      );
    }
  };

  const createClass = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await request("/classes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          schoolYear,
          localAccessCode: accessCode,
        }),
      });
      setName("");
      setSchoolYear("");
      setAccessCode("");
      await reload();
      setMessage("Turma local criada.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Falha ao criar turma.",
      );
    }
  };

  const action = async (url: string, success: string) => {
    try {
      await request(url, { method: "POST" });
      await reload();
      if (selected) await loadDetail(selected.id);
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operação falhou.");
    }
  };

  const saveCurriculum = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const curricularComponents = components
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    try {
      await request(`/classes/${selected.id}/curriculum`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          educationStage: stage,
          schoolYear,
          curricularComponents,
        }),
      });
      await reload();
      await loadDetail(selected.id);
      setMessage("Perfil curricular salvo.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Falha ao salvar currículo.",
      );
    }
  };

  return (
    <section className="timeline-panel" aria-labelledby="classes-title">
      <div className="status-heading">
        <div>
          <span className="section-label">Ciclo vertical · Etapa A</span>
          <h2 id="classes-title">Turmas e alunos</h2>
        </div>
        <button
          type="button"
          className="secondary-action compact-action"
          disabled={saving}
          onClick={() =>
            void action("/classes/sync", "Turmas do Classroom sincronizadas.")
          }
        >
          Importar Classroom
        </button>
      </div>
      <div className="plans-layout">
        <div>
          <h3>Suas turmas</h3>
          {classes.length === 0 ? (
            <p className="empty-state">Nenhuma turma cadastrada.</p>
          ) : (
            <ul className="resource-list">
              {classes.map((group) => (
                <li key={group.id}>
                  <strong>{group.name}</strong>
                  <span>{group.schoolYear}</span>
                  <small>Origem: {group.source}</small>
                  <button
                    type="button"
                    className="secondary-action compact-action"
                    onClick={() => void loadDetail(group.id)}
                  >
                    Abrir turma
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <form
          className="plan-form"
          onSubmit={(event) => void createClass(event)}
        >
          <h3>Nova turma local</h3>
          <label>
            Nome
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Ano/série
            <input
              value={schoolYear}
              onChange={(event) => setSchoolYear(event.target.value)}
              placeholder="Ex.: 8º ano EF"
            />
          </label>
          <label>
            Código de acesso
            <input
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              minLength={4}
            />
          </label>
          <button
            type="submit"
            disabled={
              saving ||
              !name.trim() ||
              !schoolYear.trim() ||
              accessCode.length < 4
            }
          >
            Criar turma
          </button>
        </form>
      </div>
      {selected && (
        <div className="plan-comparison">
          <article>
            <span className="section-label">Turma selecionada</span>
            <h3>{selected.name}</h3>
            <p>{selected.description || "Sem descrição."}</p>
            <p>{selected.students.length} alunos sincronizados.</p>
            <div className="inline-actions">
              {selected.source === "local" && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void action(
                      `/classes/${selected.id}/google`,
                      "Turma publicada no Classroom.",
                    )
                  }
                >
                  Publicar no Classroom
                </button>
              )}
              {selected.source === "google" && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void action(
                      `/classes/${selected.id}/students/sync`,
                      "Alunos sincronizados.",
                    )
                  }
                >
                  Sincronizar alunos
                </button>
              )}
            </div>
          </article>
          <form onSubmit={(event) => void saveCurriculum(event)}>
            <span className="section-label">Perfil curricular EDUC.AI</span>
            <label>
              Etapa
              <select
                value={stage}
                onChange={(event) =>
                  setStage(event.target.value as EducationStage)
                }
              >
                <option value="early_childhood">Educação infantil</option>
                <option value="elementary_1">Ensino fundamental I</option>
                <option value="elementary_2">Ensino fundamental II</option>
                <option value="high_school">Ensino médio</option>
              </select>
            </label>
            <label>
              Ano/série
              <input
                value={schoolYear}
                onChange={(event) => setSchoolYear(event.target.value)}
              />
            </label>
            <label>
              Componentes curriculares (separados por vírgula)
              <input
                value={components}
                onChange={(event) => setComponents(event.target.value)}
                placeholder="Matemática, Ciências"
              />
            </label>
            <button
              type="submit"
              disabled={saving || !schoolYear.trim() || !components.trim()}
            >
              Salvar perfil curricular
            </button>
          </form>
        </div>
      )}
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
