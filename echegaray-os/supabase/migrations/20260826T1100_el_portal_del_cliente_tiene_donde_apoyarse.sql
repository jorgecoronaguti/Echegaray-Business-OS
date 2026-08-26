-- EL PORTAL DEL CLIENTE — las cinco cosas que no existían y sin las cuales sólo se puede dibujar.
--
-- ═══ POR QUÉ ESTA MIGRACIÓN ═══
--
-- El portal muestra: quién entra, qué obras alcanza, qué le toca pagar y cuándo, qué papeles hay, y
-- qué obras ya se cerraron. De todo eso la base hoy tiene UNA cosa: la obra. Lo demás vivía en la
-- pestaña Cobranzas del Sheet (el cronograma), en la cabeza del administrador (los mails), o en
-- ningún lado (fondo de reparo, fecha de cierre, carpeta de la obra en Drive).
--
-- Todo es ADITIVO: ninguna tabla existente cambia de forma, ninguna columna se borra, ningún dato se
-- toca. Lo único que se agrega a `obras` son dos columnas que nacen NULL.
--
-- ═══ LA REGLA QUE GOBIERNA TODO ESTO ═══
--
-- NULL NUNCA ES CERO. Un certificado sin fecha no es un certificado que vence hoy; una obra sin
-- fondo de reparo cargado no es una obra con fondo cero. Por eso casi todo es NULLABLE a propósito y
-- las pantallas dicen «sin cargar», «sin factura», «sin fecha», «sin plan». Poner DEFAULT 0 acá sería
-- fabricar el dato que falta.

