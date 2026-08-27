-- ============================================================================
-- LA PUERTA DE XSAS DEJA CONSTANCIA DE CADA PEDIDO — no sólo de los que pagaron modelo.
--
-- POR QUÉ. `orq.chat_cost` cuenta LLAMADAS a un modelo. Con eso no se puede contestar la pregunta
-- que importa: «¿cuánto de lo que hace el OS necesita un modelo?». Un pedido resuelto por una tool
-- —el caso masivo y el barato— no deja una sola fila ahí, así que el costo por canal, la latencia
-- del camino determinístico y la proporción sin-LLM eran invisibles. Peor: `xsas-estado.mjs` ya
-- avisaba que hay llamadas que no dicen qué agente las pidió, y no había dónde anotarlo.
--
-- Esta tabla es POR PEDIDO, no por llamada: una fila por cada cosa que alguien le pidió a XSAS,
-- haya usado un modelo o no. `chat_cost` sigue siendo la contabilidad del proveedor y no se toca —
-- acá se anota quién pidió, por dónde, con qué capacidad se resolvió y qué salió.
--
-- HACIA ADELANTE Y NADA MÁS. No se rellena el pasado: una atribución inventada para las llamadas
-- viejas sería exactamente el defecto que esto viene a arreglar.
-- ============================================================================

create table if not exists orq.xsas_requests (
  id             uuid primary key default gen_random_uuid(),
  request_id     text not null,
  correlation_id text not null,
  canal          text not null,               -- app | mattermost | worker | timer | cli
  origen         text,                        -- la pantalla, el canal de Mattermost, el script
  actor_id       text,
  actor_rol      text,
  tipo           text not null,               -- mensaje | intencion | evento
  intencion      text,                        -- la capacidad pedida, o el atajo que resolvió
  nivel          smallint,                    -- 0 determinístico · 1 capacidad · 2 IA liviana · 3 razonamiento
  skills         text[] not null default '{}',
  tools          text[] not null default '{}',
  agente         text,
  llm            boolean not null default false,
  proveedor      text,
  modelo         text,                        -- el que RESPONDIÓ, no el que se pidió
  tokens_in      integer,
  tokens_out     integer,
  usd            numeric(12,6),
  fallback_de    text,                        -- el proveedor que falló antes que éste
  ms             integer,
  estado         text not null,               -- ok | degradado | error
  error_tipo     text,
  degradacion    text,
  creado_en      timestamptz not null default now()
);

create index if not exists xsas_requests_creado on orq.xsas_requests (creado_en desc);
create index if not exists xsas_requests_correlacion on orq.xsas_requests (correlation_id);
-- El índice que contesta «¿qué proporción de lo que pide cada canal necesita un modelo?».
create index if not exists xsas_requests_canal_llm on orq.xsas_requests (canal, llm, creado_en desc);

-- RLS aunque el esquema `orq` no esté expuesto a PostgREST: una tabla sin policy devuelve cero
-- filas en vez de un error, y un cero por falta de policy es indistinguible de un cero real. El
-- OS escribe como dueño de la tabla (que no pasa por RLS); cualquier otro rol no ve nada.
alter table orq.xsas_requests enable row level security;

drop policy if exists xsas_requests_servicio on orq.xsas_requests;
create policy xsas_requests_servicio on orq.xsas_requests
  for all to service_role using (true) with check (true);
