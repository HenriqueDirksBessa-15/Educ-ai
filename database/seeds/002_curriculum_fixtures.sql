INSERT INTO curriculum_load (
  id, source_label, source_version, checksum, status, is_fixture
) VALUES (
  'f2e1f60c-b9d8-40d7-83f5-4d4b707d2d11',
  'EDUCAI_SIMULATED_CURRICULUM',
  'day-3-fixture-v1',
  'simulated-day-3-fixture-v1',
  'applied',
  true
)
ON CONFLICT (source_label, source_version, checksum) DO NOTHING;

UPDATE curriculum_area
SET curriculum_load_id = 'f2e1f60c-b9d8-40d7-83f5-4d4b707d2d11'
WHERE is_fixture = true AND curriculum_load_id IS NULL;

UPDATE syllabus
SET curriculum_load_id = 'f2e1f60c-b9d8-40d7-83f5-4d4b707d2d11'
WHERE is_fixture = true AND curriculum_load_id IS NULL;

UPDATE bncc_skill
SET curriculum_load_id = 'f2e1f60c-b9d8-40d7-83f5-4d4b707d2d11'
WHERE is_fixture = true AND curriculum_load_id IS NULL;

INSERT INTO curriculum_change (curriculum_load_id, entity_type, entity_id, operation)
SELECT 'f2e1f60c-b9d8-40d7-83f5-4d4b707d2d11', 'curriculum_area', id, 'update'
FROM curriculum_area
WHERE curriculum_load_id = 'f2e1f60c-b9d8-40d7-83f5-4d4b707d2d11'
ON CONFLICT DO NOTHING;

INSERT INTO curriculum_change (curriculum_load_id, entity_type, entity_id, operation)
SELECT 'f2e1f60c-b9d8-40d7-83f5-4d4b707d2d11', 'syllabus', id, 'update'
FROM syllabus
WHERE curriculum_load_id = 'f2e1f60c-b9d8-40d7-83f5-4d4b707d2d11'
ON CONFLICT DO NOTHING;

INSERT INTO curriculum_change (curriculum_load_id, entity_type, entity_id, operation)
SELECT 'f2e1f60c-b9d8-40d7-83f5-4d4b707d2d11', 'bncc_skill', id, 'update'
FROM bncc_skill
WHERE curriculum_load_id = 'f2e1f60c-b9d8-40d7-83f5-4d4b707d2d11'
ON CONFLICT DO NOTHING;
