CREATE OR REPLACE FUNCTION project_bncc_compatibility(
  p_checksum text,
  p_source_uri text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_load_id uuid;
  v_areas integer := 0;
  v_syllabi integer := 0;
  v_skills integer := 0;
  v_row_count integer := 0;
BEGIN
  IF btrim(coalesce(p_checksum, '')) = '' THEN
    RAISE EXCEPTION 'O checksum do snapshot BNCC é obrigatório';
  END IF;

  INSERT INTO curriculum_load (
    source_label, source_version, source_uri, checksum, status, is_fixture
  ) VALUES (
    'BNCC_CANONICAL', 'dados-2026.07.1', p_source_uri, p_checksum,
    'applied', false
  )
  ON CONFLICT (source_label, source_version, checksum)
  DO UPDATE SET source_uri = EXCLUDED.source_uri,
                status = 'applied', error_code = NULL,
                error_message = NULL, loaded_at = now()
  RETURNING id INTO v_load_id;

  IF v_load_id IS NULL THEN
    SELECT id INTO v_load_id
    FROM curriculum_load
    WHERE source_label = 'BNCC_CANONICAL'
      AND source_version = 'dados-2026.07.1'
      AND checksum = p_checksum;
  END IF;

  -- The legacy model has no canonical counterpart for EI fields or computing.
  -- These stable synthetic areas keep the old API usable without changing its
  -- response shape.
  INSERT INTO curriculum_area (id, name, source_label, is_fixture, curriculum_load_id)
  VALUES
    ('8c5c2f7a-2e57-5b0f-8c90-5df5cde5c001'::uuid, 'Educação Infantil', 'BNCC_CANONICAL', false, v_load_id),
    ('8c5c2f7a-2e57-5b0f-8c90-5df5cde5c002'::uuid, 'Computação', 'BNCC_CANONICAL', false, v_load_id)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name,
                                  source_label = EXCLUDED.source_label,
                                  is_fixture = false,
                                  curriculum_load_id = EXCLUDED.curriculum_load_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_areas := v_areas + v_row_count;

  INSERT INTO curriculum_area (id, name, source_label, is_fixture, curriculum_load_id)
  SELECT md5('bncc-area:' || a.id)::uuid, a.name, 'BNCC_CANONICAL', false, v_load_id
  FROM bncc_area a
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name,
                                  source_label = EXCLUDED.source_label,
                                  is_fixture = false,
                                  curriculum_load_id = EXCLUDED.curriculum_load_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_areas := v_areas + v_row_count;

  CREATE TEMP TABLE _bncc_learning_projection ON COMMIT DROP AS
    SELECT
      l.id AS learning_id,
      l.code,
      l.text,
      l.document_id,
      coalesce(
        md5('bncc-area:' || c.area_id)::uuid,
        md5('bncc-area:' || a.id)::uuid,
        CASE WHEN l.stage_id = 'EI'
          THEN '8c5c2f7a-2e57-5b0f-8c90-5df5cde5c001'::uuid
          ELSE '8c5c2f7a-2e57-5b0f-8c90-5df5cde5c002'::uuid
        END) AS grouping_id,
      coalesce(c.name, a.name,
        CASE WHEN l.stage_id = 'EI' THEN 'Educação Infantil' ELSE 'Computação' END) AS component_name,
      coalesce(tc.name, tc.id, l.stage_id) AS school_year,
      coalesce(o.name, 'Aprendizagem BNCC') AS knowledge_object,
      coalesce(ctx.name, ax.name) AS thematic_unit
    FROM bncc_learning l
    LEFT JOIN LATERAL (
      SELECT c.area_id, c.name
      FROM bncc_learning_component lc
      JOIN bncc_component c ON c.id = lc.component_id
      WHERE lc.learning_id = l.id
      ORDER BY c.id
      LIMIT 1
    ) c ON true
    LEFT JOIN LATERAL (
      SELECT a.id, a.name
      FROM bncc_learning_area la
      JOIN bncc_area a ON a.id = la.area_id
      WHERE la.learning_id = l.id
      ORDER BY a.id
      LIMIT 1
    ) a ON true
    LEFT JOIN LATERAL (
      SELECT tc.id, tc.name
      FROM bncc_learning_time_cut ltc
      JOIN bncc_time_cut tc ON tc.id = ltc.time_cut_id
      WHERE ltc.learning_id = l.id
      ORDER BY tc.number NULLS LAST, tc.id
      LIMIT 1
    ) tc ON true
    LEFT JOIN LATERAL (
      SELECT o.name
      FROM bncc_learning_object lo
      JOIN bncc_object o ON o.id = lo.object_id
      WHERE lo.learning_id = l.id
      ORDER BY o.id
      LIMIT 1
    ) o ON true
    LEFT JOIN LATERAL (
      SELECT c.name
      FROM bncc_learning_context lc
      JOIN bncc_context c ON c.id = lc.context_id
      WHERE lc.learning_id = l.id
      ORDER BY c.id
      LIMIT 1
    ) ctx ON true
    LEFT JOIN LATERAL (
      SELECT ax.name
      FROM bncc_learning_axis lax
      JOIN bncc_axis ax ON ax.id = lax.axis_id
      WHERE lax.learning_id = l.id
      ORDER BY ax.id
      LIMIT 1
    ) ax ON true
  ;

  INSERT INTO syllabus (
    id, curriculum_area_id, curricular_component, school_year, description,
    source_label, is_fixture, curriculum_load_id
  )
  SELECT DISTINCT
    md5('bncc-syllabus:' || document_id || ':' || grouping_id || ':' || component_name || ':' || school_year)::uuid,
    grouping_id, component_name, school_year, component_name,
    'BNCC_CANONICAL', false, v_load_id
  FROM _bncc_learning_projection
  ON CONFLICT (id) DO UPDATE SET curriculum_area_id = EXCLUDED.curriculum_area_id,
                                 curricular_component = EXCLUDED.curricular_component,
                                 school_year = EXCLUDED.school_year,
                                 description = EXCLUDED.description,
                                 source_label = EXCLUDED.source_label,
                                 is_fixture = false,
                                 curriculum_load_id = EXCLUDED.curriculum_load_id;
  GET DIAGNOSTICS v_syllabi = ROW_COUNT;

  INSERT INTO bncc_skill (
    id, syllabus_id, code, thematic_unit, knowledge_object, description,
    source_label, is_official, is_fixture, curriculum_load_id
  )
  SELECT md5('bncc-skill:' || lp.document_id || ':' || lp.code)::uuid,
         md5('bncc-syllabus:' || lp.document_id || ':' || lp.grouping_id || ':' || lp.component_name || ':' || lp.school_year)::uuid,
         lp.code, lp.thematic_unit, lp.knowledge_object, lp.text,
         'BNCC_CANONICAL', true, false, v_load_id
  FROM _bncc_learning_projection lp
  ON CONFLICT (id) DO UPDATE SET syllabus_id = EXCLUDED.syllabus_id,
                                 thematic_unit = EXCLUDED.thematic_unit,
                                 knowledge_object = EXCLUDED.knowledge_object,
                                 description = EXCLUDED.description,
                                 source_label = EXCLUDED.source_label,
                                 is_official = true,
                                 is_fixture = false,
                                 curriculum_load_id = EXCLUDED.curriculum_load_id;
  GET DIAGNOSTICS v_skills = ROW_COUNT;

  INSERT INTO curriculum_change (curriculum_load_id, entity_type, entity_id, operation)
  SELECT v_load_id, 'curriculum_area', id, 'update'
  FROM curriculum_area WHERE curriculum_load_id = v_load_id
  ON CONFLICT DO NOTHING;
  INSERT INTO curriculum_change (curriculum_load_id, entity_type, entity_id, operation)
  SELECT v_load_id, 'syllabus', id, 'update'
  FROM syllabus WHERE curriculum_load_id = v_load_id
  ON CONFLICT DO NOTHING;
  INSERT INTO curriculum_change (curriculum_load_id, entity_type, entity_id, operation)
  SELECT v_load_id, 'bncc_skill', id, 'update'
  FROM bncc_skill WHERE curriculum_load_id = v_load_id
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'curriculumLoadId', v_load_id,
    'areas', v_areas,
    'syllabi', v_syllabi,
    'skills', v_skills
  );
END;
$$;
