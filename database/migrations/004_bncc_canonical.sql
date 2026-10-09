CREATE TABLE bncc_document (
  id varchar(80) PRIMARY KEY,
  name text NOT NULL,
  document_type varchar(40) NOT NULL,
  sphere varchar(20) NOT NULL,
  derived_from_id varchar(80) REFERENCES bncc_document(id) ON DELETE RESTRICT,
  data_version varchar(40) NOT NULL,
  schema_version varchar(40) NOT NULL,
  source_commit varchar(64) NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bncc_stage (
  id varchar(2) PRIMARY KEY,
  name varchar(80) NOT NULL UNIQUE
);

CREATE TABLE bncc_area (
  id varchar(120) PRIMARY KEY,
  stage_id varchar(2) NOT NULL REFERENCES bncc_stage(id) ON DELETE RESTRICT,
  name text NOT NULL,
  document_id varchar(80) NOT NULL REFERENCES bncc_document(id) ON DELETE RESTRICT
);

CREATE TABLE bncc_component (
  id varchar(120) PRIMARY KEY,
  stage_id varchar(2) NOT NULL REFERENCES bncc_stage(id) ON DELETE RESTRICT,
  area_id varchar(120) REFERENCES bncc_area(id) ON DELETE RESTRICT,
  name text NOT NULL,
  code_prefix varchar(10),
  has_own_learning boolean NOT NULL,
  presence_years smallint[],
  legal_note text,
  note text,
  document_id varchar(80) NOT NULL REFERENCES bncc_document(id) ON DELETE RESTRICT
);

CREATE TABLE bncc_time_cut (
  id varchar(120) PRIMARY KEY,
  stage_id varchar(2) NOT NULL REFERENCES bncc_stage(id) ON DELETE RESTRICT,
  cut_type varchar(30) NOT NULL,
  name text,
  number smallint,
  segment varchar(30),
  age_range text,
  note text,
  document_id varchar(80) NOT NULL REFERENCES bncc_document(id) ON DELETE RESTRICT
);

CREATE TABLE bncc_field_experience (
  id varchar(120) PRIMARY KEY,
  name text NOT NULL,
  document_id varchar(80) NOT NULL REFERENCES bncc_document(id) ON DELETE RESTRICT
);

CREATE TABLE bncc_context (
  id varchar(120) PRIMARY KEY,
  context_type varchar(40) NOT NULL,
  name text NOT NULL,
  component_id varchar(120) REFERENCES bncc_component(id) ON DELETE RESTRICT,
  document_id varchar(80) NOT NULL REFERENCES bncc_document(id) ON DELETE RESTRICT
);

CREATE TABLE bncc_object (
  id varchar(120) PRIMARY KEY,
  name text NOT NULL,
  parent_id varchar(120) REFERENCES bncc_object(id) ON DELETE RESTRICT,
  document_id varchar(80) NOT NULL REFERENCES bncc_document(id) ON DELETE RESTRICT
);

CREATE TABLE bncc_axis (
  id varchar(120) PRIMARY KEY,
  name text NOT NULL,
  document_id varchar(80) NOT NULL REFERENCES bncc_document(id) ON DELETE RESTRICT
);

CREATE TABLE bncc_competency (
  id varchar(120) PRIMARY KEY,
  competency_type varchar(40) NOT NULL,
  number smallint NOT NULL,
  text text NOT NULL,
  area_id varchar(120) REFERENCES bncc_area(id) ON DELETE RESTRICT,
  component_id varchar(120) REFERENCES bncc_component(id) ON DELETE RESTRICT,
  document_id varchar(80) NOT NULL REFERENCES bncc_document(id) ON DELETE RESTRICT,
  source_file text,
  source_locator text,
  source_pdf_locator text,
  source_url text
);

CREATE TABLE bncc_learning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(30) NOT NULL,
  document_id varchar(80) NOT NULL REFERENCES bncc_document(id) ON DELETE RESTRICT,
  stage_id varchar(2) NOT NULL REFERENCES bncc_stage(id) ON DELETE RESTRICT,
  learning_kind varchar(40) NOT NULL,
  text text NOT NULL,
  validity_status varchar(20) NOT NULL,
  valid_from varchar(40) NOT NULL,
  valid_until varchar(40),
  source_file text,
  source_provenance text,
  source_locator text,
  source_pdf_locator text,
  source_url text,
  content_checksum varchar(64) NOT NULL,
  UNIQUE (document_id, code)
);

