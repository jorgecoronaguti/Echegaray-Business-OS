-- ============================================================================
-- XSAS RECUERDA LO CONVERSADO — memoria entre chats, sin transcripts en el contexto del modelo.
--
-- POR QUÉ. Existían dos de las tres capas: `xsas_requests` (metadata de cada pedido, sin contenido)
-- y `xsas_contexto` (estado de trabajo de UNA conversación). Lo dicho en un chat moría con el chat:
-- «seguí con lo de Quattropani» en una conversación nueva obligaba a explicar todo otra vez, y una
-- decisión tomada por chat no existía en ningún lado consultable. Dos tablas nuevas:
--
--   · `xsas_mensaje` — el CHAT RAW: cada mensaje original, como evidencia histórica. No se
--     reescribe nunca; es a donde apunta la trazabilidad de toda memoria consolidada.
--   · `xsas_memoria` — la MEMORIA CONSOLIDADA: hechos reutilizables entre conversaciones, con
--     estado (mencionado ≠ decidido ≠ confirmado…), genealogía (qué superó a qué) y provenance
--     (conversación + mensaje + actor + fecha de donde salió).
--
-- HECHO ≠ CONVERSACIÓN: una fila acá dice quién lo dijo y cuándo, no que sea verdad empresarial.
-- MEMORIA ≠ LEARNING: esto no toca `xsas_aprendizaje`; una decisión contextual no se promueve sola
-- a conocimiento general.
--
-- El aislamiento es del actor, como en `xsas_contexto`: toda lectura filtra por el actor que puso
-- el SERVIDOR. Compartir memoria entre actores requerirá una decisión explícita del dueño.
-- ============================================================================

create table if not exists orq.xsas_mensaje (
  id              uuid primary key default gen_random_uuid(),
  conversation_id text not null,               -- el correlation_id de la conversación
  message_id      text not null,               -- el request_id del pedido que lo trajo
  actor_id        text not null,
  emisor          text not null,               -- usuario | xsas
  contenido       text not null,               -- el texto original, acotado; NUNCA se reescribe
  adjuntos        jsonb,                       -- [{hash, nombre}] cuando los hubo
  creado_en       timestamptz not null default now()
);

create index if not exists xsas_mensaje_conversacion
  on orq.xsas_mensaje (actor_id, conversation_id, creado_en);
create index if not exists xsas_mensaje_por_id on orq.xsas_mensaje (message_id);

create table if not exists orq.xsas_memoria (
  id              uuid primary key default gen_random_uuid(),
  actor_id        text not null,               -- de quién es la memoria (aislamiento)
  tema            text[] not null default '{}',-- palabras-clave del asunto (consolidación y búsqueda)
  entidades       text[] not null default '{}',-- obra/cliente/persona a las que refiere
  contenido       text not null,               -- el hecho, en una frase
  estado          text not null default 'mencionado',
  vigente         boolean not null default true,
  supersede_a     uuid,                        -- genealogía: a qué memoria reemplazó
  superada_por    uuid,                        -- y quién la reemplazó a ella
  dicho_por       text not null,               -- el actor que lo dijo (provenance, no permiso)
  conversation_id text not null,               -- trazabilidad al chat de origen
  message_id      text,                        -- y al mensaje exacto
  creado_en       timestamptz not null default now(),
  constraint xsas_memoria_estado_valido check (estado in
    ('mencionado','decidido','confirmado','observado','inferido','superado','conflicto'))
);

create index if not exists xsas_memoria_vigente on orq.xsas_memoria (actor_id, vigente, creado_en desc);
create index if not exists xsas_memoria_entidades on orq.xsas_memoria using gin (entidades);

-- RLS aunque `orq` no esté expuesto a PostgREST — mismo criterio que xsas_requests: una tabla sin
-- policy devuelve cero filas y un cero por falta de policy es indistinguible de un cero real.
alter table orq.xsas_mensaje enable row level security;
drop policy if exists xsas_mensaje_servicio on orq.xsas_mensaje;
create policy xsas_mensaje_servicio on orq.xsas_mensaje
  for all to service_role using (true) with check (true);

alter table orq.xsas_memoria enable row level security;
drop policy if exists xsas_memoria_servicio on orq.xsas_memoria;
create policy xsas_memoria_servicio on orq.xsas_memoria
  for all to service_role using (true) with check (true);
