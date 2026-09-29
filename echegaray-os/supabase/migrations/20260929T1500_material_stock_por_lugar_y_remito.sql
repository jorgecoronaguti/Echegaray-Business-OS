-- MATERIAL: STOCK POR LUGAR Y REMITO — dentro del módulo Material que ya existe (dueño, 29/09/2026).
--
-- Pedido → «Llegó» (total o parcial) → suma stock en el lugar; «Usé» resta; «Sobra → Taller u otra
-- obra» traslada y emite un REMITO. Se calca el patrón de Herramientas (activo_existencia,
-- mover_existencias): un saldo por (material, lugar) que SÓLO tocan las funciones de este archivo,
-- y un libro de movimientos que no se borra ni se edita: se corrige con otro asiento.
--
-- ═══ LOS LUGARES SON LOS DE HERRAMIENTAS ═══
-- `ubicacion` (tipo 'taller' u 'obra' por `obra_id` del índice). No hay texto libre ni obras nuevas:
-- una obra sin ubicación la crea `ubicacion_de_obra()` la primera vez. Rodado, servicio técnico y
-- tercero no son depósitos de material y se rechazan.
--
-- ═══ NADA DE STOCK MÍNIMO ═══
-- El dueño (29/09) descartó «mínimo/reponer». No hay columna, función ni aviso de eso.
--
-- ═══ LO QUE CIERRA LA PUERTA ═══
-- `pedidos_materiales` tiene grant de update y una policy `ve_pedido_material`: con eso cualquiera
-- que ve la obra podría escribir `cantidad_recibida` directo por PostgREST y el saldo dejaría de
-- cerrar contra el libro. El trigger `pedido_material_recepcion_guarda` sólo deja cambiar esas
-- columnas dentro de `recibir_pedido_material`, que avisa con un set_config local a la transacción.
--
-- ═══ EL REMITO ═══
-- Documento INTERNO del movimiento (no es el remito fiscal de ARCA). Número correlativo SIN HUECOS:
-- se toma de `remito_contador` con `update … returning` bajo lock de fila, dentro de la misma
-- transacción que el movimiento. Una sequence dejaría huecos en cada rollback, y un hueco en una
-- serie de remitos es exactamente lo que alguien va a preguntar. Lleva copia de los nombres de lugar
-- y de las personas: si mañana se renombra una obra, el remito impreso no cambia.
--
-- ═══ QUIÉN PUEDE ═══
-- Operar (llegó, usé, trasladar, recontar): `es_administracion()` = dirección, administración y
-- jefe de obra. Ver: Administración todo; el resto, sólo el stock y los remitos de las obras que ve.

-- ── Catálogo ────────────────────────────────────────────────────────────────────────────────────
create table public.material (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (length(btrim(nombre)) between 2 and 160),
  unidad     text check (unidad is null or length(btrim(unidad)) between 1 and 24),
  creado_en  timestamptz not null default now()
);
-- «Cemento» y «cemento » son el mismo material: si no, el stock se parte en dos renglones.
create unique index material_clave_uq on public.material (lower(btrim(nombre)), coalesce(lower(btrim(unidad)), ''));
comment on table public.material is
  'Qué materiales existen. Nace al recibir un pedido (nombre y unidad tal cual el pedido); no se carga a mano.';

create table public.material_existencia (
  material_id  uuid not null references public.material(id),
  ubicacion_id uuid not null references public.ubicacion(id),
  cantidad     numeric(14,3) not null check (cantidad > 0),
  primary key (material_id, ubicacion_id)
);
create index material_existencia_ubicacion_idx on public.material_existencia (ubicacion_id);
comment on table public.material_existencia is
  'Cuánto hay de cada material en cada lugar. Una fila en cero no existe. Sólo la cambian las funciones de material.';

create table public.remito_contador (
  id     int primary key check (id = 1),
  ultimo int not null default 0
);
insert into public.remito_contador (id, ultimo) values (1, 0);

