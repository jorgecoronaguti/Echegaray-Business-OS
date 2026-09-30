-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HERRAMIENTAS · EPP Y ROPA: «DÓNDE ESTÁ» Y «QUIÉN LO TIENE» SON DOS COSAS DISTINTAS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, 30/09/2026: «no es "ubicación actual" es persona que lo tiene […] la ubicación es un
-- cliente/una obra, no una persona; eso es quien lo tiene».
--
-- MODELO
--   · `activo_existencia.persona_id` (nulo = libre en ese lugar). Una fila por (activo, lugar, persona).
--   · DÓNDE: siempre un lugar real (obra, Taller, rodado, servicio técnico). Nunca una persona.
--   · QUIÉN LO TIENE: la persona, o nadie.
--   · Entregar a una persona lo deja en el lugar donde trabaja: la obra de su asignación vigente
--     (`obra_asignacion`), o el Taller si no tiene ninguna (`_lugar_de_persona`).
--   · Si cambia de obra, lo que tiene se va con ella (trigger en `obra_asignacion` + pasada diaria
--     para las asignaciones que vencen solas por fecha).
--   · Devolver = sacarle la persona; queda donde está (`devolver_de_persona`).
--   · Perdido / gastado = baja parcial sobre lo que tiene esa persona (`dar_de_baja_parcial(…, p_persona)`).
--   · Historial: `activo_movimiento.persona_origen / persona_destino` y `activo_ajuste.persona_id`.
--
-- RETIRO DE LAS UBICACIONES TIPO 'persona'
--   No se borran: se archivan y conservan sus claves foráneas (el historial las sigue nombrando). Lo que
--   estaba «en» cada una pasa, con su persona, al lugar donde esa persona trabaja, con un movimiento
--   fechado hoy. Un CHECK impide crear ubicaciones tipo persona nuevas.
--
-- CONTROLES (raise exception, dentro de esta misma transacción): total por activo igual antes y
-- después; lo que tiene cada persona igual antes y después; ninguna existencia en ubicación persona;
-- activo.cantidad = suma de existencias; renglones de constancia con persona_destino; todo lo que
-- tiene alguien está en su lugar; ninguna función con el ON CONFLICT viejo.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

set local lock_timeout = '5s';
set local statement_timeout = '180s';

-- ── Foto de antes ──────────────────────────────────────────────────────────────────────────────
create temp table _epp_total_antes on commit drop as
  select a.id as activo_id, coalesce(sum(e.cantidad), 0)::int as total
    from public.activo a left join public.activo_existencia e on e.activo_id = a.id
   group by a.id;

create temp table _epp_tenencia_antes on commit drop as
  select e.activo_id, u.persona_id, sum(e.cantidad)::int as cantidad
    from public.activo_existencia e join public.ubicacion u on u.id = e.ubicacion_id
   where u.tipo = 'persona'
   group by 1, 2;

-- ── 1. Esquema ────────────────────────────────────────────────────────────────────────────────
alter table public.activo_existencia add column persona_id uuid references public.personas(id);
alter table public.activo_existencia add column id uuid not null default gen_random_uuid();
alter table public.activo_existencia drop constraint activo_existencia_pkey;
alter table public.activo_existencia add constraint activo_existencia_pkey primary key (id);
alter table public.activo_existencia add constraint activo_existencia_lugar_uq
  unique nulls not distinct (activo_id, ubicacion_id, persona_id);
create index activo_existencia_persona_idx on public.activo_existencia (persona_id) where persona_id is not null;
comment on column public.activo_existencia.persona_id is
  'Quién lo tiene (nulo = libre en ese lugar). El lugar (ubicacion_id) es siempre una obra, el Taller, un rodado o un servicio técnico: nunca una persona (dueño 30/09).';

alter table public.activo_movimiento add column persona_origen uuid references public.personas(id);
alter table public.activo_movimiento add column persona_destino uuid references public.personas(id);
comment on column public.activo_movimiento.persona_origen is 'Quién lo tenía antes del movimiento (nulo = libre).';
comment on column public.activo_movimiento.persona_destino is 'Quién lo tiene después del movimiento (nulo = libre: devuelto o movido sin entregar).';
alter table public.activo_movimiento drop constraint activo_mov_distinto_chk;
alter table public.activo_movimiento add constraint activo_mov_distinto_chk
  check (origen_id is distinct from destino_id or persona_origen is distinct from persona_destino);

alter table public.activo_ajuste add column persona_id uuid references public.personas(id);
comment on column public.activo_ajuste.persona_id is 'Sobre lo que tenía esta persona (nulo = sobre lo libre del lugar).';

-- Las columnas nuevas nacen legibles aunque el permiso sea por columna.
grant select (id, persona_id) on public.activo_existencia to authenticated;
grant select (persona_origen, persona_destino) on public.activo_movimiento to authenticated;
grant select (persona_id) on public.activo_ajuste to authenticated;

-- ── 2. Historial: quién, sacado de las ubicaciones persona ────────────────────────────────────
update public.activo_movimiento m set persona_destino = u.persona_id
  from public.ubicacion u where u.id = m.destino_id and u.tipo = 'persona';
update public.activo_movimiento m set persona_origen = u.persona_id
  from public.ubicacion u where u.id = m.origen_id and u.tipo = 'persona';
update public.activo_ajuste a set persona_id = u.persona_id
  from public.ubicacion u where u.id = a.ubicacion_id and u.tipo = 'persona';

-- ── 3. Funciones auxiliares ───────────────────────────────────────────────────────────────────
create or replace function public._nombre_persona(p_persona uuid) returns text
language sql stable security definer set search_path = public as $function$
  select coalesce(nullif(btrim(nombre_para_mostrar), ''), nullif(btrim(nombre_completo), ''), 'Persona sin nombre')
    from personas where id = p_persona
