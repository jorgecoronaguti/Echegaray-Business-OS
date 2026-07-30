-- SKILL `personal.registrar_asistencia` — permisos, estado de formulario y vista de
-- auditoría. ADITIVA y AISLADA en el schema `comunicacion` (que ya existe y ya está
-- aplicado). NO toca public.*, NO toca orq.* y NO crea ninguna copia maestra de
-- trabajadores, obras, asignaciones ni asistencia: eso vive en el Sheet JORNALES y
-- ahí se queda.
--
-- Qué SÍ vive acá:
--   1. permisos_skill  → quién puede ejecutar qué, por identidad de plataforma.
--   2. asistencia_sesiones → el formulario a medio llenar (server-side, con TTL).
--      Hace falta en la BASE y no en memoria porque el bot son DOS procesos: el
--      consumidor WebSocket sólo ingiere, y el worker es el que responde.
--   3. v_asistencia_auditoria → vista de lectura sobre orq.events (el ledger oficial,
--      append-only). La auditoría NO tiene tabla propia: reusa el ledger que ya existe.

-- ── 1. PERMISOS POR IDENTIDAD DE PLATAFORMA (infraestructura, DESACTIVADA en el MVP) ──
-- El MVP aprobado corre en modo ABIERTO: cualquier usuario AUTENTICADO de Mattermost
-- registra y consulta asistencia, sin roles ni aprobaciones, y todo queda auditado con
-- su identidad real. Esta tabla queda creada y vacía a propósito: es la infraestructura
-- para endurecer más adelante con ORQ_ASISTENCIA_PERMISOS=estricto, sin desplegar código.
-- Estando en modo abierto, esta tabla NI SE CONSULTA, y por lo tanto estar vacía no
-- bloquea nada.
-- Deliberadamente NO hay nombres ni user_ids acá: se otorgan con
-- `orquestador/scripts/asistencia-permiso.mjs`. Una migración con user_ids adentro sería
-- configuración hardcodeada en git, que es justo lo que hay que evitar.
create table if not exists comunicacion.permisos_skill (
  id                 bigint generated always as identity primary key,
  plataforma         text not null,                       -- 'mattermost'
  plataforma_user_id text not null,                       -- user id EN la plataforma
  permiso            text not null,                       -- p.ej. 'personal.asistencia.write'
  display            text,                                -- para poder auditar sin ir a MM
  otorgado_por       text not null,                       -- quién lo dio (traza)
  activo             boolean not null default true,
  nota               text,
  creado_at          timestamptz not null default now(),
  actualizado_at     timestamptz not null default now(),
  unique (plataforma, plataforma_user_id, permiso)
);
create index if not exists permisos_skill_lookup_idx
  on comunicacion.permisos_skill (plataforma, plataforma_user_id, permiso) where activo;

comment on table comunicacion.permisos_skill is
  'Autorización de skills por identidad de plataforma (Mattermost). Sólo se consulta en modo estricto (ORQ_ASISTENCIA_PERMISOS=estricto), donde es fail-closed: sin fila activa, no se ejecuta. En el MVP el modo es abierto y esta tabla no se consulta. No duplica usuarios del OS: es un grant sobre una identidad.';

-- ── 2. ESTADO DEL FORMULARIO (server-side, efímero) ──────────────────────────
-- El cliente sólo manda un id de sesión y un token firmado. Nada de spreadsheet_id,
-- pestaña, coordenadas ni nombres: todo eso se resuelve y valida en el servidor y
-- vive acá mientras el jefe completa la carga.
create table if not exists comunicacion.asistencia_sesiones (
  id                 uuid primary key default gen_random_uuid(),
  plataforma         text not null,
  plataforma_user_id text not null,                       -- DUEÑO: sólo él puede operarla
  plataforma_username text,
  channel_id         text,                                -- canal privado/DM donde se responde
  root_post_id       text,                                -- hilo
  estado             text not null default 'abierta'
                     -- 'fallida': se intentó escribir y no entró. Estado propio para que la
                     -- clave de idempotencia (índice de abajo, sólo 'confirmada') se libere y
                     -- el jefe pueda reintentar: una carga que no entró no está registrada.
                     check (estado in ('abierta','confirmada','cancelada','vencida','conflicto','fallida')),
  fecha_operativa    date,                                -- día que se está cargando (tz San Juan)
  clave_obra         text,
  spreadsheet_id     text,
  pestana            text,
  marcas             jsonb not null default '{}'::jsonb,  -- nombre_clave → {estado, normales, extras}
  plan               jsonb,                               -- último plan calculado (evidencia del preview)
  idempotency_key    text,
  correlation_id     uuid,
  intentos_confirmacion int not null default 0,
  expira_at          timestamptz not null,
  creado_at          timestamptz not null default now(),
  actualizado_at     timestamptz not null default now(),
  cerrada_at         timestamptz
);
create index if not exists asistencia_sesiones_dueno_idx
  on comunicacion.asistencia_sesiones (plataforma, plataforma_user_id, estado);
