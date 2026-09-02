-- ============================================================================
-- EL GASTO DE MODELO QUEDA ATADO A SU PEDIDO — y el USD nunca es NULL en silencio.
--
-- POR QUÉ. La auditoría de consumo (docs/xsas/AUDITORIA-CONSUMO-API-CODE.md) encontró que
-- `orq.chat_cost` no permitía unir una llamada con el pedido que la causó (sin correlation_id) y
-- que 40 llamadas de opus-5 con 523k tokens tenían `usd = NULL`: el total mensual era un piso, no
-- un total. Dos columnas:
--
--   · correlation_id — la correlación del pedido /xsas (o del objetivo) que disparó la llamada.
--     La escribe el fusible (`lib/ia/fusible.mjs` → `registrarUso`). NULL = proceso sin pedido.
--   · usd_estimado   — true cuando el USD no salió de la tabla exacta de precios sino de la
--     estimación por familia de modelo. Un estimado a la vista vale más que un NULL invisible.
--
-- HACIA ADELANTE Y NADA MÁS: el pasado no se rellena con correlaciones inventadas.
-- ============================================================================

alter table orq.chat_cost add column if not exists correlation_id text;
alter table orq.chat_cost add column if not exists usd_estimado boolean not null default false;

create index if not exists chat_cost_correlacion on orq.chat_cost (correlation_id)
  where correlation_id is not null;
