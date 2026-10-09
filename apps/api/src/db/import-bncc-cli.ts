import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";

import { Ajv2020 } from "ajv/dist/2020.js";
import { Pool, type PoolClient } from "pg";

import { loadConfig, loadRootEnvironment } from "../config.js";
import { findRepositoryRoot } from "./paths.js";

type JsonObject = Record<string, unknown>;
type JsonSchema = Record<string, unknown>;

const DATA_VERSION = "dados-2026.07.1";
const SCHEMA_VERSION = "schema-v1.0.0";
const SOURCE_COMMIT = "daabd7dd63ae0cac0aa520b6189e79f95c24f583";
const EXPECTED_COUNTS = {
  ei: 93,
  ef: 1304,
  em: 183,
  coEi: 11,
  coEf: 104,
  coEm: 26,
};

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Registro JSON inválido: objeto esperado.");
  }
  return value as JsonObject;
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Campo obrigatório inválido: ${field}`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function jsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function validateSchemas(
  sourceDir: string,
  files: Record<string, unknown>,
): Promise<void> {
  const schemaDir = join(sourceDir, "schema");
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const definition = (await jsonFile(
    join(schemaDir, "definicoes.json"),
  )) as JsonSchema;
  ajv.addSchema(definition, "https://bncc.dev/schema/definicoes.json");
  const schemaNames = [
    "estrutura",
    "educacao-infantil",
    "ensino-fundamental",
    "ensino-medio",
    "computacao",
  ];
  for (const name of schemaNames) {
    const schema = (await jsonFile(
      join(schemaDir, `${name}.schema.json`),
    )) as JsonSchema;
    ajv.addSchema(schema);
  }
  for (const [name, data] of Object.entries(files)) {
    const validator = ajv.getSchema(
      `https://bncc.dev/schema/${name}.schema.json`,
    );
    if (!validator || !validator(data)) {
      throw new Error(
        `Schema BNCC inválido em ${name}: ${ajv.errorsText(validator?.errors)}`,
      );
    }
  }
}

async function upsertDocument(
  client: PoolClient,
  record: JsonObject,
): Promise<void> {
  await client.query(
    `INSERT INTO bncc_document (id, name, document_type, sphere, data_version, schema_version, source_commit)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, document_type = EXCLUDED.document_type,
       sphere = EXCLUDED.sphere, data_version = EXCLUDED.data_version, schema_version = EXCLUDED.schema_version,
       source_commit = EXCLUDED.source_commit, imported_at = now()`,
    [
      string(record.id, "documento.id"),
      string(record.nome, "documento.nome"),
      string(record.tipo, "documento.tipo"),
      string(record.esfera, "documento.esfera"),
      DATA_VERSION,
      SCHEMA_VERSION,
      SOURCE_COMMIT,
    ],
  );
}

async function upsertLearning(
  client: PoolClient,
  input: {
    code: string;
    document: string;
    stage: string;
    kind: string;
    text: string;
    validity: JsonObject;
    source: JsonObject;
  },
): Promise<string> {
  const validityStatus = string(input.validity.status, "vigencia.status");
  const validFrom = string(input.validity.desde, "vigencia.desde");
  const source = input.source;
  const result = await client.query(
    `INSERT INTO bncc_learning (
       code, document_id, stage_id, learning_kind, text, validity_status, valid_from, valid_until,
       source_file, source_provenance, source_locator, source_pdf_locator, source_url, content_checksum
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (document_id, code) DO UPDATE SET
       text = EXCLUDED.text, learning_kind = EXCLUDED.learning_kind, validity_status = EXCLUDED.validity_status,
       valid_from = EXCLUDED.valid_from, valid_until = EXCLUDED.valid_until,
       source_file = EXCLUDED.source_file, source_provenance = EXCLUDED.source_provenance,
       source_locator = EXCLUDED.source_locator, source_pdf_locator = EXCLUDED.source_pdf_locator,
       source_url = EXCLUDED.source_url, content_checksum = EXCLUDED.content_checksum
     RETURNING id`,
    [
      input.code,
      input.document,
      input.stage,
      input.kind,
      input.text,
      validityStatus,
      validFrom,
      optionalString(input.validity.ate),
      optionalString(source.arquivo),
      optionalString(source.proveniencia),
      optionalString(source.localizador),
      optionalString(source.localizador_pdf),
      optionalString(source.url_oficial),
      hash(input),
    ],
  );
  return String((result.rows[0] as { id: string }).id);
}

