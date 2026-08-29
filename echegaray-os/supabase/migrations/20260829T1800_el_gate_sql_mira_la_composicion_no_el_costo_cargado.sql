-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL GATE DE SQL MIRA LA COMPOSICIÓN, NO EL COSTO YA CARGADO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL DEFECTO, ENCONTRADO POR EL VIGILANTE ═══
--
-- `cot_gate_congelado` (SQL) y `gateDeCongelado` (JS) son dos implementaciones del mismo gate. El
-- test que las compara sobre el MISMO presupuesto —el real de Quattropani, COT-2026-001— dio:
--
--     SIN_PRECIO_CALCULABLE: SQL false vs JS true
--
-- El motivo: el de SQL mira `cotizacion_partida_valorizada.subtotal`, que sale de
-- `coalesce(p.costo_unitario, ac.costo_directo)` — o sea, del costo YA CARGADO en la partida o del
-- `analisis_costo` agregado. Ese número existe aunque tres de los recursos de la composición no
-- tengan ninguna observación de precio: la vista los agrega con lo que haya y no dice que faltan.
--
-- El de JS explota la composición recurso por recurso y se niega a afirmar el total. Los dos gates
-- decían cosas distintas sobre el mismo presupuesto, y el de SQL —que es el que hace cumplir el
-- congelado desde PostgREST— era el permisivo.
--
-- Es el defecto de §15 una capa más abajo: la vista `analisis_costo` hace con los RECURSOS lo mismo
-- que `cotizacion_cascada` hacía con las PARTIDAS. Acá se cierra para el gate; la vista no se toca,
-- porque tiene consumidores y arreglarla es otro trabajo con otra auditoría.
--
-- Medido sobre el presupuesto real: 26 partidas, 110 recursos, **3 sin ninguna observación de
-- precio** (`4` CAL HIDRATADA EN POLVO, `88` ADHESIVO PARA PVC, `116` BUJE RED 25x20). El gate
-- viejo dejaba congelar; el nuevo no.

-- El nombre al lado del código: 400 recursos de la Base Maestra tienen código puramente numérico.
create or replace function public.rc_entidad(p_codigo text, p_nombre text)
returns text language sql immutable as $$ select p_codigo || ' (' || coalesce(p_nombre, '?') || ')' $$;

grant execute on function public.rc_entidad(text, text) to authenticated;

create or replace function public.cot_gate_congelado(p_cotizacion_id uuid)
returns jsonb language plpgsql stable security invoker set search_path to 'public' as $$
declare
  v_bloqueos jsonb := '[]'::jsonb;
  v_avisos   jsonb := '[]'::jsonb;
  v_conocido numeric;
  v_umbral   numeric := 0.02;
  r          record;
