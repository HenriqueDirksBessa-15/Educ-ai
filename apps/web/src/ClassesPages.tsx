import type {
  ClassDetail,
  ClassRemoval,
  ClassSummary,
  EducationStage,
} from "@educai/contracts";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";

import { json, request } from "./api.js";
import { useConfirm } from "./ConfirmDialog.js";
import {
  loadCatalog,
  schoolYearLabel,
  type Catalog,
} from "./curriculumCatalog.js";
import { classSourceLabel, enrollmentStatusLabel } from "./labels.js";
import { routeHref } from "./router.js";

type Feedback = { kind: "ok" | "error"; text: string } | null;

function FeedbackMessage({ value }: { value: Feedback }) {
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

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

// Text stored as the class's own year (max 20 characters); the BNCC value
// lives in the curriculum profile.
function classYearText(schoolYear: string): string {
  if (schoolYear.startsWith("ef-ano-")) return schoolYearLabel(schoolYear);
  if (schoolYear.startsWith("em-")) return "Ensino médio";
  return "Educação infantil";
}

/* ----------------------------- Class list ----------------------------- */

export function ClassListPage({
  classes,
  reload,
}: {
  classes: ClassSummary[];
  reload: () => Promise<void>;
}) {
  const [details, setDetails] = useState<Record<string, ClassDetail>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [archived, setArchived] = useState<ClassSummary[] | null>(null);

  const toggleArchived = async () => {
    if (archived) {
      setArchived(null);
      return;
    }
    try {
      setArchived(await request<ClassSummary[]>("/classes?archived=true"));
    } catch (error) {
      setFeedback({ kind: "error", text: (error as Error).message });
    }
  };

  useEffect(() => {
    let active = true;
    // Each class is read on its own; one failure only hides that subject.
    void Promise.all(
      classes.slice(0, 30).map((group) =>
        request<ClassDetail>(`/classes/${group.id}`).then(
          (detail) => [group.id, detail] as const,
          () => null,
        ),
      ),
    ).then((entries) => {
      if (!active) return;
      setDetails(
        Object.fromEntries(
          entries.filter((entry): entry is NonNullable<typeof entry> =>
            Boolean(entry),
          ),
        ),
      );
    });
    return () => {
      active = false;
    };
  }, [classes]);

  const syncFromGoogle = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await request<{ imported: number }>("/classes/sync", {
        method: "POST",
      });
      await reload();
      setFeedback({
        kind: "ok",
        text: `${plural(result.imported, "turma trazida", "turmas trazidas")} do Google Sala de Aula.`,
      });
    } catch (error) {
      setFeedback({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="inline-actions page-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => void syncFromGoogle()}
        >
          {busy
            ? "Trazendo turmas…"
            : "Trazer minhas turmas do Google Sala de Aula"}
        </button>
        <a className="secondary-action" href={routeHref("nova-turma")}>
          + Criar turma no EDUC.AI
        </a>
      </div>
      <FeedbackMessage value={feedback} />
      {classes.length === 0 ? (
        <p className="empty-state">
          Você ainda não tem turmas. Traga suas turmas do Google Sala de Aula ou
          crie uma no EDUC.AI.
        </p>
      ) : (
        <ul className="card-list">
          {classes.map((group) => {
            const curriculum = details[group.id]?.curriculum;
            const subject = curriculum?.curricularComponents[0];
            return (
              <li key={group.id} className="card-row">
                <div>
                  <strong className="card-title">{group.name}</strong>
                  <span className="muted-line">
                    {classSourceLabel(group.source)}
                  </span>
                  {details[group.id] &&
                    (subject && curriculum ? (
                      <span className="tag">
                        {subject} · {schoolYearLabel(curriculum.schoolYear)}
                      </span>
                    ) : (
                      <span className="tag warn">Matéria não definida</span>
                    ))}
                </div>
                <a
                  className="secondary-action"
                  href={routeHref("turmas", group.id)}
                >
                  Abrir {group.name}
                </a>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        className="secondary-action"
        onClick={() => void toggleArchived()}
      >
        {archived ? "Esconder turmas arquivadas" : "Ver turmas arquivadas"}
      </button>
      {archived &&
        (archived.length === 0 ? (
          <p className="empty-state">Nenhuma turma arquivada.</p>
        ) : (
          <ul className="card-list" aria-label="Turmas arquivadas">
            {archived.map((group) => (
              <li key={group.id} className="card-row">
                <div>
                  <strong className="card-title">{group.name}</strong>
                  <span className="tag">Arquivada</span>
                </div>
                <a
                  className="secondary-action"
                  href={routeHref("turmas", group.id)}
                >
                  Abrir {group.name}
                </a>
              </li>
            ))}
          </ul>
        ))}
    </>
  );
}

/* -------------------------- Curriculum fields ------------------------- */

type Profile = { stage: EducationStage | ""; year: string; subject: string };
type ProfileErrors = Partial<Record<keyof Profile, string>>;

function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    loadCatalog().then(setCatalog, () => setFailed(true));
  }, []);
  useEffect(load, [load]);
  return { catalog, failed, retry: load };
}

function CatalogStatus({
  catalog,
  failed,
  retry,
}: ReturnType<typeof useCatalog>) {
  if (failed)
    return (
      <div className="notice error" role="alert">
        <span>
          Não conseguimos carregar a lista de matérias. Tente de novo.
        </span>
        <button type="button" onClick={retry}>
          Tentar de novo
        </button>
      </div>
    );
  if (catalog && catalog.stages.length === 0)
    return (
      <p className="notice warning" role="alert">
        A BNCC ainda não foi carregada neste ambiente. Avise o suporte.
      </p>
    );
  return null;
}

function CurriculumFields({
  catalog,
  value,
  errors,
  onChange,
}: {
  catalog: Catalog;
  value: Profile;
  errors: ProfileErrors;
  onChange: (value: Profile) => void;
}) {
  const id = useId();
  const stage = catalog.stages.find((item) => item.value === value.stage);
  const years = stage?.years ?? [];
  const year = years.find((item) => item.value === value.year);
  const subjects = year?.subjects ?? [];
  const yearKnown = !value.year || Boolean(year);
  const subjectKnown = !value.subject || subjects.includes(value.subject);

  const describe = (field: keyof Profile) =>
    errors[field]
      ? { "aria-invalid": true as const, "aria-describedby": `${id}-${field}` }
      : {};
  const error = (field: keyof Profile) =>
    errors[field] && (
      <span className="field-error" id={`${id}-${field}`}>
        {errors[field]}
      </span>
    );

  return (
    <>
      <div className="field">
        <label>
          <span>
            Etapa <span aria-hidden="true">*</span>
          </span>
          <select
            value={value.stage}
            onChange={(event) =>
              onChange({
                stage: event.target.value as EducationStage,
                year: "",
                subject: "",
              })
            }
            {...describe("stage")}
          >
            <option value="">Escolha a etapa</option>
            {catalog.stages.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {error("stage")}
      </div>
      <div className="field">
        <label>
          <span>
            Ano <span aria-hidden="true">*</span>
          </span>
          <select
            value={value.year}
            disabled={!stage}
            onChange={(event) =>
              onChange({ ...value, year: event.target.value, subject: "" })
            }
            {...describe("year")}
          >
            <option value="">Escolha o ano</option>
            {!yearKnown && (
              <option value={value.year}>
                {schoolYearLabel(value.year)} (atual)
              </option>
            )}
            {years.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {error("year")}
      </div>
      <fieldset
        className="field choice-group"
        {...(errors.subject ? { "aria-describedby": `${id}-subject` } : {})}
      >
        <legend>
          Matéria desta turma <span aria-hidden="true">*</span>
        </legend>
        {!year && yearKnown ? (
          <p className="muted-line">Escolha o ano para ver as matérias.</p>
        ) : (
          <div className="choice-grid">
            {!subjectKnown && (
              <label className="choice">
                <input
                  type="radio"
                  name={`${id}-subject`}
                  value={value.subject}
                  checked
                  readOnly
                />
                {value.subject} (atual)
              </label>
            )}
            {subjects.map((subject) => (
              <label key={subject} className="choice">
                <input
                  type="radio"
                  name={`${id}-subject`}
                  value={subject}
                  checked={value.subject === subject}
                  onChange={() => onChange({ ...value, subject })}
                />
                {subject}
              </label>
            ))}
          </div>
        )}
        <span className="muted-line">
          Cada turma tem uma matéria. Ela e o ano definem as habilidades da BNCC
          que aparecem ao planejar.
        </span>
        {error("subject")}
      </fieldset>
    </>
  );
}

function validateProfile(value: Profile): ProfileErrors {
  const errors: ProfileErrors = {};
  if (!value.stage) errors.stage = "Escolha a etapa.";
  else if (!value.year) errors.year = "Escolha o ano.";
  else if (!value.subject) errors.subject = "Escolha a matéria da turma.";
  return errors;
}

const profileBody = (value: Profile) => ({
  educationStage: value.stage,
  schoolYear: value.year,
  curricularComponents: [value.subject],
});

/* ----------------------------- Class page ----------------------------- */

export function ClassDetailPage({
  classId,
  reload,
}: {
  classId: string;
  reload: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const catalogState = useCatalog();
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    stage: "",
    year: "",
    subject: "",
  });
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const loadDetail = useCallback(async () => {
    try {
      const data = await request<ClassDetail>(`/classes/${classId}`);
      setDetail(data);
      setLoadFailed(false);
      setProfile({
        stage: data.curriculum?.educationStage ?? "",
        year: data.curriculum?.schoolYear ?? "",
        subject: data.curriculum?.curricularComponents[0] ?? "",
      });
    } catch {
      setLoadFailed(true);
    }
  }, [classId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
      await Promise.all([loadDetail(), reload()]);
      setFeedback({ kind: "ok", text: success });
    } catch (error) {
      setFeedback({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const createInGoogle = async () => {
    if (!detail) return;
    const confirmed = await confirm({
      title: "Criar esta turma no Google Sala de Aula?",
      body: `A turma ${detail.name} será criada no Google Sala de Aula com você como professor. Depois, os alunos entram nela pelo Google.`,
      confirmLabel: "Criar turma no Google",
    });
    if (!confirmed) return;
    await run(
      () => request(`/classes/${classId}/google`, { method: "POST" }),
      "Turma criada no Google Sala de Aula.",
    );
  };

  const removeClass = async () => {
    if (!detail) return;
    let plan: ClassRemoval;
    try {
      plan = await request<ClassRemoval>(`/classes/${classId}/removal`);
    } catch (error) {
      setFeedback({ kind: "error", text: (error as Error).message });
      return;
    }
    const options = {
      delete: {
        title: `Excluir a turma ${detail.name}?`,
        body: "Os alunos saem da turma e os marcos dela são apagados. Isso não pode ser desfeito.",
        confirmLabel: "Excluir turma",
        danger: true,
      },
      archive: {
        title: `A turma ${detail.name} não pode ser excluída`,
        body: `Ela tem ${plural(plan.plans, "plano", "planos")}, ${plural(plan.activities, "atividade", "atividades")} e ${plural(plan.grades, "boletim", "boletins")}. Você pode arquivá-la: ela sai da lista, mas nada se perde, e dá para desarquivar depois.`,
        confirmLabel: "Arquivar turma",
      },
      unlink: {
        title: `Remover ${detail.name} do EDUC.AI?`,
        body: "Esta turma vem do Google Sala de Aula. Vamos tirar só o vínculo aqui no EDUC.AI: ela continua no Classroom, com os alunos e as atividades de lá. Para apagá-la de vez, faça isso no Google Sala de Aula.",
        confirmLabel: "Remover vínculo local",
      },
    }[plan.action];
    if (!(await confirm(options))) return;
    setBusy(true);
    try {
      if (plan.action === "archive")
        await request(`/classes/${classId}/archive`, { method: "POST" });
      else await request(`/classes/${classId}`, { method: "DELETE" });
      await reload();
      window.location.hash = routeHref("turmas");
    } catch (error) {
      setFeedback({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const removeStudent = async (student: ClassDetail["students"][number]) => {
    const confirmed = await confirm({
      title: `Remover ${student.name} da turma?`,
      body: "O aluno sai desta turma. As respostas e notas que ele já tem continuam guardadas.",
      confirmLabel: "Remover aluno",
      danger: true,
    });
    if (!confirmed) return;
    await run(
      () =>
        request(`/classes/${classId}/students/${student.id}`, {
          method: "DELETE",
        }),
      `${student.name} saiu da turma.`,
    );
  };

  const setStudentStatus = async (
    student: ClassDetail["students"][number],
    status: "active" | "restricted",
  ) => {
    if (status === "restricted") {
      const confirmed = await confirm({
        title: `Marcar ${student.name} como restrito?`,
        body: "Aluno restrito não recebe as próximas atividades desta turma, e as respostas dele não entram na correção. Você pode reativar quando quiser.",
        confirmLabel: "Marcar como restrito",
      });
      if (!confirmed) return;
    }
    await run(
      () =>
        request(
          `/classes/${classId}/students/${student.id}`,
          json("PATCH", { status }),
        ),
      status === "restricted"
        ? `${student.name} agora está restrito.`
        : `${student.name} está ativo de novo.`,
    );
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateProfile(profile);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    await run(
      () =>
        request(
          `/classes/${classId}/curriculum`,
          json("PUT", profileBody(profile)),
        ),
      "Pronto! A matéria e o ano da turma foram salvos.",
    );
  };

  if (loadFailed)
    return (
      <>
        <a className="back-link" href={routeHref("turmas")}>
          ← Voltar para turmas
        </a>
        <div className="notice error" role="alert">
          <strong>Não conseguimos abrir esta turma.</strong>
          <span>
            Ela pode ter sido removida. Volte para a lista e tente de novo.
          </span>
        </div>
      </>
    );
  if (!detail) return <p className="empty-state">Abrindo a turma…</p>;

  const catalogReady =
    catalogState.catalog && catalogState.catalog.stages.length > 0;

  return (
    <>
      <a className="back-link" href={routeHref("turmas")}>
        ← Voltar para turmas
      </a>
      {detail.archivedAt && (
        <div className="notice warning" role="status">
          <span>
            {detail.source === "google"
              ? "Esta turma foi removida do EDUC.AI. Ela continua no Google Sala de Aula."
              : "Esta turma está arquivada. Ela não aparece na sua lista de turmas."}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  request(`/classes/${classId}/restore`, { method: "POST" }),
                "A turma voltou para a sua lista.",
              )
            }
          >
            Desarquivar
          </button>
        </div>
      )}
      <header className="page-head">
        <h1>{detail.name}</h1>
        <p>
          {plural(detail.students.length, "aluno", "alunos")} ·{" "}
          {classSourceLabel(detail.source)}
        </p>
      </header>
      <div className="inline-actions page-actions">
        {detail.source === "google" ? (
          <button
            type="button"
            className="secondary-action"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  request(`/classes/${classId}/students/sync`, {
                    method: "POST",
                  }),
                "Lista de alunos atualizada.",
              )
            }
          >
            Atualizar lista de alunos
          </button>
        ) : (
          <button
            type="button"
            className="secondary-action"
            disabled={busy}
            onClick={() => void createInGoogle()}
          >
            Criar no Google Sala de Aula
          </button>
        )}
      </div>
      <FeedbackMessage value={feedback} />

      <section className="timeline-panel" aria-labelledby="perfil-turma">
        <h2 id="perfil-turma">O que esta turma estuda</h2>
        <p className="muted-line">
          Usamos isso para mostrar as habilidades da BNCC certas quando você
          planejar.
        </p>
        <CatalogStatus {...catalogState} />
        {catalogReady && (
          <form
            className="stacked-form"
            onSubmit={(event) => void saveProfile(event)}
            noValidate
          >
            <CurriculumFields
              catalog={catalogState.catalog!}
              value={profile}
              errors={errors}
              onChange={(value) => {
                setProfile(value);
                setErrors({});
              }}
            />
            <button type="submit" disabled={busy}>
              {busy ? "Salvando…" : "Salvar"}
            </button>
          </form>
        )}
      </section>

      <section className="timeline-panel" aria-labelledby="alunos-turma">
        <h2 id="alunos-turma">Alunos</h2>
        {detail.students.length === 0 ? (
          <p className="empty-state">
            {detail.source === "google"
              ? "Nenhum aluno ainda. Toque em “Atualizar lista de alunos” para trazer os alunos do Google Sala de Aula."
              : "Nenhum aluno ainda. Crie a turma no Google Sala de Aula para os alunos entrarem."}
          </p>
        ) : (
          <ul className="student-list">
            {detail.students.map((student) => (
              <li key={student.id}>
                <span>{student.name}</span>
                <span className="muted-line">
                  {enrollmentStatusLabel(student.status)}
                </span>
                <span className="inline-actions">
                  {student.status === "restricted" ? (
                    <button
                      type="button"
                      className="secondary-action"
                      disabled={busy}
                      onClick={() => void setStudentStatus(student, "active")}
                    >
                      Reativar {student.name}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondary-action"
                      disabled={busy}
                      onClick={() =>
                        void setStudentStatus(student, "restricted")
                      }
                    >
                      Marcar {student.name} como restrito
                    </button>
                  )}
                  {student.origin !== "google" && (
                    <button
                      type="button"
                      className="danger-action"
                      disabled={busy}
                      onClick={() => void removeStudent(student)}
                    >
                      Remover {student.name}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {detail.students.some((student) => student.origin === "google") && (
          <details className="muted-line">
            <summary>Como tirar um aluno do Google Sala de Aula</summary>
            <p>
              Alunos que vêm do Google só saem pelo Classroom. Abra o{" "}
              <a
                href="https://classroom.google.com"
                target="_blank"
                rel="noreferrer"
              >
                Google Sala de Aula
              </a>
              , entre na turma, vá em Pessoas, toque nos três pontos ao lado do
              aluno e escolha Remover. Depois, toque em “Atualizar lista de
              alunos” aqui. Enquanto isso, você pode marcá-lo como restrito.
            </p>
          </details>
        )}
      </section>

      {!detail.archivedAt && (
        <section className="timeline-panel" aria-labelledby="excluir-turma">
          <h2 id="excluir-turma">Excluir turma</h2>
          <p className="muted-line">
            Turmas com planos, atividades ou notas são arquivadas em vez de
            excluídas, para nada se perder.
          </p>
          <button
            type="button"
            className="danger-action"
            disabled={busy}
            onClick={() => void removeClass()}
          >
            Excluir {detail.name}
          </button>
        </section>
      )}
    </>
  );
}

/* ------------------------------ New class ----------------------------- */

function generateCode(): string {
  return `TURMA-${String(Math.floor(1000 + Math.random() * 9000))}`;
}

type NewClassErrors = ProfileErrors & { name?: string; code?: string };

export function NewClassPage({ reload }: { reload: () => Promise<void> }) {
  const catalogState = useCatalog();
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState(generateCode);
  const [profile, setProfile] = useState<Profile>({
    stage: "",
    year: "",
    subject: "",
  });
  const [errors, setErrors] = useState<NewClassErrors>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found: NewClassErrors = validateProfile(profile);
    if (!name.trim()) found.name = "Escreva o nome da turma.";
    if (code.trim().length < 4)
      found.code = "O código precisa ter pelo menos 4 letras ou números.";
    setErrors(found);
    if (Object.keys(found).length > 0) {
      if (found.name) nameRef.current?.focus();
      return;
    }

    setBusy(true);
    setFeedback(null);
    let classId: string | null = null;
    try {
      classId = (
        await request<{ id: string }>(
          "/classes",
          json("POST", {
            name: name.trim(),
            schoolYear: classYearText(profile.year),
            localAccessCode: code.trim(),
          }),
        )
      ).id;
      await request(
        `/classes/${classId}/curriculum`,
        json("PUT", profileBody(profile)),
      );
      await reload();
      window.location.hash = routeHref("turmas", classId);
    } catch (error) {
      if (classId) {
        // The class exists; never create it twice. Point to it instead.
        setCreatedId(classId);
        await reload().catch(() => undefined);
        setFeedback({
          kind: "error",
          text: "A turma foi criada, mas a matéria não foi salva. Abra a turma para concluir.",
        });
      } else {
        setFeedback({ kind: "error", text: (error as Error).message });
      }
    } finally {
      setBusy(false);
    }
  };

  const catalogReady =
    catalogState.catalog && catalogState.catalog.stages.length > 0;

  return (
    <>
      <a className="back-link" href={routeHref("turmas")}>
        ← Voltar para turmas
      </a>
      <CatalogStatus {...catalogState} />
      <form
        className="timeline-panel stacked-form"
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        <div className="field">
          <label>
            <span>
              Nome da turma <span aria-hidden="true">*</span>
            </span>
            <input
              ref={nameRef}
              value={name}
              placeholder="Ex.: 7º ano B"
              onChange={(event) => setName(event.target.value)}
              {...(errors.name
                ? { "aria-invalid": true, "aria-describedby": `${id}-name` }
                : {})}
            />
          </label>
          {errors.name && (
            <span className="field-error" id={`${id}-name`}>
              {errors.name}
            </span>
          )}
        </div>
        {catalogReady && (
          <CurriculumFields
            catalog={catalogState.catalog!}
            value={profile}
            errors={errors}
            onChange={setProfile}
          />
        )}
        <div className="field">
          <label>
            <span>Código da turma</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              aria-describedby={`${id}-code-help`}
              {...(errors.code ? { "aria-invalid": true } : {})}
            />
          </label>
          <span
            className={errors.code ? "field-error" : "muted-line"}
            id={`${id}-code-help`}
          >
            {errors.code ??
              "Criamos um código para você. Pode trocar se quiser."}
          </span>
        </div>
        <FeedbackMessage value={feedback} />
        {createdId && (
          <a className="secondary-action" href={routeHref("turmas", createdId)}>
            Abrir a turma criada
          </a>
        )}
        <div className="inline-actions">
          <a className="secondary-action" href={routeHref("turmas")}>
            Cancelar
          </a>
          <button
            type="submit"
            disabled={busy || !catalogReady || Boolean(createdId)}
          >
            {busy ? "Criando…" : "Criar turma"}
          </button>
        </div>
      </form>
    </>
  );
}
