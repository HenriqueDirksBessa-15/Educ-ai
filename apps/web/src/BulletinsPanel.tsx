import type {
  Bulletin,
  BulletinPeriodType,
  EligibleBulletinStudent,
} from "@educai/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
type DataEnvelope<T> = { data: T };

export function BulletinsPanel() {
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
      setMessage("Não foi possível carregar os boletins."),
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
        `${body.data.ids.length} boletim(ns) gerado(s) com PDF histórico.`,
      );
      await load();
    } catch {
      setMessage(
        "Não foi possível gerar: verifique período, notas aprovadas e filtro de média.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const send = async (bulletinId: string) => {
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
      setMessage("Boletim enviado; a tentativa foi preservada.");
    } catch {
      setMessage("O PDF foi preservado. O envio pode ser repetido.");
    } finally {
      await load().catch(() => undefined);
      setBusyId(null);
    }
  };

  return (
    <section className="timeline-panel" aria-labelledby="bulletins-title">
      <div className="status-heading">
        <div>
          <span className="section-label">Dia 13 · RF014</span>
          <h2 id="bulletins-title">Boletins e envio</h2>
        </div>
        <span className="timeline-count">{bulletins.length} boletins</span>
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
            Somente desempenho abaixo do limiar
          </label>
          {onlyBelowAverage && (
            <label>
              Limiar
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
          <h3>Boletins históricos</h3>
          {bulletins.length === 0 ? (
            <p className="empty-state">Nenhum boletim gerado.</p>
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
                    {bulletin.periodStart} a {bulletin.periodEnd} ·{" "}
                    {bulletin.activities.length} atividades ·{" "}
                    {bulletin.feedbacks.length} feedbacks
                  </small>
                  {bulletin.lastErrorCode && (
                    <small className="status-error">
                      {bulletin.lastErrorCode}
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
                      onClick={() => void send(bulletin.id)}
                    >
                      {bulletin.status === "sent" ? "Reenviar" : "Enviar"}
                    </button>
                  </div>
                  <small>
                    {bulletin.deliveries.length} tentativa(s) de envio
                  </small>
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

function bulletinStatusLabel(status: Bulletin["status"]): string {
  return {
    generated: "PDF gerado",
    pending: "Envio pendente",
    sent: "Enviado",
    failed: "Falha recuperável",
  }[status];
}