create table public.remito (
  id             uuid primary key default gen_random_uuid(),
  numero         int  not null unique,
  emitido_en     timestamptz not null default now(),
  origen_id      uuid not null references public.ubicacion(id),
  destino_id     uuid not null references public.ubicacion(id),
  origen_rotulo  text not null,
  destino_rotulo text not null,
  entrega_id     uuid references auth.users(id),
  entrega_nombre text,
  recibe_nombre  text check (recibe_nombre is null or length(recibe_nombre) <= 120),
  nota           text check (nota is null or length(nota) <= 500),
  constraint remito_lugares_chk check (origen_id <> destino_id)
);
comment on table public.remito is
  'Remito interno de un traslado de material. No es comprobante fiscal. Inmutable: no se edita, se emite otro.';

create table public.remito_item (
  id          uuid primary key default gen_random_uuid(),
  remito_id   uuid not null references public.remito(id),
  material_id uuid not null references public.material(id),
  material    text not null,
  unidad      text,
  cantidad    numeric(14,3) not null check (cantidad > 0)
);
create index remito_item_remito_idx on public.remito_item (remito_id);

create table public.material_movimiento (
  id           uuid primary key default gen_random_uuid(),
  material_id  uuid not null references public.material(id),
  tipo         text not null check (tipo in ('entrada', 'consumo', 'traslado', 'ajuste', 'anulacion')),
  origen_id    uuid references public.ubicacion(id),
  destino_id   uuid references public.ubicacion(id),
  cantidad     numeric(14,3) not null check (cantidad > 0),
  pedido_id    uuid references public.pedidos_materiales(id),
  remito_id    uuid references public.remito(id),
  motivo       text check (motivo is null or motivo in ('recuento', 'perdido', 'descartado')),
  nota         text check (nota is null or length(nota) <= 400),
  usuario_id   uuid references auth.users(id),
  creado_en    timestamptz not null default now(),
  -- Cada tipo tiene una forma: un consumo sin origen o un traslado con un solo lado es un asiento roto.
  constraint material_mov_forma_chk check (
    (tipo = 'entrada'  and origen_id is null     and destino_id is not null) or
    (tipo = 'consumo'  and origen_id is not null and destino_id is null) or
    (tipo = 'traslado' and origen_id is not null and destino_id is not null and origen_id <> destino_id) or
    (tipo = 'ajuste'   and (origen_id is null) <> (destino_id is null) and motivo is not null) or
    -- Anular una llegada: saca del lugar donde entró, con el pedido a la vista (ver anular_recepcion_material).
    (tipo = 'anulacion' and origen_id is not null and destino_id is null and pedido_id is not null)
  )
);
create index material_movimiento_material_idx on public.material_movimiento (material_id, creado_en desc);
create index material_movimiento_pedido_idx on public.material_movimiento (pedido_id);

-- El libro no se reescribe: ni el dueño de la función ni un error de código lo pisan.
create function public._material_libro_inmutable() returns trigger
language plpgsql as $$
begin
  raise exception 'el libro de movimientos de material no se edita ni se borra: se corrige con un ajuste' using errcode = '42501';
end $$;
create trigger material_movimiento_inmutable before update or delete on public.material_movimiento
  for each row execute function public._material_libro_inmutable();
create trigger remito_inmutable before update or delete on public.remito
  for each row execute function public._material_libro_inmutable();
create trigger remito_item_inmutable before update or delete on public.remito_item
  for each row execute function public._material_libro_inmutable();

-- ── Recepción en el pedido ──────────────────────────────────────────────────────────────────────
alter table public.pedidos_materiales
  add column if not exists cantidad_recibida numeric(14,3) not null default 0 check (cantidad_recibida >= 0),
  add column if not exists recibido_en timestamptz,
  add column if not exists recibido_por uuid references auth.users(id),
  add column if not exists material_id uuid references public.material(id);
comment on column public.pedidos_materiales.cantidad_recibida is
  'Lo que llegó de este pedido, sumado entre todas las recepciones parciales. La escribe sólo recibir_pedido_material.';

