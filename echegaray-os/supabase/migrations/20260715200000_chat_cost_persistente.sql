-- ============================================================================
-- COSTO DEL CHAT PERSISTENTE — para que el TOPE diario sea honesto y a prueba de
-- reinicios. Hasta ahora el gasto del chat vivía solo en memoria del server y se
-- borraba en cada restart: el governor de presupuesto sub-contaba (o saltaba de
-- golpe). Con esta tabla, costoHoy() suma worker (orq.tasks) + chat (acá) de verdad.
-- ============================================================================

create table if not exists orq.chat_cost (
  id      bigint generated always as identity primary key,
  ts      timestamptz not null default now(),
  model   text,
  usd     numeric not null default 0,
  rol     text
);

create index if not exists chat_cost_ts on orq.chat_cost (ts desc);
