-- Entrada por código começa pendente; o professor pode ligar, por turma, o
-- aceite automático de e-mails do domínio da turma.
ALTER TABLE class_group
  ADD COLUMN auto_accept_domain boolean NOT NULL DEFAULT false;