$function$;

create or replace function public._quien_tiene(p_activo uuid, p_ubicacion uuid default null) returns text
language sql stable security definer set search_path = public as $function$
  select string_agg(x.txt, ', ' order by x.txt)
    from (select public._nombre_persona(e.persona_id) || case when e.cantidad > 1 then ' (' || e.cantidad || ')' else '' end as txt
            from activo_existencia e
           where e.activo_id = p_activo and e.persona_id is not null
             and (p_ubicacion is null or e.ubicacion_id = p_ubicacion)) x
$function$;

-- Dónde queda lo que tiene una persona: la obra (activa) de su asignación vigente; si no, el Taller.
create or replace function public._lugar_de_persona(p_persona uuid) returns uuid
language plpgsql security definer set search_path = public as $function$
declare v_obra text; v_ubic uuid; v_arch boolean;
begin
  select a.obra_id into v_obra
    from obra_asignacion a join obra_canonica o on o.id = a.obra_id
   where a.persona_id = p_persona and public.asignacion_vigente(a.desde, a.hasta) and o.estado = 'activa'
   order by a.desde desc nulls last, a.creado_en desc
   limit 1;
  if v_obra is not null then
    select id, archivada into v_ubic, v_arch from ubicacion where obra_id = v_obra;
    if v_ubic is null then
      insert into ubicacion (tipo, obra_id) values ('obra', v_obra) on conflict (obra_id) do nothing returning id into v_ubic;
      if v_ubic is null then select id into v_ubic from ubicacion where obra_id = v_obra; end if;
    elsif v_arch then
      v_ubic := null;
    end if;
  end if;
  if v_ubic is null then
    select id into v_ubic from ubicacion where tipo = 'taller' and not archivada order by creado_en limit 1;
  end if;
  if v_ubic is null then
    raise exception 'no hay Taller cargado: no hay dónde dejar lo que tiene %', public._nombre_persona(p_persona);
  end if;
  return v_ubic;
end $function$;

-- ── 4. Motor de movimientos: ahora mueve (lugar, persona) → (lugar, persona) ──────────────────
drop function public._mover_existencia(uuid, uuid, uuid, integer, uuid, uuid, text);
create function public._mover_existencia(
  p_activo uuid, p_origen uuid, p_destino uuid, p_cantidad integer, p_usr uuid, p_lote uuid, p_nota text,
  p_per_origen uuid default null, p_per_destino uuid default null
) returns integer
language plpgsql security definer set search_path = public as $function$
declare v_codigo text; v_cant int; v_hay int; v_n int; v_entra boolean := false; v_quien text;
begin
  if p_origen is not distinct from p_destino and p_per_origen is not distinct from p_per_destino then return 0; end if;
  select codigo, coalesce(cantidad, 1) into v_codigo, v_cant from activo where id = p_activo;
  if p_origen is null then
    -- Sin lugar de salida: sólo vale si no tiene unidades en NINGÚN lado (alta sin ubicación).
    if p_per_origen is not null then raise exception 'sin lugar de salida no hay quién lo tenga'; end if;
    if exists (select 1 from activo_existencia where activo_id = p_activo) then
      raise exception '% tiene unidades cargadas: hay que decir de qué lugar sale', v_codigo using errcode = 'P0001';
    end if;
    v_hay := v_cant;
    v_entra := true;
  else
    select cantidad into v_hay from activo_existencia
     where activo_id = p_activo and ubicacion_id = p_origen and persona_id is not distinct from p_per_origen for update;
    if v_hay is null then
      if p_per_origen is not null then
        raise exception '%: % no tiene unidades en ese lugar', v_codigo, public._nombre_persona(p_per_origen) using errcode = 'P0001';
      end if;
      v_quien := public._quien_tiene(p_activo, p_origen);
      if v_quien is not null then
        raise exception '%: en ese lugar no quedan unidades libres, las tiene %: primero se devuelven', v_codigo, v_quien using errcode = 'P0001';
      end if;
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
    delete from activo_existencia
     where activo_id = p_activo and ubicacion_id = p_origen and persona_id is not distinct from p_per_origen;
  else
    update activo_existencia set cantidad = cantidad - v_n
     where activo_id = p_activo and ubicacion_id = p_origen and persona_id is not distinct from p_per_origen;
  end if;
  insert into activo_existencia (activo_id, ubicacion_id, persona_id, cantidad) values (p_activo, p_destino, p_per_destino, v_n)
  on conflict (activo_id, ubicacion_id, persona_id) do update set cantidad = activo_existencia.cantidad + excluded.cantidad;
  insert into activo_movimiento (activo_id, origen_id, destino_id, usuario_id, lote_id, nota, cantidad, persona_origen, persona_destino)
  values (p_activo, p_origen, p_destino, p_usr, p_lote, nullif(btrim(p_nota), ''), v_n, p_per_origen, p_per_destino);
  perform public._activo_recalcular(p_activo);
  return v_n;
end $function$;