-- ── 1 · QUIÉN PUEDE ENTRAR ────────────────────────────────────────────────────────────────────
--
-- `clientes.email` es UNO solo y es el mail de contacto comercial, no una credencial. Un cliente
-- real tiene varias personas (el dueño, el que paga, el arquitecto) y cada una puede alcanzar obras
-- distintas. `obra_id NULL` = alcanza a TODAS las obras de ese cliente; con obra_id = sólo a esa.
create table if not exists public.cliente_mail (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references public.clientes(id) on delete cascade,
  -- El mail se guarda normalizado en minúsculas: el índice único es la única defensa contra dar de
  -- alta dos veces a la misma persona con distinta capitalización.
  mail         text not null check (mail = lower(mail) and mail like '%_@_%.__%'),
  obra_id      uuid references public.obras(id) on delete cascade,
  nombre       text,
  activo       boolean not null default true,
  creado_por   uuid references public.perfiles(id),
  created_at   timestamptz not null default now()
);
create unique index if not exists cliente_mail_unico on public.cliente_mail (mail, coalesce(obra_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists cliente_mail_por_mail on public.cliente_mail (mail) where activo;

-- ── 2 · EL CÓDIGO DE ACCESO Y LOS INTENTOS ────────────────────────────────────────────────────
--
-- No se guarda el código: se guarda su HASH. Un código en claro en la base es una contraseña en
-- claro. `intentos` existe porque un código de 6 dígitos se adivina por fuerza bruta si nadie cuenta.
create table if not exists public.portal_codigo (
  id          uuid primary key default gen_random_uuid(),
  mail        text not null,
  hash        text not null,
  vence_en    timestamptz not null,
  usado_en    timestamptz,
  intentos    smallint not null default 0,
  ip          inet,
  created_at  timestamptz not null default now()
);
create index if not exists portal_codigo_vivo on public.portal_codigo (mail, created_at desc) where usado_en is null;

-- LOS RECHAZOS SE REGISTRAN. Un mail que no está habilitado y golpea la puerta veinte veces es la
-- única señal temprana de que alguien está probando direcciones.
create table if not exists public.portal_acceso (
  id          bigserial primary key,
  mail        text not null,
  resultado   text not null check (resultado in ('habilitado', 'no_habilitado', 'codigo_ok', 'codigo_malo', 'codigo_vencido')),
  ip          inet,
  agente      text,
  created_at  timestamptz not null default now()
);
create index if not exists portal_acceso_reciente on public.portal_acceso (created_at desc);

-- ── 3 · LA CARPETA DE LA OBRA EN DRIVE ────────────────────────────────────────────────────────
--
-- Hoy sólo el CLIENTE tiene carpeta (`clientes.drive_carpeta_id`). El portal muestra los papeles de
-- UNA obra: sin este mapeo, o muestra la carpeta del cliente entera —donde están todas sus obras— o
-- no muestra nada.
alter table public.obras add column if not exists drive_carpeta_id text;

-- ── 4 · LA FECHA DE CIERRE ────────────────────────────────────────────────────────────────────
--
-- `estado = 'cerrada'` ya existe y dice QUÉ; no dice CUÁNDO. La pantalla de obras terminadas se
-- ordena por esa fecha y muestra «terminada 03/2025»: sin la columna, o se inventa o se omite.
alter table public.obras add column if not exists fecha_cierre date;
-- Una obra no puede estar cerrada en el futuro ni cerrada antes de empezar.
alter table public.obras drop constraint if exists obras_cierre_check;
alter table public.obras add constraint obras_cierre_check
  check (fecha_cierre is null or (fecha_cierre >= fecha_inicio));

-- ── 5 · EL CRONOGRAMA DE PAGOS COMO ENTIDAD ───────────────────────────────────────────────────
--
-- Hoy el cronograma se arma leyendo la pestaña Cobranzas y agrupando a mano. Eso alcanza para un
-- informe y no alcanza para una pantalla que el CLIENTE mira: dos lecturas del mismo Sheet dan dos
-- cronogramas distintos, y el «próximo pago» del Inicio se recalcularía por su cuenta.
--
-- LA REGLA DEL MÓDULO: el próximo pago del Inicio SALE DE ACÁ. No se recalcula en ninguna pantalla.
create table if not exists public.pago_programado (
  id              uuid primary key default gen_random_uuid(),
  obra_id         uuid not null references public.obras(id) on delete cascade,
  -- El orden lo pone el administrador: «Certificado 4» puede vencer antes que el 3.
  orden           smallint not null,
  tipo            text not null check (tipo in ('anticipo', 'certificado', 'fondo_reparo', 'otro')),
  rotulo          text not null,
  -- NULLABLE a propósito: un certificado todavía no medido no tiene monto, y no tiene monto CERO.
  monto           numeric(14,2) check (monto is null or monto >= 0),
  fecha_prevista  date,
  fecha_pago      date,
  -- El estado se DERIVA (vencido = prevista < hoy y sin pago) salvo cuando el administrador lo fija.
  estado          text check (estado in ('pagado', 'vencido', 'proximo', 'programado', 'sin_factura')),
  factura_numero  text,
  recibo_numero   text,
  -- Sólo para tipo = 'fondo_reparo': cuándo se devuelve.
  devolucion_en   date,
  devuelto_en     date,
  nota            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists pago_programado_orden on public.pago_programado (obra_id, orden);
create index if not exists pago_programado_por_obra on public.pago_programado (obra_id, fecha_prevista);
-- Un pago con fecha de pago pero sin monto es un pago que nadie puede conciliar.
alter table public.pago_programado drop constraint if exists pago_programado_pagado_tiene_monto;
alter table public.pago_programado add constraint pago_programado_pagado_tiene_monto
  check (fecha_pago is null or monto is not null);
-- La devolución del fondo de reparo sólo tiene sentido en el fondo de reparo.
alter table public.pago_programado drop constraint if exists pago_programado_devolucion_es_del_fondo;
alter table public.pago_programado add constraint pago_programado_devolucion_es_del_fondo
  check (tipo = 'fondo_reparo' or (devolucion_en is null and devuelto_en is null));

-- ── 6 · LO QUE EL CLIENTE SUBE ────────────────────────────────────────────────────────────────
--
-- Cae en una SUBCARPETA de la obra, nunca mezclado con los papeles de la empresa: lo que sube el
-- cliente es material de él, y confundirlo con un plano nuestro es el error caro.
create table if not exists public.obra_adjunto_cliente (
  id             uuid primary key default gen_random_uuid(),
  obra_id        uuid not null references public.obras(id) on delete cascade,
  mail           text not null,
  nombre         text not null,
  drive_file_id  text,
  mime           text,
  bytes          bigint,
  -- Se avisa a administración. Null = todavía no se avisó; es la cola, no un adorno.
  avisado_en     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists obra_adjunto_cliente_por_obra on public.obra_adjunto_cliente (obra_id, created_at desc);
create index if not exists obra_adjunto_cliente_sin_avisar on public.obra_adjunto_cliente (created_at) where avisado_en is null;

-- ── RLS ───────────────────────────────────────────────────────────────────────────────────────
--
-- Se prende en las seis. El portal NO entra por PostgREST con la sesión del cliente —el cliente no
-- tiene usuario de Supabase— sino por el servidor con la clave de servicio, detrás del chequeo de la
-- cookie firmada. Prender RLS sin políticas es deliberado: cierra la puerta para cualquier otro
-- camino, y el día que el portal pase a PostgREST la política se escribe acá y no en la pantalla.
alter table public.cliente_mail          enable row level security;
alter table public.portal_codigo         enable row level security;
alter table public.portal_acceso         enable row level security;
alter table public.pago_programado       enable row level security;
alter table public.obra_adjunto_cliente  enable row level security;

-- ── UNA COLUMNA NUEVA NACE SIN PERMISO ────────────────────────────────────────────────────────
--
-- `public.obras` no tiene un GRANT de tabla entera: tiene GRANT POR COLUMNA. Una columna agregada
-- después queda fuera de esa lista y la web la lee VACÍA — sin error, sin log, sin nada. La pantalla
-- muestra un campo en blanco y nadie lo asocia a un permiso.
--
-- Lo detectó `orquestador/lib/columnas-comerciales-cerradas.test.mjs`, que existe exactamente para
-- esto y que se puso en rojo en cuanto se aplicó la primera mitad de esta migración.
grant select (drive_carpeta_id, fecha_cierre) on public.obras to authenticated;