create index if not exists asistencia_sesiones_expira_idx
  on comunicacion.asistencia_sesiones (expira_at) where estado = 'abierta';
-- Una sola sesión ABIERTA por persona: evita dos formularios simultáneos del mismo
-- jefe pisándose entre sí.
create unique index if not exists asistencia_sesiones_una_abierta_idx
  on comunicacion.asistencia_sesiones (plataforma, plataforma_user_id) where estado = 'abierta';
-- Una confirmación por clave de idempotencia: el reintento exacto no crea otra.
create unique index if not exists asistencia_sesiones_idem_idx
  on comunicacion.asistencia_sesiones (idempotency_key) where idempotency_key is not null and estado = 'confirmada';

comment on table comunicacion.asistencia_sesiones is
  'Estado server-side del formulario de asistencia (TTL). Evidencia del preview y de la confirmación; NO es fuente de verdad de la asistencia (eso es el Sheet JORNALES).';

-- Vence las sesiones abiertas pasadas de hora. La llama el worker de comunicación en
-- su loop, con intervalo propio (COMM_WORKER_VENCER_MS, default 60 s) — ver
-- crearVencedorPeriodico en orquestador/comunicacion/asistencia-sesion.mjs. Sin este
-- barrido una sesión ABANDONADA seguiría ocupando asistencia_sesiones_una_abierta_idx
-- hasta que su dueño volviera a escribir. También sirve suelta para limpieza manual.
create or replace function comunicacion.vencer_sesiones_asistencia()
returns integer language sql as $$
  with v as (
    update comunicacion.asistencia_sesiones
       set estado = 'vencida', cerrada_at = now(), actualizado_at = now()
     where estado = 'abierta' and expira_at <= now()
    returning 1)
  select count(*)::int from v;
$$;

-- ── 3. VISTA DE AUDITORÍA SOBRE EL LEDGER EXISTENTE ──────────────────────────
-- La auditoría de cada confirmación se emite con orq.emit_event (append-only). Esta
-- vista sólo la hace consultable sin conocer la forma del payload.
create or replace view comunicacion.v_asistencia_auditoria as
select
  e.created_at                                  as ocurrido_at,
  e.type                                        as evento,
  e.correlation_id,
  e.payload->>'skill_name'                      as skill_name,
  e.payload->>'status'                          as status,
  e.payload->>'mattermost_user_id'              as mattermost_user_id,
  e.payload->>'mattermost_username'             as mattermost_username,
  (e.payload->>'fecha_operativa')::date         as fecha_operativa,
  e.payload->>'timezone'                        as timezone,
  e.payload->>'spreadsheet_id'                  as spreadsheet_id,
  e.payload->>'sheet_name'                      as sheet_name,
  e.payload->>'obra_original'                   as obra_original,
  e.payload->>'obra_normalizada'                as obra_normalizada,
  e.payload->>'idempotency_key'                 as idempotency_key,
  (e.payload->>'cantidad_trabajadores')::int    as cantidad_trabajadores,
  (e.payload->>'cantidad_presentes')::int       as cantidad_presentes,
  (e.payload->>'cantidad_ausentes')::int        as cantidad_ausentes,
  (e.payload->>'cantidad_parciales')::int       as cantidad_parciales,
  (e.payload->>'cantidad_tarde')::int           as cantidad_tarde,
  (e.payload->>'horas_normales')::numeric       as horas_normales,
  (e.payload->>'horas_extra')::numeric          as horas_extra,
  (e.payload->>'horas_total')::numeric          as horas_total,
  e.payload->>'modo_permisos'                   as modo_permisos,
  -- Por celda: old_value / old_formula / old_effective_value / old_normal_hours /
  -- old_extra_hours / new_normal_hours / new_extra_hours / new_total_hours / new_formula.
  e.payload->'celdas_modificadas'               as celdas_modificadas,
  e.payload->>'error_code'                      as error_code,
  e.payload->>'error_message_sanitized'         as error_message_sanitized,
  e.payload
from orq.events e
where e.type like 'personal.asistencia.%';

comment on view comunicacion.v_asistencia_auditoria is
  'Auditoría del skill personal.registrar_asistencia, leída del ledger oficial orq.events. Incluye old_value/new_value por celda como evidencia del cambio confirmado — no para reconstruir la asistencia (la verdad es JORNALES).';