-- El lugar principal del activo es el que más unidades tiene, sumando libres y tenidas.
create or replace function public._activo_recalcular(p_activo uuid) returns void
language plpgsql security definer set search_path = public as $function$
declare v_total int; v_ubic uuid;
begin
  select coalesce(sum(cantidad), 0) into v_total from activo_existencia where activo_id = p_activo;
  if v_total = 0 then
    update activo set cantidad = 0, ubicacion_id = null
     where id = p_activo and clase in ('epp', 'ropa') and (cantidad <> 0 or ubicacion_id is not null);
    return;
  end if;
  select e.ubicacion_id into v_ubic
    from activo_existencia e join activo a on a.id = e.activo_id
   where e.activo_id = p_activo
   group by e.ubicacion_id, a.ubicacion_id
   order by sum(e.cantidad) desc, (e.ubicacion_id = a.ubicacion_id) desc, e.ubicacion_id
   limit 1;
  update activo set cantidad = v_total, ubicacion_id = v_ubic
   where id = p_activo and (cantidad, ubicacion_id) is distinct from (v_total, v_ubic);
end $function$;

-- Mover desde Herramientas: mueve lo LIBRE. Lo que tiene alguien se devuelve primero (o se va con la persona).
create or replace function public.mover_existencias(p_items jsonb, p_destino uuid, p_nota text default null, p_bajar_carga boolean default false)
returns uuid language plpgsql security definer set search_path = public as $function$
declare
  v_usr uuid := public._activo_usuario();
  v_lote uuid := gen_random_uuid();
  v_dest ubicacion%rowtype := public._validar_destino(p_destino);
  v_it jsonb; v_act activo%rowtype; v_origen uuid; v_lugares int; v_movidos int := 0; v_quien text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no hay activos para mover';
  end if;
  for v_it in select value from jsonb_array_elements(p_items) order by value->>'activo', value->>'origen' loop
    select * into v_act from activo where id = (v_it->>'activo')::uuid for update;
    if not found then raise exception 'el activo no existe'; end if;
    if v_act.estado = 'baja' then raise exception '% está dado de baja: no se mueve más', v_act.codigo; end if;
    if v_dest.tipo = 'rodado' and v_dest.activo_id = v_act.id then
      raise exception '% no puede moverse adentro de sí mismo', v_act.codigo;
    end if;
    v_origen := nullif(v_it->>'origen', '')::uuid;
    if v_origen is null then
      select count(*), min(ubicacion_id::text)::uuid into v_lugares, v_origen
        from activo_existencia where activo_id = v_act.id and persona_id is null;
      if v_lugares > 1 then
        raise exception '% está repartido en % lugares: elegí de dónde sale', v_act.codigo, v_lugares using errcode = 'P0001';
      end if;
      if v_lugares = 0 then
        v_quien := public._quien_tiene(v_act.id);
        if v_quien is not null then
          raise exception '%: no quedan unidades libres, las tiene %: primero se devuelven', v_act.codigo, v_quien using errcode = 'P0001';
        end if;
      end if;
    end if;
    v_movidos := v_movidos + public._mover_existencia(v_act.id, v_origen, p_destino,
                   nullif(v_it->>'cantidad', '')::int, v_usr, v_lote, p_nota);
    if v_act.clase = 'rodado' and p_bajar_carga and v_origen is distinct from p_destino then
      perform public._bajar_carga_de_rodado(v_act.id, v_origen, v_usr, v_lote, v_act.codigo);
    end if;
  end loop;
  if v_movidos = 0 then return null; end if;
  return v_lote;
end $function$;

create or replace function public.mover_activos(p_activos uuid[], p_destino uuid, p_nota text default null, p_bajar_carga boolean default false)
returns uuid language plpgsql security definer set search_path = public as $function$
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
      v_movidos := v_movidos + public._mover_existencia(v_act.id, null, p_destino, null, v_usr, v_lote, p_nota);
    else
      -- Sólo lo libre: lo que tiene alguien se queda con esa persona.
      for v_e in select ubicacion_id, cantidad from activo_existencia
                  where activo_id = v_act.id and persona_id is null and ubicacion_id <> p_destino order by ubicacion_id loop
        v_movidos := v_movidos + public._mover_existencia(v_act.id, v_e.ubicacion_id, p_destino, v_e.cantidad, v_usr, v_lote, p_nota);
      end loop;
    end if;
    if v_act.clase = 'rodado' and p_bajar_carga and v_desde is distinct from p_destino then
      perform public._bajar_carga_de_rodado(v_act.id, v_desde, v_usr, v_lote, v_act.codigo);
    end if;
  end loop;
  if v_movidos = 0 then return null; end if;
  return v_lote;
end $function$;

create or replace function public._bajar_carga_de_rodado(p_rodado uuid, p_donde uuid, p_usr uuid, p_lote uuid, p_codigo text)
returns void language plpgsql security definer set search_path = public as $function$
declare v_ubic_rodado uuid; r record;
begin
  if p_donde is null then return; end if;
  select id into v_ubic_rodado from ubicacion where activo_id = p_rodado;
  for r in select e.activo_id, e.persona_id, e.cantidad from activo_existencia e join activo a on a.id = e.activo_id
            where e.ubicacion_id = v_ubic_rodado and a.estado <> 'baja' order by a.codigo, e.persona_id loop
    perform 1 from activo where id = r.activo_id for update;
    perform public._mover_existencia(r.activo_id, v_ubic_rodado, p_donde, r.cantidad, p_usr, p_lote,
      'bajó del rodado ' || p_codigo, r.persona_id, r.persona_id);
  end loop;
end $function$;

