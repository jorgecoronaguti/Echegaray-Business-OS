-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL ACTIVO SIN UBICACIÓN TAMBIÉN SE MUEVE — la primera vez que sale, ENTRA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, 22/09/2026: *«roto el movimiento de maquinarias en modulo de herramientas»*.
--
-- Reproducido en producción con MIN-001 (Minicargadora Bobcat S650, dada de alta sin ubicación):
-- Herramientas › Inventario › Maquinarias → «Mover o asignar a obra» → cualquier obra → el panel
-- contesta «MIN-001 no tiene unidades en el lugar de origen» y la máquina se queda donde estaba.
--
-- POR QUÉ: desde 20260922T1300 el movimiento se calcula sobre `activo_existencia`. Un activo dado de
-- alta SIN ubicación no tiene ninguna fila ahí —lo cual es correcto: no está en ningún lado—, así que
-- `_mover_existencia` busca las unidades del origen `null`, no encuentra ninguna y aborta. El caso no
-- es raro: es el alta normal cuando todavía no se sabe dónde va a quedar la máquina.
--   · `mover_existencias` (el panel y el teléfono) aborta con ese mensaje.
--   · `mover_activos` (la firma de siempre) es peor: recorre CERO existencias, devuelve null y la app
--     lo traduce como «ya estaban ahí» — un movimiento que no pasó y que nadie ve fallar.
--
-- QUÉ CAMBIA: origen `null` y ninguna unidad cargada en ningún lugar = ALTA EN EL DESTINO. Las
-- unidades del activo entran al destino y queda el movimiento con `origen_id null`, que es lo que ya
-- hace `dar_de_alta_activo` cuando el alta trae ubicación. Nada más se afloja: si el activo SÍ tiene
-- existencias, un origen `null` sigue siendo un error (hay que decir de dónde sale), y lo que no está
-- en ningún lado entra ENTERO —repartir algo que no está en ninguna parte perdería unidades, porque
-- el total se recalcula desde `activo_existencia`.
--
-- NO SE APLICA DESDE UN AGENTE. La aplica el dueño.

-- ── EL NÚCLEO ───────────────────────────────────────────────────────────────────────────────────
create or replace function public._mover_existencia(
  p_activo uuid, p_origen uuid, p_destino uuid, p_cantidad int, p_usr uuid, p_lote uuid, p_nota text
) returns int
language plpgsql security definer set search_path = public as $$
declare v_codigo text; v_cant int; v_hay int; v_n int; v_entra boolean := false;
begin
  if p_origen is not distinct from p_destino then return 0; end if;
  select codigo, coalesce(cantidad, 1) into v_codigo, v_cant from activo where id = p_activo;
  if p_origen is null then
    -- Sin lugar de salida: sólo vale si no tiene unidades en NINGÚN lado (alta sin ubicación).
    if exists (select 1 from activo_existencia where activo_id = p_activo) then
      raise exception '% tiene unidades cargadas: hay que decir de qué lugar sale', v_codigo using errcode = 'P0001';
    end if;
    v_hay := v_cant;
    v_entra := true;
  else
    select cantidad into v_hay from activo_existencia where activo_id = p_activo and ubicacion_id = p_origen for update;
    if v_hay is null then
      raise exception '% no tiene unidades en el lugar de origen', v_codigo using errcode = 'P0001';
    end if;
  end if;
  v_n := coalesce(p_cantidad, v_hay);
  if v_n < 1 then raise exception 'la cantidad a mover es 1 o más'; end if;
  if v_n > v_hay then
    raise exception '%: en el lugar de origen hay %, no se pueden mover %', v_codigo, v_hay, v_n using errcode = 'P0001';
  end if;
  if v_entra then
    if v_n < v_hay then
      raise exception '% no tiene ubicación cargada: entra entero (% unidades), no se puede repartir lo que no está en ningún lado',
        v_codigo, v_hay using errcode = 'P0001';
    end if;
  elsif v_n = v_hay then
    delete from activo_existencia where activo_id = p_activo and ubicacion_id = p_origen;
  else
    update activo_existencia set cantidad = cantidad - v_n where activo_id = p_activo and ubicacion_id = p_origen;
  end if;
  insert into activo_existencia (activo_id, ubicacion_id, cantidad) values (p_activo, p_destino, v_n)
  on conflict (activo_id, ubicacion_id) do update set cantidad = activo_existencia.cantidad + excluded.cantidad;
  insert into activo_movimiento (activo_id, origen_id, destino_id, usuario_id, lote_id, nota, cantidad)
  values (p_activo, p_origen, p_destino, p_usr, p_lote, nullif(btrim(p_nota), ''), v_n);
  perform public._activo_recalcular(p_activo);
  return v_n;
end $$;

-- ── MOVER ACTIVOS ENTEROS: el que no está en ningún lado también entra ───────────────────────────
create or replace function public.mover_activos(
  p_activos uuid[], p_destino uuid, p_nota text default null, p_bajar_carga boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._activo_usuario();
  v_lote uuid := gen_random_uuid();
  v_dest ubicacion%rowtype := public._validar_destino(p_destino);
  v_act activo%rowtype; v_e record; v_desde uuid; v_lugares int; v_movidos int := 0;
begin
  if coalesce(array_length(p_activos, 1), 0) = 0 then raise exception 'no hay activos para mover'; end if;
  for v_act in select * from activo where id = any(p_activos) order by codigo for update loop
    if v_act.estado = 'baja' then raise exception '% está dado de baja: no se mueve más', v_act.codigo; end if;
    if v_dest.tipo = 'rodado' and v_dest.activo_id = v_act.id then
      raise exception '% no puede moverse adentro de sí mismo', v_act.codigo;
    end if;
    v_desde := v_act.ubicacion_id;
    select count(*) into v_lugares from activo_existencia where activo_id = v_act.id;
    if v_lugares = 0 then
      -- Sin ubicación cargada: entra al destino con todas sus unidades.
      v_movidos := v_movidos + public._mover_existencia(v_act.id, null, p_destino, null, v_usr, v_lote, p_nota);
    else
      for v_e in select ubicacion_id, cantidad from activo_existencia
                  where activo_id = v_act.id and ubicacion_id <> p_destino order by ubicacion_id loop
        v_movidos := v_movidos + public._mover_existencia(v_act.id, v_e.ubicacion_id, p_destino, v_e.cantidad, v_usr, v_lote, p_nota);
      end loop;
    end if;
    if v_act.clase = 'rodado' and p_bajar_carga and v_desde is distinct from p_destino then
      perform public._bajar_carga_de_rodado(v_act.id, v_desde, v_usr, v_lote, v_act.codigo);
    end if;
  end loop;
  if v_movidos = 0 then return null; end if;
  return v_lote;
end $$;

revoke all on function public._mover_existencia(uuid, uuid, uuid, int, uuid, uuid, text) from public, anon;
grant execute on function public.mover_activos(uuid[], uuid, text, boolean) to authenticated;
