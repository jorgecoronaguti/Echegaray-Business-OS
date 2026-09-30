-- MATERIAL: ACOPIO EN EL TALLER PARA UNA OBRA (dueño, 30/09/2026: «se ingresa material al Taller para
-- una obra determinada o cliente determinado y el acopio se hace en el Taller aunque ya se sabe el
-- destino del material»).
--
-- ═══ EL MODELO ═══
-- El LUGAR físico sigue siendo uno (el Taller) y el DESTINO es otro eje: `material_existencia` pasa a
-- tener una fila por (material, lugar, destino). `destino_obra_id` nulo = material LIBRE; con valor =
-- ACOPIADO para esa obra (índice `obra_canonica`; el cliente se deduce de la obra, nunca se guarda
-- aparte: dos verdades del cliente se desincronizan). Alternativa descartada: una «ubicación» por obra
-- dentro del Taller. Inventa lugares que no existen en el mundo físico (la estantería es una) y rompe
-- la regla del 29/09 de que las ubicaciones son las de Herramientas.
-- El acopio sólo existe en el Taller: en una obra el material ya está en destino.
--
-- ═══ QUÉ CAMBIA EN CADA MOVIMIENTO ═══
-- · Ingreso (con o sin pedido): puede llevar destino. Un «Llegó» al Taller de un pedido que tiene obra
--   queda acopiado para ESA obra sin preguntar: el pedido ya lo dice; liberar es una acción aparte.
-- · Mover del Taller a una obra consume PRIMERO lo acopiado para esa obra y después lo libre. Mover
--   acopio de la obra A a una obra B pide confirmación explícita (`reasignar: true` en el renglón): se
--   reasigna (A→B dentro del Taller) y recién después sale. Queda el asiento 'reasignacion'.
-- · Reasignar/liberar desde la ficha: asiento 'reasignacion' con quién y cuándo (usuario_id, creado_en).
-- · El libro sigue inmutable. La columna `acopio_id` de cada asiento dice QUÉ fila de destino tocó.
--
-- ═══ CONTROL DE SUMA ═══
-- `material_control_libro()` recalcula el saldo de cada (material, lugar, destino) desde el libro y lo
-- compara con la existencia; este archivo termina con un control que frena la migración si hoy no cierra
-- (mismo criterio que el control de activos de Herramientas: la suma por lugar tiene que explicarse).
--
-- ═══ QUIÉN VE ═══
-- Igual que el resto de Materiales, más una excepción acotada: lo acopiado PARA una obra lo ve quien ve
-- esa obra (ve_obra), aunque esté físicamente en el Taller. Sin eso el campo no sabría que su material
-- ya está esperándolo. Un acopio de una obra que no ve sigue oculto.

-- ── Tablas ──────────────────────────────────────────────────────────────────────────────────────
alter table public.material_existencia
  add column destino_obra_id text references public.obra_canonica(id),
  add column desde timestamptz not null default now();
comment on column public.material_existencia.destino_obra_id is
  'Obra para la que está acopiado este material en el Taller. Nulo = libre. Sólo el Taller acopia.';
comment on column public.material_existencia.desde is
  'Cuándo entró esta fila (fecha de ingreso del acopio). Se conserva mientras la fila exista; si se vacía y vuelve a llenar, empieza de nuevo.';

alter table public.material_existencia drop constraint material_existencia_pkey;
-- Una fila por (material, lugar, destino). El nulo es «libre»: se normaliza para que la clave lo cuente.
create unique index material_existencia_uq on public.material_existencia
  (material_id, ubicacion_id, (coalesce(destino_obra_id, '')));

alter table public.material_movimiento
  add column acopio_id text references public.obra_canonica(id),
  add column acopio_a_id text references public.obra_canonica(id);
comment on column public.material_movimiento.acopio_id is
  'Fila de destino tocada en el lugar de origen (o en el de destino, si es una entrada): obra del acopio; nulo = libre.';
