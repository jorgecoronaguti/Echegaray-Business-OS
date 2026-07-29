-- PR-3 · Communication Layer — schema `comunicacion` (esquema final tras los
-- ajustes bloqueantes de la auditoría: M2 dedup atómico, M3 inbox/DLQ, M4 lease,
-- M7 auditoría de rechazos, M10 puente).
--
-- Persistencia del Communication Service: log canónico de eventos (auditable,
-- append-only), DOS colas simétricas con lease durable (salida=outbox,
-- entrada=inbox), Dead Letter, auditoría de rechazos entrantes y el mapeo de
-- identidades OS↔plataforma (sin duplicar usuarios).
--
-- IMPORTANTE (PR-3): esta migración es ADITIVA y está AISLADA en su propio
-- schema. NO toca ninguna tabla existente (public.*, orq.*), NO cambia el
-- Business OS y NO se aplica a producción como parte de PR-3 — se aplica recién
-- cuando el wiring del PR-4 lo requiera, con su ventana y su rollback
-- (communication-service/db/rollback/0001_comunicacion_down.sql). La lógica de
-- claim-con-lease y de insert-atómico vive en el repositorio (SQL parametrizado),
-- no en RPCs plpgsql, para que sea testeable de punta a punta y el mismo puerto
-- valga en memoria y en Postgres.

create schema if not exists comunicacion;

-- ── 1. LOG CANÓNICO DE EVENTOS (auditable, append-only, idempotente) ─────────
create table comunicacion.eventos (
  seq             bigint generated always as identity primary key,
  id              uuid not null,                 -- id del evento canónico
  schema_version  int  not null,
  type            text not null,                 -- TIPOS canónicos (dominio.hecho)
  direccion       text not null check (direccion in ('outbound','inbound')),
  idempotency_key text not null,                 -- IDENTIDAD del evento (M1: intención / natural), no contenido
  correlation_id  uuid,                          -- hilo causal
  causation_id    uuid,                          -- evento que causó éste
  actor           jsonb,                         -- { tipo, id, display }
  data            jsonb not null default '{}'::jsonb,
  occurred_at     timestamptz not null,
  registrado_at   timestamptz not null default now(),
  unique (idempotency_key)                       -- idempotencia a nivel base (M2: INSERT..ON CONFLICT DO NOTHING RETURNING)
);
create index eventos_correlation_idx on comunicacion.eventos (correlation_id, seq);
create index eventos_type_idx        on comunicacion.eventos (type, seq);

-- Append-only: prohibir update/delete (defensa en profundidad, igual que orq.events).
create or replace function comunicacion.eventos_immutable()
returns trigger language plpgsql set search_path = comunicacion, pg_temp as $$
begin
  raise exception 'comunicacion.eventos es append-only (% denegado)', tg_op;
end;
$$;
create trigger eventos_no_update before update on comunicacion.eventos
  for each row execute function comunicacion.eventos_immutable();
create trigger eventos_no_delete before delete on comunicacion.eventos
  for each row execute function comunicacion.eventos_immutable();

-- ── 2. COLA DE SALIDA (outbox) — entrega a la plataforma, con lease durable ──
create table comunicacion.outbox (
  id               bigint generated always as identity primary key,
  evento_id        uuid not null,
  idempotency_key  text not null,
  type             text not null,
  plataforma       text,                         -- adapter destino (default resuelto por el servicio)
  payload          jsonb not null,               -- el evento canónico completo
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente','en_proceso','publicado','dead')),
  intentos         int  not null default 0,
  next_attempt_at  timestamptz not null default now(),
  -- lease durable (M4): un worker reclama flipeando estado→en_proceso en la MISMA
  -- operación atómica; el lease permite recuperar si el worker muere.
  claimed_by       text,
  claimed_at       timestamptz,
  lease_expires_at timestamptz,
  platform_ref     text,                         -- id del mensaje en la plataforma (post_id…)
  last_error       text,
  creado_at        timestamptz not null default now(),
  actualizado_at   timestamptz not null default now(),
  unique (idempotency_key)                        -- un evento saliente, una fila
);
-- índice del claim: pendientes listos, ordenados por vencimiento.
create index outbox_reclamables_idx on comunicacion.outbox (next_attempt_at)
  where estado = 'pendiente';
