-- ============================================================================
-- LOS ADJUNTOS Y EL CONTEXTO DE /XSAS PERSISTEN — la continuidad no puede vivir en la RAM.
--
-- POR QUÉ. GATE 2 del executor: un archivo subido a /xsas se lee con el motor existente y esa
-- lectura tiene que sobrevivir al proceso, para que «ahora mostrame lo que quedó pendiente» se
-- conteste desde estado ESTRUCTURADO y no reenviándole un transcript a un modelo. Dos tablas:
--
--   · `xsas_adjunto`  — la lectura de cada archivo, identificada por su sha256 y POR ACTOR. El
--     mismo contenido subido dos veces reutiliza el parse; el parse de un actor no es evidencia
--     para otro. Se guarda el RESUMEN estructurado (texto acotado), nunca los bytes.
--   · `xsas_contexto` — el estado de trabajo de una conversación (actor + correlation_id):
--     archivos activos, entidades, referencias. Es un índice de trabajo, no un histórico.
--
-- El aislamiento es del actor: toda lectura del gateway filtra por el actor que puso el SERVIDOR.
-- Conocer el correlation_id de otro no alcanza para leer su contexto.
-- ============================================================================

create table if not exists orq.xsas_adjunto (
  id             uuid primary key default gen_random_uuid(),
  actor_id       text not null,
  correlation_id text,
  hash           text not null,               -- sha256 de los bytes: la identidad real del contenido
  nombre         text not null,               -- el nombre lo escribe quien sube; no identifica nada
  tamano         bigint,
  familia        text,                        -- planilla | pdf | texto | imagen | otro
  formato        text,
  destino        text,                        -- banco | planilla | pdf | texto | comprobantes | ninguno
  resumen        jsonb,                       -- la lectura estructurada, con el texto acotado
  creado_en      timestamptz not null default now(),
  unique (actor_id, hash)
);

create index if not exists xsas_adjunto_conversacion on orq.xsas_adjunto (actor_id, correlation_id);

create table if not exists orq.xsas_contexto (
  actor_id       text not null,
  correlation_id text not null,
  datos          jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default now(),
  primary key (actor_id, correlation_id)
);

-- RLS aunque el esquema `orq` no esté expuesto a PostgREST — mismo criterio que xsas_requests.
alter table orq.xsas_adjunto enable row level security;
drop policy if exists xsas_adjunto_servicio on orq.xsas_adjunto;
create policy xsas_adjunto_servicio on orq.xsas_adjunto
  for all to service_role using (true) with check (true);

alter table orq.xsas_contexto enable row level security;
drop policy if exists xsas_contexto_servicio on orq.xsas_contexto;
create policy xsas_contexto_servicio on orq.xsas_contexto
  for all to service_role using (true) with check (true);
