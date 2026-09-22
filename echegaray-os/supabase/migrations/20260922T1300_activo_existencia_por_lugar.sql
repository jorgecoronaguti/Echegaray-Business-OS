-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HERRAMIENTAS · LOS LOTES SE REPARTEN: CUÁNTAS UNIDADES HAY EN CADA LUGAR
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, 22/09/2026: «y como se hara el descuento de unidades a medida q se asigna la herram en una
-- obra?» → «ok» a la propuesta: un lote es UN código con la cantidad por lugar.
--
-- Hasta hoy un lote (BAL-001, 8 baldes) se movía entero: no había forma de mandar 3 a una obra y dejar
-- 5 en el Taller. Ahora:
--   · `activo_existencia` dice cuántas unidades de cada activo hay en cada lugar. Es LA verdad de dónde
--     están las cosas; una herramienta de a una tiene una sola fila con 1.
--   · `activo.cantidad` es el total de todos los lugares y `activo.ubicacion_id` el lugar donde hay más
--     (el de siempre para lo que no es lote). Los dos se recalculan solos: no se escriben a mano.
--   · Cada movimiento dice cuántas unidades movió (`activo_movimiento.cantidad`; null = lo histórico,
--     cuando un lote sólo podía moverse entero).
--   · Un recuento («había 7, no 8») y una baja parcial («se rompieron 2») quedan en `activo_ajuste`.
--   · La base no deja mandar más unidades de las que hay en el lugar de origen.

create table public.activo_existencia (
  activo_id    uuid not null references public.activo(id),
  ubicacion_id uuid not null references public.ubicacion(id),
  cantidad     int  not null check (cantidad >= 1),
  primary key (activo_id, ubicacion_id)
);
create index activo_existencia_ubicacion_idx on public.activo_existencia (ubicacion_id);
comment on table public.activo_existencia is
  'Cuántas unidades de cada activo hay en cada lugar. Sólo la cambian mover_existencias, mover_activos, ajustar_existencia, las bajas y el alta.';
alter table public.activo_existencia enable row level security;
create policy activo_existencia_select on public.activo_existencia for select to authenticated using (true);
revoke all on public.activo_existencia from anon, public;
grant select on public.activo_existencia to authenticated;

alter table public.activo_movimiento add column cantidad int check (cantidad is null or cantidad >= 1);
comment on column public.activo_movimiento.cantidad is
  'Unidades que se movieron. Null = movimiento anterior al 22/09, cuando un lote sólo se movía entero.';

create table public.activo_ajuste (
  id           uuid primary key default gen_random_uuid(),
  activo_id    uuid not null references public.activo(id),
  ubicacion_id uuid not null references public.ubicacion(id),
  antes        int  not null check (antes >= 0),
  despues      int  not null check (despues >= 0),
  motivo       text not null check (motivo in ('recuento', 'robada', 'perdida', 'descartada', 'vendida')),
  detalle      text check (detalle is null or length(detalle) <= 400),
  usuario_id   uuid references auth.users(id),
  creado_en    timestamptz not null default now(),
  constraint activo_ajuste_cambia_chk check (antes <> despues),
  constraint activo_ajuste_baja_chk check (motivo = 'recuento' or despues < antes)
);
create index activo_ajuste_activo_idx on public.activo_ajuste (activo_id, creado_en desc);
comment on table public.activo_ajuste is
  'Cambios de cantidad en un lugar que no son movimientos: recuento o baja parcial de un lote.';
alter table public.activo_ajuste enable row level security;
create policy activo_ajuste_select on public.activo_ajuste for select to authenticated using (true);
revoke all on public.activo_ajuste from anon, public;
grant select on public.activo_ajuste to authenticated;

-- ── LO QUE HAY HOY: cada activo vivo, todas sus unidades donde está ─────────────────────────────
insert into public.activo_existencia (activo_id, ubicacion_id, cantidad)
select id, ubicacion_id, cantidad from public.activo where estado <> 'baja' and ubicacion_id is not null;

