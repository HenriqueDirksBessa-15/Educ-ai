-- Canonical BNCC context/object names are authoritative and may exceed the
-- original fixture widths of the legacy compatibility model.
ALTER TABLE bncc_skill
  ALTER COLUMN thematic_unit TYPE text,
  ALTER COLUMN knowledge_object TYPE text;