create or replace function public._activos_de_obra_inactiva_al_taller() returns trigger
language plpgsql security definer set search_path = public as $function$
declare v_ubic uuid; v_taller uuid; v_lote uuid := gen_random_uuid(); r record;
begin
  if new.estado = 'activa' or old.estado is not distinct from new.estado then return new; end if;
  select id into v_ubic from ubicacion where obra_id = new.id;
  if v_ubic is null then return new; end if;
  select id into v_taller from ubicacion where tipo = 'taller' and not archivada order by creado_en limit 1;
  if v_taller is null then return new; end if;
  -- Lo que tiene alguien viaja con su persona (sigue a su nombre); la pasada diaria lo lleva a su obra nueva.
  for r in select e.activo_id, e.persona_id, e.cantidad from activo_existencia e join activo a on a.id = e.activo_id
            where e.ubicacion_id = v_ubic and a.estado <> 'baja' order by a.codigo, e.persona_id loop
    perform 1 from activo where id = r.activo_id for update;
    perform public._mover_existencia(r.activo_id, v_ubic, v_taller, r.cantidad, auth.uid(), v_lote,
      'la obra pasó a «' || new.estado || '»: al Taller (regla del dueño 21/09)', r.persona_id, r.persona_id);
  end loop;
  return new;
end $function$;

-- ── 5. Ajustes y bajas: sobre lo libre del lugar o sobre lo que tiene una persona ──────────────
drop function public.ajustar_existencia(uuid, uuid, integer, text);
create function public.ajustar_existencia(p_activo uuid, p_ubicacion uuid, p_cantidad integer, p_detalle text default null, p_persona uuid default null)
returns void language plpgsql security definer set search_path = public as $function$
declare v_usr uuid := public._activo_usuario(); v_act activo%rowtype; v_hay int;
begin
  select * into v_act from activo where id = p_activo for update;
  if not found then raise exception 'el activo no existe'; end if;
  if v_act.estado = 'baja' then raise exception '% está dado de baja', v_act.codigo; end if;
  if coalesce(p_cantidad, 0) < 1 then
    raise exception 'para dejar un lugar en 0 es una baja (robada, perdida, descartada o vendida) o un movimiento';
  end if;
  select cantidad into v_hay from activo_existencia
   where activo_id = p_activo and ubicacion_id = p_ubicacion and persona_id is not distinct from p_persona for update;
  if v_hay is null then
    if v_act.clase not in ('epp', 'ropa') then
      raise exception '% no tiene unidades en ese lugar: se lleva con un movimiento', v_act.codigo;
    end if;
    perform public._validar_destino(p_ubicacion);
    if p_persona is not null and not exists (select 1 from personas where id = p_persona and en_la_empresa) then
      raise exception 'la persona ya no está en la empresa: no se le entrega nada';
    end if;
    insert into activo_existencia (activo_id, ubicacion_id, persona_id, cantidad) values (p_activo, p_ubicacion, p_persona, p_cantidad);
    insert into activo_ajuste (activo_id, ubicacion_id, persona_id, antes, despues, motivo, detalle, usuario_id)
    values (p_activo, p_ubicacion, p_persona, 0, p_cantidad, 'recuento', nullif(btrim(p_detalle), ''), v_usr);
    perform public._activo_recalcular(p_activo);
    return;
  end if;
  if v_hay = p_cantidad then return; end if;
  update activo_existencia set cantidad = p_cantidad
   where activo_id = p_activo and ubicacion_id = p_ubicacion and persona_id is not distinct from p_persona;
  insert into activo_ajuste (activo_id, ubicacion_id, persona_id, antes, despues, motivo, detalle, usuario_id)
  values (p_activo, p_ubicacion, p_persona, v_hay, p_cantidad, 'recuento', nullif(btrim(p_detalle), ''), v_usr);
  perform public._activo_recalcular(p_activo);
end $function$;

drop function public.dar_de_baja_parcial(uuid, uuid, integer, text, text);
create function public.dar_de_baja_parcial(p_activo uuid, p_ubicacion uuid, p_cantidad integer, p_motivo text,
                                          p_detalle text default null, p_persona uuid default null)
returns void language plpgsql security definer set search_path = public as $function$
declare v_usr uuid := public._activo_usuario(); v_act activo%rowtype; v_hay int; v_total int; v_quien text;
begin
  select * into v_act from activo where id = p_activo for update;
  if not found then raise exception 'el activo no existe'; end if;
  if v_act.estado = 'baja' then raise exception '% ya está dado de baja', v_act.codigo; end if;
  if p_motivo not in ('robada', 'perdida', 'descartada', 'vendida') then raise exception 'motivo de baja no válido'; end if;
  if coalesce(p_cantidad, 0) < 1 then raise exception 'la cantidad a dar de baja es 1 o más'; end if;
  select cantidad into v_hay from activo_existencia
   where activo_id = p_activo and ubicacion_id = p_ubicacion and persona_id is not distinct from p_persona for update;
  if v_hay is null then
    if p_persona is not null then
      raise exception '%: % no tiene unidades en ese lugar', v_act.codigo, public._nombre_persona(p_persona);
    end if;
    v_quien := public._quien_tiene(p_activo, p_ubicacion);
    if v_quien is not null then
      raise exception '%: en ese lugar no hay unidades libres, las tiene %: la baja se hace sobre esa persona', v_act.codigo, v_quien;
    end if;
    raise exception '% no tiene unidades en ese lugar', v_act.codigo;
  end if;
  if p_cantidad > v_hay then
    raise exception '%: en ese lugar hay %, no se pueden dar de baja %', v_act.codigo, v_hay, p_cantidad using errcode = 'P0001';
  end if;
  select sum(cantidad) into v_total from activo_existencia where activo_id = p_activo;
  insert into activo_ajuste (activo_id, ubicacion_id, persona_id, antes, despues, motivo, detalle, usuario_id)
  values (p_activo, p_ubicacion, p_persona, v_hay, v_hay - p_cantidad, p_motivo, nullif(btrim(p_detalle), ''), v_usr);
  if p_cantidad = v_total and v_act.clase not in ('epp', 'ropa') then
    perform public.dar_de_baja_activo(p_activo, p_motivo, p_detalle);
    return;
  end if;
  if p_cantidad = v_hay then
    delete from activo_existencia
     where activo_id = p_activo and ubicacion_id = p_ubicacion and persona_id is not distinct from p_persona;
  else
    update activo_existencia set cantidad = cantidad - p_cantidad
     where activo_id = p_activo and ubicacion_id = p_ubicacion and persona_id is not distinct from p_persona;
  end if;
  perform public._activo_recalcular(p_activo);