comment on column public.material_movimiento.acopio_a_id is
  'Sólo en una reasignación: a qué obra pasó el acopio (nulo = quedó libre).';

alter table public.material_movimiento drop constraint if exists material_movimiento_tipo_check;
alter table public.material_movimiento add constraint material_movimiento_tipo_check
  check (tipo in ('entrada', 'consumo', 'traslado', 'ajuste', 'anulacion', 'reasignacion'));
alter table public.material_movimiento drop constraint material_mov_forma_chk;
alter table public.material_movimiento add constraint material_mov_forma_chk check (
  (tipo = 'entrada'  and origen_id is null     and destino_id is not null) or
  (tipo = 'consumo'  and origen_id is not null and destino_id is null) or
  (tipo = 'traslado' and origen_id is not null and destino_id is not null and origen_id <> destino_id) or
  (tipo = 'ajuste'   and (origen_id is null) <> (destino_id is null) and motivo is not null) or
  (tipo = 'anulacion' and origen_id is not null and destino_id is null and pedido_id is not null) or
  -- Cambiar el destino de un acopio no mueve nada de lugar: origen y destino son el mismo, y el destino
  -- tiene que cambiar de verdad (un asiento que no cambia nada es ruido en el rastro).
  (tipo = 'reasignacion' and origen_id is not null and destino_id = origen_id and acopio_id is distinct from acopio_a_id)
);
create index material_movimiento_acopio_idx on public.material_movimiento (acopio_id) where acopio_id is not null;

-- ── Lectura: lo acopiado para una obra lo ve quien ve la obra ───────────────────────────────────
drop policy material_existencia_select on public.material_existencia;
create policy material_existencia_select on public.material_existencia for select to authenticated
  using (public.ve_ubicacion_material(ubicacion_id) or (destino_obra_id is not null and public.ve_obra(destino_obra_id)));
drop policy material_movimiento_select on public.material_movimiento;
create policy material_movimiento_select on public.material_movimiento for select to authenticated
  using (public.ve_ubicacion_material(origen_id) or public.ve_ubicacion_material(destino_id)
         or (acopio_id is not null and public.ve_obra(acopio_id))
         or (acopio_a_id is not null and public.ve_obra(acopio_a_id)));

-- ── Piezas internas (las firmas viejas se reemplazan: sólo las llaman las funciones de este módulo) ──
drop function public._material_sumar(uuid, uuid, numeric);
drop function public._material_restar(uuid, uuid, numeric);
drop function public.usar_material(uuid, uuid, numeric, text);
drop function public.ajustar_material(uuid, uuid, numeric, text, text);
drop function public.ingresar_material(text, text, uuid, numeric, text);

-- La obra a la que se acopia tiene que existir y estar activa: acopiar para una obra cerrada es stock huérfano.
create function public._material_acopio_obra(p_obra text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from obra_canonica where id = p_obra and estado = 'activa') then
    raise exception 'la obra del acopio no existe o no está activa' using errcode = 'P0001';
  end if;
end $$;

