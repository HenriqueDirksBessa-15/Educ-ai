import type {
  ClassSummary,
  Material,
  MaterialCategory,
} from "@educai/contracts";
import { useEffect, useState, type FormEvent } from "react";

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
    if (!classId || !title.trim() || !url.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/materials/links", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description: description.trim() || null,
          category,
          classIds: [classId],
          bnccSkillIds: [],
          url,
        }),
      });
      if (!response.ok) throw new Error();
      setTitle("");
      setDescription("");
      setUrl("");
      setMessage("Material adicionado à turma.");
      await reload();
    } catch {
      setMessage(
        "Não foi possível adicionar o material. Revise o link e a turma.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h3>Materiais por link</h3>
      <form className="plan-form material-form" onSubmit={create}>
        <label>
          Título do material
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </label>
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
            <option value="link">Link</option>
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
          {saving ? "Adicionando…" : "Adicionar material"}
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
                href={material.url ?? undefined}
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