create function public._pedido_material_recepcion_guarda() returns trigger
language plpgsql as $$
declare v_entra boolean; v_sale boolean;
begin
  if current_setting('material.desde_rpc', true) is distinct from 'on' then
    if tg_op = 'INSERT' and (new.cantidad_recibida <> 0 or new.recibido_en is not null
                             or new.recibido_por is not null or new.material_id is not null) then
      raise exception 'lo recibido de un pedido se registra con «Llegó», no se escribe directo' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (
         new.cantidad_recibida is distinct from old.cantidad_recibida
      or new.recibido_en is distinct from old.recibido_en
      or new.recibido_por is distinct from old.recibido_por
      or new.material_id is distinct from old.material_id) then
      raise exception 'lo recibido de un pedido se registra con «Llegó», no se escribe directo' using errcode = '42501';
    end if;
    -- ENTREGADO = llegó material y sumó stock. Si una persona lo pusiera por el selector, el pedido quedaría
    -- entregado sin stock y `recibir_pedido_material` ya no lo aceptaría («ya figura entregado»): el material
    -- no podría entrar nunca. Se mira por raíz («entregado», «ENTREGADA») porque el Sheet conjuga.
    -- Sólo cuando hay una persona logueada: el sync del Sheet del AppSheet escribe con la llave de servicio
    -- (sin auth.uid()) y no puede romperse por lo que el campo marcó allá.
    if auth.uid() is not null then
      v_entra := upper(btrim(coalesce(new.estado, ''))) like 'ENTREGAD%'
                 and (tg_op = 'INSERT' or upper(btrim(coalesce(old.estado, ''))) not like 'ENTREGAD%');
      v_sale  := tg_op = 'UPDATE' and upper(btrim(coalesce(old.estado, ''))) like 'ENTREGAD%'
                 and upper(btrim(coalesce(new.estado, ''))) not like 'ENTREGAD%' and old.cantidad_recibida > 0;
      if v_entra then
        raise exception 'un pedido pasa a ENTREGADO con «Llegó», que también suma el stock: no se elige a mano' using errcode = '42501';
      end if;
      if v_sale then
        raise exception 'un pedido con material recibido no sale de ENTREGADO a mano: se anula la llegada' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger pedido_material_recepcion_guarda before insert or update on public.pedidos_materiales
  for each row execute function public._pedido_material_recepcion_guarda();

