-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- DOS NIVELES DE USUARIO, Y UN NIVEL VE SÓLO SUS OBRAS — CON RLS DE VERDAD
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El dueño (18/08/2026), textual:
--   *"ADMINISTRACIÓN: acceso a todos los Clientes, todas las Obras, Economía… OBRAS: acceso sólo a
--   obras asignadas"* · *"Supabase Auth + RLS real. No seguridad cosmética"* · y las cuatro pruebas
--   que exige: obra asignada OK · otra obra por URL DENEGADO · API directa DENEGADO · Administración
--   todas.
--
-- ═══ EL AGUJERO QUE ESTA MIGRACIÓN CIERRA, Y NO ERA UNA POLICY QUE FALTABA ═══
--
-- Las policies de SELECT sobre `obra_canonica`, `obra_actividad` y `obra_asignacion` decían `true`:
-- cualquiera autenticado veía todo. Pero cambiarlas no alcanzaba, y ésta es la parte que se ve
-- después de romperse:
--
--   **LAS VISTAS NO HEREDAN EL RLS DE SUS TABLAS.** `obra_panel`, `obra_plan_vs_real`, `obra_avance`
--   y `cliente_panel` se crearon sin `security_invoker`, así que corren con los permisos de su DUEÑO
--   (postgres), que salta el RLS. Toda la web lee por esas vistas. Poner policies estrictas sobre las
--   tablas y dejar las vistas como estaban habría producido exactamente lo que el dueño llama
--   seguridad cosmética: un `select * from obra_panel` desde PostgREST devolviendo las ocho obras con
--   su margen, mientras el middleware redirige prolijamente en el navegador.
--
-- Por eso las cuatro vistas pasan a `security_invoker = true` EN LA MISMA MIGRACIÓN. Y por eso el
-- test de aceptación consulta PostgREST directo con el token del jefe de obra, no la pantalla.
--
-- ═══ POR QUÉ NO HAY ROLES NUEVOS ═══
--
-- *"No crear más niveles de usuario"*. `perfiles.rol` ya tiene cuatro valores con usuarios reales y
-- policies escritas contra esos literales. El nivel es una AGRUPACIÓN de los que ya existen
-- (`es_administracion()`), y el alcance es una tabla de asignación. Nivel = qué puede hacer;
-- asignación = sobre qué obras. Dos ejes, separados a propósito, y así la granularidad futura se
-- agrega con filas y no con una migración de roles.

-- ── 1 · QUIÉN ES ADMINISTRACIÓN ─────────────────────────────────────────────────────────────────
--
-- `stable` y no `immutable`: lee una tabla. `security definer` para que pueda leer `perfiles` aunque
-- el que pregunta no tenga permiso sobre ella — es el mismo patrón de `current_rol()`, que ya existe.
create or replace function public.es_administracion()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(public.current_rol() in ('direccion', 'administracion'), false)
$$;

comment on function public.es_administracion() is
  'Nivel ADMINISTRACIÓN (direccion|administracion). Sin perfil devuelve false: falla cerrado.';

-- ── 2 · QUÉ OBRAS TIENE ASIGNADAS CADA USUARIO ──────────────────────────────────────────────────
--
-- Una fila por (usuario, obra). El alta la hace Administración; nadie se autoasigna una obra, igual
-- que nadie se autoasigna un rol.
create table if not exists public.usuario_obra (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  obra_canonica_id text not null references public.obra_canonica (id) on delete cascade,
  -- El rol EN LA OBRA. No es el rol del sistema: una persona puede ser jefe en una y visita en otra.
  -- Hoy no cambia permisos; existe para que mañana los cambie sin migrar la tabla.
  papel text not null default 'jefe' check (papel in ('jefe', 'colaborador', 'lectura')),
  desde date,
  hasta date,
  creado_en timestamptz not null default now(),
  unique (usuario_id, obra_canonica_id)
);

comment on table public.usuario_obra is
  'Qué obras ve un usuario de nivel OBRAS. Administración no necesita filas acá: ve todas.';

create index if not exists usuario_obra_usuario_idx on public.usuario_obra (usuario_id);
create index if not exists usuario_obra_obra_idx on public.usuario_obra (obra_canonica_id);

alter table public.usuario_obra enable row level security;

-- RLS ≠ GRANT: la policy dice QUÉ FILAS, el grant dice SI PODÉS TOCAR LA TABLA. Faltó el grant una
-- vez y dejó el módulo 01 entero en 404 (17/08) — no se vuelve a olvidar.
grant select on public.usuario_obra to authenticated;
grant insert, update, delete on public.usuario_obra to authenticated;

drop policy if exists usuario_obra_select on public.usuario_obra;
create policy usuario_obra_select on public.usuario_obra for select to authenticated
  -- Cada uno ve SUS asignaciones (para saber a qué tiene acceso); Administración ve todas.
  using (usuario_id = auth.uid() or public.es_administracion());

drop policy if exists usuario_obra_write on public.usuario_obra;
create policy usuario_obra_write on public.usuario_obra for all to authenticated
  using (public.es_administracion()) with check (public.es_administracion());