begin
  if not exists (select 1 from public.cotizaciones where id = p_cotizacion_id) then
    return jsonb_build_object('ready', false, 'blocking_issues',
      jsonb_build_array(jsonb_build_object('tipo','NO_EXISTE','entidad',p_cotizacion_id,'detalle','la cotización no existe')),
      'warnings', '[]'::jsonb);
  end if;

  select coalesce(sum(v.subtotal), 0) into v_conocido
    from public.cotizacion_partida_valorizada v where v.cotizacion_id = p_cotizacion_id;

  -- 4.1 · subcontrato sin precio
  for r in
    select v.codigo, v.descripcion from public.cotizacion_partida_valorizada v
     where v.cotizacion_id = p_cotizacion_id and v.sin_precio_de_subcontrato
  loop
    v_bloqueos := v_bloqueos || jsonb_build_object(
      'tipo','SUBCONTRATO_SIN_PRECIO','entidad',coalesce(r.codigo, r.descripcion),
      'detalle','declarado subcontratado y sin precio: NO vale $0, vale lo que va a costar',
      'impacto', null, 'accion','set_subcontract');
  end loop;

  -- 4.2 · partida sin costo
  for r in
    select v.codigo, v.descripcion, v.cantidad, v.sin_analisis
      from public.cotizacion_partida_valorizada v
     where v.cotizacion_id = p_cotizacion_id
       and not v.sin_precio_de_subcontrato
       and (v.subtotal is null or v.cantidad is null or v.sin_analisis)
  loop
    v_bloqueos := v_bloqueos || jsonb_build_object(
      'tipo', case when r.cantidad is null then 'CANTIDAD_CRITICA_AUSENTE' else 'SIN_COMPOSICION' end,
      'entidad', coalesce(r.codigo, r.descripcion),
      'detalle', case when r.cantidad is null then 'no tiene cantidad computada'
                      else 'no tiene análisis vigente: no se sabe de qué está hecha' end,
      'impacto', null,
      'accion', case when r.cantidad is null then 'update_quantity' else null end);
  end loop;

  -- ═══ 4.2b · EL RECURSO SIN PRECIO, QUE ES LO QUE FALTABA ═══
  -- Se baja hasta `analisis_linea` → `recurso` → `recurso_precio`. Un recurso de la composición sin
  -- NINGUNA observación de precio bloquea, aunque la partida tenga un `costo_unitario` cargado que
  -- la haga ver completa. El nombre viaja en la entidad porque 400 recursos de la Base Maestra
  -- tienen código puramente numérico y «SIN_PRECIO · 4» no se puede accionar.
  for r in
    select rc.codigo, rc.nombre,
           string_agg(distinct coalesce(p.codigo, p.descripcion), ', ') as partidas
      from public.cotizacion_partida p
      join public.analisis_linea al on al.analisis_id = p.analisis_id
      join public.recurso rc on rc.id = al.recurso_id
     where p.cotizacion_id = p_cotizacion_id
       and not p.subcontratada
       and not exists (select 1 from public.recurso_precio rp
                        where rp.recurso_id = rc.id and rp.costo is not null and rp.fecha_precio is not null)
     group by rc.codigo, rc.nombre
  loop
    v_bloqueos := v_bloqueos || jsonb_build_object(
      'tipo','SIN_PRECIO','entidad', rc_entidad(r.codigo, r.nombre),
      'detalle','no hay ninguna observación de precio para este recurso · lo pide: ' || coalesce(r.partidas,'?'),
      'impacto', null, 'accion','set_resource_price');
  end loop;

  -- 4.3 · conflicto de alcance
  for r in
    select p.codigo, p.descripcion,
           string_agg(distinct a.patron || '→' || a.estado || ' (' || a.fuente || ')', ' vs ') as detalle
      from public.cotizacion_partida p
      join public.cotizacion_alcance a
        on a.cotizacion_id = p.cotizacion_id
       and (lower(coalesce(p.descripcion,'')) like '%' || lower(a.patron) || '%'
            or lower(coalesce(p.codigo,''))  like '%' || lower(a.patron) || '%'
            or lower(coalesce(p.rubro,''))   like '%' || lower(a.patron) || '%')
     where p.cotizacion_id = p_cotizacion_id
     group by p.id, p.codigo, p.descripcion
    having count(distinct a.estado) > 1
  loop
    v_bloqueos := v_bloqueos || jsonb_build_object(
      'tipo','CONFLICTO','entidad',coalesce(r.codigo, r.descripcion),
      'detalle','el alcance dice dos cosas distintas sobre esta partida: ' || r.detalle,
      'impacto', null, 'accion','include_scope');
  end loop;

  -- ═══ 4.4 · SIN PRECIO CALCULABLE ═══
  -- Ya no basta con que la suma de subtotales dé > 0: si hay UN recurso sin precio, el costo
  -- directo no se puede afirmar, y por lo tanto no hay número que fijar. Es la misma regla que
  -- `costoDirecto()` en JS, escrita del lado de la base para que los dos gates coincidan.
  if v_conocido <= 0
     or exists (select 1 from public.cotizacion_partida p
                  join public.analisis_linea al on al.analisis_id = p.analisis_id
                  join public.recurso rc on rc.id = al.recurso_id
                 where p.cotizacion_id = p_cotizacion_id and not p.subcontratada
                   and not exists (select 1 from public.recurso_precio rp
                                    where rp.recurso_id = rc.id and rp.costo is not null and rp.fecha_precio is not null))
     or exists (select 1 from public.cotizacion_partida_valorizada v
                 where v.cotizacion_id = p_cotizacion_id and v.sin_precio_de_subcontrato)
  then
    v_bloqueos := v_bloqueos || jsonb_build_object(
      'tipo','SIN_PRECIO_CALCULABLE','entidad','cotización',
      'detalle','el costo directo no se pudo afirmar, así que el precio tampoco. NO es cero: es desconocido',
      'impacto', null, 'accion', null);
  end if;

  -- 4.5 · precios viejos
  for r in
    select v.codigo, v.descripcion, v.subtotal, max(cc.fecha_precio) as ultima
      from public.cotizacion_partida_valorizada v
      join public.analisis_linea al on al.analisis_id = v.analisis_id
      join public.recurso_precio cc on cc.recurso_id = al.recurso_id and cc.vigente
     where v.cotizacion_id = p_cotizacion_id and v.subtotal is not null
     group by v.codigo, v.descripcion, v.subtotal
    having max(cc.fecha_precio) < current_date - 180
  loop
    if v_conocido > 0 and r.subtotal / v_conocido >= v_umbral then
      v_bloqueos := v_bloqueos || jsonb_build_object(
        'tipo','PRECIO_DESACTUALIZADO','entidad',coalesce(r.codigo, r.descripcion),
        'detalle','el precio más nuevo de esta partida es del ' || r.ultima,
        'impacto', r.subtotal, 'accion','set_resource_price');
    else
      v_avisos := v_avisos || jsonb_build_object(
        'tipo','PRECIO_DESACTUALIZADO','entidad',coalesce(r.codigo, r.descripcion),
        'detalle','precio del ' || r.ultima, 'impacto', r.subtotal);
    end if;
  end loop;

  return jsonb_build_object(
    'ready', jsonb_array_length(v_bloqueos) = 0,
    'blocking_issues', v_bloqueos,
    'warnings', v_avisos,
    'costo_conocido', v_conocido);
end $$;

comment on function public.cot_gate_congelado(uuid) is
  'El gate determinístico ANTES de congelar. Baja hasta analisis_linea → recurso → recurso_precio: '
  'un recurso sin NINGUNA observación de precio bloquea aunque la partida tenga costo_unitario '
  'cargado. Sin eso, el gate de SQL decía ready donde el de JS bloqueaba, y el permisivo era el que '
  'hace cumplir el congelado desde PostgREST. Lo encontró el test que compara los dos gates sobre '
  'el presupuesto real de Quattropani.';

