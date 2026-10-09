-- Some official BNCC age-group labels exceed the original fixture width of 20.
-- Keep the complete label instead of truncating the compatibility projection.
ALTER TABLE syllabus
  ALTER COLUMN school_year TYPE varchar(255);
