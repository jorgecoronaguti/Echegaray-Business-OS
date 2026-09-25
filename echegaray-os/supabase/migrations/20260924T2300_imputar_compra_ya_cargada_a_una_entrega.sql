-- IMPUTAR A UNA ENTREGA DE EFECTIVO UNA COMPRA YA CARGADA EN COMPRAS (dueño, 24/09/2026)
--
-- «voy a imputar un gasto que tengo que registrar vía canal comprobantes gastos a una rendición de efectivo,
-- ¿cómo hago eso?». El riesgo conocido desde el 22/09: un ticket pagado con plata de una entrega que entró
-- por #comprobantes-gastos quedó en Compras con Tipo pago «Efectivo» → CAJA lo resta otra vez (la plata ya
-- salió del cajón con la entrega) y el saldo de la entrega no baja. Esto es la puerta para arreglarlo desde
-- la ficha de la entrega: «Imputar un comprobante ya cargado».
--
-- ═══ LA WEB SIGUE SIN ESCRIBIR COMPRAS ═══
--
-- El cambio de Tipo pago «Efectivo» → «A rendir» viaja por la MISMA cola por la que la app registra un
-- pago de Compras (`compra_obra_cambio`, tipo `pago`, una celda «Tipo pago»): el worker relee la fila,
-- prueba que sigue siendo la misma compra y que la celda dice lo que la pantalla vio, escribe y relee.
-- El sync superpone el pedido mientras está en cola (`pagos-pendientes.mjs`), así la réplica no vuelve a
-- decir «Efectivo» en el medio. Nada de esto es nuevo: es `compra_pago_registrar` con una sola celda.
--
-- ═══ EL VÍNCULO NACE CON EL PEDIDO ═══
--
-- `efectivo_rendicion` se escribe en la misma transacción que el pedido a la cola, con `origen =
-- 'reimputada'`, el cambio que la escribe y el Tipo pago que tenía antes (con eso se deshace). El saldo de
-- la persona baja en el acto; la fila del Sheet dice «A rendir» cuando el worker la escribe.
--
-- ═══ DESHACER ═══
--
-- `desimputar_compra_de_entrega` devuelve el Tipo pago anterior por la misma cola y suelta el vínculo. Y
-- anular la entrega ya NO cancela esa fila (una compra real, pagada del cajón): le devuelve su Tipo pago.
-- Cancelar sigue siendo lo que se hace con las filas que escribió un ticket de la entrega.
--
-- Permisos: `ve_economia()` (Dirección y Administración), como toda la gestión del efectivo a rendir.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

set local lock_timeout = '5s';

-- ─── 1 · el vínculo sabe de dónde vino ─────────────────────────────────────────────────────────────
alter table public.efectivo_rendicion
  add column if not exists origen text not null default 'ticket',
  add column if not exists cambio_id uuid references public.compra_obra_cambio(id),
  add column if not exists tipo_pago_anterior text;
alter table public.efectivo_rendicion drop constraint if exists efectivo_rendicion_origen_chk;
alter table public.efectivo_rendicion add constraint efectivo_rendicion_origen_chk
  check (origen in ('ticket', 'reimputada', 'iniciales'));
comment on column public.efectivo_rendicion.origen is
  'ticket = la fila la escribió un ticket de la entrega (canal Efectivo, #comprobantes-gastos con número, app). '
  'reimputada = una compra ya cargada que Administración imputó a la entrega desde su ficha. '
  'iniciales = el bot la imputó por las iniciales escritas a mano en el ticket (20260924T2310).';
comment on column public.efectivo_rendicion.cambio_id is
  'reimputada: el pedido a compra_obra_cambio que cambia su Tipo pago a «A rendir».';
comment on column public.efectivo_rendicion.tipo_pago_anterior is
  'reimputada: el Tipo pago que tenía la fila antes (con esto se deshace).';
-- La tabla concede SELECT entero (no por columna): las columnas nuevas ya se leen. Se repite explícito.
grant select on public.efectivo_rendicion to authenticated;

