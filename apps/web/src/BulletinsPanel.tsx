import type {
  Bulletin,
  BulletinPeriodType,
  EligibleBulletinStudent,
} from "@educai/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { useConfirm } from "./ConfirmDialog.js";
import { bulletinStatusLabel, errorMessage, formatDate } from "./labels.js";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
type DataEnvelope<T> = { data: T };

export function BulletinsPanel() {
  const confirm = useConfirm();
  const [bulletins, setBulletins] = useState<Bulletin[]>([]);
  const [students, setStudents] = useState<EligibleBulletinStudent[]>([]);
  const [classId, setClassId] = useState("");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [periodType, setPeriodType] = useState<BulletinPeriodType>("monthly");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [title, setTitle] = useState("Boletim de aprendizagem");
  const [teacherComment, setTeacherComment] = useState("");
  const [onlyBelowAverage, setOnlyBelowAverage] = useState(false);
  const [averageThreshold, setAverageThreshold] = useState(6);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [bulletinsResponse, studentsResponse] = await Promise.all([
      fetch(`${apiBaseUrl}/bulletins`, { credentials: "include" }),
      fetch(`${apiBaseUrl}/bulletins/eligible-students`, {
        credentials: "include",
      }),
    ]);
    if (!bulletinsResponse.ok || !studentsResponse.ok) throw new Error();
    setBulletins(
      ((await bulletinsResponse.json()) as DataEnvelope<Bulletin[]>).data,
    );
    setStudents(
      (
        (await studentsResponse.json()) as DataEnvelope<
          EligibleBulletinStudent[]
        >
      ).data,
    );
  }, []);

  useEffect(() => {
    void load().catch(() =>
      setMessage("Não foi possível carregar os boletins. Tente de novo."),
    );
  }, [load]);

  const classes = useMemo(
    () =>
      Array.from(
        new Map(
          students.map((student) => [
            student.classId,
            { id: student.classId, name: student.className },
          ]),
        ).values(),
      ),
    [students],
  );
  const classStudents = useMemo(
    () => students.filter((student) => student.classId === classId),
    [students, classId],
  );

  useEffect(() => {
    if (!classId && classes[0]) setClassId(classes[0].id);
  }, [classId, classes]);

  useEffect(() => {
    setStudentIds(classStudents[0] ? [classStudents[0].id] : []);
  }, [classId, classStudents]);

  const generate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyId("new");
    setMessage(null);
    try {
      const response = await fetch(`${apiBaseUrl}/bulletins`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId,
          studentIds,
          periodType,
          periodStart,
          periodEnd,
          title,
          teacherComment: teacherComment || null,
          onlyBelowAverage,
          ...(onlyBelowAverage ? { averageThreshold } : {}),
        }),
      });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as DataEnvelope<{ ids: string[] }>;
      setMessage(
        body.data.ids.length === 1
          ? "1 boletim gerado."
          : `${body.data.ids.length} boletins gerados.`,
      );
      await load();
    } catch {
      setMessage(
        "Não foi possível gerar. Confira o período e se há notas devolvidas nele.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const send = async (bulletin: Bulletin) => {
    if (
      !(await confirm({
        title: "Enviar boletim por e-mail?",
        body: `O boletim de ${bulletin.studentName} será enviado para o e-mail do aluno cadastrado no Google Sala de Aula.`,
        confirmLabel: "Enviar boletim",
      }))
    )
      return;
    const bulletinId = bulletin.id;
    setBusyId(bulletinId);
    setMessage(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/bulletins/${bulletinId}/send`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!response.ok) throw new Error();
      setMessage("Boletim enviado.");
    } catch {
      setMessage(
        "O e-mail não foi enviado. O boletim está salvo; tente de novo.",
      );
    } finally {
      await load().catch(() => undefined);
      setBusyId(null);
    }
  };

  return (
    <section className="timeline-panel" aria-labelledby="bulletins-title">
      <div className="status-heading">
        <h2 id="bulletins-title">Seus boletins</h2>
        <span className="timeline-count">
          {bulletins.length} {bulletins.length === 1 ? "boletim" : "boletins"}
        </span>
      </div>
      <div className="activities-layout">
        <form
          className="activity-form"
          onSubmit={(event) => void generate(event)}
        >
          <h3>Gerar boletim</h3>
          <label>
            Turma
            <select
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
            >
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Alunos
            <select
              multiple
              value={studentIds}
              onChange={(event) =>
                setStudentIds(
                  Array.from(event.currentTarget.selectedOptions).map(
                    (option) => option.value,
                  ),
                )
              }
            >
              {classStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="secondary-action compact-action"
            onClick={() =>
              setStudentIds(classStudents.map((student) => student.id))
            }
          >
            Selecionar turma inteira
          </button>
          <label>
            Período
            <select
              value={periodType}
              onChange={(event) =>
                setPeriodType(event.target.value as BulletinPeriodType)
              }
            >
              <option value="monthly">Mensal</option>
              <option value="bimonthly">Bimestral</option>
              <option value="quarterly">Trimestral</option>
              <option value="annual">Anual</option>
              <option value="custom">Personalizado</option>
            </select>
          </label>
          <div className="form-row">
            <label>
              Início
              <input
                type="date"
                value={periodStart}
                onChange={(event) => setPeriodStart(event.target.value)}
              />
            </label>
            <label>
              Fim
              <input
                type="date"
                value={periodEnd}
                onChange={(event) => setPeriodEnd(event.target.value)}
              />
            </label>
          </div>
          <label>
            Título
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Comentário do professor
            <textarea
              value={teacherComment}
              onChange={(event) => setTeacherComment(event.target.value)}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={onlyBelowAverage}
              onChange={(event) => setOnlyBelowAverage(event.target.checked)}
            />
            Só alunos com média abaixo de um valor
          </label>
          {onlyBelowAverage && (
            <label>
              Média mínima (0 a 10)
              <input
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={averageThreshold}
                onChange={(event) =>
                  setAverageThreshold(Number(event.target.value))
                }
              />
            </label>
          )}
          <button
            disabled={
              busyId === "new" ||
              !classId ||
              studentIds.length === 0 ||
              !periodStart ||
              !periodEnd ||
              !title.trim()
            }
          >
            {busyId === "new" ? "Gerando…" : "Gerar PDF"}
          </button>
        </form>
        <div>
          <h3>Boletins gerados</h3>
          {bulletins.length === 0 ? (
            <p className="empty-state">
              Nenhum boletim ainda. Escolha a turma e o período ao lado.
            </p>
          ) : (
            <ul className="resource-list">
              {bulletins.map((bulletin) => (
                <li key={bulletin.id}>
                  <strong>
                    {bulletin.studentName} · média{" "}
                    {bulletin.average.toLocaleString("pt-BR")}
                  </strong>
                  <span>
                    {bulletin.className} ·{" "}
                    {bulletinStatusLabel(bulletin.status)}
                  </span>
                  <small>
                    {formatDate(bulletin.periodStart)} a{" "}
                    {formatDate(bulletin.periodEnd)} ·{" "}
                    {bulletin.activities.length} atividades ·{" "}
                    {bulletin.feedbacks.length} recados
                  </small>
                  {bulletin.lastErrorCode && (
                    <small className="status-error">
                      {errorMessage(bulletin.lastErrorCode)}
                    </small>
                  )}
                  <div className="inline-actions">
                    <a
                      className="secondary-action compact-action"
                      href={`${apiBaseUrl}/bulletins/${bulletin.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Visualizar PDF
                    </a>
                    <button
                      type="button"
                      className="compact-action"
                      disabled={
                        busyId === bulletin.id || bulletin.status === "pending"
                      }
                      onClick={() => void send(bulletin)}
                    >
                      {bulletin.status === "sent" ? "Reenviar" : "Enviar"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {message && (
        <small className="form-message" role="status">
          {message}
        </small>
      )}
    </section>
  );
}
