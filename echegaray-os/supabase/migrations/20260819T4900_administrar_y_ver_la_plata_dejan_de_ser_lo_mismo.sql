-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ADMINISTRAR Y VER LA PLATA DEJAN DE SER LO MISMO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El dueño (19/08/2026), textual: *"quiero que los usuarios con permisos de «jefe de obra» pueda
-- acceder a administracion, solo no quiero que vean los montos de venta de las obras. pero necesito
-- que puedan hacer todo lo demas"*.
--
-- Hasta hoy `es_administracion()` respondía DOS preguntas a la vez —«¿administra los maestros?» y
-- «¿ve cuánto se vendió?»— porque hasta hoy eran la misma gente. Ya no lo son. La función se parte:
--
--   `es_administracion()`  → administra: personas, legajos, cuadrillas, clientes, proveedores.
--                            AHORA INCLUYE A JEFE DE OBRA.
--   `ve_economia()`        → montos de venta, certificados, adicionales, presupuestos y quién puede
--                            entrar a qué. Dirección y Administración, nadie más.
--
-- ═══ EL AGUJERO QUE ESTO CIERRA, Y QUE TODAVÍA NO TENÍA DATOS ═══
--
-- `certificados_select` y `adicionales_select` filtraban por `ve_obra(obra_canonica_id)`. Cuando
-- `ve_obra` se abrió a todas las obras para el jefe (migración 4600), esas dos tablas —que son
-- EXACTAMENTE los montos de venta: lo certificado, lo cobrado, lo cotizado de un adicional— quedaron
-- alcanzadas. Hoy tienen CERO filas, así que no se ve nada y ninguna prueba lo habría notado: se
-- habría abierto solo el día que alguien cargue el primer certificado.
--
-- Un permiso que todavía no filtró nada porque la tabla está vacía no es un permiso correcto: es una
-- bomba con la mecha apagada. Las dos pasan a `ve_economia()`.
--
-- ═══ LO QUE NO SE ABRE, Y POR QUÉ ═══
--
--   · `usuario_obra` — decide quién entra a qué. Si un jefe pudiera escribirla, el corte económico
--     dependería de que nadie se lo saltee dándose acceso. El control de acceso no se delega.
--   · `perfiles` — no tiene policy de escritura y sigue sin tenerla: el alta de usuarios y el cambio
--     de rol pasan por el service role. Sin esto, un jefe podría ascenderse a dirección y el resto de
--     este archivo sería decorativo.
--   · `personas.retribucion_pactada` — NO tiene GRANT de select para nadie, y se queda así. Un sueldo
--     no es un monto de venta, pero es el dato más sensible del legajo y el 19/08 el dueño lo cerró
--     con todas las letras. Abrirlo es una línea; hacerlo sin que lo pida no.

begin;

create or replace function public.ve_economia()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(public.current_rol() in ('direccion', 'administracion'), false)
$function$;

comment on function public.ve_economia() is
  'Si el usuario puede ver la PLATA de una obra: monto contratado, certificados, adicionales, '
  'presupuestos y márgenes. Dirección y Administración. Es lo único que un jefe de obra no ve.';

create or replace function public.es_administracion()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(public.current_rol() in ('direccion', 'administracion', 'jefe_obra'), false)
$function$;

comment on function public.es_administracion() is
  'Si el usuario ADMINISTRA los maestros: personas, legajos, cuadrillas, clientes, proveedores. '
  'Incluye a jefe de obra desde el 19/08/2026. Para la plata está ve_economia(), que no lo incluye.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- LO ECONÓMICO SE REAPUNTA A `ve_economia()`
-- ─────────────────────────────────────────────────────────────────────────────────────────────

drop policy if exists certificados_select on public.certificados;
create policy certificados_select on public.certificados for select to authenticated
  using (public.ve_economia());
drop policy if exists certificados_insert on public.certificados;
create policy certificados_insert on public.certificados for insert to authenticated
  with check (public.ve_economia());
drop policy if exists certificados_update on public.certificados;
create policy certificados_update on public.certificados for update to authenticated
  using (public.ve_economia()) with check (public.ve_economia());
drop policy if exists certificados_delete on public.certificados;
create policy certificados_delete on public.certificados for delete to authenticated
  using (public.ve_economia());

drop policy if exists adicionales_select on public.adicionales;
create policy adicionales_select on public.adicionales for select to authenticated
  using (public.ve_economia());

drop policy if exists partidas_presupuesto_select on public.partidas_presupuesto;
create policy partidas_presupuesto_select on public.partidas_presupuesto for select to authenticated
  using (public.ve_economia());

-- El control de acceso no se delega: quién entra a qué obra lo decide Administración.
drop policy if exists usuario_obra_select on public.usuario_obra;
create policy usuario_obra_select on public.usuario_obra for select to authenticated
  using (public.ve_economia() or usuario_id = auth.uid());
drop policy if exists usuario_obra_insert on public.usuario_obra;
create policy usuario_obra_insert on public.usuario_obra for insert to authenticated
  with check (public.ve_economia());
drop policy if exists usuario_obra_update on public.usuario_obra;
create policy usuario_obra_update on public.usuario_obra for update to authenticated
  using (public.ve_economia()) with check (public.ve_economia());
drop policy if exists usuario_obra_delete on public.usuario_obra;
create policy usuario_obra_delete on public.usuario_obra for delete to authenticated
  using (public.ve_economia());

commit;
