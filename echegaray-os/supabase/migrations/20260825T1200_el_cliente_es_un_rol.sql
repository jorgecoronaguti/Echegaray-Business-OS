-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL CLIENTE ES UN ROL — la puerta del portal (pantallas 29/30/31)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Hasta hoy `perfiles.rol` admitía cuatro valores y los cuatro son de ADENTRO: dirección,
-- administración, jefe de obra y campo. El portal del cliente mete por primera vez a alguien de
-- AFUERA en la misma tabla de identidades, y eso obliga a decidir dos cosas antes de escribir una
-- línea de aplicación.
--
-- ═══ POR QUÉ EL CLIENTE ENTRA A `perfiles` Y NO A UNA TABLA APARTE ═══
--
-- Porque `perfiles.id` es la FK a `auth.users` y es lo que `current_rol()` mira. Un cliente con
-- sesión de Supabase pero sin fila en `perfiles` tendría `current_rol()` NULL, y NULL contra los
-- porteros existentes da `false` por coalesce — o sea, no vería nada, que suena seguro pero es
-- peor: sería un usuario autenticado sin rol declarado, y el día que alguien agregue una policy
-- con `using (true)` ese usuario entra a todo. El rol se declara, no se deduce de una ausencia.
--
-- ═══ POR QUÉ `es_cliente()` NO ALCANZA POR SÍ SOLA ═══
--
-- `es_cliente()` dice QUÉ es el que consulta; no dice DE QUIÉN es. La pregunta que gobierna todo
-- el portal es la segunda («¿qué cliente es este que entró?») y su respuesta vive en
-- `cliente_acceso`, que todavía no existe: por eso `cliente_de_sesion()` se crea en la migración
-- siguiente y no acá. El nombre del archivo es la posición en la cadena (`.claude/rules/
-- migraciones.md`): una función que referencia una tabla creada después corta la reconstrucción
-- desde cero aunque en producción «funcione» porque se aplicó a mano en otro orden.

-- ── 1. EL ROL ───────────────────────────────────────────────────────────────────────────────────
--
-- El CHECK se reemplaza, no se agrega: un CHECK nuevo conviviendo con el viejo dejaría el viejo
-- rechazando 'cliente' y el alta fallaría con un mensaje que culpa a la restricción equivocada.
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('direccion', 'administracion', 'jefe_obra', 'campo', 'cliente'));

comment on column public.perfiles.rol is
  'direccion/administracion/jefe_obra/campo son roles INTERNOS. `cliente` es EXTERNO: sólo ve /portal, '
  'y qué ve lo decide su fila de public.cliente_acceso, no este rol. El middleware confina a `cliente` '
  'a /portal* y no deja entrar a ningún otro rol ahí.';

-- ── 2. EL PORTERO DE TIPO ───────────────────────────────────────────────────────────────────────
--
-- Mismo molde que `es_administracion()`: STABLE + SECURITY DEFINER + search_path fijo. STABLE es lo
-- que permite que Postgres la evalúe como InitPlan cuando se la envuelve en `(select …)` — una vez
-- por consulta y no una vez por fila. Por fila, en esta misma base, costó 63,9 s (T7000).
--
-- SECURITY DEFINER porque tiene que poder leer `perfiles` incluso cuando quien consulta no tiene
-- permiso de leer la fila de otro: si dependiera del permiso del llamador, el portero se volvería
-- circular (para saber si podés ver algo hay que poder ver quién sos).
create or replace function public.es_cliente()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(public.current_rol() = 'cliente', false)
$$;

comment on function public.es_cliente() is
  'true si quien consulta es un cliente externo del portal. Dice QUÉ es, no DE QUIÉN es: para eso '
  'está cliente_de_sesion(). Envolver siempre en (select public.es_cliente()) dentro de una policy.';

revoke all on function public.es_cliente() from public;
grant execute on function public.es_cliente() to authenticated, service_role;