-- ── TOTAL Y LUGAR PRINCIPAL, DERIVADOS DE LAS EXISTENCIAS ───────────────────────────────────────
-- Lugar principal = donde hay más unidades; si empatan, se queda el que ya tenía (no salta sin motivo).
create function public._activo_recalcular(p_activo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_total int; v_ubic uuid;
begin
  select coalesce(sum(cantidad), 0) into v_total from activo_existencia where activo_id = p_activo;
  if v_total = 0 then return; end if;   -- sin unidades en ningún lado: lo resuelve la baja
  select e.ubicacion_id into v_ubic
    from activo_existencia e join activo a on a.id = e.activo_id
   where e.activo_id = p_activo
   order by e.cantidad desc, (e.ubicacion_id = a.ubicacion_id) desc, e.ubicacion_id
   limit 1;
  update activo set cantidad = v_total, ubicacion_id = v_ubic
   where id = p_activo and (cantidad, ubicacion_id) is distinct from (v_total, v_ubic);
end $$;

-- ── EL NÚCLEO: mover n unidades de un activo de un lugar a otro ─────────────────────────────────
-- Quien llama ya validó el destino y bloqueó el activo. Devuelve cuántas movió (0 = ya estaban ahí).
create function public._mover_existencia(
  p_activo uuid, p_origen uuid, p_destino uuid, p_cantidad int, p_usr uuid, p_lote uuid, p_nota text
) returns int
language plpgsql security definer set search_path = public as $$
declare v_codigo text; v_hay int; v_n int;
begin
  if p_origen is not distinct from p_destino then return 0; end if;
  select codigo into v_codigo from activo where id = p_activo;
  select cantidad into v_hay from activo_existencia where activo_id = p_activo and ubicacion_id = p_origen for update;
  if v_hay is null then
    raise exception '% no tiene unidades en el lugar de origen', v_codigo using errcode = 'P0001';
  end if;
  v_n := coalesce(p_cantidad, v_hay);
  if v_n < 1 then raise exception 'la cantidad a mover es 1 o más'; end if;
  if v_n > v_hay then
    raise exception '%: en el lugar de origen hay %, no se pueden mover %', v_codigo, v_hay, v_n using errcode = 'P0001';
  end if;
  if v_n = v_hay then
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

create function public._validar_destino(p_destino uuid) returns ubicacion
language plpgsql security definer set search_path = public as $$
declare v_dest ubicacion%rowtype;
begin
  select * into v_dest from ubicacion where id = p_destino;
  if not found then raise exception 'el destino no existe'; end if;
  if v_dest.archivada then raise exception 'el destino está archivado'; end if;
  if v_dest.tipo = 'obra' and not exists (select 1 from obra_canonica where id = v_dest.obra_id and estado = 'activa') then
    raise exception 'la obra de destino no está activa';
  end if;
  if v_dest.tipo = 'rodado' and exists (select 1 from activo where id = v_dest.activo_id and estado = 'baja') then
    raise exception 'el rodado de destino está dado de baja';
  end if;
  return v_dest;
end $$;

-- Un rodado que se mueve con «bajar la carga» deja lo que lleva encima donde estaba.
create function public._bajar_carga_de_rodado(p_rodado uuid, p_donde uuid, p_usr uuid, p_lote uuid, p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_ubic_rodado uuid; r record;
begin
  if p_donde is null then return; end if;
  select id into v_ubic_rodado from ubicacion where activo_id = p_rodado;
  for r in select e.activo_id, e.cantidad from activo_existencia e join activo a on a.id = e.activo_id
            where e.ubicacion_id = v_ubic_rodado and a.estado <> 'baja' order by a.codigo loop
    perform 1 from activo where id = r.activo_id for update;
    perform public._mover_existencia(r.activo_id, v_ubic_rodado, p_donde, r.cantidad, p_usr, p_lote, 'bajó del rodado ' || p_codigo);
  end loop;
end $$;

-- ── MOVER UNIDADES: [{activo, origen?, cantidad?}] ──────────────────────────────────────────────
-- origen: si falta y el activo está en un solo lugar, ése; si está repartido, hay que decirlo.
-- cantidad: si falta, todas las del origen.
create function public.mover_existencias(
  p_items jsonb, p_destino uuid, p_nota text default null, p_bajar_carga boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._activo_usuario();
  v_lote uuid := gen_random_uuid();
  v_dest ubicacion%rowtype := public._validar_destino(p_destino);
  v_it jsonb; v_act activo%rowtype; v_origen uuid; v_lugares int; v_movidos int := 0;
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
      select count(*), min(ubicacion_id::text)::uuid into v_lugares, v_origen from activo_existencia where activo_id = v_act.id;
      if v_lugares > 1 then
        raise exception '% está repartido en % lugares: elegí de dónde sale', v_act.codigo, v_lugares using errcode = 'P0001';
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
end $$;

-- ── MOVER ACTIVOS ENTEROS (la firma de siempre): todas las unidades, de todos los lugares ────────
create or replace function public.mover_activos(
  p_activos uuid[], p_destino uuid, p_nota text default null, p_bajar_carga boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._activo_usuario();
  v_lote uuid := gen_random_uuid();
  v_dest ubicacion%rowtype := public._validar_destino(p_destino);
  v_act activo%rowtype; v_e record; v_desde uuid; v_movidos int := 0;
begin
  if coalesce(array_length(p_activos, 1), 0) = 0 then raise exception 'no hay activos para mover'; end if;
  for v_act in select * from activo where id = any(p_activos) order by codigo for update loop
    if v_act.estado = 'baja' then raise exception '% está dado de baja: no se mueve más', v_act.codigo; end if;
    if v_dest.tipo = 'rodado' and v_dest.activo_id = v_act.id then
      raise exception '% no puede moverse adentro de sí mismo', v_act.codigo;
    end if;
    v_desde := v_act.ubicacion_id;
    for v_e in select ubicacion_id, cantidad from activo_existencia
                where activo_id = v_act.id and ubicacion_id <> p_destino order by ubicacion_id loop
      v_movidos := v_movidos + public._mover_existencia(v_act.id, v_e.ubicacion_id, p_destino, v_e.cantidad, v_usr, v_lote, p_nota);
    end loop;
    if v_act.clase = 'rodado' and p_bajar_carga and v_desde is distinct from p_destino then
      perform public._bajar_carga_de_rodado(v_act.id, v_desde, v_usr, v_lote, v_act.codigo);
    end if;
  end loop;
  if v_movidos = 0 then return null; end if;
  return v_lote;
end $$;

-- ── RECUENTO EN UN LUGAR («había 7, no 8») ──────────────────────────────────────────────────────
create function public.ajustar_existencia(p_activo uuid, p_ubicacion uuid, p_cantidad int, p_detalle text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_act activo%rowtype; v_hay int;
begin
  select * into v_act from activo where id = p_activo for update;
  if not found then raise exception 'el activo no existe'; end if;
  if v_act.estado = 'baja' then raise exception '% está dado de baja', v_act.codigo; end if;
  if coalesce(p_cantidad, 0) < 1 then
    raise exception 'para dejar un lugar en 0 es una baja (robada, perdida, descartada o vendida) o un movimiento';
  end if;
  select cantidad into v_hay from activo_existencia where activo_id = p_activo and ubicacion_id = p_ubicacion for update;
  if v_hay is null then raise exception '% no tiene unidades en ese lugar: se lleva con un movimiento', v_act.codigo; end if;
  if v_hay = p_cantidad then return; end if;
  update activo_existencia set cantidad = p_cantidad where activo_id = p_activo and ubicacion_id = p_ubicacion;
  insert into activo_ajuste (activo_id, ubicacion_id, antes, despues, motivo, detalle, usuario_id)
  values (p_activo, p_ubicacion, v_hay, p_cantidad, 'recuento', nullif(btrim(p_detalle), ''), v_usr);
  perform public._activo_recalcular(p_activo);
end $$;

-- ── BAJA TOTAL: la de siempre, y además el activo deja de tener unidades en ningún lado ─────────
create or replace function public.dar_de_baja_activo(p_activo uuid, p_motivo text, p_detalle text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_act activo%rowtype;
begin
  select * into v_act from activo where id = p_activo for update;
  if not found then raise exception 'el activo no existe'; end if;
  if v_act.estado = 'baja' then raise exception '% ya está dado de baja', v_act.codigo; end if;
  if p_motivo not in ('robada', 'perdida', 'descartada', 'vendida') then raise exception 'motivo de baja no válido'; end if;
  if v_act.clase = 'rodado' and exists (
    select 1 from activo_existencia e join ubicacion u on u.id = e.ubicacion_id join activo a on a.id = e.activo_id
     where u.activo_id = p_activo and a.estado <> 'baja'
  ) then
    raise exception 'el rodado todavía lleva activos encima: bajalos antes de darlo de baja';
  end if;
  delete from activo_existencia where activo_id = p_activo;
  update activo set estado = 'baja', baja_motivo = p_motivo, baja_detalle = nullif(btrim(p_detalle), ''),
                    baja_en = now(), baja_por = v_usr, estado_desde = now(), estado_por = v_usr
   where id = p_activo;
  update ubicacion set archivada = true where activo_id = p_activo;
  update activo_incidencia set cerrada_en = now(), cerrada_por = v_usr, cierre_nota = 'dado de baja'
   where activo_id = p_activo and cerrada_en is null;
end $$;

-- ── BAJA PARCIAL DE UN LOTE («se rompieron 2 de los 5 de la obra») ──────────────────────────────
-- Si con eso el lote se queda sin ninguna unidad en ningún lado, es la baja total.
create function public.dar_de_baja_parcial(
  p_activo uuid, p_ubicacion uuid, p_cantidad int, p_motivo text, p_detalle text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_act activo%rowtype; v_hay int; v_total int;
begin
  select * into v_act from activo where id = p_activo for update;
  if not found then raise exception 'el activo no existe'; end if;
  if v_act.estado = 'baja' then raise exception '% ya está dado de baja', v_act.codigo; end if;
  if p_motivo not in ('robada', 'perdida', 'descartada', 'vendida') then raise exception 'motivo de baja no válido'; end if;
  if coalesce(p_cantidad, 0) < 1 then raise exception 'la cantidad a dar de baja es 1 o más'; end if;
  select cantidad into v_hay from activo_existencia where activo_id = p_activo and ubicacion_id = p_ubicacion for update;
  if v_hay is null then raise exception '% no tiene unidades en ese lugar', v_act.codigo; end if;
  if p_cantidad > v_hay then
    raise exception '%: en ese lugar hay %, no se pueden dar de baja %', v_act.codigo, v_hay, p_cantidad using errcode = 'P0001';
  end if;
  select sum(cantidad) into v_total from activo_existencia where activo_id = p_activo;
  insert into activo_ajuste (activo_id, ubicacion_id, antes, despues, motivo, detalle, usuario_id)
  values (p_activo, p_ubicacion, v_hay, v_hay - p_cantidad, p_motivo, nullif(btrim(p_detalle), ''), v_usr);
  if p_cantidad = v_total then
    perform public.dar_de_baja_activo(p_activo, p_motivo, p_detalle);
    return;
  end if;
  if p_cantidad = v_hay then
    delete from activo_existencia where activo_id = p_activo and ubicacion_id = p_ubicacion;
  else
    update activo_existencia set cantidad = cantidad - p_cantidad where activo_id = p_activo and ubicacion_id = p_ubicacion;
  end if;
  perform public._activo_recalcular(p_activo);
end $$;

-- ── ALTA: además del movimiento de alta, sus unidades quedan en el lugar ────────────────────────
create or replace function public.dar_de_alta_activo(
  p_clase text, p_nombre text, p_ubicacion uuid default null, p_categoria text default null,
  p_codigo text default null, p_patente text default null, p_alta_desde_obra boolean default false,
  p_foto_url text default null, p_cantidad int default 1
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_codigo text; v_id uuid;
begin
  if p_clase not in ('herramienta', 'equipo', 'rodado') then raise exception 'clase no válida'; end if;
  if length(btrim(coalesce(p_nombre, ''))) < 2 then raise exception 'falta el nombre'; end if;
  if coalesce(p_cantidad, 1) < 1 then raise exception 'la cantidad es 1 o más'; end if;
  v_codigo := public._codigo_propuesto(p_codigo, p_nombre);
  insert into activo (codigo, clase, nombre, categoria, patente, alta_desde_obra, foto_url, creado_por, estado_por, cantidad)
  values (v_codigo, p_clase, btrim(p_nombre),
          coalesce(nullif(btrim(p_categoria), ''), case when p_clase = 'rodado' then 'Rodados' end),
          nullif(upper(btrim(p_patente)), ''), p_alta_desde_obra, p_foto_url, v_usr, v_usr, coalesce(p_cantidad, 1))
  returning id into v_id;
  if p_clase = 'rodado' then insert into ubicacion (tipo, activo_id) values ('rodado', v_id); end if;
  if p_ubicacion is not null then
    insert into activo_movimiento (activo_id, origen_id, destino_id, usuario_id, nota, cantidad)
    values (v_id, null, p_ubicacion, v_usr, 'alta', coalesce(p_cantidad, 1));
    insert into activo_existencia (activo_id, ubicacion_id, cantidad) values (v_id, p_ubicacion, coalesce(p_cantidad, 1));
    update activo set ubicacion_id = p_ubicacion where id = v_id;
  end if;
  return v_id;
end $$;

-- ── EDITAR: la cantidad se cambia acá sólo si el activo está en un solo lugar ───────────────────
create or replace function public.editar_activo(p_activo uuid, p_datos jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_lugares int; v_ubic uuid; v_cant int;
begin
  if p_datos ? 'cantidad' then
    v_cant := (p_datos->>'cantidad')::int;
    select count(*), min(ubicacion_id::text)::uuid into v_lugares, v_ubic from activo_existencia where activo_id = p_activo;
    if v_lugares > 1 and v_cant is distinct from (select cantidad from activo where id = p_activo) then
      raise exception 'está repartido en % lugares: la cantidad se corrige en cada lugar', v_lugares using errcode = 'P0001';
    end if;
    if v_lugares = 1 then
      perform public.ajustar_existencia(p_activo, v_ubic, v_cant, 'corregido al editar los datos');
    end if;
  end if;
  update activo set
    nombre              = coalesce(nullif(btrim(p_datos->>'nombre'), ''), nombre),
    categoria           = case when p_datos ? 'categoria' then nullif(btrim(p_datos->>'categoria'), '') else categoria end,
    cantidad            = case when p_datos ? 'cantidad' and v_lugares = 0 then v_cant else cantidad end,
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
end $$;

-- ── OBRA QUE DEJA DE ESTAR ACTIVA: todas las unidades que hay ahí vuelven al Taller ─────────────
create or replace function public._activos_de_obra_inactiva_al_taller() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ubic uuid; v_taller uuid; v_lote uuid := gen_random_uuid(); r record;
begin
  if new.estado = 'activa' or old.estado is not distinct from new.estado then return new; end if;
  select id into v_ubic from ubicacion where obra_id = new.id;
  if v_ubic is null then return new; end if;
  select id into v_taller from ubicacion where tipo = 'taller' and not archivada order by creado_en limit 1;
  if v_taller is null then return new; end if;
  for r in select e.activo_id, e.cantidad from activo_existencia e join activo a on a.id = e.activo_id
            where e.ubicacion_id = v_ubic and a.estado <> 'baja' order by a.codigo loop
    perform 1 from activo where id = r.activo_id for update;
    perform public._mover_existencia(r.activo_id, v_ubic, v_taller, r.cantidad, auth.uid(), v_lote,
      'la obra pasó a «' || new.estado || '»: al Taller (regla del dueño 21/09)');
  end loop;
  return new;
end $$;

revoke all on function public._activo_recalcular(uuid), public._mover_existencia(uuid, uuid, uuid, int, uuid, uuid, text),
  public._validar_destino(uuid), public._bajar_carga_de_rodado(uuid, uuid, uuid, uuid, text),
  public.mover_existencias(jsonb, uuid, text, boolean), public.ajustar_existencia(uuid, uuid, int, text),
  public.dar_de_baja_parcial(uuid, uuid, int, text, text) from public, anon;
grant execute on function public.mover_existencias(jsonb, uuid, text, boolean), public.ajustar_existencia(uuid, uuid, int, text),
  public.dar_de_baja_parcial(uuid, uuid, int, text, text) to authenticated;

-- ── LA CUENTA TIENE QUE CERRAR ──────────────────────────────────────────────────────────────────
do $$
declare n_mal int; n_ubic int; n_lotes int;
begin
  select count(*) into n_mal from activo a
   where a.estado <> 'baja'
     and a.cantidad is distinct from (select sum(cantidad) from activo_existencia e where e.activo_id = a.id);
  select count(*) into n_ubic from activo a
   where a.estado <> 'baja'
     and not exists (select 1 from activo_existencia e where e.activo_id = a.id and e.ubicacion_id = a.ubicacion_id);
  select count(*) into n_lotes from activo where estado <> 'baja' and cantidad > 1;
  if n_mal > 0 then raise exception '% activos con cantidad distinta de la suma por lugar', n_mal; end if;
  if n_ubic > 0 then raise exception '% activos cuyo lugar principal no tiene unidades', n_ubic; end if;
  raise notice 'existencias cargadas: cada activo vivo en su lugar; % lotes', n_lotes;
end $$;
