-- ASISTENTE CONVERSACIONAL DEL OS (MVP) — persistencia mínima.
--
-- El bot `@os` ya recibe lenguaje natural (consumidor WebSocket), ya lo convierte en tarea
-- del Work Fabric (ingesta-os) y ya tiene un Director que elige especialista. Lo que faltaba
-- para que además RESUELVA pedidos personales (buscar en Drive, recordar, agendar, anotar
-- una tarea) es este estado: quién es cada quien, qué hay que recordarle a quién y cuándo,
-- qué se preguntó y qué ya se ejecutó.
--
-- ADITIVA y AISLADA en el schema `comunicacion`, que ya existe. NO toca public.*, NO toca
-- orq.* y NO duplica ninguna fuente: los archivos siguen viviendo en Drive, los eventos en
-- Google Calendar, las tareas en Google Tasks. Acá sólo vive lo que es DEL OS.
--
-- Sin RLS, igual que el resto del schema `comunicacion`: no está expuesto a PostgREST ni a
-- `anon`/`authenticated` — se accede exclusivamente desde el worker por DATABASE_URL. La
-- autorización de estas filas la hace el código (dueño de la sesión / permiso de skill), no
-- una policy, porque no hay un `auth.uid()` del lado del chat: la identidad la trae
-- Mattermost.

-- ── 1. IDENTIDADES ───────────────────────────────────────────────────────────
-- El puente estable entre las tres identidades de una misma persona: quién es en
-- Mattermost (lo único que trae el evento), quién es en el OS (email de public.usuarios_os)
-- y con qué cuenta de Google actúa (orq.google_tokens, por email).
--
-- Existe porque sin él un recordatorio cruzado se resolvería por texto libre — "Rodrigo" —
-- y el texto libre no es una identidad: hay dos Rodrigos. Acá el nombre resuelve a un
-- user_id REAL o no resuelve, y entonces se pregunta.
create table if not exists comunicacion.identidades (
  id                  bigint generated always as identity primary key,
  plataforma          text not null default 'mattermost',
  plataforma_user_id  text not null,
  plataforma_username text,                       -- @rodrigo
  nombre_visible      text not null,              -- "Rodrigo Bronia"
  alias               text[] not null default '{}',-- otras formas de nombrarlo en el chat
  email               text,                       -- cuenta del OS / Google (puede faltar)
  zona_horaria        text not null default 'America/Argentina/San_Juan',
  activo              boolean not null default true,
  creado_at           timestamptz not null default now(),
  actualizado_at      timestamptz not null default now(),
  unique (plataforma, plataforma_user_id)
);
create index if not exists identidades_username_idx
  on comunicacion.identidades (plataforma, lower(plataforma_username)) where activo;
create index if not exists identidades_email_idx
  on comunicacion.identidades (lower(email)) where activo;

comment on table comunicacion.identidades is
  'Mapeo estable Mattermost ↔ OS ↔ Google de una misma persona. No duplica public.usuarios_os (que gobierna el acceso web por email): la liga por email. Se puebla desde Mattermost con orquestador/scripts/asistente-identidades.mjs.';

-- ── 2. RECORDATORIOS INTERNOS ────────────────────────────────────────────────
-- Son DEL OS a propósito: no se crean en Calendar ni en Tasks. Un recordatorio no es un
-- compromiso de agenda ni un pendiente — es "el OS me habla a mí (o a otro) en tal momento".
-- Meterlos en Google haría que el OS no pudiera entregarlos por Mattermost ni saber si la
-- entrega entró.
create table if not exists comunicacion.recordatorios (
  id                    uuid primary key default gen_random_uuid(),
  plataforma            text not null default 'mattermost',
  creador_user_id       text not null,
  creador_display       text,
  destinatario_user_id  text not null,
  destinatario_display  text,
  contenido             text not null,
  -- null = único (se entrega una vez y queda `delivered`).
  -- Si no: cadencia en el MISMO formato que orq.schedules/computeNextRun
  -- ('daily:HH:MM' | 'weekly:<dow>:HH:MM' | 'monthly:DD:HH:MM'), para no inventar un
  -- segundo vocabulario de recurrencia en el OS.
  cadencia              text,
  zona_horaria          text not null default 'America/Argentina/San_Juan',
  proxima_ejecucion     timestamptz not null,
  estado                text not null default 'active'
                        check (estado in ('active','delivered','completed','cancelled','failed')),
  intentos              int not null default 0,
  ultimo_error          text,
  -- IDEMPOTENCIA DE CREACIÓN: el comm_event_id del mensaje que lo pidió. Un reintento del
  -- mismo mensaje no crea un segundo recordatorio.
  idempotency_key       text,
  correlation_id        uuid,
  -- CLAIM TRANSACCIONAL de la entrega (mismo patrón que el resto del Work Fabric): el
  -- worker toma el recordatorio con un lease y nadie más lo toca hasta que vence.
  lease_hasta           timestamptz,
  lease_worker          text,
  creado_at             timestamptz not null default now(),
  actualizado_at        timestamptz not null default now(),
  cerrado_at            timestamptz
);
create unique index if not exists recordatorios_idem_idx
  on comunicacion.recordatorios (idempotency_key) where idempotency_key is not null;