-- ─── 2 · el registro de quién imputó y quién deshizo ──────────────────────────────────────────────
create table if not exists public.efectivo_imputacion_registro (
  id              uuid primary key default gen_random_uuid(),
  entrega_id      uuid not null references public.efectivo_entrega(id) on delete cascade,
  compra_clave    text not null,
  fila            integer not null,
  monto           numeric(14,2) not null,
  accion          text not null check (accion in ('imputar', 'desimputar')),
  tipo_pago_antes   text,
  tipo_pago_despues text,
  cambio_id       uuid references public.compra_obra_cambio(id),
  hecho_por       uuid not null,
  hecho_en        timestamptz not null default now()
);
create index if not exists efectivo_imputacion_registro_entrega_idx on public.efectivo_imputacion_registro (entrega_id, hecho_en);
comment on table public.efectivo_imputacion_registro is
  'Cada imputación a mano de una compra ya cargada a una entrega de efectivo, y cada vez que se deshizo. Lo escriben sólo las funciones.';
alter table public.efectivo_imputacion_registro enable row level security;
drop policy if exists efectivo_imputacion_registro_select on public.efectivo_imputacion_registro;
create policy efectivo_imputacion_registro_select on public.efectivo_imputacion_registro for select to authenticated
  using ((select public.ve_economia()));
revoke all on public.efectivo_imputacion_registro from anon, public;
revoke insert, update, delete, truncate on public.efectivo_imputacion_registro from authenticated;
grant select on public.efectivo_imputacion_registro to authenticated;

-- ─── 3 · los campos de pago de la fila, como los guarda `previo` ──────────────────────────────────
-- `compra_pago_cancelar` repone la réplica desde `previo` campo por campo: un `previo` incompleto le
-- pondría null a lo que no trae. Se guarda entero, igual que `esperadoDe` en la app.
create or replace function public._efectivo_previo_de_pago(s public.compra_sheet) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'monto_pagado', coalesce(s.monto_pagado, 0), 'monto_parcial_2', coalesce(s.monto_parcial_2, 0),
    'monto_parcial_1', coalesce(s.monto_parcial_1, 0), 'pago_total_o_parcial', coalesce(s.pago_total_o_parcial, ''),
    'tipo_pago', s.tipo_pago, 'estado', coalesce(s.estado, ''), 'estado_pago', s.estado_pago,
    'fecha_prevista_2', s.fecha_prevista_2, 'saldo_pendiente', s.saldo_pendiente)
$$;

