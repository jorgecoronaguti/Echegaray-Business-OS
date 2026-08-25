-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- QUIÉN ENTRA AL PORTAL Y QUÉ VE — pantalla 31 «Acceso al portal»
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Esta tabla es la LISTA DE INVITADOS del portal. No es una tabla de contactos: `cliente_contacto`
-- ya existe y guarda a quién se le manda un mail. Acá vive otra cosa — quién puede ABRIR SESIÓN y
-- qué le está permitido mirar y aprobar. Son dos preguntas distintas y mezclarlas terminaría dando
-- acceso a todo el que alguna vez figuró como contacto en una obra.
--
-- ═══ EL MAIL ES LA IDENTIDAD, Y POR ESO SE NORMALIZA EN LA BASE ═══
--
-- El ingreso es por link mágico al mail (Supabase OTP): el mail ES la credencial. Si «Juan@ARCOR.com»
-- y «juan@arcor.com» pueden convivir como dos filas, entonces revocar una deja la otra viva y el
-- acceso revocado sigue entrando. El contrato pedía `citext`, pero la extensión NO está instalada en
-- esta base (`pg_available_extensions` la lista con `installed_version` NULL) y una migración que
-- depende de un `create extension` es una migración que puede fallar en un entorno donde el rol no
-- sea superusuario. Se resuelve sin extensión: CHECK que obliga a guardar el mail ya normalizado
-- (minúsculas y sin espacios) más un UNIQUE común. El resultado es el mismo y no agrega dependencia.
--
-- ═══ REVOCAR NO BORRA ═══
--
-- `revocado_at` en vez de un DELETE. Un acceso borrado no deja rastro de que existió, y la pregunta
-- «¿quién aprobó este certificado?» tiene que poder responderse un año después aunque a esa persona
-- se le haya quitado el acceso. Además `cliente_actividad_portal` apunta acá: borrar la fila haría
-- huérfano el historial de lo que esa persona hizo.
create table if not exists public.cliente_acceso (
  id                    uuid primary key default gen_random_uuid(),
  -- RESTRICT, no CASCADE: borrar un cliente no puede borrar en silencio quién tenía acceso a su
  -- información. Si hay accesos, que la base obligue a decidir qué hacer con ellos.
  cliente_id            uuid not null references public.clientes(id) on delete restrict,
  email                 text not null unique
                        check (email = lower(btrim(email)) and position('@' in email) > 1),
  -- El nombre de la persona, no el del cliente. La pantalla 31 dice «María Gómez · Compras» y eso
  -- no sale de `clientes.nombre_comercial`.
  persona_contacto      text,

  -- ═══ LOS TRES PERMISOS ═══
  -- Son independientes a propósito. Un cliente puede querer que su jefe de compras vea el avance
  -- (puede_ver_obra) sin ver los montos (puede_ver_montos), y que sólo el firmante apruebe
  -- certificados (puede_aprobar). Un permiso único «nivel de acceso» obligaría a inventar una
  -- jerarquía que la realidad no tiene.
  puede_ver_obra        boolean not null default true,
  puede_ver_montos      boolean not null default false,
  puede_aprobar         boolean not null default false,

  -- NULL = todas las obras del cliente. Un array vacío NO es lo mismo: significa ninguna. La
  -- diferencia importa porque el vacío es el estado natural de un formulario a medio llenar y
  -- confundirlo con «todas» abriría el acceso por accidente. Son ids de obra_canonica (text).
  obras                 text[],
  check (obras is null or array_position(obras, null) is null),

  habilitado_por        uuid references auth.users(id),
  habilitado_at         timestamptz,
  invitacion_enviada_at timestamptz,
  primer_ingreso_at     timestamptz,
  ultimo_ingreso_at     timestamptz,
  ultimo_dispositivo    text,
  revocado_at           timestamptz,

  -- Se completa en el PRIMER ingreso, no al habilitar: hasta que la persona no entra por el link,
  -- no existe un `auth.users` al que apuntar. UNIQUE porque un usuario de Auth es una persona y una
  -- persona no puede ser dos accesos distintos — si lo fuera, `cliente_de_sesion()` tendría que
  -- elegir uno y elegiría mal en silencio.
  auth_user_id          uuid unique references auth.users(id) on delete set null,

  creado_at             timestamptz not null default now()
);

-- Un mail habilitado dos veces para el mismo cliente ya lo impide el UNIQUE del mail. Este índice es
-- para la pregunta que hace la pantalla 31: «los accesos de ESTE cliente», y para el conteo de
-- activos que muestra la solapa.
create index if not exists cliente_acceso_cliente_idx
  on public.cliente_acceso (cliente_id) where revocado_at is null;

comment on table public.cliente_acceso is
  'Lista de invitados del portal (pantalla 31): quién puede abrir sesión con su mail y qué puede ver '
  'y aprobar. Distinta de cliente_contacto (a quién se le escribe). Revocar es poner revocado_at, '
  'nunca borrar: el historial de cliente_actividad_portal apunta acá.';