end $function$;

create or replace function public.editar_activo(p_activo uuid, p_datos jsonb)
returns void language plpgsql security definer set search_path = public as $function$
declare v_usr uuid := public._activo_usuario(); v_lugares int; v_ubic uuid; v_per uuid; v_cant int;
begin
  if p_datos ? 'cantidad' then
    v_cant := (p_datos->>'cantidad')::int;
    select count(*), min(ubicacion_id::text)::uuid, min(persona_id::text)::uuid into v_lugares, v_ubic, v_per
      from activo_existencia where activo_id = p_activo;
    if v_lugares > 1 and v_cant is distinct from (select cantidad from activo where id = p_activo) then
      raise exception 'está repartido en % lugares: la cantidad se corrige en cada lugar', v_lugares using errcode = 'P0001';
    end if;
    if v_lugares = 1 then
      perform public.ajustar_existencia(p_activo, v_ubic, v_cant, 'corregido al editar los datos', v_per);
    end if;
  end if;
  update activo set
    nombre              = coalesce(nullif(btrim(p_datos->>'nombre'), ''), nombre),
    categoria           = case when p_datos ? 'categoria' and clase not in ('epp', 'ropa') then nullif(btrim(p_datos->>'categoria'), '') else categoria end,
    cantidad            = case when p_datos ? 'cantidad' and v_lugares = 0 then v_cant else cantidad end,
    talle               = case when p_datos ? 'talle' and clase in ('epp', 'ropa') then nullif(upper(btrim(p_datos->>'talle')), '') else talle end,
    foto_url            = case when p_datos ? 'foto_url' then nullif(p_datos->>'foto_url', '') else foto_url end,
    numero_serie        = case when p_datos ? 'numero_serie' then nullif(btrim(p_datos->>'numero_serie'), '') else numero_serie end,
    compra_fecha        = case when p_datos ? 'compra_fecha' then nullif(p_datos->>'compra_fecha', '')::date else compra_fecha end,
    compra_precio       = case when p_datos ? 'compra_precio' then nullif(p_datos->>'compra_precio', '')::numeric else compra_precio end,
    compra_proveedor_id = case when p_datos ? 'compra_proveedor_id' then nullif(p_datos->>'compra_proveedor_id', '')::uuid else compra_proveedor_id end,
    patente             = case when p_datos ? 'patente' and clase = 'rodado' then nullif(upper(btrim(p_datos->>'patente')), '') else patente end,
    etiqueta_impresa_en = case when (p_datos->>'etiqueta_impresa')::boolean then now() else etiqueta_impresa_en end,
    alta_desde_obra     = case when (p_datos->>'revisada')::boolean then false else alta_desde_obra end
  where id = p_activo;
  if not found then raise exception 'el activo no existe'; end if;
end $function$;

-- Recuento de un lugar: cuenta lo LIBRE. Lo que tiene cada persona se controla en su legajo.
create or replace function public.abrir_recuento(p_ubicacion uuid)
returns uuid language plpgsql security definer set search_path = public as $function$
declare v_usr uuid := public._activo_usuario(); v_ubic ubicacion%rowtype; v_id uuid; v_n int;
begin
  select * into v_ubic from ubicacion where id = p_ubicacion for update;
  if not found then raise exception 'el lugar no existe'; end if;
  if v_ubic.archivada then raise exception 'el lugar está archivado: no se cuenta'; end if;
  select id into v_id from activo_recuento where ubicacion_id = p_ubicacion and cerrado_en is null;
  if v_id is not null then return v_id; end if;
  select count(*) into v_n from activo_existencia e join activo a on a.id = e.activo_id
   where e.ubicacion_id = p_ubicacion and e.persona_id is null and a.estado <> 'baja';
  if v_ubic.tipo = 'taller' then
    v_n := v_n + (select count(*) from activo a where a.clase in ('epp', 'ropa') and a.estado <> 'baja'
                    and not exists (select 1 from activo_existencia e where e.activo_id = a.id and e.ubicacion_id = p_ubicacion and e.persona_id is null));
  end if;
  if v_n = 0 then raise exception 'no hay nada registrado en ese lugar: no hay qué contar'; end if;
  insert into activo_recuento (ubicacion_id, hecho_por) values (p_ubicacion, v_usr) returning id into v_id;
  insert into activo_recuento_linea (recuento_id, activo_id, esperado)
  select v_id, e.activo_id, e.cantidad from activo_existencia e join activo a on a.id = e.activo_id
   where e.ubicacion_id = p_ubicacion and e.persona_id is null and a.estado <> 'baja';
  if v_ubic.tipo = 'taller' then
    insert into activo_recuento_linea (recuento_id, activo_id, esperado)
    select v_id, a.id, 0 from activo a
     where a.clase in ('epp', 'ropa') and a.estado <> 'baja'
       and not exists (select 1 from activo_existencia e where e.activo_id = a.id and e.ubicacion_id = p_ubicacion and e.persona_id is null);
  end if;
  return v_id;
end $function$;

create or replace function public.cerrar_recuento(p_recuento uuid, p_aplicar boolean, p_observaciones text default null)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  v_usr uuid := public._activo_usuario(); v_rec activo_recuento%rowtype; r record; v_hay int;
  v_contados int := 0; v_con_dif int := 0; v_ajustadas int := 0; v_sin_ajustar text[] := '{}';