async function importSnapshot(
  sourceDir: string,
  databaseUrl: string,
  dryRun: boolean,
): Promise<void> {
  const dataDir = join(sourceDir, "dados");
  const files = {
    estrutura: await jsonFile(join(dataDir, "bncc-2018", "estrutura.json")),
    "educacao-infantil": await jsonFile(
      join(dataDir, "bncc-2018", "educacao-infantil.json"),
    ),
    "ensino-fundamental": await jsonFile(
      join(dataDir, "bncc-2018", "ensino-fundamental.json"),
    ),
    "ensino-medio": await jsonFile(
      join(dataDir, "bncc-2018", "ensino-medio.json"),
    ),
    computacao: await jsonFile(
      join(dataDir, "computacao-2022", "computacao.json"),
    ),
  };
  await validateSchemas(sourceDir, files);
  const ei = object(files["educacao-infantil"]);
  const ef = object(files["ensino-fundamental"]);
  const em = object(files["ensino-medio"]);
  const co = object(files.computacao);
  const counts = {
    ei: array(ei.objetivos).length,
    ef: array(ef.habilidades).length,
    em: array(em.habilidades).length,
    coEi: array(co.objetivos_ei).length,
    coEf: array(co.habilidades_ef).length,
    coEm: array(co.habilidades_em).length,
  };
  if (JSON.stringify(counts) !== JSON.stringify(EXPECTED_COUNTS)) {
    throw new Error(`Contagens BNCC inesperadas: ${JSON.stringify(counts)}`);
  }
  const snapshotChecksum = hash(files);
  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dataVersion: DATA_VERSION,
          schemaVersion: SCHEMA_VERSION,
          snapshotChecksum,
          counts,
          total: Object.values(counts).reduce((sum, count) => sum + count, 0),
        },
        null,
        2,
      ),
    );
    return;
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10_000,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const structure = object(files.estrutura);
    const documents = array(structure.documento_curricular).map(object);
    for (const document of documents) await upsertDocument(client, document);
    for (const document of documents) {
      if (document.derivado_de) {
        await client.query(
          "UPDATE bncc_document SET derived_from_id = $2 WHERE id = $1",
          [document.id, document.derivado_de],
        );
      }
    }
    await client.query(
      "INSERT INTO bncc_stage (id,name) VALUES ('EI','Educação Infantil'),('EF','Ensino Fundamental'),('EM','Ensino Médio') ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name",
    );

    for (const area of array(structure.areas_conhecimento).map(object)) {
      await client.query(
        "INSERT INTO bncc_area (id,stage_id,name,document_id) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,stage_id=EXCLUDED.stage_id,document_id=EXCLUDED.document_id",
        [area.id, area.etapa, area.nome, area.documento],
      );
    }
    for (const component of array(structure.componentes_curriculares).map(
      object,
    )) {
      await client.query(
        "INSERT INTO bncc_component (id,stage_id,area_id,name,code_prefix,has_own_learning,presence_years,legal_note,note,document_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'bncc-2018') ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,area_id=EXCLUDED.area_id,stage_id=EXCLUDED.stage_id,presence_years=EXCLUDED.presence_years",
        [
          component.id,
          component.etapa,
          component.area ?? null,
          component.nome,
          component.sigla_codigo ?? null,
          component.tem_aprendizagens_proprias,
          object(component.presenca ?? {}).anos ?? null,
          component.destaque_legal ?? null,
          component.nota ?? null,
        ],
      );
    }
    for (const cut of array(structure.recortes_temporais).map(object)) {
      await client.query(
        "INSERT INTO bncc_time_cut (id,stage_id,cut_type,name,number,segment,age_range,note,document_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'bncc-2018') ON CONFLICT (id) DO NOTHING",
        [
          cut.id,
          cut.etapa,
          cut.tipo,
          cut.nome ?? null,
          cut.numero ?? null,
          cut.segmento ?? null,
          cut.faixa ?? null,
          cut.nota ?? null,
        ],
      );
    }
    for (const field of array(structure.campos_experiencias).map(object)) {
      await client.query(
        "INSERT INTO bncc_field_experience (id,name,document_id) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name",
        [field.id, field.nome, field.documento],
      );
    }
    for (const context of [
      ...array(ef.contextos_organizacao),
      ...array(em.contextos_organizacao),
    ].map(object)) {
      await client.query(
        "INSERT INTO bncc_context (id,context_type,name,component_id,document_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name",
        [
          context.id,
          context.tipo,
          context.nome,
          context.componente ?? null,
          context.documento ?? "bncc-2018",
        ],
      );
      if (context.tipo === "oc") {
        await client.query(
          "INSERT INTO bncc_object (id,name,parent_id,document_id) VALUES ($1,$2,NULL,$3) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name",
          [context.id, context.nome, context.documento ?? "bncc-2018"],
        );
      }
    }
    for (const axis of array(co.eixos).map(object)) {
      await client.query(
        "INSERT INTO bncc_axis (id,name,document_id) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name",
        [axis.id, axis.nome, axis.documento],
      );
    }
    const computingObjects = array(co.objetos_conhecimento).map(object);
    for (const knowledgeObject of computingObjects) {
      await client.query(
        "INSERT INTO bncc_object (id,name,parent_id,document_id) VALUES ($1,$2,NULL,$3) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,document_id=EXCLUDED.document_id",
        [knowledgeObject.id, knowledgeObject.nome, knowledgeObject.documento],
      );
    }
    for (const knowledgeObject of computingObjects) {
      if (knowledgeObject.pai) {
        await client.query("UPDATE bncc_object SET parent_id=$2 WHERE id=$1", [
          knowledgeObject.id,
          knowledgeObject.pai,
        ]);
      }
    }
    for (const competency of array(co.competencias).map(object)) {
      const provenance = object(competency.fonte ?? {});
      await client.query(
        "INSERT INTO bncc_competency (id,competency_type,number,text,area_id,component_id,document_id,source_file,source_locator,source_pdf_locator,source_url) VALUES ($1,$2,$3,$4,NULL,NULL,$5,$6,$7,$8,$9) ON CONFLICT (id) DO UPDATE SET text=EXCLUDED.text",
        [
          competency.id,
          competency.tipo,
          competency.numero,
          competency.texto,
          competency.documento,
          provenance.arquivo ?? null,
          provenance.localizador ?? null,
          provenance.localizador_pdf ?? null,
          provenance.url_oficial ?? null,
        ],
      );
    }
    for (const competency of array(structure.competencias_gerais)
      .concat(array(structure.competencias_especificas))
      .map(object)) {
      const provenance = object(competency.fonte ?? {});
      await client.query(
        "INSERT INTO bncc_competency (id,competency_type,number,text,area_id,component_id,document_id,source_file,source_locator,source_pdf_locator,source_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO UPDATE SET text=EXCLUDED.text",
        [
          competency.id,
          competency.tipo,
          competency.numero,
          competency.texto,
          competency.area ?? null,
          competency.componente ?? null,
          competency.documento,
          provenance.arquivo ?? null,
          provenance.localizador ?? null,
          provenance.localizador_pdf ?? null,
          provenance.url_oficial ?? null,
        ],
      );
    }

    const learningIds = new Map<string, string>();
    const addLearning = async (
      record: JsonObject,
      stage: string,
      kind: string,
      document: string,
    ) => {
      const id = await upsertLearning(client, {
        code: string(record.codigo, "codigo"),
        document,
        stage,
        kind,
        text: string(record.texto, "texto"),
        validity: object(record.vigencia),
        source: object(record.fonte),
      });
      learningIds.set(`${document}:${record.codigo}`, id);
      return id;
    };
    for (const record of array(ei.objetivos).map(object)) {
      const id = await addLearning(record, "EI", "objective", "bncc-2018");
      await client.query(
        "INSERT INTO bncc_learning_field (learning_id,field_id) VALUES ($1::uuid,$2::varchar(255)) ON CONFLICT DO NOTHING",
        [id, record.campo_experiencias],
      );
      await client.query(
        "INSERT INTO bncc_learning_time_cut (learning_id,time_cut_id) VALUES ($1::uuid,$2::varchar(255)) ON CONFLICT DO NOTHING",
        [id, record.grupo_etario],
      );
    }
    for (const record of array(ef.habilidades).map(object)) {
      const organization = object(record.organizacao ?? {});
      const id = await addLearning(record, "EF", "skill", "bncc-2018");
      await client.query(
        "INSERT INTO bncc_learning_component (learning_id,component_id) VALUES ($1::uuid,$2::varchar(255)) ON CONFLICT DO NOTHING",
        [id, record.componente],
      );
      for (const year of array(record.anos))
        await client.query(
          "INSERT INTO bncc_learning_time_cut (learning_id,time_cut_id) VALUES ($1::uuid,$2::varchar(255)) ON CONFLICT DO NOTHING",
          [id, `ef-ano-${String(year).padStart(2, "0")}`],
        );
      for (const ref of [
        ...array(record.objetos_conhecimento),
        ...array(organization.unidade_tematica),
        ...array(organization.campos_atuacao),
        ...array(organization.pratica_linguagem),
        ...array(organization.eixo),
      ])
        await client.query(
          "INSERT INTO bncc_learning_context (learning_id,context_id) VALUES ($1::uuid,$2::varchar(255)) ON CONFLICT DO NOTHING",
          [id, ref],
        );
    }
    for (const record of array(em.habilidades).map(object)) {
      const id = await addLearning(record, "EM", "skill", "bncc-2018");
      if (record.area)
        await client.query(
          "INSERT INTO bncc_learning_area (learning_id,area_id) VALUES ($1::uuid,$2::varchar(255)) ON CONFLICT DO NOTHING",
          [id, record.area],
        );
      if (record.componente)
        await client.query(
          "INSERT INTO bncc_learning_component (learning_id,component_id) VALUES ($1::uuid,$2::varchar(255)) ON CONFLICT DO NOTHING",
          [id, record.componente],
        );
      for (const competency of array(record.competencias_especificas))
        await client.query(
          "INSERT INTO bncc_learning_competency (learning_id,competency_id) VALUES ($1::uuid,$2::varchar(255)) ON CONFLICT DO NOTHING",
          [id, competency],
        );
      for (const context of array(record.campos_atuacao_social))
        await client.query(
          "INSERT INTO bncc_learning_context (learning_id,context_id) VALUES ($1::uuid,$2::varchar(255)) ON CONFLICT DO NOTHING",
          [id, context],
        );
    }
    for (const record of [
      ...array(co.objetivos_ei),
      ...array(co.habilidades_ef),
      ...array(co.habilidades_em),
    ].map(object)) {
      const stage = String(record.codigo).startsWith("EI")
        ? "EI"
        : String(record.codigo).startsWith("EF")
          ? "EF"
          : "EM";
      const id = await addLearning(
        record,
        stage,
        "computing_learning",
        "computacao-2022",
      );
      if (record.grupo_etario)
        await client.query(
          "INSERT INTO bncc_learning_time_cut (learning_id,time_cut_id) VALUES ($1::uuid,$2::varchar(255)) ON CONFLICT DO NOTHING",
          [id, record.grupo_etario],
        );
      for (const year of array(record.anos))
        await client.query(
          "INSERT INTO bncc_learning_time_cut (learning_id,time_cut_id) VALUES ($1::uuid,$2::varchar(255)) ON CONFLICT DO NOTHING",
          [id, `ef-ano-${String(year).padStart(2, "0")}`],
        );
      if (record.eixo)
        await client.query(
          "INSERT INTO bncc_learning_axis (learning_id,axis_id,axis_name) VALUES ($1::uuid,$2::varchar(255),$2::text) ON CONFLICT DO NOTHING",
          [id, record.eixo],
        );
      for (const competency of [
        record.competencia,
        ...array(record.competencias),
      ])
        if (competency)
          await client.query(
            "INSERT INTO bncc_learning_competency (learning_id,competency_id) VALUES ($1::uuid,$2::varchar(255)) ON CONFLICT DO NOTHING",
            [id, competency],
          );
      for (const obj of array(record.objetos_conhecimento))
        await client.query(
          "INSERT INTO bncc_learning_object (learning_id,object_id) VALUES ($1::uuid,$2::varchar(255)) ON CONFLICT DO NOTHING",
          [id, obj],
        );
    }
    for (const alignment of array(ei.alinhamentos).map(object)) {
      await client.query(
        "INSERT INTO bncc_ei_alignment (id,field_id,note,document_id) VALUES ($1,$2,$3,'bncc-2018') ON CONFLICT (id) DO UPDATE SET note=EXCLUDED.note",
        [alignment.id, alignment.campo_experiencias, alignment.nota ?? null],
      );
      for (const code of array(alignment.objetivos)) {
        const id = learningIds.get(`bncc-2018:${code}`);
        if (id)
          await client.query(
            "INSERT INTO bncc_ei_alignment_member (alignment_id,learning_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
            [alignment.id, id],
          );
      }
    }
    const projection = await client.query<{
      project_bncc_compatibility: object;
    }>("SELECT project_bncc_compatibility($1) AS project_bncc_compatibility", [
      snapshotChecksum,
    ]);
    await client.query("COMMIT");
    console.log(
      JSON.stringify({
        dataVersion: DATA_VERSION,
        schemaVersion: SCHEMA_VERSION,
        snapshotChecksum,
        counts: EXPECTED_COUNTS,
        compatibility: projection.rows[0]?.project_bncc_compatibility ?? null,
      }),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

loadRootEnvironment();
const config = loadConfig(process.env);
const sourceDir = resolve(
  argument("--source-dir") ??
    join(findRepositoryRoot(), "database", "bncc", "source"),
);
importSnapshot(
  sourceDir,
  config.databaseUrl,
  process.argv.includes("--dry-run"),
).catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Falha ao importar BNCC.",
  );
  process.exitCode = 1;
});