comment on column public.cliente_acceso.obras is
  'NULL = todas las obras del cliente. Array vacío = ninguna. Ids de obra_canonica.';
comment on column public.cliente_acceso.auth_user_id is
  'Se completa en el primer ingreso por link mágico, no al habilitar. Es lo que cliente_de_sesion() '
  'traduce de auth.uid() a cliente_id.';

-- ── EL PORTERO DE IDENTIDAD ─────────────────────────────────────────────────────────────────────
--
-- La pregunta que gobierna TODO el portal: de quién es el que entró. Se define UNA vez acá y la
-- consumen todas las policies del portal — si cada tabla repitiera el subselect, el día que cambie
-- la regla (por ejemplo, que un acceso vencido también quede afuera) habría que acordarse de los
-- siete lugares, y el que se olvide queda abierto.
--
-- `revocado_at is null` va DENTRO de la función, no en cada policy, por la misma razón: revocar
-- tiene que apagar el acceso en un solo lugar. Un acceso revocado devuelve NULL, y `cliente_id =
-- NULL` es NULL (no true) en toda policy — falla cerrado.
create or replace function public.cliente_de_sesion()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select cliente_id
    from public.cliente_acceso
   where auth_user_id = auth.uid()
     and revocado_at is null
   limit 1
$$;

comment on function public.cliente_de_sesion() is
  'El cliente_id del acceso vinculado a auth.uid(), o NULL si no hay acceso o está revocado. Es la '
  'única traducción sesión→cliente del portal: ninguna policy la reimplementa. Devuelve NULL para un '
  'acceso revocado, y como NULL no es true, toda policy que la use falla cerrada.';

revoke all on function public.cliente_de_sesion() from public;
grant execute on function public.cliente_de_sesion() to authenticated, service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────────────────
alter table public.cliente_acceso enable row level security;

-- Administración ve y administra todos los accesos (es la pantalla 31). El cliente ve SÓLO SU PROPIA
-- fila: necesita saber qué permisos tiene para que el portal no le ofrezca un botón que la base le
-- va a rechazar. No ve los otros accesos de su misma empresa — quién más entra al portal de ARCOR es
-- información de ARCOR, pero mostrársela a un empleado cualquiera de ARCOR no es decisión nuestra.
drop policy if exists cliente_acceso_select on public.cliente_acceso;
create policy cliente_acceso_select on public.cliente_acceso
  for select to authenticated
  using ((select public.es_administracion()) or auth_user_id = (select auth.uid()));

-- Habilitar un acceso es dejar entrar a un tercero a la información económica de una obra: sólo
-- Administración, y siempre a nombre propio (`habilitado_por`), para que el registro diga quién
-- abrió la puerta. Sin el `= auth.uid()` cualquiera podría habilitar firmando con el nombre de otro.
drop policy if exists cliente_acceso_insert on public.cliente_acceso;
create policy cliente_acceso_insert on public.cliente_acceso
  for insert to authenticated
  with check (
    (select public.es_administracion())
    and habilitado_por = (select auth.uid())
    and auth_user_id is null      -- el vínculo lo escribe el callback del login, no el formulario
    and revocado_at is null       -- nadie nace revocado
  );

-- El UPDATE es de Administración y NUNCA del cliente: si el cliente pudiera actualizar su propia
-- fila se auto-otorgaría `puede_aprobar`. El grant por columna de abajo es la segunda cerradura.
drop policy if exists cliente_acceso_update on public.cliente_acceso;
create policy cliente_acceso_update on public.cliente_acceso
  for update to authenticated
  using ((select public.es_administracion()))
  with check ((select public.es_administracion()));

-- NO hay policy de DELETE: revocar es un UPDATE. Ver el comentario de arriba.

-- ── GRANTS ──────────────────────────────────────────────────────────────────────────────────────
--
-- Una columna nueva NACE SIN PERMISO y el permiso no se hereda: sin esto el insert rebota con
-- «permission denied for table cliente_acceso» y Next lo muestra como un 404 — un error de permiso
-- disfrazado de «no existe», que es la peor pista posible para depurar.
grant select on public.cliente_acceso to authenticated;
grant insert (cliente_id, email, persona_contacto, puede_ver_obra, puede_ver_montos, puede_aprobar,
              obras, habilitado_por, habilitado_at, invitacion_enviada_at)
  on public.cliente_acceso to authenticated;
-- `auth_user_id`, `primer_ingreso_at`, `ultimo_ingreso_at` y `ultimo_dispositivo` NO están acá a
-- propósito: los escribe el callback del login con la llave de servicio, que no pasa por RLS. Que un
-- authenticated pudiera escribir `auth_user_id` sería poder apuntarse a sí mismo a otro cliente.
grant update (persona_contacto, puede_ver_obra, puede_ver_montos, puede_aprobar, obras,
              invitacion_enviada_at, revocado_at)
  on public.cliente_acceso to authenticated;
