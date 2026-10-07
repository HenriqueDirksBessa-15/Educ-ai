-- Dados exclusivamente fictícios para desenvolvimento e teste.
-- As referências curriculares abaixo NÃO são habilidades oficiais da BNCC.

INSERT INTO professor (
  id,
  email,
  display_name,
  notification_preference,
  is_fixture
) VALUES
  ('00000000-0000-4000-8000-000000000001', 'professora.ana@example.invalid', 'Professora Ana (Fictícia)', 'visual', true),
  ('00000000-0000-4000-8000-000000000002', 'professor.beto@example.invalid', 'Professor Beto (Fictício)', 'visual', true)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name,
  notification_preference = EXCLUDED.notification_preference,
  is_fixture = EXCLUDED.is_fixture;

INSERT INTO curriculum_area (
  id,
  name,
  source_label,
  is_fixture
) VALUES (
  '00000000-0000-4000-8000-000000000010',
  'Área curricular simulada',
  'FIXTURE EDUC.AI - NÃO OFICIAL',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  source_label = EXCLUDED.source_label,
  is_fixture = EXCLUDED.is_fixture;

INSERT INTO syllabus (
  id,
  curriculum_area_id,
  curricular_component,
  school_year,
  description,
  source_label,
  is_fixture
) VALUES (
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000010',
  'Componente simulado',
  'Ano simulado',
  'Ementa fictícia usada somente para validar persistência e relacionamentos.',
  'FIXTURE EDUC.AI - NÃO OFICIAL',
  true
)
ON CONFLICT (id) DO UPDATE SET
  curriculum_area_id = EXCLUDED.curriculum_area_id,
  curricular_component = EXCLUDED.curricular_component,
  school_year = EXCLUDED.school_year,
  description = EXCLUDED.description,
  source_label = EXCLUDED.source_label,
  is_fixture = EXCLUDED.is_fixture;

INSERT INTO bncc_skill (
  id,
  syllabus_id,
  code,
  thematic_unit,
  knowledge_object,
  description,
  source_label,
  is_official,
  is_fixture
) VALUES (
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000011',
  'SIM-NAO-OFICIAL-01',
  'Unidade temática simulada',
  'Objeto de conhecimento simulado',
  'Habilidade deliberadamente fictícia; não representa a BNCC.',
  'FIXTURE EDUC.AI - NÃO OFICIAL',
  false,
  true
)
ON CONFLICT (id) DO UPDATE SET
  syllabus_id = EXCLUDED.syllabus_id,
  code = EXCLUDED.code,
  thematic_unit = EXCLUDED.thematic_unit,
  knowledge_object = EXCLUDED.knowledge_object,
  description = EXCLUDED.description,
  source_label = EXCLUDED.source_label,
  is_official = EXCLUDED.is_official,
  is_fixture = EXCLUDED.is_fixture;

INSERT INTO class_group (
  id,
  professor_id,
  name,
  description,
  school_year,
  local_access_code,
  origin,
  is_fixture
) VALUES
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    'Turma da Professora Ana (Fictícia)',
    'Turma isolada para validar autorização no desenvolvimento.',
    '2026',
    'TURMA-ANA-2026',
    'local',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000002',
    'Turma do Professor Beto (Fictícia)',
    'Segunda turma isolada para testes de acesso cruzado.',
    '2026',
    'TURMA-BETO-2026',
    'local',
    true
  )
ON CONFLICT (id) DO UPDATE SET
  professor_id = EXCLUDED.professor_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  school_year = EXCLUDED.school_year,
  local_access_code = EXCLUDED.local_access_code,
  origin = EXCLUDED.origin,
  is_fixture = EXCLUDED.is_fixture;

INSERT INTO student (
  id,
  name,
  email,
  is_fixture
) VALUES
  ('00000000-0000-4000-8000-000000000201', 'Aluna Ana (Fictícia)', 'aluna.ana@example.invalid', true),
  ('00000000-0000-4000-8000-000000000202', 'Aluno Beto (Fictício)', 'aluno.beto@example.invalid', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  is_fixture = EXCLUDED.is_fixture;

INSERT INTO enrollment (
  id,
  class_group_id,
  student_id,
  status,
  origin
) VALUES
  (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201',
    'active',
    'local'
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000202',
    'active',
    'local'
  )
ON CONFLICT (id) DO UPDATE SET
  class_group_id = EXCLUDED.class_group_id,
  student_id = EXCLUDED.student_id,
  status = EXCLUDED.status,
  origin = EXCLUDED.origin;

INSERT INTO integration_status (
  service,
  status,
  error_code,
  error_message,
  is_fixture
)
SELECT
  fixture.service::integration_service,
  'inactive'::integration_availability,
  'FIXTURE_NOT_CONFIGURED',
  'Integração não configurada; registro fictício de desenvolvimento.',
  true
FROM (
  VALUES
    ('google_oauth'),
    ('google_classroom'),
    ('google_forms'),
    ('openai')
) AS fixture(service)
WHERE NOT EXISTS (
  SELECT 1
  FROM integration_status current_status
  WHERE current_status.service = fixture.service::integration_service
    AND current_status.is_fixture = true
);
