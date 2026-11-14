# Database

The SQLite schema is in `schema.sql`. The backend creates the parent directory, opens the database, enables WAL/foreign keys, and runs the schema with `CREATE TABLE/INDEX IF NOT EXISTS` at startup. The default file is `../data/pharma.sqlite` from the project root; override it with `PHARMA_DB_PATH`.

All dynamic filters use bound SQLite parameters. See [database schema documentation](../docs/database-schema.md) for table meaning, indexes and deduplication behavior.