-- ── Lectura ─────────────────────────────────────────────────────────────────────────────────────
create function public.ve_ubicacion_material(p_ubicacion uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_administracion()
      or exists (select 1 from ubicacion u where u.id = p_ubicacion and u.tipo = 'obra' and public.ve_obra(u.obra_id))
$$;

alter table public.material enable row level security;
create policy material_select on public.material for select to authenticated using (true);
alter table public.material_existencia enable row level security;
create policy material_existencia_select on public.material_existencia for select to authenticated
  using (public.ve_ubicacion_material(ubicacion_id));
alter table public.material_movimiento enable row level security;
create policy material_movimiento_select on public.material_movimiento for select to authenticated
  using (public.ve_ubicacion_material(origen_id) or public.ve_ubicacion_material(destino_id));
alter table public.remito enable row level security;
create policy remito_select on public.remito for select to authenticated
  using (public.ve_ubicacion_material(origen_id) or public.ve_ubicacion_material(destino_id));
alter table public.remito_item enable row level security;
create policy remito_item_select on public.remito_item for select to authenticated
  using (exists (select 1 from remito r where r.id = remito_id));
alter table public.remito_contador enable row level security;
create policy remito_contador_select on public.remito_contador for select to authenticated
  using (public.es_administracion());

-- Las tablas nuevas nacen con DML para authenticated (default privileges): se lo sacamos. Escribir
-- es sólo por las funciones de abajo; sin policy de escritura, un grant suelto tampoco alcanzaría.
revoke all on public.material, public.material_existencia, public.material_movimiento,
  public.remito, public.remito_item, public.remito_contador from anon, public, authenticated;
-- Un grant por tabla: el guardián de grants (`grants.test.mjs`) busca «grant … on <tabla>» y no lee listas.
grant select on public.material to authenticated;
grant select on public.material_existencia to authenticated;
grant select on public.material_movimiento to authenticated;
grant select on public.remito to authenticated;
grant select on public.remito_item to authenticated;
grant select on public.remito_contador to authenticated;

-- ── Piezas internas ─────────────────────────────────────────────────────────────────────────────
create function public._material_operador() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  if not public.es_administracion() then
    raise exception 'el stock de material lo mueve Administración o el jefe de obra' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- Sólo el Taller y las obras guardan material.
create function public._material_deposito(p_ubicacion uuid, p_rol text) returns ubicacion
language plpgsql security definer set search_path = public as $$
declare v ubicacion%rowtype;
begin
  select * into v from ubicacion where id = p_ubicacion;
  if not found then raise exception 'el lugar de % no existe', p_rol using errcode = 'P0001'; end if;
  if v.tipo not in ('taller', 'obra') then
    raise exception 'el material se guarda en el Taller o en una obra, no en «%»', v.tipo using errcode = 'P0001';
  end if;
  if v.archivada then raise exception 'el lugar de % está archivado', p_rol using errcode = 'P0001'; end if;
  if v.tipo = 'obra' and not exists (select 1 from obra_canonica where id = v.obra_id and estado = 'activa') then
    raise exception 'la obra de % no está activa', p_rol using errcode = 'P0001';
  end if;
  return v;
end $$;

create function public._material_rotulo(p_ubicacion uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when u.tipo = 'obra' then concat_ws(' · ', o.codigo, o.nombre) else coalesce(u.nombre, 'Taller') end
    from ubicacion u left join obra_canonica o on o.id = u.obra_id where u.id = p_ubicacion
$$;

create function public._material_id(p_nombre text, p_unidad text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nombre text := btrim(p_nombre); v_unidad text := nullif(btrim(p_unidad), '');
begin
  if v_nombre is null or length(v_nombre) < 2 then raise exception 'el material no tiene nombre' using errcode = 'P0001'; end if;
  select id into v_id from material where lower(btrim(nombre)) = lower(v_nombre) and coalesce(lower(btrim(unidad)), '') = coalesce(lower(v_unidad), '');
  if v_id is null then
    insert into material (nombre, unidad) values (left(v_nombre, 160), left(v_unidad, 24))
    on conflict (lower(btrim(nombre)), coalesce(lower(btrim(unidad)), '')) do nothing returning id into v_id;
    if v_id is null then
      select id into v_id from material where lower(btrim(nombre)) = lower(v_nombre) and coalesce(lower(btrim(unidad)), '') = coalesce(lower(v_unidad), '');
    end if;
  end if;
  return v_id;
end $$;

create function public._material_sumar(p_material uuid, p_ubicacion uuid, p_cantidad numeric) returns void
language sql security definer set search_path = public as $$
  insert into material_existencia (material_id, ubicacion_id, cantidad) values (p_material, p_ubicacion, p_cantidad)
  on conflict (material_id, ubicacion_id) do update set cantidad = material_existencia.cantidad + excluded.cantidad
$$;

-- Resta con la regla central: no se saca más de lo que hay. Devuelve cuánto había.
create function public._material_restar(p_material uuid, p_ubicacion uuid, p_cantidad numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_hay numeric; v_nombre text;
begin
  select nombre into v_nombre from material where id = p_material;
  select cantidad into v_hay from material_existencia where material_id = p_material and ubicacion_id = p_ubicacion for update;
  if coalesce(v_hay, 0) < p_cantidad then
    raise exception '%: en ese lugar hay %, no se pueden sacar %', v_nombre, coalesce(v_hay, 0), p_cantidad using errcode = 'P0001';
  end if;
  if v_hay = p_cantidad then
    delete from material_existencia where material_id = p_material and ubicacion_id = p_ubicacion;
  else
    update material_existencia set cantidad = cantidad - p_cantidad where material_id = p_material and ubicacion_id = p_ubicacion;
  end if;
  return v_hay;
end $$;

create function public._material_cantidad(p_valor text, p_que text) returns numeric
language plpgsql immutable as $$
declare v numeric;
begin
  begin v := p_valor::numeric; exception when others then
    raise exception 'la cantidad de «%» no es un número', p_que using errcode = 'P0001';
  end;
  if v is null or v <= 0 then raise exception 'la cantidad de «%» tiene que ser mayor que cero', p_que using errcode = 'P0001'; end if;
  return round(v, 3);
end $$;

-- ── «Llegó» ─────────────────────────────────────────────────────────────────────────────────────
-- p_cantidad null = llegó todo lo que faltaba. Si llega menos, el pedido sigue abierto con su saldo.
create function public.recibir_pedido_material(p_id_pedido text, p_cantidad numeric default null, p_destino uuid default null, p_nota text default null)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._material_operador();
  p pedidos_materiales%rowtype;
  v_falta numeric; v_llega numeric; v_material uuid; v_dest uuid; v_total numeric;
begin
  select * into p from pedidos_materiales where id_pedido = p_id_pedido and borrado_en is null for update;
  if not found then raise exception 'el pedido % no existe', p_id_pedido using errcode = 'P0001'; end if;
  if p.estado = 'ENTREGADO' then raise exception 'el pedido «%» ya figura entregado', p.material using errcode = 'P0001'; end if;
  if p.material is null or btrim(p.material) = '' then raise exception 'el pedido no dice qué material es' using errcode = 'P0001'; end if;
  v_dest := coalesce(p_destino, case when p.obra_canonica_id is not null then public.ubicacion_de_obra(p.obra_canonica_id) end);
  if v_dest is null then
    raise exception 'el pedido no tiene obra del índice: elegí a dónde llegó' using errcode = 'P0001';
  end if;
  perform public._material_deposito(v_dest, 'destino');
  v_falta := case when p.cantidad is null then null else greatest(p.cantidad - p.cantidad_recibida, 0) end;
  v_llega := coalesce(p_cantidad, v_falta);
  if v_llega is null or v_llega <= 0 then raise exception 'la cantidad que llegó tiene que ser mayor que cero' using errcode = 'P0001'; end if;
  v_llega := round(v_llega, 3);
  if v_falta is not null and v_llega > v_falta then
    raise exception '«%»: se pidieron %, ya llegaron % y faltan %: no pueden llegar %', p.material, p.cantidad, p.cantidad_recibida, v_falta, v_llega
      using errcode = 'P0001';
  end if;
  v_material := coalesce(p.material_id, public._material_id(p.material, p.unidad));
  perform set_config('material.desde_rpc', 'on', true);
  v_total := p.cantidad_recibida + v_llega;
  update pedidos_materiales
     set cantidad_recibida = v_total, recibido_en = now(), recibido_por = v_usr, material_id = v_material,
         estado = case when p.cantidad is null or v_total >= p.cantidad then 'ENTREGADO' else p.estado end,
         origen = case when origen = 'appsheet_sheet' then 'os' else origen end,
         updated_at = now()
   where id = p.id;
  perform set_config('material.desde_rpc', 'off', true);
  perform public._material_sumar(v_material, v_dest, v_llega);
  insert into material_movimiento (material_id, tipo, destino_id, cantidad, pedido_id, nota, usuario_id)
  values (v_material, 'entrada', v_dest, v_llega, p.id, nullif(btrim(p_nota), ''), v_usr);
  return v_total;
end $$;

-- ── «Usé» ───────────────────────────────────────────────────────────────────────────────────────
create function public.usar_material(p_material uuid, p_ubicacion uuid, p_cantidad numeric, p_nota text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._material_operador(); v_n numeric := public._material_cantidad(p_cantidad::text, 'lo usado');
begin
  perform public._material_deposito(p_ubicacion, 'origen');
  perform public._material_restar(p_material, p_ubicacion, v_n);
  insert into material_movimiento (material_id, tipo, origen_id, cantidad, nota, usuario_id)
  values (p_material, 'consumo', p_ubicacion, v_n, nullif(btrim(p_nota), ''), v_usr);
end $$;

-- ── Traslado + remito ───────────────────────────────────────────────────────────────────────────
-- p_items = [{"material": uuid, "cantidad": n}]. Devuelve el id del remito: un traslado SIEMPRE lo emite.
create function public.mover_material(p_items jsonb, p_origen uuid, p_destino uuid, p_recibe text default null, p_nota text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._material_operador();
  v_remito uuid := gen_random_uuid(); v_numero int; v_it jsonb; v_mat material%rowtype; v_n numeric;
begin
  if p_origen is not distinct from p_destino then raise exception 'el origen y el destino son el mismo lugar' using errcode = 'P0001'; end if;
  perform public._material_deposito(p_origen, 'origen');
  perform public._material_deposito(p_destino, 'destino');
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no hay material para mover' using errcode = 'P0001';
  end if;
  update remito_contador set ultimo = ultimo + 1 where id = 1 returning ultimo into v_numero;
  insert into remito (id, numero, origen_id, destino_id, origen_rotulo, destino_rotulo, entrega_id, entrega_nombre, recibe_nombre, nota)
  values (v_remito, v_numero, p_origen, p_destino, public._material_rotulo(p_origen), public._material_rotulo(p_destino), v_usr,
          (select nombre from perfiles where id = v_usr), nullif(btrim(p_recibe), ''), nullif(btrim(p_nota), ''));
  -- Orden fijo: dos traslados cruzados no se trancan entre sí.
  for v_it in select value from jsonb_array_elements(p_items) order by value->>'material' loop
    select * into v_mat from material where id = nullif(v_it->>'material', '')::uuid;
    if not found then raise exception 'el material no existe' using errcode = 'P0001'; end if;
    v_n := public._material_cantidad(v_it->>'cantidad', v_mat.nombre);
    perform public._material_restar(v_mat.id, p_origen, v_n);
    perform public._material_sumar(v_mat.id, p_destino, v_n);
    insert into remito_item (remito_id, material_id, material, unidad, cantidad) values (v_remito, v_mat.id, v_mat.nombre, v_mat.unidad, v_n);
    insert into material_movimiento (material_id, tipo, origen_id, destino_id, cantidad, remito_id, nota, usuario_id)
    values (v_mat.id, 'traslado', p_origen, p_destino, v_n, v_remito, nullif(btrim(p_nota), ''), v_usr);
  end loop;
  return v_remito;
end $$;

-- ── Recuento ────────────────────────────────────────────────────────────────────────────────────
-- Es la única forma de corregir un error: lo contado pisa el saldo y el libro guarda la diferencia.
create function public.ajustar_material(p_material uuid, p_ubicacion uuid, p_contado numeric, p_motivo text default 'recuento', p_nota text default null)
returns numeric
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._material_operador(); v_hay numeric; v_dif numeric;
begin
  if p_contado is null or p_contado < 0 then raise exception 'lo contado no puede ser negativo' using errcode = 'P0001'; end if;
  if p_motivo is null or p_motivo not in ('recuento', 'perdido', 'descartado') then
    raise exception 'el motivo es recuento, perdido o descartado' using errcode = 'P0001';
  end if;
  perform public._material_deposito(p_ubicacion, 'lugar');
  perform 1 from material where id = p_material;
  if not found then raise exception 'el material no existe' using errcode = 'P0001'; end if;
  select cantidad into v_hay from material_existencia where material_id = p_material and ubicacion_id = p_ubicacion for update;
  v_hay := coalesce(v_hay, 0);
  v_dif := round(p_contado, 3) - v_hay;
  if v_dif = 0 then return v_hay; end if;
  if p_motivo <> 'recuento' and v_dif > 0 then raise exception 'perdido o descartado sólo baja el saldo' using errcode = 'P0001'; end if;
  if v_dif > 0 then perform public._material_sumar(p_material, p_ubicacion, v_dif);
  else perform public._material_restar(p_material, p_ubicacion, -v_dif); end if;
  insert into material_movimiento (material_id, tipo, origen_id, destino_id, cantidad, motivo, nota, usuario_id)
  values (p_material, 'ajuste', case when v_dif < 0 then p_ubicacion end, case when v_dif > 0 then p_ubicacion end,
          abs(v_dif), p_motivo, nullif(btrim(p_nota), ''), v_usr);
  return round(p_contado, 3);
end $$;

-- ── Anular una llegada ──────────────────────────────────────────────────────────────────────────
-- «Llegó» equivocado (cantidad de más, pedido que no era). `ajustar_material` corrige el SALDO pero el
-- pedido seguiría diciendo que llegó: por eso esto baja las dos cosas en la misma transacción. Saca el
-- stock del lugar donde entró (lo más reciente primero) y deja un asiento 'anulacion' por lugar. Si ese
-- material ya se usó o se trasladó y no queda lo que se quiere anular, se frena: primero se corrige el
-- rastro con un recuento o se trae de vuelta, no se inventa stock negativo. Motivo obligatorio.
-- Sólo Administración y Dirección: el jefe de obra da «Llegó» pero no lo deshace (dueño, 29/09).
create function public.anular_recepcion_material(p_id_pedido text, p_cantidad numeric default null, p_nota text default null)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := auth.uid(); v_nota text := nullif(btrim(p_nota), '');
  p pedidos_materiales%rowtype; v_quita numeric; v_resta numeric; v_x numeric; v_total numeric; r record;
begin
  if v_usr is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  if coalesce(public.current_rol() not in ('direccion', 'administracion'), true) then
    raise exception 'anular una llegada lo hace Administración' using errcode = '42501';
  end if;
  if v_nota is null then raise exception 'anular una llegada exige decir por qué' using errcode = 'P0001'; end if;
  select * into p from pedidos_materiales where id_pedido = p_id_pedido and borrado_en is null for update;
  if not found then raise exception 'el pedido % no existe', p_id_pedido using errcode = 'P0001'; end if;
  if p.cantidad_recibida <= 0 then raise exception 'el pedido «%» no tiene nada recibido para anular', p.material using errcode = 'P0001'; end if;
  v_quita := round(coalesce(p_cantidad, p.cantidad_recibida), 3);
  if v_quita <= 0 or v_quita > p.cantidad_recibida then
    raise exception '«%»: llegaron % y no se pueden anular %', p.material, p.cantidad_recibida, v_quita using errcode = 'P0001';
  end if;
  v_resta := v_quita;
  for r in
    select coalesce(destino_id, origen_id) as lugar, material_id,
           sum(case when tipo = 'entrada' then cantidad else -cantidad end) as neto, max(creado_en) as ult
      from material_movimiento where pedido_id = p.id and tipo in ('entrada', 'anulacion')
     group by 1, 2 having sum(case when tipo = 'entrada' then cantidad else -cantidad end) > 0
     order by max(creado_en) desc, 1
  loop
    exit when v_resta <= 0;
    v_x := least(r.neto, v_resta);
    perform public._material_restar(r.material_id, r.lugar, v_x);
    insert into material_movimiento (material_id, tipo, origen_id, cantidad, pedido_id, nota, usuario_id)
    values (r.material_id, 'anulacion', r.lugar, v_x, p.id, v_nota, v_usr);
    v_resta := v_resta - v_x;
  end loop;
  if v_resta > 0 then raise exception 'el libro no explica % de lo recibido: no se puede anular', v_resta using errcode = 'P0001'; end if;
  v_total := p.cantidad_recibida - v_quita;
  perform set_config('material.desde_rpc', 'on', true);
  -- Un pedido que deja de estar completo vuelve a COMPRADO: para haber llegado estuvo comprado.
  update pedidos_materiales
     set cantidad_recibida = v_total,
         recibido_en = case when v_total = 0 then null else recibido_en end,
         recibido_por = case when v_total = 0 then null else recibido_por end,
         estado = case when upper(btrim(coalesce(estado, ''))) like 'ENTREGAD%' then 'COMPRADO' else estado end,
         updated_at = now()
   where id = p.id;
  perform set_config('material.desde_rpc', 'off', true);
  return v_total;
end $$;

revoke all on function public._material_libro_inmutable(), public._pedido_material_recepcion_guarda(),
  public.ve_ubicacion_material(uuid), public._material_operador(), public._material_deposito(uuid, text),
  public._material_rotulo(uuid), public._material_id(text, text), public._material_sumar(uuid, uuid, numeric),
  public._material_restar(uuid, uuid, numeric), public._material_cantidad(text, text),
  public.recibir_pedido_material(text, numeric, uuid, text), public.usar_material(uuid, uuid, numeric, text),
  public.mover_material(jsonb, uuid, uuid, text, text), public.ajustar_material(uuid, uuid, numeric, text, text),
  public.anular_recepcion_material(text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.ve_ubicacion_material(uuid), public.recibir_pedido_material(text, numeric, uuid, text),
  public.usar_material(uuid, uuid, numeric, text), public.mover_material(jsonb, uuid, uuid, text, text),
  public.ajustar_material(uuid, uuid, numeric, text, text), public.anular_recepcion_material(text, numeric, text) to authenticated;