-- índice para recuperar leases vencidos.
create index outbox_lease_idx on comunicacion.outbox (lease_expires_at)
  where estado = 'en_proceso';

-- ── 3. COLA DE ENTRADA (inbox) — procesamiento de handlers, mismo lease (M3) ──
create table comunicacion.inbox (
  id               bigint generated always as identity primary key,
  evento_id        uuid not null,
  idempotency_key  text not null,
  type             text not null,
  correlation_id   uuid,
  causation_id     uuid,
  payload          jsonb not null,               -- el evento canónico completo
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente','en_proceso','procesado','dead')),
  intentos         int  not null default 0,
  next_attempt_at  timestamptz not null default now(),
  claimed_by       text,
  claimed_at       timestamptz,
  lease_expires_at timestamptz,
  last_error       text,
  creado_at        timestamptz not null default now(),
  actualizado_at   timestamptz not null default now(),
  unique (idempotency_key)                        -- un evento entrante, una fila (idempotencia de replay)
);
create index inbox_reclamables_idx on comunicacion.inbox (next_attempt_at)
  where estado = 'pendiente';
create index inbox_lease_idx on comunicacion.inbox (lease_expires_at)
  where estado = 'en_proceso';

-- ── 4. DEAD LETTER (lo que agotó reintentos o falló permanente, de ambas colas) ─
create table comunicacion.dead_letter (
  id           bigint generated always as identity primary key,
  cola         text not null check (cola in ('salida','entrada')),
  origen_id    bigint,                            -- id en outbox/inbox
  evento_id    uuid not null,
  type         text not null,
  correlation_id uuid,
  causation_id uuid,
  payload      jsonb not null,
  intentos     int  not null,
  last_error   text,
  muerto_at    timestamptz not null default now()
);
create index dead_letter_cola_idx on comunicacion.dead_letter (cola, muerto_at);

-- ── 5. AUDITORÍA DE RECHAZOS ENTRANTES (M7) ──────────────────────────────────
-- Cada payload entrante rechazado por seguridad se AUDITA (no se cuenta y se
-- descarta en silencio). No guarda secretos ni firmas completas.
create table comunicacion.rechazos_entrantes (
  id           bigint generated always as identity primary key,
  plataforma   text,
  motivo       text not null,                     -- firma_invalida | timestamp_vencido | replay | ip_no_permitida | secreto_faltante | firma_faltante
  ip           text,
  firma_prefijo text,                             -- sólo un prefijo corto, nunca la firma entera
  detalle      text,
  at           timestamptz not null default now()
);
create index rechazos_at_idx on comunicacion.rechazos_entrantes (at);

-- ── 6. IDENTIDADES (puente OS ↔ plataforma, NO duplica usuarios) ─────────────
create table comunicacion.identidades (
  id                 bigint generated always as identity primary key,
  plataforma         text not null,              -- 'mattermost'
  plataforma_user_id text not null,              -- user id en la plataforma
  principal_id       uuid,                        -- link suave a orq.principals / public.perfiles
  display            text,
  confianza          text not null default 'inferido'
                     check (confianza in ('verificado','inferido','desconocido')),
  creado_at          timestamptz not null default now(),
  unique (plataforma, plataforma_user_id)
);
create index identidades_principal_idx on comunicacion.identidades (plataforma, principal_id);

comment on schema comunicacion is 'PR-3 Communication Layer: eventos canónicos, colas salida/entrada con lease, DLQ, auditoría de rechazos, identidades OS↔plataforma. Aislado, aditivo.';
