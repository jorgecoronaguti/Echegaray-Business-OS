-- Rollback de 20260711120000_orq_fundacion_work_fabric.sql (Fase 0).
-- Es seguro y completo: el schema orq es aislado y aditivo; nada de public
-- depende de él. No borra ningún dato de negocio.
--
-- Uso (con DATABASE_URL apuntando al entorno objetivo):
--   psql "$DATABASE_URL" -f orquestador/db/rollback/0000_orq_fundacion_down.sql
drop schema if exists orq cascade;