create index if not exists recordatorios_vencidos_idx
  on comunicacion.recordatorios (proxima_ejecucion) where estado = 'active';
create index if not exists recordatorios_destinatario_idx
  on comunicacion.recordatorios (plataforma, destinatario_user_id, estado);

comment on table comunicacion.recordatorios is
  'Recordatorios internos del Business OS, entregados por DM de Mattermost. NO son eventos de Calendar ni tareas de Google Tasks: son del OS. La cadencia usa el mismo formato que orq.schedules.';

-- ── 3. ENTREGAS ──────────────────────────────────────────────────────────────
-- Historial y, sobre todo, LLAVE DE NO-DUPLICACIÓN de la entrega: la ocurrencia
-- (recordatorio, momento programado) es única. Un recurrente que se reprograma mal, un
-- reinicio del worker en el medio o un reintento no pueden entregar dos veces el mismo
-- lunes a las 8.
create table if not exists comunicacion.recordatorio_entregas (
  id               bigint generated always as identity primary key,
  recordatorio_id  uuid not null references comunicacion.recordatorios(id) on delete cascade,
  programada_para  timestamptz not null,
  estado           text not null check (estado in ('entregada','fallida')),
  canal_id         text,
  post_id          text,
  error            text,
  intento          int not null default 1,
  creado_at        timestamptz not null default now(),
  unique (recordatorio_id, programada_para)
);
create index if not exists recordatorio_entregas_rec_idx
  on comunicacion.recordatorio_entregas (recordatorio_id, creado_at desc);

comment on table comunicacion.recordatorio_entregas is
  'Estado FINAL de cada ocurrencia (recordatorio, momento programado) y llave de no-duplicación. El unique deja UNA fila por ocurrencia a propósito: no es el log de los intentos (eso es `intento` y `ultimo_error` del recordatorio), es la respuesta a "¿esta ocurrencia ya se entregó?". Registra si Mattermost aceptó o rechazó.';

-- ── 4. ACLARACIONES PENDIENTES ───────────────────────────────────────────────
-- Cuando falta un dato IMPRESCINDIBLE (dos Rodrigos, "el jueves" ambiguo), el asistente
-- pregunta UNA vez y guarda acá lo que ya entendió. La respuesta del usuario se resuelve
-- contra esta fila en vez de reenviarle al modelo el historial del canal.
create table if not exists comunicacion.asistente_pendientes (
  id                  uuid primary key default gen_random_uuid(),
  plataforma          text not null default 'mattermost',
  plataforma_user_id  text not null,
  channel_id          text,
  root_post_id        text,
  capacidad           text not null,              -- id de la capacidad en juego
  parcial             jsonb not null default '{}'::jsonb,  -- ParsedAssistantRequest incompleto
  pregunta            text not null,
  opciones            jsonb,                      -- [{valor, etiqueta}] cuando es elegir
  estado              text not null default 'abierta'
                      check (estado in ('abierta','resuelta','vencida','cancelada')),
  expira_at           timestamptz not null,
  creado_at           timestamptz not null default now(),
  actualizado_at      timestamptz not null default now()
);
-- Una sola aclaración abierta por persona: el asistente no acumula preguntas sin responder.
create unique index if not exists asistente_pendientes_unica_idx
  on comunicacion.asistente_pendientes (plataforma, plataforma_user_id) where estado = 'abierta';
create index if not exists asistente_pendientes_expira_idx
  on comunicacion.asistente_pendientes (expira_at) where estado = 'abierta';

comment on table comunicacion.asistente_pendientes is
  'Aclaración a medio camino: qué se entendió y qué falta. Evita reenviar el historial del canal al modelo y garantiza como máximo UNA pregunta por solicitud.';

-- ── 5. EJECUCIONES ───────────────────────────────────────────────────────────
-- Idempotencia del EFECTO EXTERNO. La tarea del Work Fabric ya es idempotente por
-- dedupe_key, pero un reintento DENTRO de la tarea (o un lease vencido y reclamado por otro
-- worker) podría crear dos eventos de Calendar. Acá queda que ese (mensaje, capacidad) ya
-- se ejecutó y con qué resultado: el segundo intento devuelve el mismo resultado en vez de
-- volver a crear.
create table if not exists comunicacion.asistente_ejecuciones (
  id                  bigint generated always as identity primary key,
  comm_event_id       uuid not null,
  capacidad           text not null,
  plataforma_user_id  text,
  estado              text not null check (estado in ('ok','error')),
  resultado           jsonb,                      -- id/enlace del efecto externo creado
  error_codigo        text,
  creado_at           timestamptz not null default now(),
  unique (comm_event_id, capacidad)
);

comment on table comunicacion.asistente_ejecuciones is
  'Un (mensaje, capacidad) se ejecuta UNA vez. Es la barrera que impide que un reintento del Work Fabric cree un segundo evento de Calendar o una segunda tarea de Google Tasks.';
