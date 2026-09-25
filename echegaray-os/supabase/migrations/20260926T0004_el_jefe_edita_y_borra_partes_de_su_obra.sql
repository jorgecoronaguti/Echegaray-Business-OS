-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL JEFE EDITA Y BORRA LOS PARTES DE SU OBRA; ADMINISTRACIÓN, LOS DE TODAS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Pedido del dueño (25/09/2026, por el coordinador de la auditoría de accesos): un jefe de obra edita y
-- borra partes SÓLO de su obra; Administración, de todas. Hasta hoy la base dejaba al jefe operar sobre
-- todas: `ve_obra()` devuelve true para cualquier obra cuando el rol es `jefe_obra` (decisión del 19/08,
-- que sigue valiendo para VER y CARGAR), y `parte_dictado`, `registrar_cambio_parte` y el borrado de
-- renglones de avance (`obra_ejecucion`, `obra_ejecucion_equipo`) se apoyaban en ella.
--
-- NO SE INVENTA UNA REGLA: «su obra» es la de `ve_obra()` sin la línea del jefe — las obras de su cuenta
-- (`usuario_obra`) y la obra donde su PERSONA está asignada hoy (`obra_asignacion` vigente). Hoy:
-- hys@ (Maldonado) → quattropani; ingenieria@ (Nievas) → pisos-industriales.
--
-- QUÉ SE CIERRA (policies RESTRICTIVAS, se suman con AND a las que ya están):
--   · `parte_dictado` UPDATE (guardar, descartar, anular un dictado);
--   · `obra_ejecucion` y `obra_ejecucion_equipo` DELETE (borrar renglones de un parte);
--   · `registrar_cambio_parte` (la bitácora de «editado / corregido por voz / borrado»).
-- QUÉ NO CAMBIA: cargar el parte del día, la asistencia y el avance (INSERT), que siguen con `ve_obra()`.
-- Las acciones de la app (`parteGuardadoActions`, `borrarParte`) preguntan `ve_obra_propia` ANTES de
-- escribir nada, para que un rechazo no deje un parte a medio editar.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

create or replace function public.ve_obra_propia(p_obra text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.ve_economia()
      or exists (
        select 1 from public.usuario_obra uo
         where uo.usuario_id = auth.uid()
           and uo.obra_canonica_id = p_obra
      )
      or exists (
        select 1 from public.obra_asignacion a
         where a.persona_id = public.mi_persona_id()
           and a.obra_id = p_obra
           and public.asignacion_vigente(a.desde, a.hasta)
      )
$$;
comment on function public.ve_obra_propia(text) is
  'Administración: toda obra. Resto: las de su cuenta (usuario_obra) y la de su asignación vigente — ve_obra() sin la línea '
  'que abre todas al jefe. Decide quién EDITA y BORRA partes (20260926T0004).';
revoke all on function public.ve_obra_propia(text) from public, anon;
grant execute on function public.ve_obra_propia(text) to authenticated, service_role;

drop policy if exists parte_de_su_obra on public.parte_dictado;
create policy parte_de_su_obra on public.parte_dictado as restrictive for update to authenticated
  using (public.ve_obra_propia(obra_id)) with check (public.ve_obra_propia(obra_id));

drop policy if exists parte_de_su_obra on public.obra_ejecucion;
create policy parte_de_su_obra on public.obra_ejecucion as restrictive for delete to authenticated
  using (public.ve_obra_propia(obra_id));

drop policy if exists parte_de_su_obra on public.obra_ejecucion_equipo;
create policy parte_de_su_obra on public.obra_ejecucion_equipo as restrictive for delete to authenticated
  using (public.ve_obra_propia(obra_id));

do $$
declare
  def text;
  nuevo text;
begin
  select pg_get_functiondef('public.registrar_cambio_parte(text, date, text, text, text)'::regprocedure) into def;
  nuevo := replace(def, 'if not public.es_administracion() or not public.ve_obra(p_obra) then',
                        'if not public.es_administracion() or not public.ve_obra_propia(p_obra) then');
  if nuevo = def then raise exception 'registrar_cambio_parte no tiene la guarda esperada'; end if;
  execute nuevo;
end $$;
