-- LO QUE NACIÓ POR FUERA QUEDA EN LA CADENA (2): `obra_canonica.contrato_monto` y `contrato_moneda`.
--
-- ═══ POR QUÉ EXISTE (18/09/2026) ═══
--
-- `20260827T0910_el_estado_de_la_empresa_se_puede_consultar.sql` y `20260827T1200_xsas_mira_por_la_vista_canonica.sql`
-- leen `o.contrato_monto` de `public.obra_canonica`. En producción esa columna existe (numeric, nullable) junto
-- con `contrato_moneda` (text not null default 'ARS'), pero NINGUNA migración del repositorio las crea: nacieron
-- por fuera de la cadena. En producción no se nota —la columna ya estaba— y la reconstrucción desde cero se corta
-- ahí: es exactamente la trampa que `.claude/rules/migraciones.md` describe («el nombre del archivo ES la posición
-- en la cadena»).
--
-- Se ubica ANTES de la primera migración que las usa. En producción es un no-op (`if not exists`); en una base
-- reconstruida crea lo que la cadena necesita. La definición copia la de producción, leída del catálogo el
-- 18/09/2026 (`information_schema.columns`).

alter table public.obra_canonica
  add column if not exists contrato_monto  numeric,
  add column if not exists contrato_moneda text not null default 'ARS';