begin
  select * into v_rec from activo_recuento where id = p_recuento for update;
  if not found then raise exception 'el recuento no existe'; end if;
  if v_rec.cerrado_en is not null then raise exception 'el recuento ya está cerrado'; end if;
  if p_aplicar is null then raise exception 'hay que decir si se ajusta el inventario o no'; end if;
  select count(*) filter (where contado is not null), count(*) filter (where diferencia <> 0)
    into v_contados, v_con_dif from activo_recuento_linea where recuento_id = p_recuento;
  if v_contados = 0 then raise exception 'no se contó nada: el recuento no se cierra vacío'; end if;
  if p_aplicar then
    for r in select l.activo_id, l.esperado, l.contado, a.codigo from activo_recuento_linea l join activo a on a.id = l.activo_id
              where l.recuento_id = p_recuento and l.diferencia <> 0 order by a.codigo loop
      select cantidad into v_hay from activo_existencia
       where activo_id = r.activo_id and ubicacion_id = v_rec.ubicacion_id and persona_id is null;
      if coalesce(v_hay, 0) <> r.esperado then
        raise exception '%: había % cuando se abrió el recuento y ahora hay %: se movió mientras se contaba. Guardá sin ajustar o contá de nuevo', r.codigo, r.esperado, coalesce(v_hay, 0);
      end if;
      if r.contado = 0 then
        v_sin_ajustar := v_sin_ajustar || r.codigo;
        continue;
      end if;
      perform public.ajustar_existencia(r.activo_id, v_rec.ubicacion_id, r.contado, 'recuento ' || p_recuento::text);
      v_ajustadas := v_ajustadas + 1;
    end loop;
  end if;
  update activo_recuento set cerrado_en = now(), cerrado_por = v_usr, aplicado = p_aplicar,
                             observaciones = nullif(btrim(p_observaciones), '')
   where id = p_recuento;
  return jsonb_build_object(
    'contados', v_contados, 'con_diferencia', v_con_dif, 'ajustadas', v_ajustadas,
    'sin_ajustar', to_jsonb(v_sin_ajustar)
  );
end $function$;

-- ── 6. Persona: entregar, devolver, egreso ────────────────────────────────────────────────────
create or replace function public.entregar_a_persona(p_persona uuid, p_items jsonb, p_nota text default null, p_ya_la_tenia boolean default false)
returns uuid language plpgsql security definer set search_path = public as $function$
declare
  v_usr uuid := public._activo_usuario(); v_lote uuid := gen_random_uuid(); v_lugar uuid; v_nota text;
  v_it jsonb; v_act activo%rowtype; v_n int; v_hay int; v_origen uuid; v_lugares int; v_quien text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no hay nada para entregar';
  end if;
  if not exists (select 1 from personas where id = p_persona) then raise exception 'la persona no existe'; end if;
  if not exists (select 1 from personas where id = p_persona and en_la_empresa) then
    raise exception 'la persona ya no está en la empresa: no se le entrega nada';
  end if;
  v_lugar := public._lugar_de_persona(p_persona);
  perform public._validar_destino(v_lugar);
  v_nota := coalesce(nullif(btrim(p_nota), ''),
                     case when p_ya_la_tenia then 'ya la tenía: entregada antes de registrarla' else 'entrega' end);
  for v_it in select value from jsonb_array_elements(p_items) order by value->>'activo', value->>'origen' loop
    select * into v_act from activo where id = (v_it->>'activo')::uuid for update;
    if not found then raise exception 'el ítem no existe'; end if;
    if v_act.clase not in ('epp', 'ropa') then
      raise exception '% no es EPP ni ropa de trabajo: se mueve desde Herramientas', v_act.codigo;
    end if;
    if v_act.estado = 'baja' then raise exception '% está dado de baja', v_act.codigo; end if;
    v_n := nullif(v_it->>'cantidad', '')::int;
    if coalesce(v_n, 0) < 1 then raise exception 'la cantidad a entregar es 1 o más'; end if;
    if p_ya_la_tenia then
      select cantidad into v_hay from activo_existencia
       where activo_id = v_act.id and ubicacion_id = v_lugar and persona_id = p_persona;
      perform public.ajustar_existencia(v_act.id, v_lugar, coalesce(v_hay, 0) + v_n, v_nota, p_persona);
    else
      v_origen := nullif(v_it->>'origen', '')::uuid;
      if v_origen is null then
        select count(*), min(ubicacion_id::text)::uuid into v_lugares, v_origen
          from activo_existencia where activo_id = v_act.id and persona_id is null;
        if v_lugares > 1 then
          raise exception '% está repartido en % lugares: elegí de dónde sale', v_act.codigo, v_lugares using errcode = 'P0001';
        end if;
        if v_lugares = 0 then
          v_quien := public._quien_tiene(v_act.id);
          if v_quien is not null then
            raise exception '%: no quedan unidades libres para entregar, las tiene %', v_act.codigo, v_quien using errcode = 'P0001';
          end if;
        end if;
      end if;
      perform public._mover_existencia(v_act.id, v_origen, v_lugar, v_n, v_usr, v_lote, v_nota, null, p_persona);
    end if;
  end loop;
  return v_lugar;
end $function$;

create or replace function public.devolver_de_persona(p_persona uuid, p_activo uuid, p_cantidad integer default null, p_nota text default null)
returns integer language plpgsql security definer set search_path = public as $function$
declare
  v_usr uuid := public._activo_usuario(); v_lote uuid := gen_random_uuid(); v_act activo%rowtype;
  r record; v_tot int; v_resta int; v_k int;
