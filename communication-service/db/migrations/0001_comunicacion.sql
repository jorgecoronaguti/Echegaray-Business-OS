-- PR-3 · Communication Layer — schema `comunicacion`.
--
-- Persistencia del Communication Service: log canónico de eventos (auditable,
-- append-only), outbox transaccional con reintentos/DLQ, y el mapeo de
-- identidades OS↔plataforma (sin duplicar usuarios).
--
-- IMPORTANTE (PR-3): esta migración es ADITIVA y está AISLADA en su propio
-- schema. NO toca ninguna tabla existente (public.*, orq.*), NO cambia el
-- Business OS y NO debe aplicarse a producción como parte de PR-3 — se aplica
-- recién cuando el wiring del PR-4 lo requiera, con su ventana y su rollback
-- (communication-service/db/rollback/0001_comunicacion_down.sql). Vive con el
-- servicio (no en echegaray-os/supabase/migrations) para honrar el desacople de
-- la ARCHITECTURE. Reproduce, sin acoplarse, el patrón ya probado de
-- orq.events / orq.emit_event (outbox transaccional + append-only).

create schema if not exists comunicacion;

-- ── 1. LOG CANÓNICO DE EVENTOS (auditable, append-only, idempotente) ─────────
create table comunicacion.eventos (
  seq             bigint generated always as identity primary key,
  id              uuid not null,                 -- id del evento canónico
  schema_version  int  not null,
  type            text not null,                 -- TIPOS canónicos (dominio.hecho)
  direccion       text not null check (direccion in ('outbound','inbound')),
  idempotency_key text not null,                 -- un hecho no entra dos veces
  correlation_id  uuid,                          -- hilo causal
  causation_id    uuid,                          -- evento que causó éste
  actor           jsonb,                         -- { tipo, id, display }
  data            jsonb not null default '{}'::jsonb,
  occurred_at     timestamptz not null,
  registrado_at   timestamptz not null default now(),
  unique (idempotency_key)                       -- idempotencia a nivel base
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

-- ── 2. OUTBOX (entrega saliente con reintentos/DLQ) ──────────────────────────
create table comunicacion.outbox (
  id              bigint generated always as identity primary key,
  evento_id       uuid not null,
  idempotency_key text not null,
  type            text not null,
  plataforma      text,                          -- adapter destino (default resuelto por el servicio)
  payload         jsonb not null,                -- el evento canónico completo
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','publicado','dead')),
  intentos        int  not null default 0,
  next_attempt_at timestamptz not null default now(),
  platform_ref    text,                          -- id del mensaje en la plataforma (post_id…)
  last_error      text,
  creado_at       timestamptz not null default now(),
  actualizado_at  timestamptz not null default now(),
  unique (idempotency_key)                        -- un evento saliente, una fila
);

create index outbox_pendientes_idx on comunicacion.outbox (estado, next_attempt_at)
  where estado = 'pendiente';

-- ── 3. DEAD LETTER (lo que agotó reintentos o falló permanente) ──────────────
create table comunicacion.dead_letter (
  id           bigint generated always as identity primary key,
  outbox_id    bigint,
  evento_id    uuid not null,
  type         text not null,
  payload      jsonb not null,
  intentos     int  not null,
  last_error   text,
  muerto_at    timestamptz not null default now()
);

-- ── 4. IDENTIDADES (puente OS ↔ plataforma, NO duplica usuarios) ─────────────
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

-- ── 5. RPCs de outbox (claim con SKIP LOCKED — misma técnica que el Work Fabric) ─
-- Emite un evento y (si es saliente) lo encola en el outbox, en UNA transacción.
create or replace function comunicacion.emit(p_evento jsonb)
returns uuid language plpgsql set search_path = comunicacion, pg_temp as $$
declare v_id uuid := (p_evento->>'id')::uuid;
begin
  insert into comunicacion.eventos (id, schema_version, type, direccion, idempotency_key,
    correlation_id, causation_id, actor, data, occurred_at)
  values (v_id, (p_evento->>'schema_version')::int, p_evento->>'type', p_evento->>'direccion',
    p_evento->>'idempotency_key', nullif(p_evento->>'correlation_id','')::uuid,
    nullif(p_evento->>'causation_id','')::uuid, p_evento->'actor', coalesce(p_evento->'data','{}'::jsonb),
    (p_evento->>'occurred_at')::timestamptz)
  on conflict (idempotency_key) do nothing;

  if (p_evento->>'direccion') = 'outbound' then
    insert into comunicacion.outbox (evento_id, idempotency_key, type, plataforma, payload)
    values (v_id, p_evento->>'idempotency_key', p_evento->>'type', p_evento->'data'->>'platform', p_evento)
    on conflict (idempotency_key) do nothing;
  end if;
  return v_id;
end;
$$;

-- Toma hasta N ítems pendientes listos, bloqueándolos para este worker.
create or replace function comunicacion.claim_outbox(p_lote int)
returns setof comunicacion.outbox language sql set search_path = comunicacion, pg_temp as $$
  select * from comunicacion.outbox
  where estado = 'pendiente' and next_attempt_at <= now()
  order by next_attempt_at
  for update skip locked
  limit p_lote;
$$;

comment on schema comunicacion is 'PR-3 Communication Layer: eventos canónicos, outbox/DLQ, identidades OS↔plataforma. Aislado, aditivo.';