-- ─── 4 · encolar UNA celda «Tipo pago» (la pieza común de imputar y deshacer) ──────────────────────
create or replace function public._efectivo_encolar_tipo_pago(
  s public.compra_sheet, p_nuevo text, p_accion text, p_usr uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_nombre text;
begin
  if exists (select 1 from public.compra_obra_cambio
              where fila = s.fila and tipo = 'pago' and estado in ('pendiente', 'procesando')) then
    raise exception 'la fila % de Compras ya tiene un pago esperando que el Sheet lo confirme: esperá a que se aplique y volvé', s.fila
      using errcode = 'P0001';
  end if;
  select nombre into v_nombre from public.perfiles where id = p_usr;
  insert into public.compra_obra_cambio
    (fila, clave, sheet_id, pestana, tipo, celdas, previo, valor_anterior, valor_nuevo, origen, pedido_por, pedido_por_nombre)
  values
    (s.fila, s.clave, s.sheet_id, 'Compras', 'pago',
     jsonb_build_array(jsonb_build_object('rotulo', 'Tipo pago', 'especie', 'texto', 'valor', p_nuevo,
                                          'anterior', s.tipo_pago, 'escribir', p_nuevo)),
     public._efectivo_previo_de_pago(s), s.tipo_pago, p_accion, 'app', p_usr, v_nombre)
  returning id into v_id;
  -- El efecto inmediato en la app; el sync lo superpone hasta que el worker lo escribe.
  update public.compra_sheet set tipo_pago = p_nuevo where fila = s.fila;
  return v_id;
end $$;
revoke all on function public._efectivo_encolar_tipo_pago(public.compra_sheet, text, text, uuid) from public, anon, authenticated;

-- ─── 5 · soltar una rendición reimputada: devolverle a la fila su Tipo pago ────────────────────────
-- Si el pedido de «A rendir» todavía está en cola, se cancela (no hay nada que revertir en el Sheet);
-- si ya se escribió —o quedó en error—, se encola el inverso. El bisturí del worker no pisa una celda que
-- no diga lo esperado, así que el inverso es seguro en cualquier estado.
create or replace function public._efectivo_soltar_reimputada(p_rendicion uuid, p_usr uuid, p_motivo text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.efectivo_rendicion;
  s public.compra_sheet;
  c public.compra_obra_cambio;
  v_cambio uuid;
  v_antes text;
begin
  select * into r from public.efectivo_rendicion where id = p_rendicion for update;
  if r.id is null then raise exception 'esa imputación ya no existe' using errcode = 'P0001'; end if;
  if r.origen not in ('reimputada', 'iniciales') then
    raise exception 'esa fila la escribió un ticket de la entrega: se deshace descartando el comprobante' using errcode = 'P0001';
  end if;
  v_antes := coalesce(nullif(btrim(r.tipo_pago_anterior), ''), 'Efectivo');
  if r.cambio_id is not null then
    select * into c from public.compra_obra_cambio where id = r.cambio_id for update;
  end if;
  select * into s from public.compra_sheet where clave = r.compra_clave order by fila limit 1 for update;
  if c.estado = 'procesando' then
    raise exception 'el worker está escribiendo esa fila en el Sheet justo ahora: probá de nuevo en un minuto' using errcode = 'P0001';
  end if;
  -- EL VÍNCULO SE SUELTA PRIMERO: mientras exista, la guarda de la sección 9 no deja cancelar su pedido
  -- (es lo que impide que «Deshacer pago» de Compras revierta una imputación).
  delete from public.efectivo_rendicion where id = r.id;
  if c.estado = 'pendiente' then
    update public.compra_obra_cambio
       set estado = 'rechazado', motivo = 'cancelado desde la app antes de que el worker lo escribiera: ' || p_motivo
     where id = c.id;
    if s.fila is not null then update public.compra_sheet set tipo_pago = v_antes where fila = s.fila; end if;
  elsif c.estado = 'rechazado' or s.fila is null or coalesce(s.anulada, false) then
    -- El Sheet nunca dijo «A rendir», o la fila ya no está: no hay celda que devolver.
    null;
  else
    v_cambio := public._efectivo_encolar_tipo_pago(s, v_antes, 'desimputar', p_usr);
  end if;
  insert into public.efectivo_imputacion_registro
    (entrega_id, compra_clave, fila, monto, accion, tipo_pago_antes, tipo_pago_despues, cambio_id, hecho_por)
  values (r.entrega_id, r.compra_clave, coalesce(s.fila, 0), r.monto, 'desimputar', 'A rendir', v_antes, v_cambio, p_usr);
  return v_antes;
end $$;
revoke all on function public._efectivo_soltar_reimputada(uuid, uuid, text) from public, anon, authenticated;

-- ─── 6 · IMPUTAR ──────────────────────────────────────────────────────────────────────────────────
-- La pieza interna la usan la app (con `ve_economia()`) y el bot cuando alguien contesta «sí, es de EM»
-- (20260924T2310). Todas las verificaciones viven acá: ninguna de las dos puertas las repite.
create or replace function public._efectivo_imputar_fila(p_entrega uuid, p_fila integer, p_clave text, p_usr uuid, p_origen text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.efectivo_entrega;
  s public.compra_sheet;
  v_otra text;
  v_cambio uuid;
  v_rend uuid;
begin
  if p_origen not in ('reimputada', 'iniciales') then raise exception 'origen desconocido' using errcode = 'P0001'; end if;
  select * into e from public.efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
  if e.anulada_en is not null then raise exception '% está anulada: no se le imputa nada', e.codigo using errcode = 'P0001'; end if;
  if e.cerrada_en is not null then raise exception '% está cerrada: no se le imputa nada', e.codigo using errcode = 'P0001'; end if;
  if e.es_prueba or public.persona_es_prueba(e.persona_id) then
    raise exception '% es una prueba: sus gastos no van a Compras', e.codigo using errcode = 'P0001';
  end if;

  select * into s from public.compra_sheet where fila = p_fila for update;
  if s.fila is null then raise exception 'la fila % ya no está en Compras', p_fila using errcode = 'P0001'; end if;
  if s.clave is null or s.clave is distinct from p_clave then
    raise exception 'la fila % cambió de comprobante mientras la mirabas: volvé a abrir la lista', p_fila using errcode = 'P0001';
  end if;
  if coalesce(s.anulada, false) then raise exception 'la fila % está anulada', p_fila using errcode = 'P0001'; end if;
  if coalesce(s.total, 0) <= 0 then raise exception 'la fila % no tiene Total: no hay nada que rendir', p_fila using errcode = 'P0001'; end if;
  if btrim(coalesce(s.tipo_pago, '')) <> 'Efectivo' then
    raise exception 'la fila % dice «%»: sólo se imputa una compra cargada en Efectivo', p_fila, coalesce(s.tipo_pago, 'vacío')
      using errcode = 'P0001';
  end if;
  -- LA MISMA FACTURA EN DOS FILAS: el vínculo es por clave, y atar una clave repetida sería rendir las dos.
  if (select count(*) from public.compra_sheet where clave = s.clave) > 1 then
    raise exception 'el comprobante de la fila % está en más de una fila de Compras: resolvé el duplicado primero', p_fila
      using errcode = 'P0001';
  end if;
  select en.codigo into v_otra from public.efectivo_rendicion r join public.efectivo_entrega en on en.id = r.entrega_id
   where r.compra_clave = s.clave;
  if v_otra is not null then
    raise exception 'la fila % ya está imputada a %', p_fila, v_otra using errcode = 'P0001';
  end if;

  v_cambio := public._efectivo_encolar_tipo_pago(s, 'A rendir', 'imputar ' || e.codigo, p_usr);
  insert into public.efectivo_rendicion (entrega_id, compra_clave, monto, imputada_por, origen, cambio_id, tipo_pago_anterior)
  values (e.id, s.clave, round(s.total::numeric, 2), p_usr, p_origen, v_cambio, s.tipo_pago)
  returning id into v_rend;
  insert into public.efectivo_imputacion_registro
    (entrega_id, compra_clave, fila, monto, accion, tipo_pago_antes, tipo_pago_despues, cambio_id, hecho_por)
  values (e.id, s.clave, s.fila, round(s.total::numeric, 2), 'imputar', s.tipo_pago, 'A rendir', v_cambio, p_usr);
  return jsonb_build_object('rendicion', v_rend, 'cambio', v_cambio, 'codigo', e.codigo, 'fila', s.fila, 'monto', round(s.total::numeric, 2));
end $$;
revoke all on function public._efectivo_imputar_fila(uuid, integer, text, uuid, text) from public, anon, authenticated;

-- La puerta de la app.
create or replace function public.imputar_compra_a_entrega(p_entrega uuid, p_fila integer, p_clave text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._efectivo_exigir_administracion();
begin
  return public._efectivo_imputar_fila(p_entrega, p_fila, p_clave, v_usr, 'reimputada');
end $$;
comment on function public.imputar_compra_a_entrega(uuid, integer, text) is
  'Administración imputa a una entrega de efectivo una compra ya cargada en Efectivo: encola Tipo pago «A rendir» '
  '(misma cola que los pagos de la app), ata la fila a la entrega (el saldo baja) y deja registro.';

-- ─── 7 · DESHACER ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.desimputar_compra_de_entrega(p_rendicion uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._efectivo_exigir_administracion();
begin
  return public._efectivo_soltar_reimputada(p_rendicion, v_usr, 'deshecho desde la ficha de la entrega');
end $$;
comment on function public.desimputar_compra_de_entrega(uuid) is
  'Deshace una imputación a mano: devuelve el Tipo pago anterior por la cola de Compras y suelta el vínculo.';

revoke all on function public.imputar_compra_a_entrega(uuid, integer, text), public.desimputar_compra_de_entrega(uuid) from public, anon;
grant execute on function public.imputar_compra_a_entrega(uuid, integer, text), public.desimputar_compra_de_entrega(uuid) to authenticated;

-- ─── 8 · anular la entrega NO cancela una compra reimputada: le devuelve su Tipo pago ──────────────
-- Copia de la 20260923T1400 con una sola rama nueva al principio del loop.
create or replace function public._efectivo_cancelar_filas_rendidas(p_entrega uuid, p_motivo text, p_usr uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  s record;
  v_n integer := 0;
  v_nombre text;
begin
  select nombre into v_nombre from public.perfiles where id = p_usr;
  for r in select * from public.efectivo_rendicion where entrega_id = p_entrega loop
    if r.origen in ('reimputada', 'iniciales') then
      perform public._efectivo_soltar_reimputada(r.id, p_usr, 'la entrega se anuló: ' || trim(p_motivo));
      v_n := v_n + 1;
      continue;
    end if;
    select fila, sheet_id, estado, anulada into s from public.compra_sheet where clave = r.compra_clave limit 1;
    if s.fila is null then
      raise exception 'la fila de Compras del comprobante % todavía no está en el espejo: esperá el próximo sync y volvé a anular', r.compra_clave
        using errcode = 'P0001';
    end if;
    if not coalesce(s.anulada, false) then
      insert into public.compra_obra_cambio
        (fila, clave, sheet_id, pestana, tipo, valor_anterior, valor_nuevo, origen, pedido_por, pedido_por_nombre)
      values
        (s.fila, r.compra_clave, s.sheet_id, 'Compras', 'anular', s.estado, 'Cancelado', 'app', p_usr, v_nombre);
      v_n := v_n + 1;
    end if;
    -- El ticket queda descartado con el motivo: la fila que produjo se cancela, y el vínculo se suelta.
    update public.efectivo_comprobante
       set descartado_en = coalesce(descartado_en, now()),
           descartado_motivo = coalesce(descartado_motivo, 'se canceló su fila de Compras: ' || trim(p_motivo))
     where id = r.comprobante_id;
    delete from public.efectivo_rendicion where id = r.id;
  end loop;
  return v_n;
end $$;
revoke all on function public._efectivo_cancelar_filas_rendidas(uuid, text, uuid) from public, anon, authenticated;

-- ─── 9 · «DESHACER PAGO» DE COMPRAS NO REVIERTE UNA IMPUTACIÓN (dueño, 24/09/2026) ─────────────────
-- La app ya lo rechaza (`deshacerPagoDeCompra`), pero un control que vive sólo en la pantalla se saltea
-- llamando a la RPC. Acá, en la base, para las dos puertas de «Deshacer pago»:
--   · el pedido todavía en cola → `compra_pago_cancelar` lo pasaría a rechazado: no, si una imputación viva
--     lo usa (`efectivo_rendicion.cambio_id`);
--   · el pedido ya escrito → `compra_pago_registrar(accion 'deshacer')` encolaría el inverso: no, si la fila
--     está imputada a mano o por iniciales.
-- Sólo frena a una SESIÓN de la app (`auth.uid()`): el worker de la cola y el bot escriben por la conexión
-- directa, sin sesión, y tienen que poder rechazar o cerrar un pedido. Deshacer la imputación sigue siendo
-- `desimputar_compra_de_entrega`, que suelta el vínculo antes de tocar la cola.
create or replace function public._compra_pago_no_revierte_imputacion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo is distinct from 'pago' or (select auth.uid()) is null then return new; end if;
  if tg_op = 'UPDATE' then
    if old.estado = 'pendiente' and new.estado = 'rechazado'
       and exists (select 1 from public.efectivo_rendicion where cambio_id = old.id) then
      raise exception 'ese cambio es la imputación de la fila % a una entrega de efectivo: se deshace desde la ficha de la entrega, no desde Compras', old.fila
        using errcode = 'P0001';
    end if;
  elsif new.valor_nuevo = 'deshacer'
        and exists (select 1 from public.efectivo_rendicion
                     where compra_clave = new.clave and origen in ('reimputada', 'iniciales')) then
    raise exception 'la fila % está imputada a una entrega de efectivo: se deshace desde la ficha de la entrega, no desde Compras', new.fila
      using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public._compra_pago_no_revierte_imputacion() from public, anon, authenticated;
drop trigger if exists compra_pago_no_revierte_imputacion on public.compra_obra_cambio;
create trigger compra_pago_no_revierte_imputacion
  before insert or update of estado on public.compra_obra_cambio
  for each row execute function public._compra_pago_no_revierte_imputacion();

notify pgrst, 'reload schema';
