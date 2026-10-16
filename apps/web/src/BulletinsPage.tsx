import type {
  Bulletin,
  BulletinPeriodType,
  EligibleBulletinStudent,
} from "@educai/contracts";
import { useCallback, useEffect, useId, useState } from "react";

import { ApiError, json, request } from "./api.js";
import {
  classesFromStudents,
  notYetSent,
  periodRange,
  validateBulletinForm,
  type BulletinFormErrors,
} from "./bulletins.js";
import { useConfirm } from "./ConfirmDialog.js";
import { bulletinStatusLabel, errorMessage, formatDate } from "./labels.js";

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

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const PERIODS: Array<[BulletinPeriodType, string]> = [
  ["monthly", "Mês atual"],
  ["bimonthly", "Bimestre atual"],
  ["quarterly", "Trimestre atual"],
  ["annual", "Ano atual"],
  ["custom", "Escolher as datas"],
];

const DEFAULT_TITLE = "Boletim de aprendizagem";

export function BulletinsPage() {
  const confirm = useConfirm();
  const id = useId();
  const [bulletins, setBulletins] = useState<Bulletin[] | null>(null);
  const [students, setStudents] = useState<EligibleBulletinStudent[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const initialRange = periodRange("bimonthly", new Date())!;
  const [classId, setClassId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [periodType, setPeriodType] = useState<BulletinPeriodType>("bimonthly");
  const [start, setStart] = useState(initialRange.start);
  const [end, setEnd] = useState(initialRange.end);
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [comment, setComment] = useState("");
  const [onlyBelowAverage, setOnlyBelowAverage] = useState(false);
  const [threshold, setThreshold] = useState("6");
  const [errors, setErrors] = useState<BulletinFormErrors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const [list, eligible] = await Promise.all([
        request<Bulletin[]>("/bulletins"),
        request<EligibleBulletinStudent[]>("/bulletins/eligible-students"),
      ]);
      setBulletins(list);
      setStudents(eligible);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const classes = classesFromStudents(students);
  const classStudents = students
    .filter((student) => student.classId === classId)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const allSelected =
    classStudents.length > 0 && selected.length === classStudents.length;

  const chooseClass = (value: string) => {
    setClassId(value);
    // A whole class is the common case, so everyone starts selected.
    setSelected(
      students
        .filter((student) => student.classId === value)
        .map((student) => student.id),
    );
    setErrors({});
  };

  const choosePeriod = (value: BulletinPeriodType) => {
    setPeriodType(value);
    const preset = periodRange(value, new Date());
    if (preset) {
      setStart(preset.start);
      setEnd(preset.end);
    }
  };

  const toggle = (studentId: string) =>
    setSelected((current) =>
      current.includes(studentId)
        ? current.filter((item) => item !== studentId)
        : [...current, studentId],
    );

  const generate = async () => {
    const found = validateBulletinForm({
      classId,
      studentIds: selected,
      start,
      end,
      title,
      onlyBelowAverage,
      threshold,
    });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await request<{ ids: string[] }>(
        "/bulletins",
        json("POST", {
          classId,
          // Keep the class order so the request is predictable.
          studentIds: classStudents
            .map((student) => student.id)
            .filter((studentId) => selected.includes(studentId)),
          periodType,
          periodStart: start,
          periodEnd: end,
          title: title.trim(),
          teacherComment: comment.trim() || null,
          onlyBelowAverage,
          ...(onlyBelowAverage
            ? { averageThreshold: Number(threshold.replace(",", ".")) }
            : {}),
        }),
      );
      await load();
      setNotice({
        kind: "ok",
        text: `${plural(result.ids.length, "boletim gerado", "boletins gerados")}.`,
      });
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof ApiError && error.code === "VALIDATION_ERROR"
            ? "Nenhum boletim foi gerado: não há notas aprovadas no período para os alunos escolhidos, ou nenhum ficou abaixo da média mínima."
            : (error as Error).message,
      });
    } finally {
      setBusy(false);
    }
  };

  const sendOne = async (bulletin: Bulletin) => {
    const confirmed = await confirm({
      title: "Enviar boletim por e-mail?",
      body: `O boletim de ${bulletin.studentName} será enviado para ${bulletin.studentEmail}.`,
      confirmLabel: "Enviar boletim",
    });
    if (!confirmed) return;
    setBusy(true);
    setNotice(null);
    try {
      await request(`/bulletins/${bulletin.id}/send`, { method: "POST" });
      setNotice({
        kind: "ok",
        text: `Boletim de ${bulletin.studentName} enviado.`,
      });
    } catch (error) {
      setNotice({ kind: "error", text: (error as Error).message });
    } finally {
      await load();
      setBusy(false);
    }
  };

  const sendPending = async (pending: Bulletin[]) => {
    const confirmed = await confirm({
      title: "Enviar os boletins por e-mail?",
      body: `${plural(pending.length, "boletim será enviado", "boletins serão enviados")}, cada um para o e-mail do aluno cadastrado no Google Sala de Aula.`,
      confirmLabel: "Enviar boletins",
    });
    if (!confirmed) return;
    setBusy(true);
    setNotice(null);
    const failures: string[] = [];
    for (const bulletin of pending) {
      try {
        await request(`/bulletins/${bulletin.id}/send`, { method: "POST" });
      } catch {
        failures.push(bulletin.studentName);
      }
    }
    await load();
    setBusy(false);
    setNotice(
      failures.length > 0
        ? {
            kind: "error",
            text: `${plural(failures.length, "boletim não foi enviado", "boletins não foram enviados")}: ${failures.join(", ")}. Tente de novo.`,
          }
        : {
            kind: "ok",
            text: `${plural(pending.length, "boletim enviado", "boletins enviados")}.`,
          },
    );
  };

  const fieldError = (key: keyof BulletinFormErrors) =>
    errors[key] && (
      <span className="field-error" id={`${id}-${key}`}>
        {errors[key]}
      </span>
    );
  const invalid = (key: keyof BulletinFormErrors) =>
    errors[key]
      ? { "aria-invalid": true as const, "aria-describedby": `${id}-${key}` }
      : {};

  const pending = notYetSent(bulletins ?? []);

  return (
    <>
      <NoticeMessage value={notice} />
      {loadFailed && (
        <div className="notice error" role="alert">
          <span>Não conseguimos carregar os boletins.</span>
          <button type="button" onClick={() => void load()}>
            Tentar de novo
          </button>
        </div>
      )}

      {/* The form waits for the students, so a choice is never lost. */}
      {bulletins === null ? (
        !loadFailed && <p className="empty-state">Carregando…</p>
      ) : (
        <section
          className="timeline-panel stacked-form"
          aria-labelledby={`${id}-gerar`}
        >
          <h2 id={`${id}-gerar`}>Gerar boletins</h2>
          {classes.length === 0 ? (
            <p className="notice warning">
              Ainda não há alunos com notas aprovadas. Corrija e aprove as notas
              primeiro.
            </p>
          ) : (
            <>
              <div className="field">
                <label>
                  <span>
                    Turma <span aria-hidden="true">*</span>
                  </span>
                  <select
                    value={classId}
                    onChange={(event) => chooseClass(event.target.value)}
                    {...invalid("classId")}
                  >
                    <option value="">Escolha a turma</option>
                    {classes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                {fieldError("classId")}
              </div>
              <div className="form-row">
                <div className="field">
                  <label>
                    <span>Tipo de período</span>
                    <select
                      value={periodType}
                      onChange={(event) =>
                        choosePeriod(event.target.value as BulletinPeriodType)
                      }
                    >
                      {PERIODS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="field">
                  <label>
                    <span>Título</span>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      {...invalid("title")}
                    />
                  </label>
                  {fieldError("title")}
                </div>
              </div>
              <div className="form-row">
                <div className="field">
                  <label>
                    <span>Início</span>
                    <input
                      type="date"
                      value={start}
                      onChange={(event) => {
                        setPeriodType("custom");
                        setStart(event.target.value);
                      }}
                      {...invalid("start")}
                    />
                  </label>
                  {fieldError("start")}
                </div>
                <div className="field">
                  <label>
                    <span>Fim</span>
                    <input
                      type="date"
                      value={end}
                      onChange={(event) => {
                        setPeriodType("custom");
                        setEnd(event.target.value);
                      }}
                      {...invalid("end")}
                    />
                  </label>
                  {fieldError("end")}
                </div>
              </div>

              {classId && (
                <fieldset
                  className="choice-group"
                  {...(errors.students
                    ? { "aria-describedby": `${id}-students` }
                    : {})}
                >
                  <legend>Alunos</legend>
                  <label className="choice">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() =>
                        setSelected(
                          allSelected
                            ? []
                            : classStudents.map((student) => student.id),
                        )
                      }
                    />
                    Selecionar todos ({classStudents.length})
                  </label>
                  <div className="choice-grid">
                    {classStudents.map((student) => (
                      <label key={student.id} className="choice">
                        <input
                          type="checkbox"
                          checked={selected.includes(student.id)}
                          onChange={() => toggle(student.id)}
                        />
                        {student.name}
                      </label>
                    ))}
                  </div>
                  {fieldError("students")}
                </fieldset>
              )}

              <div className="field">
                <label>
                  <span>Comentário para todos os boletins (opcional)</span>
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                  />
                </label>
              </div>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={onlyBelowAverage}
                  onChange={(event) =>
                    setOnlyBelowAverage(event.target.checked)
                  }
                />
                Só alunos com média abaixo de um valor
              </label>
              {onlyBelowAverage && (
                <div className="field points-field">
                  <label>
                    <span>Média mínima (0 a 10)</span>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      value={threshold}
                      onChange={(event) => setThreshold(event.target.value)}
                      {...invalid("threshold")}
                    />
                  </label>
                  {fieldError("threshold")}
                </div>
              )}
              <div className="inline-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void generate()}
                >
                  {busy ? "Gerando…" : "Gerar boletins"}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <section className="queue-group" aria-labelledby={`${id}-gerados`}>
        <div className="status-heading">
          <h2 id={`${id}-gerados`}>Boletins gerados</h2>
          {pending.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void sendPending(pending)}
            >
              Enviar{" "}
              {plural(
                pending.length,
                "boletim ainda não enviado",
                "boletins ainda não enviados",
              )}
            </button>
          )}
        </div>
        {bulletins !== null && bulletins.length === 0 ? (
          <p className="empty-state">
            Nenhum boletim ainda. Escolha a turma e o período acima.
          </p>
        ) : (
          bulletins && (
            <ul className="card-list" aria-label="Boletins gerados">
              {bulletins.map((bulletin) => (
                <li key={bulletin.id} className="card-row">
                  <div>
                    <strong className="card-title">
                      {bulletin.studentName} · média{" "}
                      {bulletin.average.toLocaleString("pt-BR")}
                    </strong>
                    <span className="muted-line">
                      {bulletin.className} · {formatDate(bulletin.periodStart)}{" "}
                      a {formatDate(bulletin.periodEnd)}
                    </span>
                    <span
                      className={`tag ${bulletin.status === "sent" ? "ok" : bulletin.status === "failed" ? "warn" : ""}`}
                    >
                      {bulletinStatusLabel(bulletin.status)}
                    </span>
                    {bulletin.status === "failed" && bulletin.lastErrorCode && (
                      <span className="muted-line">
                        {errorMessage(bulletin.lastErrorCode)}
                      </span>
                    )}
                  </div>
                  <div className="inline-actions">
                    <a
                      className="secondary-action"
                      href={`${apiBaseUrl}/bulletins/${bulletin.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver PDF de {bulletin.studentName}
                    </a>
                    <button
                      type="button"
                      className="secondary-action"
                      disabled={busy || bulletin.status === "pending"}
                      onClick={() => void sendOne(bulletin)}
                    >
                      {bulletin.status === "sent"
                        ? `Enviar de novo o boletim de ${bulletin.studentName}`
                        : `Enviar boletim de ${bulletin.studentName} por e-mail`}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        )}
      </section>
    </>
  );
}