CREATE TABLE bncc_learning_component (
  learning_id uuid NOT NULL REFERENCES bncc_learning(id) ON DELETE CASCADE,
  component_id varchar(120) NOT NULL REFERENCES bncc_component(id) ON DELETE RESTRICT,
  PRIMARY KEY (learning_id, component_id)
);
CREATE TABLE bncc_learning_area (
  learning_id uuid NOT NULL REFERENCES bncc_learning(id) ON DELETE CASCADE,
  area_id varchar(120) NOT NULL REFERENCES bncc_area(id) ON DELETE RESTRICT,
  PRIMARY KEY (learning_id, area_id)
);
CREATE TABLE bncc_learning_time_cut (
  learning_id uuid NOT NULL REFERENCES bncc_learning(id) ON DELETE CASCADE,
  time_cut_id varchar(120) NOT NULL REFERENCES bncc_time_cut(id) ON DELETE RESTRICT,
  PRIMARY KEY (learning_id, time_cut_id)
);
CREATE TABLE bncc_learning_field (
  learning_id uuid NOT NULL REFERENCES bncc_learning(id) ON DELETE CASCADE,
  field_id varchar(120) NOT NULL REFERENCES bncc_field_experience(id) ON DELETE RESTRICT,
  PRIMARY KEY (learning_id, field_id)
);
CREATE TABLE bncc_learning_context (
  learning_id uuid NOT NULL REFERENCES bncc_learning(id) ON DELETE CASCADE,
  context_id varchar(120) NOT NULL REFERENCES bncc_context(id) ON DELETE RESTRICT,
  PRIMARY KEY (learning_id, context_id)
);
CREATE TABLE bncc_learning_object (
  learning_id uuid NOT NULL REFERENCES bncc_learning(id) ON DELETE CASCADE,
  object_id varchar(120) NOT NULL REFERENCES bncc_object(id) ON DELETE RESTRICT,
  PRIMARY KEY (learning_id, object_id)
);
CREATE TABLE bncc_learning_competency (
  learning_id uuid NOT NULL REFERENCES bncc_learning(id) ON DELETE CASCADE,
  competency_id varchar(120) NOT NULL REFERENCES bncc_competency(id) ON DELETE RESTRICT,
  PRIMARY KEY (learning_id, competency_id)
);
CREATE TABLE bncc_learning_axis (
  learning_id uuid NOT NULL REFERENCES bncc_learning(id) ON DELETE CASCADE,
  axis_id varchar(120) NOT NULL REFERENCES bncc_axis(id) ON DELETE RESTRICT,
  axis_name text NOT NULL,
  PRIMARY KEY (learning_id, axis_id)
);

CREATE TABLE bncc_ei_alignment (
  id varchar(120) PRIMARY KEY,
  field_id varchar(120) NOT NULL REFERENCES bncc_field_experience(id) ON DELETE RESTRICT,
  note text,
  document_id varchar(80) NOT NULL REFERENCES bncc_document(id) ON DELETE RESTRICT
);
CREATE TABLE bncc_ei_alignment_member (
  alignment_id varchar(120) NOT NULL REFERENCES bncc_ei_alignment(id) ON DELETE CASCADE,
  learning_id uuid NOT NULL REFERENCES bncc_learning(id) ON DELETE RESTRICT,
  PRIMARY KEY (alignment_id, learning_id)
);

CREATE TABLE bncc_legal_act (
  id varchar(120) PRIMARY KEY,
  act_type varchar(40) NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  official_url text NOT NULL,
  document_id varchar(80) NOT NULL REFERENCES bncc_document(id) ON DELETE RESTRICT
);

CREATE TABLE bncc_profile (
  id varchar(80) PRIMARY KEY,
  name text NOT NULL,
  synonyms text[] NOT NULL DEFAULT '{}',
  document_id varchar(80) NOT NULL REFERENCES bncc_document(id) ON DELETE RESTRICT
);

CREATE INDEX bncc_learning_code_idx ON bncc_learning (code);
CREATE INDEX bncc_learning_stage_idx ON bncc_learning (stage_id, learning_kind);
CREATE INDEX bncc_learning_validity_idx ON bncc_learning (validity_status, valid_from);
CREATE INDEX bncc_component_stage_idx ON bncc_component (stage_id, name);
CREATE INDEX bncc_time_cut_stage_idx ON bncc_time_cut (stage_id, number);
CREATE INDEX bncc_learning_component_idx ON bncc_learning_component (component_id, learning_id);
