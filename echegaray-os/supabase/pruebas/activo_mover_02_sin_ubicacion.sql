-- ══ MOVER LO QUE TODAVÍA NO ESTÁ EN NINGÚN LADO ═════════════════════════════════════════════════
-- Cada caso corta el script si falla (raise exception). Se corre sobre el andamio + la cadena de
-- migraciones de Herramientas; sin 20260922T2500 los casos 1 y 2 abortan, que es el defecto que
-- reportó el dueño el 22/09/2026 («roto el movimiento de maquinarias»).
set client_min_messages to notice;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);

-- Lugares de la prueba: el Taller ya lo creó la migración; la obra la crea la función de siempre.
create temp table t as
select (select id from public.ubicacion where tipo = 'taller') as taller,
       public.ubicacion_de_obra('ob-activa') as obra,
       public.ubicacion_de_obra('ob-otra') as otra;

-- ── 1 · La maquinaria dada de alta SIN ubicación se mueve a una obra ────────────────────────────
do $$
declare v_id uuid; v_lote uuid; v_ubic uuid; v_cant int; v_mov record;
begin
  v_id := public.dar_de_alta_activo('equipo', 'Minicargadora Bobcat S650', null, null, 'MIN-001');
  v_lote := public.mover_existencias(
    jsonb_build_array(jsonb_build_object('activo', v_id, 'origen', null, 'cantidad', 1)),
    (select obra from t), 'a la obra');
  if v_lote is null then raise exception 'FALLÓ 1: no registró ningún movimiento (la app lo muestra como «ya estaban ahí»)'; end if;
  select cantidad into v_cant from public.activo_existencia where activo_id = v_id and ubicacion_id = (select obra from t);
  if coalesce(v_cant, 0) <> 1 then raise exception 'FALLÓ 1: la unidad no quedó en la obra (quedó %)', v_cant; end if;
  select ubicacion_id into v_ubic from public.activo where id = v_id;
  if v_ubic is distinct from (select obra from t) then raise exception 'FALLÓ 1: el activo no quedó apuntando a la obra'; end if;
  select * into v_mov from public.activo_movimiento where activo_id = v_id and lote_id = v_lote;
  if v_mov.origen_id is not null then raise exception 'FALLÓ 1: el movimiento debe nacer sin origen, no inventarlo'; end if;
  if v_mov.cantidad <> 1 then raise exception 'FALLÓ 1: el movimiento no dice 1 unidad'; end if;
  -- Y desde ahí se sigue moviendo como cualquier otro.
  perform public.mover_existencias(
    jsonb_build_array(jsonb_build_object('activo', v_id, 'origen', (select obra from t), 'cantidad', 1)),
    (select taller from t), null);
  select ubicacion_id into v_ubic from public.activo where id = v_id;
  if v_ubic is distinct from (select taller from t) then raise exception 'FALLÓ 1: el segundo movimiento no la dejó en el Taller'; end if;
  raise notice 'OK 1 · la maquinaria sin ubicación entra a la obra y después sigue moviéndose';
end $$;

-- ── 2 · `mover_activos` (la firma de siempre) tampoco puede devolver un silencio ────────────────
do $$
declare v_id uuid; v_lote uuid; v_ubic uuid;
begin
  v_id := public.dar_de_alta_activo('equipo', 'Rodillo vibrador', null, null, 'ROD-900');
  v_lote := public.mover_activos(array[v_id], (select obra from t), 'a la obra');
  if v_lote is null then raise exception 'FALLÓ 2: devolvió null y la app dice «ya estaban ahí»: el movimiento nunca pasó'; end if;
  select ubicacion_id into v_ubic from public.activo where id = v_id;
  if v_ubic is distinct from (select obra from t) then raise exception 'FALLÓ 2: no quedó en la obra'; end if;
  raise notice 'OK 2 · mover_activos también da de entrada al que no estaba en ningún lado';
end $$;

-- ── 3 · Lo que ya andaba no se afloja: el origen de un lote repartido sigue siendo obligatorio ──
do $$
declare v_id uuid; v_ok boolean := false;
begin
  v_id := public.dar_de_alta_activo('herramienta', 'Andamio', (select taller from t), null, 'AND-900', null, false, null, 8);
  perform public.mover_existencias(
    jsonb_build_array(jsonb_build_object('activo', v_id, 'origen', (select taller from t), 'cantidad', 3)),
    (select obra from t), null);
  begin
    perform public.mover_existencias(
      jsonb_build_array(jsonb_build_object('activo', v_id, 'origen', null, 'cantidad', 1)), (select otra from t), null);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'FALLÓ 3: un lote repartido se movió sin decir de dónde sale'; end if;
  if (select sum(cantidad) from public.activo_existencia where activo_id = v_id) <> 8 then
    raise exception 'FALLÓ 3: se perdieron unidades en el camino';
  end if;
  raise notice 'OK 3 · el lote repartido sigue exigiendo el lugar de salida';
end $$;

-- ── 4 · Lo que no está en ningún lado entra ENTERO: repartirlo perdería unidades ────────────────
do $$
declare v_id uuid; v_ok boolean := false;
begin
  v_id := public.dar_de_alta_activo('herramienta', 'Puntal', null, null, 'PUN-900', null, false, null, 10);
  begin
    perform public.mover_existencias(
      jsonb_build_array(jsonb_build_object('activo', v_id, 'origen', null, 'cantidad', 4)), (select obra from t), null);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'FALLÓ 4: dejó mandar 4 de 10 sin ubicación y las otras 6 desaparecen'; end if;
  if (select count(*) from public.activo_existencia where activo_id = v_id) <> 0 then
    raise exception 'FALLÓ 4: quedó una existencia a medias';
  end if;
  perform public.mover_existencias(
    jsonb_build_array(jsonb_build_object('activo', v_id, 'origen', null, 'cantidad', 10)), (select obra from t), null);
  if (select cantidad from public.activo_existencia where activo_id = v_id and ubicacion_id = (select obra from t)) <> 10 then
    raise exception 'FALLÓ 4: las 10 no quedaron en la obra';
  end if;
  raise notice 'OK 4 · entra entero, y entero llega';
end $$;

-- ── 5 · La cuenta cierra: el total de cada activo vivo es la suma de sus lugares ────────────────
do $$
declare n int;
begin
  select count(*) into n from public.activo a
   where a.estado <> 'baja' and exists (select 1 from public.activo_existencia e where e.activo_id = a.id)
     and a.cantidad is distinct from (select sum(cantidad) from public.activo_existencia e where e.activo_id = a.id);
  if n > 0 then raise exception 'FALLÓ 5: % activos con cantidad distinta de la suma por lugar', n; end if;
  raise notice 'OK 5 · la cuenta cierra';
end $$;