-- ── 3 · ¿ESTE USUARIO VE ESTA OBRA? ─────────────────────────────────────────────────────────────
--
-- La pregunta se contesta en UN solo lugar: toda policy de este módulo la cita. Si mañana el criterio
-- cambia (una obra por cliente, una por unidad de negocio), cambia acá y no en once policies.
create or replace function public.ve_obra(p_obra text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.es_administracion()
      or exists (
        select 1 from public.usuario_obra uo
        where uo.usuario_id = auth.uid()
          and uo.obra_canonica_id = p_obra
      )
$$;

comment on function public.ve_obra(text) is
  'true si el usuario es Administración o tiene la obra asignada. La usan TODAS las policies del módulo.';

-- ── 4 · LAS POLICIES DE LECTURA, OBRA POR OBRA ──────────────────────────────────────────────────
--
-- Decían `using (true)`. Ahora cada tabla del módulo filtra por la obra a la que pertenece la fila.
-- La de ESCRITURA no se toca en esta migración: ya exige rol, y meterle el alcance en el mismo cambio
-- mezcla dos cosas que se prueban distinto.

drop policy if exists obra_canonica_select on public.obra_canonica;
create policy obra_canonica_select on public.obra_canonica for select to authenticated
  using (public.ve_obra(id));

drop policy if exists obra_actividad_select on public.obra_actividad;
create policy obra_actividad_select on public.obra_actividad for select to authenticated
  using (public.ve_obra(obra_id));

drop policy if exists obra_asignacion_select on public.obra_asignacion;
create policy obra_asignacion_select on public.obra_asignacion for select to authenticated
  using (public.ve_obra(obra_id));

drop policy if exists obra_restriccion_select on public.obra_restriccion;
create policy obra_restriccion_select on public.obra_restriccion for select to authenticated
  using (public.ve_obra(obra_id));

drop policy if exists obra_documento_select on public.obra_documento;
create policy obra_documento_select on public.obra_documento for select to authenticated
  using (public.ve_obra(obra_id));

-- CLIENTES es del área Administración: un jefe de obra no ve la cartera. Su obra le dice de quién es
-- por el nombre que ya viaja en `obra_panel`.
drop policy if exists clientes_select on public.clientes;
create policy clientes_select on public.clientes for select to authenticated
  using (public.es_administracion());

drop policy if exists cliente_contacto_select on public.cliente_contacto;
create policy cliente_contacto_select on public.cliente_contacto for select to authenticated
  using (public.es_administracion());

drop policy if exists cliente_documento_select on public.cliente_documento;
create policy cliente_documento_select on public.cliente_documento for select to authenticated
  using (public.es_administracion());

-- ECONOMÍA. *"Economía/administración sensible no visible salvo permiso futuro"*.
drop policy if exists certificados_select on public.certificados;
create policy certificados_select on public.certificados for select to authenticated
  using (public.es_administracion());

-- ── 5 · LAS VISTAS HEREDAN EL RLS. SIN ESTO, TODO LO DE ARRIBA ES DECORACIÓN ─────────────────────
--
-- `security_invoker = true` hace que la vista se ejecute con los permisos y las policies del que
-- consulta, no del dueño de la vista. Es la línea que convierte este archivo en seguridad real.
--
-- Requiere que `authenticated` tenga SELECT sobre las tablas base — lo tiene desde
-- `20260817223000_modulo_01_grants.sql`, y es justamente lo que faltaba el día que el módulo salió en
-- 404. Se re-otorga acá por si alguna vista se recreó en el medio: un grant repetido no molesta, uno
-- faltante tira la pantalla entera.
grant select on public.obra_canonica, public.obra_actividad, public.obra_asignacion,
  public.obra_restriccion, public.obra_documento, public.clientes, public.cliente_contacto,
  public.cliente_documento, public.certificados, public.presupuestos, public.registros_hh,
  public.personas to authenticated;

alter view public.obra_panel set (security_invoker = true);
alter view public.obra_avance set (security_invoker = true);
alter view public.obra_plan_vs_real set (security_invoker = true);
alter view public.cliente_panel set (security_invoker = true);

grant select on public.obra_panel, public.obra_avance, public.obra_plan_vs_real,
  public.cliente_panel to authenticated;

-- ── 6 · EL SERVICE ROLE NO PODÍA LEER EL MÓDULO ─────────────────────────────────────────────────
--
-- Encontrado probando esta misma migración: `select * from obra_canonica` con la service key devuelve
-- `42501 permission denied`. Las tablas del módulo 01 nacieron con grants para `authenticated` y
-- ninguno para `service_role`, así que todo lo que entra por PostgREST del lado servidor —los tests
-- de aceptación, cualquier job, la asignación de obras a un usuario— estaba ciego. No se había notado
-- porque el orquestador entra por Postgres directo como `postgres`, que no necesita grant.
--
-- `service_role` además salta el RLS por diseño (`bypassrls`), así que esto no abre nada nuevo: sólo
-- deja de romper lo que ya debía poder hacer.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
