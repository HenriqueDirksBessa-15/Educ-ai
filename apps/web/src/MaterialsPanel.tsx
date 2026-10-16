import type {
  ClassSummary,
  Material,
  MaterialCategory,
} from "@educai/contracts";
import { useEffect, useRef, useState, type FormEvent } from "react";

export function MaterialsPanel({
  materials,
  classes,
  reload,
}: {
  materials: Material[];
  classes: ClassSummary[];
  reload: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<"link" | "file">("link");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [category, setCategory] = useState<MaterialCategory>("reading");
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!classes.some((group) => group.id === classId))
      setClassId(classes[0]?.id ?? "");
  }, [classes, classId]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const file = fileInput.current?.files?.[0] ?? null;
    if (!classId || !title.trim() || (source === "link" ? !url.trim() : !file))
      return;
    setSaving(true);
    setMessage(null);
    try {
      const metadata = {
        title,
        description: description.trim() || null,
        category,
        classIds: [classId],
        bnccSkillIds: [],
      };
      const formData = new FormData();
      if (file) {
        formData.append("metadata", JSON.stringify(metadata));
        formData.append("file", file);
      }
      const response = await fetch(
        source === "link" ? "/api/materials/links" : "/api/materials/files",
        {
          method: "POST",
          credentials: "include",
          ...(source === "link"
            ? {
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ ...metadata, url }),
              }
            : { body: formData }),
        },
      );
      if (!response.ok) throw new Error();
      setTitle("");
      setDescription("");
      setUrl("");
      setFileInputKey((current) => current + 1);
      setMessage(
        source === "link"
          ? "Material adicionado à turma."
          : "Arquivo privado enviado para a turma.",
      );
      await reload();
    } catch {
      setMessage(
        source === "link"
          ? "Não foi possível adicionar o material. Revise o link e a turma."
          : "Não foi possível enviar o arquivo. Revise o tipo, o limite de 100 MB e a turma.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h3>Materiais</h3>
      <form className="plan-form material-form" onSubmit={create}>
        <label>
          Origem
          <select
            value={source}
            onChange={(event) => {
              const next = event.target.value as "link" | "file";
              setSource(next);
              if (next === "file" && category === "link") setCategory("other");
            }}
          >
            <option value="link">Link externo</option>
            <option value="file">Arquivo privado</option>
          </select>
        </label>
        <label>
          Título do material
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </label>
        {source === "link" ? (
          <label>
            Endereço do material
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://"
              required
            />
          </label>
        ) : (
          <label>
            Arquivo privado
            <input
              key={fileInputKey}
              ref={fileInput}
              type="file"
              accept=".pdf,.docx,.ppt,.pptx,.mp4,.jpg,.jpeg,.png,.gif,.webp"
              required
            />
            <small>PDF, DOCX, PPT/PPTX, MP4 ou imagem; máximo de 100 MB.</small>
          </label>
        )}
        <label>
          Turma
          <select
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            required
          >
            <option value="">Selecione</option>
            {classes.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Categoria
          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as MaterialCategory)
            }
          >
            <option value="reading">Leitura</option>
            <option value="presentation">Apresentação</option>
            <option value="video">Vídeo</option>
            <option value="image">Imagem</option>
            {source === "link" && <option value="link">Link</option>}
            <option value="other">Outro</option>
          </select>
        </label>
        <label>
          Descrição opcional
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <button type="submit" disabled={saving || classes.length === 0}>
          {saving
            ? source === "link"
              ? "Adicionando…"
              : "Enviando…"
            : source === "link"
              ? "Adicionar material"
              : "Enviar arquivo"}
        </button>
        {message && <p role="status">{message}</p>}
      </form>
      {materials.length === 0 ? (
        <p className="empty-state">Nenhum material cadastrado.</p>
      ) : (
        <ul className="resource-list">
          {materials.slice(0, 5).map((material) => (
            <li key={material.id}>
              <a
                href={material.url ?? `/api/materials/${material.id}/file`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <strong>{material.title}</strong>
              </a>
              <span>{material.category}</span>
              <small>{material.classNames.join(", ")}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