create function public._material_sumar(p_material uuid, p_ubicacion uuid, p_cantidad numeric, p_acopio text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_acopio is not null and not exists (select 1 from ubicacion where id = p_ubicacion and tipo = 'taller') then
    raise exception 'sólo el Taller acopia material para una obra: en una obra el material ya está en destino' using errcode = 'P0001';
  end if;
  insert into material_existencia (material_id, ubicacion_id, cantidad, destino_obra_id) values (p_material, p_ubicacion, p_cantidad, p_acopio)
  on conflict (material_id, ubicacion_id, (coalesce(destino_obra_id, ''))) do update set cantidad = material_existencia.cantidad + excluded.cantidad;
end $$;

-- Resta de UNA fila (la libre o la acopiada para una obra): no se saca más de lo que hay en ella.
create function public._material_restar(p_material uuid, p_ubicacion uuid, p_cantidad numeric, p_acopio text default null)
returns numeric
language plpgsql security definer set search_path = public as $$
declare v_hay numeric; v_nombre text; v_que text;
begin
  select nombre into v_nombre from material where id = p_material;
  select cantidad into v_hay from material_existencia
   where material_id = p_material and ubicacion_id = p_ubicacion and coalesce(destino_obra_id, '') = coalesce(p_acopio, '') for update;
  if coalesce(v_hay, 0) < p_cantidad then
    v_que := case when p_acopio is null then 'libre' else 'acopiado para ' || p_acopio end;
    raise exception '%: en ese lugar hay % (%), no se pueden sacar %', v_nombre, coalesce(v_hay, 0), v_que, p_cantidad using errcode = 'P0001';
  end if;
  if v_hay = p_cantidad then
    delete from material_existencia where material_id = p_material and ubicacion_id = p_ubicacion and coalesce(destino_obra_id, '') = coalesce(p_acopio, '');
  else
    update material_existencia set cantidad = cantidad - p_cantidad
     where material_id = p_material and ubicacion_id = p_ubicacion and coalesce(destino_obra_id, '') = coalesce(p_acopio, '');
  end if;
  return v_hay;
end $$;

-- Cambia el destino de un acopio (p_de/p_para nulo = libre) y deja el asiento. La usan la acción pública y `mover_material`.
create function public._material_reasignar(p_material uuid, p_ubicacion uuid, p_de text, p_para text, p_cantidad numeric, p_nota text, p_usr uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_para is not null then perform public._material_acopio_obra(p_para); end if;
  perform public._material_restar(p_material, p_ubicacion, p_cantidad, p_de);
  perform public._material_sumar(p_material, p_ubicacion, p_cantidad, p_para);
  insert into material_movimiento (material_id, tipo, origen_id, destino_id, cantidad, acopio_id, acopio_a_id, nota, usuario_id)
  values (p_material, 'reasignacion', p_ubicacion, p_ubicacion, p_cantidad, p_de, p_para, left(nullif(btrim(p_nota), ''), 400), p_usr);
end $$;

-- Una «tajada» de un traslado: sale de UNA fila del origen y entra al destino (libre si el destino es una obra;
-- en otro Taller conserva el acopio). Un asiento por tajada, todos bajo el mismo remito.
create function public._material_mover_tajada(p_material uuid, p_origen uuid, p_destino uuid, p_acopio text, p_cantidad numeric, p_remito uuid, p_nota text, p_usr uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_acopio_llega text := case when exists (select 1 from ubicacion where id = p_destino and tipo = 'taller') then p_acopio end;
begin
  perform public._material_restar(p_material, p_origen, p_cantidad, p_acopio);
  perform public._material_sumar(p_material, p_destino, p_cantidad, v_acopio_llega);
  insert into material_movimiento (material_id, tipo, origen_id, destino_id, cantidad, remito_id, acopio_id, acopio_a_id, nota, usuario_id)
  values (p_material, 'traslado', p_origen, p_destino, p_cantidad, p_remito, p_acopio, null, nullif(btrim(p_nota), ''), p_usr);
end $$;

-- ── Ingreso sin pedido, ahora con destino ───────────────────────────────────────────────────────
create function public.ingresar_material(p_nombre text, p_unidad text, p_ubicacion uuid, p_cantidad numeric, p_origen text, p_para_obra text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._material_operador();
  v_n numeric := public._material_cantidad(p_cantidad::text, coalesce(btrim(p_nombre), 'el material'));
  v_origen text := nullif(btrim(p_origen), '');
  v_para text := nullif(btrim(p_para_obra), '');
  v_mat uuid;
begin
  if v_origen is null or length(v_origen) < 3 then
    raise exception 'decí de dónde viene el material (compra directa, stock inicial…)' using errcode = 'P0001';
  end if;
  perform public._material_deposito(p_ubicacion, 'destino');
  if v_para is not null then perform public._material_acopio_obra(v_para); end if;
  v_mat := public._material_id(p_nombre, p_unidad);
  perform public._material_sumar(v_mat, p_ubicacion, v_n, v_para);
  insert into material_movimiento (material_id, tipo, destino_id, cantidad, acopio_id, nota, usuario_id)
  values (v_mat, 'entrada', p_ubicacion, v_n, v_para, left(v_origen, 400), v_usr);
  return v_mat;
end $$;

-- ── «Llegó»: al Taller, un pedido con obra queda acopiado para ella ─────────────────────────────
create or replace function public.recibir_pedido_material(p_id_pedido text, p_cantidad numeric default null, p_destino uuid default null, p_nota text default null)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._material_operador();
  p pedidos_materiales%rowtype;
  v_falta numeric; v_llega numeric; v_material uuid; v_dest uuid; v_total numeric; v_acopio text;
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
  -- El pedido ya sabe para qué obra es: si llega al Taller, se acopia para ella.
  if p.obra_canonica_id is not null and exists (select 1 from ubicacion where id = v_dest and tipo = 'taller') then
    v_acopio := p.obra_canonica_id;
    perform public._material_acopio_obra(v_acopio);
  end if;
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
  perform public._material_sumar(v_material, v_dest, v_llega, v_acopio);
  insert into material_movimiento (material_id, tipo, destino_id, cantidad, pedido_id, acopio_id, nota, usuario_id)
  values (v_material, 'entrada', v_dest, v_llega, p.id, v_acopio, nullif(btrim(p_nota), ''), v_usr);
  return v_total;
end $$;

-- ── «Usé» y recuento: sobre una fila (libre por defecto) ────────────────────────────────────────
create function public.usar_material(p_material uuid, p_ubicacion uuid, p_cantidad numeric, p_nota text default null, p_acopio text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._material_operador(); v_n numeric := public._material_cantidad(p_cantidad::text, 'lo usado');
begin
  perform public._material_deposito(p_ubicacion, 'origen');
  perform public._material_restar(p_material, p_ubicacion, v_n, nullif(btrim(p_acopio), ''));
  insert into material_movimiento (material_id, tipo, origen_id, cantidad, acopio_id, nota, usuario_id)
  values (p_material, 'consumo', p_ubicacion, v_n, nullif(btrim(p_acopio), ''), nullif(btrim(p_nota), ''), v_usr);
end $$;

create function public.ajustar_material(p_material uuid, p_ubicacion uuid, p_contado numeric, p_motivo text default 'recuento', p_nota text default null, p_acopio text default null)
returns numeric
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._material_operador(); v_hay numeric; v_dif numeric; v_ac text := nullif(btrim(p_acopio), '');
begin
  if p_contado is null or p_contado < 0 then raise exception 'lo contado no puede ser negativo' using errcode = 'P0001'; end if;
  if p_motivo is null or p_motivo not in ('recuento', 'perdido', 'descartado') then
    raise exception 'el motivo es recuento, perdido o descartado' using errcode = 'P0001';
  end if;
  perform public._material_deposito(p_ubicacion, 'lugar');
  perform 1 from material where id = p_material;
  if not found then raise exception 'el material no existe' using errcode = 'P0001'; end if;
  select cantidad into v_hay from material_existencia
   where material_id = p_material and ubicacion_id = p_ubicacion and coalesce(destino_obra_id, '') = coalesce(v_ac, '') for update;
  v_hay := coalesce(v_hay, 0);
  v_dif := round(p_contado, 3) - v_hay;
  if v_dif = 0 then return v_hay; end if;
  if p_motivo <> 'recuento' and v_dif > 0 then raise exception 'perdido o descartado sólo baja el saldo' using errcode = 'P0001'; end if;
  if v_dif > 0 then perform public._material_sumar(p_material, p_ubicacion, v_dif, v_ac);
  else perform public._material_restar(p_material, p_ubicacion, -v_dif, v_ac); end if;
  insert into material_movimiento (material_id, tipo, origen_id, destino_id, cantidad, motivo, acopio_id, nota, usuario_id)
  values (p_material, 'ajuste', case when v_dif < 0 then p_ubicacion end, case when v_dif > 0 then p_ubicacion end,
          abs(v_dif), p_motivo, v_ac, nullif(btrim(p_nota), ''), v_usr);
  return round(p_contado, 3);
end $$;

-- ── Reasignar / liberar desde la ficha ──────────────────────────────────────────────────────────
-- p_de / p_para nulos = libre. «Quién y cuándo» quedan en el asiento (usuario_id, creado_en).
create function public.reasignar_acopio(p_material uuid, p_ubicacion uuid, p_de text, p_para text, p_cantidad numeric, p_nota text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._material_operador(); v_de text := nullif(btrim(p_de), ''); v_para text := nullif(btrim(p_para), '');
        v_n numeric := public._material_cantidad(p_cantidad::text, 'lo que se reasigna');
begin
  if not exists (select 1 from ubicacion where id = p_ubicacion and tipo = 'taller') then
    raise exception 'el acopio existe sólo en el Taller' using errcode = 'P0001';
  end if;
  if v_de is not distinct from v_para then raise exception 'el destino es el mismo: no hay nada que cambiar' using errcode = 'P0001'; end if;
  perform public._material_reasignar(p_material, p_ubicacion, v_de, v_para, v_n, p_nota, v_usr);
end $$;

-- ── Traslado + remito: primero lo acopiado para la obra destino ─────────────────────────────────
-- Renglón = {"material": uuid, "cantidad": n, "acopio": null|"libre"|<obra>, "reasignar": bool}.
--  · sin «acopio» (automático): del Taller a una obra consume PRIMERO lo acopiado para esa obra y después lo libre;
--  · «libre»: sólo lo libre;
--  · <obra>: sale de lo acopiado para esa obra; si el destino es OTRA obra exige «reasignar»: true (se reasigna con rastro).
create or replace function public.mover_material(p_items jsonb, p_origen uuid, p_destino uuid, p_recibe text default null, p_nota text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._material_operador();
  v_remito uuid := gen_random_uuid(); v_numero int; v_it jsonb; v_mat material%rowtype; v_n numeric;
  v_ori ubicacion%rowtype; v_des ubicacion%rowtype; v_obra_dest text; v_key text; v_hay numeric; v_x numeric;
begin
  if p_origen is not distinct from p_destino then raise exception 'el origen y el destino son el mismo lugar' using errcode = 'P0001'; end if;
  v_ori := public._material_deposito(p_origen, 'origen');
  v_des := public._material_deposito(p_destino, 'destino');
  v_obra_dest := case when v_des.tipo = 'obra' then v_des.obra_id end;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no hay material para mover' using errcode = 'P0001';
  end if;
  update remito_contador set ultimo = ultimo + 1 where id = 1 returning ultimo into v_numero;
  insert into remito (id, numero, origen_id, destino_id, origen_rotulo, destino_rotulo, entrega_id, entrega_nombre, recibe_nombre, nota)
  values (v_remito, v_numero, p_origen, p_destino, public._material_rotulo(p_origen), public._material_rotulo(p_destino), v_usr,
          (select nombre from perfiles where id = v_usr), nullif(btrim(p_recibe), ''), nullif(btrim(p_nota), ''));
  -- Orden fijo: dos traslados cruzados no se trancan entre sí.
  for v_it in select value from jsonb_array_elements(p_items) order by value->>'material', value->>'acopio' nulls first loop
    select * into v_mat from material where id = nullif(v_it->>'material', '')::uuid;
    if not found then raise exception 'el material no existe' using errcode = 'P0001'; end if;
    v_n := public._material_cantidad(v_it->>'cantidad', v_mat.nombre);
    v_key := nullif(btrim(v_it->>'acopio'), '');
    if v_key is not null and v_key <> 'libre' and v_ori.tipo <> 'taller' then
      raise exception 'sólo el Taller tiene material acopiado' using errcode = 'P0001';
    end if;
    if v_key is null and v_obra_dest is not null and v_ori.tipo = 'taller' then
      -- Automático: lo acopiado para la obra destino primero, el resto de lo libre.
      select cantidad into v_hay from material_existencia
       where material_id = v_mat.id and ubicacion_id = p_origen and destino_obra_id = v_obra_dest;
      v_x := least(v_n, coalesce(v_hay, 0));
      if v_x > 0 then perform public._material_mover_tajada(v_mat.id, p_origen, p_destino, v_obra_dest, v_x, v_remito, p_nota, v_usr); end if;
      if v_n - v_x > 0 then perform public._material_mover_tajada(v_mat.id, p_origen, p_destino, null, v_n - v_x, v_remito, p_nota, v_usr); end if;
    elsif v_key is null or v_key = 'libre' then
      perform public._material_mover_tajada(v_mat.id, p_origen, p_destino, null, v_n, v_remito, p_nota, v_usr);
    else
      -- Acopio de la obra v_key. Si va a OTRA obra, se reasigna con confirmación explícita y rastro.
      if v_des.tipo = 'obra' and v_obra_dest is distinct from v_key then
        if v_it->>'reasignar' is distinct from 'true' then
          raise exception '«%»: está acopiado para la obra % y el destino es otra obra: confirmá la reasignación', v_mat.nombre, v_key using errcode = 'P0001';
        end if;
        perform public._material_reasignar(v_mat.id, p_origen, v_key, v_obra_dest, v_n,
          coalesce(nullif(btrim(p_nota), ''), 'reasignado al mover a otra obra') || ' (remito R-' || lpad(v_numero::text, 4, '0') || ')', v_usr);
        v_key := v_obra_dest;
      end if;
      perform public._material_mover_tajada(v_mat.id, p_origen, p_destino, v_key, v_n, v_remito, p_nota, v_usr);
    end if;
    insert into remito_item (remito_id, material_id, material, unidad, cantidad) values (v_remito, v_mat.id, v_mat.nombre, v_mat.unidad, v_n);
  end loop;
  return v_remito;
end $$;

-- ── Anular una llegada: saca de la fila donde entró (libre o acopiada) ──────────────────────────
create or replace function public.anular_recepcion_material(p_id_pedido text, p_cantidad numeric default null, p_nota text default null)
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
    select coalesce(destino_id, origen_id) as lugar, material_id, acopio_id,
           sum(case when tipo = 'entrada' then cantidad else -cantidad end) as neto, max(creado_en) as ult
      from material_movimiento where pedido_id = p.id and tipo in ('entrada', 'anulacion')
     group by 1, 2, 3 having sum(case when tipo = 'entrada' then cantidad else -cantidad end) > 0
     order by max(creado_en) desc, 1
  loop
    exit when v_resta <= 0;
    v_x := least(r.neto, v_resta);
    perform public._material_restar(r.material_id, r.lugar, v_x, r.acopio_id);
    insert into material_movimiento (material_id, tipo, origen_id, cantidad, pedido_id, acopio_id, nota, usuario_id)
    values (r.material_id, 'anulacion', r.lugar, v_x, p.id, r.acopio_id, v_nota, v_usr);
    v_resta := v_resta - v_x;
  end loop;
  if v_resta > 0 then raise exception 'el libro no explica % de lo recibido: no se puede anular', v_resta using errcode = 'P0001'; end if;
  v_total := p.cantidad_recibida - v_quita;
  perform set_config('material.desde_rpc', 'on', true);
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

-- ── Control de suma: el saldo de cada fila se explica con el libro ──────────────────────────────
-- Devuelve las filas donde existencia ≠ Σ del libro (vacío = cierra). Cubre también las filas que el libro
-- dice que deberían existir y no existen. Lo corre quien audita; no escribe nada.
create function public.material_control_libro()
returns table (material_id uuid, ubicacion_id uuid, destino_obra_id text, en_existencia numeric, segun_libro numeric)
language sql stable security definer set search_path = public as $$
  with l as (
    select m.material_id, m.destino_id as ub, m.acopio_id as ac, m.cantidad as c from material_movimiento m where m.tipo = 'entrada'
    union all select m.material_id, m.origen_id, m.acopio_id, -m.cantidad from material_movimiento m where m.tipo in ('consumo', 'anulacion', 'traslado')
    union all select m.material_id, m.destino_id, null, m.cantidad from material_movimiento m where m.tipo = 'traslado'
    union all select m.material_id, coalesce(m.destino_id, m.origen_id), m.acopio_id, case when m.destino_id is not null then m.cantidad else -m.cantidad end
      from material_movimiento m where m.tipo = 'ajuste'
    union all select m.material_id, m.origen_id, m.acopio_id, -m.cantidad from material_movimiento m where m.tipo = 'reasignacion'
    union all select m.material_id, m.origen_id, m.acopio_a_id, m.cantidad from material_movimiento m where m.tipo = 'reasignacion'
  ), lib as (
    select material_id, ub, ac, sum(c) as s from l group by 1, 2, 3
  )
  select coalesce(e.material_id, lib.material_id), coalesce(e.ubicacion_id, lib.ub), coalesce(e.destino_obra_id, lib.ac),
         coalesce(e.cantidad, 0), coalesce(lib.s, 0)
    from material_existencia e
    full join lib on lib.material_id = e.material_id and lib.ub = e.ubicacion_id and coalesce(lib.ac, '') = coalesce(e.destino_obra_id, '')
   where coalesce(e.cantidad, 0) <> coalesce(lib.s, 0)
$$;

revoke all on function public._material_acopio_obra(text), public._material_sumar(uuid, uuid, numeric, text),
  public._material_restar(uuid, uuid, numeric, text), public._material_reasignar(uuid, uuid, text, text, numeric, text, uuid),
  public._material_mover_tajada(uuid, uuid, uuid, text, numeric, uuid, text, uuid),
  public.ingresar_material(text, text, uuid, numeric, text, text), public.usar_material(uuid, uuid, numeric, text, text),
  public.ajustar_material(uuid, uuid, numeric, text, text, text), public.reasignar_acopio(uuid, uuid, text, text, numeric, text),
  public.material_control_libro(), public.recibir_pedido_material(text, numeric, uuid, text),
  public.mover_material(jsonb, uuid, uuid, text, text), public.anular_recepcion_material(text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.ingresar_material(text, text, uuid, numeric, text, text), public.usar_material(uuid, uuid, numeric, text, text),
  public.ajustar_material(uuid, uuid, numeric, text, text, text), public.reasignar_acopio(uuid, uuid, text, text, numeric, text),
  public.recibir_pedido_material(text, numeric, uuid, text), public.mover_material(jsonb, uuid, uuid, text, text),
  public.anular_recepcion_material(text, numeric, text) to authenticated;

-- ── Controles de consistencia: frenan la migración si algo no cierra ────────────────────────────
do $$
declare n_suma int; n_acopio_fuera_del_taller int;
begin
  select count(*) into n_suma from public.material_control_libro();
  if n_suma > 0 then raise exception 'material: % filas de existencia no se explican con el libro', n_suma; end if;
  select count(*) into n_acopio_fuera_del_taller from public.material_existencia e
   join public.ubicacion u on u.id = e.ubicacion_id where e.destino_obra_id is not null and u.tipo <> 'taller';
  if n_acopio_fuera_del_taller > 0 then raise exception 'material: % acopios fuera del Taller', n_acopio_fuera_del_taller; end if;
end $$;
