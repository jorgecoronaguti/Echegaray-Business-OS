-- EL COSTO DE LA INTELIGENCIA, ATRIBUIBLE — hasta hoy no se podía responder «¿quién gastó esto?».
--
-- `orq.chat_cost` guardaba `model, usd, rol, motivo`. Con eso se puede sumar el gasto del día
-- (`lib/budget.mjs` lo hace) pero no se puede contestar la pregunta que el dueño hizo: **qué
-- funciones y qué agentes están consumiendo IA y cuánto**. Faltaba de quién es cada llamada, cuántos
-- tokens movió, cuánto tardó y si salió bien.
--
-- Y faltaba algo más grave: TRES de los cuatro caminos que hablan con un modelo —la lectura de
-- comprobantes, el ruteo del Director y la interpretación del asistente— no escribían acá nada. El
-- gasto de leer 900 comprobantes con `claude-opus-5` no figuraba en ninguna tabla.
--
-- Todo es ADITIVO y con default: ninguna fila vieja se toca y el insert de cuatro columnas que ya
-- existe en `interactive-server.mjs` sigue funcionando igual.

alter table orq.chat_cost add column if not exists agente        text;
alter table orq.chat_cost add column if not exists funcion       text;
alter table orq.chat_cost add column if not exists proveedor     text not null default 'anthropic';
alter table orq.chat_cost add column if not exists capacidad     text;
alter table orq.chat_cost add column if not exists tokens_in     integer;
alter table orq.chat_cost add column if not exists tokens_out    integer;
alter table orq.chat_cost add column if not exists ms            integer;
alter table orq.chat_cost add column if not exists ok            boolean not null default true;
alter table orq.chat_cost add column if not exists error_kind    text;
-- Cuál proveedor atendió de verdad cuando el primero no pudo. NULL = contestó el titular.
alter table orq.chat_cost add column if not exists fallback_de   text;

comment on column orq.chat_cost.agente is
  'El slug de orq.agents que pidió, o el nombre del circuito cuando no hay agente formal '
  '(«comprobantes», «ruteo», «asistente»). Es la respuesta a «quién gastó esto».';
comment on column orq.chat_cost.funcion is
  'Qué se estaba haciendo, dentro del agente: «leer-comprobante», «revisar-lectura», «rutear». '
  'Un agente puede tener funciones de costo muy distinto y sumarlas escondería la cara.';
comment on column orq.chat_cost.ok is
  'false = la llamada falló. Se registra IGUAL: una llamada que falla consume cuota y tiempo, y '
  'borrarla del registro haría parecer que el proveedor nunca falla.';
comment on column orq.chat_cost.fallback_de is
  'El proveedor que NO pudo, cuando contestó otro. NULL = contestó el titular. Sirve para ver '
  'cuánto del mes se atendió degradado sin tener que leer los logs.';

-- NUNCA se guarda el prompt ni la respuesta: acá va cuánto costó, no qué se dijo. Los datos de la
-- empresa no se duplican en una tabla de telemetría.

create index if not exists chat_cost_ts_idx     on orq.chat_cost (ts desc);
create index if not exists chat_cost_agente_idx on orq.chat_cost (agente, ts desc);

-- LA PREGUNTA DEL DUEÑO, YA RESUELTA: qué consume IA y cuánto, por día.
create or replace view orq.v_costo_ia as
select
  date_trunc('day', ts)                       as dia,
  coalesce(agente, rol, 'sin atribuir')       as agente,
  coalesce(funcion, motivo, 'sin detalle')    as funcion,
  proveedor,
  model                                       as modelo,
  count(*)                                    as llamadas,
  count(*) filter (where not ok)              as fallidas,
  count(*) filter (where fallback_de is not null) as por_fallback,
  sum(coalesce(tokens_in, 0))                 as tokens_in,
  sum(coalesce(tokens_out, 0))                as tokens_out,
  round(sum(coalesce(usd, 0))::numeric, 4)    as usd,
  round(avg(ms)::numeric, 0)                  as ms_promedio
from orq.chat_cost
group by 1, 2, 3, 4, 5;

comment on view orq.v_costo_ia is
  'Qué agente, con qué función, en qué proveedor y modelo, cuántas llamadas y cuánto costó — por '
  'día. Las fallidas se cuentan aparte: consumen y no producen.';