begin
  select * into v_act from activo where id = p_activo for update;
  if not found then raise exception 'el ítem no existe'; end if;
  select coalesce(sum(cantidad), 0) into v_tot from activo_existencia where activo_id = p_activo and persona_id = p_persona;
  if v_tot = 0 then
    raise exception '% no figura en poder de %', v_act.codigo, coalesce(public._nombre_persona(p_persona), 'esa persona');
  end if;
  v_resta := coalesce(p_cantidad, v_tot);
  if v_resta < 1 then raise exception 'la cantidad a devolver es 1 o más'; end if;
  if v_resta > v_tot then
    raise exception '%: % tiene %, no se pueden devolver %', v_act.codigo, public._nombre_persona(p_persona), v_tot, v_resta using errcode = 'P0001';
  end if;
  -- Devolver = sacarle la persona: queda libre donde está.
  for r in select ubicacion_id, cantidad from activo_existencia
            where activo_id = p_activo and persona_id = p_persona order by cantidad desc, ubicacion_id loop
    exit when v_resta = 0;
    v_k := least(v_resta, r.cantidad);
    perform public._mover_existencia(p_activo, r.ubicacion_id, r.ubicacion_id, v_k, v_usr, v_lote,
      coalesce(nullif(btrim(p_nota), ''), 'devuelto'), p_persona, null);
    v_resta := v_resta - v_k;
  end loop;
  return coalesce(p_cantidad, v_tot);
end $function$;

create or replace function public._cerrar_entregas_de_persona(p_persona uuid)
returns integer language plpgsql security definer set search_path = public as $function$
declare v_egreso date; v_en boolean; v_cuando timestamptz; v_detalle text; r record; v_n int := 0;
begin
  select en_la_empresa, fecha_egreso into v_en, v_egreso from personas where id = p_persona;
  v_cuando := case when v_egreso is not null then (v_egreso::text || ' 12:00:00-03')::timestamptz else now() end;
  v_detalle := case when v_egreso is not null then 'egresó el ' || to_char(v_egreso, 'DD/MM/YYYY') || ' · no devuelto'
                    else 'egresó (sin fecha de baja en el legajo) · no devuelto' end;
  for r in select e.id, e.activo_id, e.ubicacion_id, e.cantidad from activo_existencia e
            where e.persona_id = p_persona order by e.activo_id for update loop
    insert into activo_ajuste (activo_id, ubicacion_id, persona_id, antes, despues, motivo, detalle, usuario_id, creado_en)
    values (r.activo_id, r.ubicacion_id, p_persona, r.cantidad, 0, 'egreso', v_detalle, auth.uid(), v_cuando);
    delete from activo_existencia where id = r.id;
    perform public._activo_recalcular(r.activo_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

-- Lo que tiene una persona se va con ella cuando cambia de obra.
create or replace function public._reubicar_lo_que_tiene(p_persona uuid) returns integer
language plpgsql security definer set search_path = public as $function$
declare v_lugar uuid; r record; v_lote uuid := gen_random_uuid(); v_n int := 0;
begin
  if p_persona is null then return 0; end if;
  if not exists (select 1 from activo_existencia where persona_id = p_persona) then return 0; end if;
  v_lugar := public._lugar_de_persona(p_persona);
  for r in select e.activo_id, e.ubicacion_id, e.cantidad
             from activo_existencia e join ubicacion u on u.id = e.ubicacion_id join activo a on a.id = e.activo_id
            where e.persona_id = p_persona and e.ubicacion_id <> v_lugar and u.tipo in ('obra', 'taller') and a.estado <> 'baja'
            order by a.codigo loop
    perform 1 from activo where id = r.activo_id for update;
    perform public._mover_existencia(r.activo_id, r.ubicacion_id, v_lugar, r.cantidad, auth.uid(), v_lote,
      'se fue con ' || public._nombre_persona(p_persona) || ': cambió de obra', p_persona, p_persona);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

create or replace function public._reubicar_todos() returns integer
language plpgsql security definer set search_path = public as $function$
declare r record; v_n int := 0;
begin
  for r in select distinct persona_id from activo_existencia where persona_id is not null loop
    v_n := v_n + public._reubicar_lo_que_tiene(r.persona_id);
  end loop;
  return v_n;
end $function$;

-- Un error acá no puede frenar la carga de asignaciones: avisa y la pasada diaria lo corrige.
create or replace function public._asignacion_mueve_lo_que_tiene() returns trigger
language plpgsql security definer set search_path = public as $function$
begin
  <<reubicar>>
  begin
    if tg_op in ('UPDATE', 'DELETE') then
      perform public._reubicar_lo_que_tiene(old.persona_id);
    end if;
    if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.persona_id is distinct from old.persona_id) then
      perform public._reubicar_lo_que_tiene(new.persona_id);
    end if;
  exception when others then
    raise warning 'no se pudo llevar lo que tiene la persona a su obra nueva: %', sqlerrm;
  end reubicar;
  return null;
end $function$;

create trigger obra_asignacion_mueve_lo_que_tiene
  after insert or delete or update of obra_id, persona_id, desde, hasta on public.obra_asignacion
  for each row execute function public._asignacion_mueve_lo_que_tiene();

do $$
begin
  if exists (select 1 from cron.job where jobname = 'epp_sigue_a_la_persona') then
    perform cron.unschedule('epp_sigue_a_la_persona');
  end if;
end $$;
select cron.schedule('epp_sigue_a_la_persona', '15 6 * * *', $$select public._reubicar_todos();$$);

