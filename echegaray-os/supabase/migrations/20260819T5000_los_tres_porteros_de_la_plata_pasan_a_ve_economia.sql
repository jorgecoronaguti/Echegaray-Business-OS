-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LOS TRES PORTEROS DE LA PLATA PASAN A `ve_economia()`
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Al abrir `es_administracion()` al jefe de obra, tres funciones que decidían si se devuelve un monto
-- o un null quedaron abiertas con él. Verificado con el token real ANTES de este archivo:
--
--     obra_panel.monto_contratado de «relevamiento-topografico» → 900000
--
-- Las tres son `SECURITY DEFINER` y por eso el grant de columna de `obra_canonica` no las frena: son
-- la puerta por la que Administración lee el monto, y la única. Reapuntarlas a `ve_economia()` cierra
-- de una vez `obra_panel`, `cliente_panel.contratado`, `obra_plan_vs_real` y el margen sobre
-- contratado — porque los cuatro salen de acá y no de la columna.
--
-- `auth.uid() is null` se conserva: es el service role de los scripts del OS, que sí calculan la
-- economía. Sacarlo dejaría el Flujo de Fondos sin contratado.
--
-- Y `presupuestos` —la cotización— se cierra: el dueño puso «montos de ventas y cotizaciones» del
-- mismo lado. Su policy de lectura no tenía predicado y devolvía filas a cualquier autenticado.

create or replace function public.contratado_de_obra(p_obra text)
returns numeric language sql stable security definer set search_path to 'public'
as $function$
  select case when public.ve_economia() or auth.uid() is null
              then (select oc.monto_contratado from public.obra_canonica oc where oc.id = p_obra) end
$function$;

create or replace function public.presupuesto_monto(p_presupuesto uuid)
returns numeric language sql stable security definer set search_path to 'public'
as $function$
  select case when public.ve_economia() or auth.uid() is null
              then (select p.monto_presupuestado from public.presupuestos p where p.id = p_presupuesto) end
$function$;

create or replace function public.presupuesto_margen(p_presupuesto uuid)
returns numeric language sql stable security definer set search_path to 'public'
as $function$
  select case when public.ve_economia() or auth.uid() is null
              then (select p.margen_esperado from public.presupuestos p where p.id = p_presupuesto) end
$function$;

drop policy if exists presupuestos_select on public.presupuestos;
create policy presupuestos_select on public.presupuestos for select to authenticated
  using (public.ve_economia());