-- ── 7. Lo que estaba «en» cada persona pasa, con su persona, al lugar donde trabaja ──────────
update public.activo_existencia e set persona_id = u.persona_id
  from public.ubicacion u where u.id = e.ubicacion_id and u.tipo = 'persona';

do $$
declare r record; v_lote uuid := gen_random_uuid();
begin
  for r in select e.activo_id, e.ubicacion_id, e.persona_id, e.cantidad
             from activo_existencia e join ubicacion u on u.id = e.ubicacion_id
            where u.tipo = 'persona' order by e.persona_id, e.activo_id loop
    perform 1 from activo where id = r.activo_id for update;
    perform public._mover_existencia(r.activo_id, r.ubicacion_id, public._lugar_de_persona(r.persona_id), r.cantidad, null, v_lote,
      'lo que tiene ' || public._nombre_persona(r.persona_id) || ' pasa a figurar en la obra donde trabaja (30/09)',
      r.persona_id, r.persona_id);
  end loop;
  update activo_movimiento set usuario_texto = 'migración 30/09 · quién lo tiene' where lote_id = v_lote;
end $$;

update public.ubicacion set archivada = true where tipo = 'persona' and not archivada;
alter table public.ubicacion add constraint ubicacion_persona_archivada_chk check (tipo <> 'persona' or archivada);
comment on constraint ubicacion_persona_archivada_chk on public.ubicacion is
  'Una persona no es un lugar (dueño 30/09): las ubicaciones tipo persona quedan sólo como historial, archivadas.';

drop function public._ubicacion_de_persona(uuid);

-- ── 8. Permisos ───────────────────────────────────────────────────────────────────────────────
revoke all on function public._nombre_persona(uuid) from public, anon, authenticated;
revoke all on function public._quien_tiene(uuid, uuid) from public, anon, authenticated;
revoke all on function public._lugar_de_persona(uuid) from public, anon, authenticated;
revoke all on function public._mover_existencia(uuid, uuid, uuid, integer, uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public._reubicar_lo_que_tiene(uuid) from public, anon, authenticated;
revoke all on function public._reubicar_todos() from public, anon, authenticated;
revoke all on function public._asignacion_mueve_lo_que_tiene() from public, anon, authenticated;
revoke all on function public.ajustar_existencia(uuid, uuid, integer, text, uuid) from public, anon;
grant execute on function public.ajustar_existencia(uuid, uuid, integer, text, uuid) to authenticated;
revoke all on function public.dar_de_baja_parcial(uuid, uuid, integer, text, text, uuid) from public, anon;
grant execute on function public.dar_de_baja_parcial(uuid, uuid, integer, text, text, uuid) to authenticated;
revoke all on function public.devolver_de_persona(uuid, uuid, integer, text) from public, anon;
grant execute on function public.devolver_de_persona(uuid, uuid, integer, text) to authenticated;

-- ── 9. Controles ──────────────────────────────────────────────────────────────────────────────
do $$
declare v int; v2 int;
begin
  select count(*) into v
    from _epp_total_antes b
    left join (select activo_id, sum(cantidad)::int t from public.activo_existencia group by 1) x using (activo_id)
   where b.total <> coalesce(x.t, 0);
  if v > 0 then raise exception 'CONTROL: % activos cambiaron de total antes/después', v; end if;

  select count(*) into v from public.activo_existencia e join public.ubicacion u on u.id = e.ubicacion_id where u.tipo = 'persona';
  if v > 0 then raise exception 'CONTROL: quedan % existencias en ubicaciones tipo persona', v; end if;

  select count(*) into v
    from _epp_tenencia_antes b
    full join (select activo_id, persona_id, sum(cantidad)::int as cantidad from public.activo_existencia
                where persona_id is not null group by 1, 2) n using (activo_id, persona_id)
   where b.cantidad is distinct from n.cantidad;
  if v > 0 then raise exception 'CONTROL: % pares (activo, persona) cambiaron lo que tiene cada uno', v; end if;

  select count(*) into v from public.activo a
   where exists (select 1 from public.activo_existencia e where e.activo_id = a.id)
     and a.cantidad is distinct from (select sum(e.cantidad) from public.activo_existencia e where e.activo_id = a.id);
  if v > 0 then raise exception 'CONTROL: % activos con cantidad distinta a la suma de sus existencias', v; end if;

  select count(*), count(*) filter (where persona_destino is null) into v, v2 from public.activo_movimiento
   where origen_id is null and respaldo_drive_file_id is not null and usuario_texto = 'constancia firmada';
  if v < 84 or v2 > 0 then raise exception 'CONTROL: renglones de constancia % (esperados 84+), sin persona %', v, v2; end if;

  select count(*) into v from public.activo_existencia e
   where e.persona_id is not null and e.ubicacion_id <> public._lugar_de_persona(e.persona_id);
  if v > 0 then raise exception 'CONTROL: % tenencias fuera del lugar donde trabaja la persona', v; end if;

  select count(*) into v from public.ubicacion where tipo = 'persona' and not archivada;
  if v > 0 then raise exception 'CONTROL: % ubicaciones persona sin archivar', v; end if;

  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and pg_get_functiondef(p.oid) ~* 'on conflict \(activo_id, ubicacion_id\)';
  if v > 0 then raise exception 'CONTROL: % funciones con el ON CONFLICT (activo_id, ubicacion_id) viejo', v; end if;

  select count(*), coalesce(sum(cantidad), 0) into v, v2 from public.activo_existencia where persona_id is not null;
  raise notice 'OK · tenencias: % filas, % unidades · ubicaciones persona archivadas: %', v, v2,
    (select count(*) from public.ubicacion where tipo = 'persona');
end $$;
