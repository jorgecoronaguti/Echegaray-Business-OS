-- RENDICIÓN MANUAL DE EFECTIVO (30/09/2026, pedido del dueño: «sigo sin poder hacer rendiciones manuales,
-- cargarlas, editarlas, modificarlas; soy admin, tengo que tener ABM de todo en efectivo»).
--
-- Una rendición SIEMPRE es una fila de Compras: el efectivo entregado se rinde contra un gasto que existe en
-- el libro. Hasta hoy la única puerta era la foto del ticket (el bot lee y carga la fila) o imputar una fila
-- que ya estaba cargada. Faltaba la tercera: el gasto sin comprobante —flete, propina, un peón pagado en
-- mano— que la persona anota a mano. Ese gasto entra a Compras por el MISMO circuito que la libreta del
-- dueño (`especialistas/libreta.mjs`, aprobado el 22/09: «¿un gasto sin comprobante entra igual? ok»): un
-- fajo web en `reintento` que el worker de comprobantes ya vivo toma en menos de un minuto y escribe como
-- fila «A rendir», con el concepto escrito y marcado «sin comprobante».
--
-- Como la fila no tiene número de comprobante, en el espejo queda con `clave` NULL: la rendición no se ata
-- por clave sino por FILA, que el cargador deja en `comunicacion.comprobantes_cargados` (fajo_id → fila).
-- Mientras la fila no existe, la ficha la muestra con sus datos denormalizados y el estado del fajo.

alter table public.efectivo_rendicion
  add column if not exists fila integer,
  add column if not exists fajo_id uuid,
  add column if not exists fecha date,
  add column if not exists concepto text,
  add column if not exists proveedor text;
comment on column public.efectivo_rendicion.fila is 'Fila de Compras de la rendición manual, cuando el cargador ya la escribió (se resuelve por fajo_id).';
comment on column public.efectivo_rendicion.fajo_id is 'Fajo web (comunicacion.comprobante_fajos) que escribe la fila de la rendición manual.';
grant select (fila, fajo_id, fecha, concepto, proveedor) on public.efectivo_rendicion to authenticated;

alter table public.efectivo_rendicion drop constraint if exists efectivo_rendicion_origen_chk;
alter table public.efectivo_rendicion add constraint efectivo_rendicion_origen_chk
  check (origen in ('ticket', 'reimputada', 'iniciales', 'manual'));

create index if not exists efectivo_rendicion_fajo_idx on public.efectivo_rendicion (fajo_id) where fajo_id is not null;

-- ── El nombre de la obra tal como lo acepta el desplegable de Compras (columna J) ────────────────────────
-- `obra_canonica.nombre` no es necesariamente el rótulo del desplegable estricto. El rótulo que SÍ acepta
-- es el que ya tienen las filas del espejo atadas a esa obra: se toma el más usado. Sin filas, no se manda
-- obra (la política de la libreta no la exige) y se completa en Compras.
create or replace function public._efectivo_obra_para_compras(p_obra text)
returns text language sql stable security definer set search_path = public as $$
  select s.obra_texto from public.compra_sheet s
   where s.obra_id = p_obra and nullif(btrim(coalesce(s.obra_texto, '')), '') is not null
   group by s.obra_texto order by count(*) desc, s.obra_texto limit 1
$$;
revoke all on function public._efectivo_obra_para_compras(text) from public;

-- ── ALTA ───────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.rendir_gasto_manual(
  p_entrega uuid, p_fecha date, p_total numeric, p_concepto text,
  p_proveedor text default null, p_cuit text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := auth.uid();
  e public.efectivo_entrega;
  v_rend uuid := gen_random_uuid();
  v_fajo uuid := gen_random_uuid();
  v_lote text := gen_random_uuid()::text;
  v_nombre text;
  v_concepto text := nullif(btrim(coalesce(p_concepto, '')), '');
  v_proveedor text := nullif(btrim(coalesce(p_proveedor, '')), '');
  v_cuit text := nullif(regexp_replace(coalesce(p_cuit, ''), '\D', '', 'g'), '');
  v_texto text;
  v_comp jsonb;
begin
  if v_usr is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  select * into e from public.efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'esa entrega no existe' using errcode = 'P0001'; end if;
  if not coalesce(public._efectivo_actua_por(e.persona_id), false) then
    raise exception 'sólo rinde quien tiene la entrega, o Administración' using errcode = '42501';
  end if;
  if e.anulada_en is not null or e.cerrada_en is not null then
    raise exception 'la entrega % está cerrada: no se le rinde más', e.codigo using errcode = 'P0001';
  end if;
  if coalesce(e.es_prueba, false) then raise exception 'una entrega de prueba no se rinde' using errcode = 'P0001'; end if;
  if p_fecha is null then raise exception 'poné la fecha del gasto' using errcode = 'P0001'; end if;
  if p_fecha > current_date + 1 then raise exception 'la fecha no puede ser futura' using errcode = 'P0001'; end if;
  if p_total is null or p_total <= 0 then raise exception 'el importe tiene que ser mayor que cero' using errcode = 'P0001'; end if;
  if v_concepto is null then raise exception 'escribí qué se pagó' using errcode = 'P0001'; end if;
  if v_cuit is not null and length(v_cuit) <> 11 then v_cuit := null; end if;

  select nombre into v_nombre from public.perfiles where id = v_usr;
  v_nombre := coalesce(nullif(btrim(v_nombre), ''), 'app');

  -- El proveedor escrito a mano NO va a la celda E (desplegable estricto): viaja en el concepto, igual que la
  -- libreta. Con CUIT de 11 dígitos el cargador lo resuelve solo desde la lista de proveedores.
  v_texto := v_concepto || case when v_proveedor is not null then ' · ' || v_proveedor else '' end || ' · sin comprobante';
  v_comp := jsonb_build_object(
    'fecha', to_char(p_fecha, 'DD/MM/YYYY'),
    'concepto', v_texto,
    'total', round(p_total, 2),
    'formaPago', 'A rendir',
    'condicion', 'Contado',
    'pagado', round(p_total, 2));
  if v_cuit is not null then v_comp := v_comp || jsonb_build_object('cuit', v_cuit); end if;
  if e.estructura then
    v_comp := v_comp || jsonb_build_object('unidad', 'Estructura');
  elsif e.obra_id is not null and public._efectivo_obra_para_compras(e.obra_id) is not null then
    v_comp := v_comp || jsonb_build_object('obra', public._efectivo_obra_para_compras(e.obra_id));
  end if;

  insert into comunicacion.comprobante_fajos
    (id, plataforma, plataforma_user_id, plataforma_username, channel_id, root_post_id, post_ids, items,
     estado, intentos, proximo_intento_at, creado_at, ultimo_at)
  values
    (v_fajo, 'web', v_usr::text, v_nombre, v_lote, v_lote, '{}'::text[],
     jsonb_build_array(jsonb_build_object(
       'origenCarga', 'libreta',
       'clave', 'm:' || v_rend::text,
       'postId', v_lote,
       'leidoEn', now(),
       'proveedorNuevo', false,
       'rendicionManual', v_rend,
       'comprobante', v_comp)),
     'reintento', 0, now(), now(), now());

  insert into public.efectivo_rendicion
    (id, entrega_id, compra_clave, monto, imputada_por, origen, fajo_id, fecha, concepto, proveedor)
  values
    (v_rend, e.id, 'm:' || v_rend::text, round(p_total, 2), v_usr, 'manual', v_fajo, p_fecha, v_concepto, v_proveedor);

  return jsonb_build_object('rendicion', v_rend, 'fajo', v_fajo, 'codigo', e.codigo);
end $$;
grant execute on function public.rendir_gasto_manual(uuid, date, numeric, text, text, text) to authenticated;

-- ── LA FILA, CUANDO EL CARGADOR YA LA ESCRIBIÓ ────────────────────────────────────────────────────────────
create or replace function public._efectivo_resolver_filas_manuales()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.efectivo_rendicion r
     set fila = cc.fila
    from comunicacion.comprobantes_cargados cc
   where r.origen = 'manual' and r.fila is null and r.fajo_id is not null
     and cc.fajo_id = r.fajo_id and cc.fila is not null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public._efectivo_resolver_filas_manuales() from public;

-- Lo que la ficha muestra de cada manual: su fila si ya está, o en qué anda el fajo (reintento · confirmado ·
-- error, con el texto). El que ve la entrega ve esto; la tabla de fajos es sólo de postgres.
create or replace function public.estado_rendiciones_manuales(p_entrega uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if auth.uid() is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  if not exists (select 1 from public.efectivo_entrega e where e.id = p_entrega
                  and (coalesce(public.ve_economia(), false) or public.ve_efectivo_entrega(e.persona_id, e.entregada_por))) then
    return '[]'::jsonb;
  end if;
  perform public._efectivo_resolver_filas_manuales();
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'fila', r.fila,
           'fajo', case when r.fila is not null then 'cargado' else f.estado end,
           'error', case when r.fila is null then f.error end,
           'intentos', f.intentos) order by r.imputada_en), '[]'::jsonb)
    into v
    from public.efectivo_rendicion r
    left join comunicacion.comprobante_fajos f on f.id = r.fajo_id
   where r.entrega_id = p_entrega and r.origen = 'manual';
  return v;
end $$;
grant execute on function public.estado_rendiciones_manuales(uuid) to authenticated;

-- ── BAJA ───────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public._efectivo_soltar_manual(p_rendicion uuid, p_motivo text, p_usr uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.efectivo_rendicion;
  f record;
  s record;
  v_nombre text;
begin
  perform public._efectivo_resolver_filas_manuales();
  select * into r from public.efectivo_rendicion where id = p_rendicion for update;
  if r.id is null then return; end if;
  select estado, error into f from comunicacion.comprobante_fajos where id = r.fajo_id for update;
  if r.fila is null then
    if f.estado = 'confirmado' then
      raise exception 'esa rendición se está escribiendo en Compras ahora mismo: esperá un minuto y volvé a intentar' using errcode = 'P0001';
    end if;
    if f.estado in ('cargado', 'encolado') then
      raise exception 'el gasto ya salió hacia Compras y su fila todavía no volvió al espejo: esperá el próximo sync (minutos) y volvé a intentar' using errcode = 'P0001';
    end if;
    -- reintento · error · abierto · descartado: la fila nunca se escribió. Se descarta el fajo y listo.
    update comunicacion.comprobante_fajos
       set estado = 'descartado', error = left('rendición borrada en la app: ' || coalesce(p_motivo, 'sin motivo'), 500), ultimo_at = now()
     where id = r.fajo_id and estado <> 'descartado';
    delete from public.efectivo_rendicion where id = p_rendicion;
    return;
  end if;
  select fila, sheet_id, estado, anulada into s from public.compra_sheet where fila = r.fila limit 1;
  if s.fila is null then
    raise exception 'la fila % de Compras todavía no está en el espejo: esperá el próximo sync (minutos) y volvé a intentar', r.fila using errcode = 'P0001';
  end if;
  if not coalesce(s.anulada, false) then
    select nombre into v_nombre from public.perfiles where id = p_usr;
    insert into public.compra_obra_cambio
      (fila, clave, sheet_id, pestana, tipo, valor_anterior, valor_nuevo, origen, pedido_por, pedido_por_nombre)
    values
      (s.fila, r.compra_clave, s.sheet_id, 'Compras', 'anular', s.estado, 'Cancelado', 'app', p_usr, v_nombre);
  end if;
  delete from public.efectivo_rendicion where id = p_rendicion;
end $$;
revoke all on function public._efectivo_soltar_manual(uuid, text, uuid) from public;

create or replace function public._efectivo_soltar_rendicion(p_rendicion uuid, p_motivo text, p_usr uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  s record;
  v_nombre text;
begin
  select to_jsonb(x) into r from public.efectivo_rendicion x where x.id = p_rendicion for update;
  if r is null then return; end if;
  -- EL ADELANTO DE SUELDO no tiene fila de Compras: vive en Liquidación, y se saca de ahí.
  if r ->> 'adelanto_persona_id' is not null then
    perform public.quitar_adelanto_rendido(p_rendicion, p_motivo);
    return;
  end if;
  -- LA MANUAL se ata por fila (su clave del espejo es NULL) y puede no tener fila todavía.
  if r ->> 'origen' = 'manual' then
    perform public._efectivo_soltar_manual(p_rendicion, p_motivo, p_usr);
    return;
  end if;
  if coalesce(r ->> 'origen', 'ticket') <> 'ticket' then
    perform public._efectivo_soltar_reimputada(p_rendicion, p_usr, p_motivo);
    return;
  end if;
  select fila, sheet_id, estado, anulada into s from public.compra_sheet where clave = r ->> 'compra_clave' limit 1;
  if s.fila is null then
    raise exception 'la fila de Compras del comprobante % todavía no está en el espejo: esperá el próximo sync (minutos) y volvé a intentar', r ->> 'compra_clave'
      using errcode = 'P0001';
  end if;
  if not coalesce(s.anulada, false) then
    select nombre into v_nombre from public.perfiles where id = p_usr;
    insert into public.compra_obra_cambio
      (fila, clave, sheet_id, pestana, tipo, valor_anterior, valor_nuevo, origen, pedido_por, pedido_por_nombre)
    values
      (s.fila, r ->> 'compra_clave', s.sheet_id, 'Compras', 'anular', s.estado, 'Cancelado', 'app', p_usr, v_nombre);
  end if;
  update public.efectivo_comprobante
     set descartado_en = coalesce(descartado_en, now()),
         descartado_motivo = coalesce(descartado_motivo, 'se canceló su fila de Compras: ' || p_motivo)
   where id = (r ->> 'comprobante_id')::uuid;
  delete from public.efectivo_rendicion where id = p_rendicion;
end $$;

-- ── MODIFICACIÓN ───────────────────────────────────────────────────────────────────────────────────────────
-- Igual que la 20260930T2200 para ticket/reimputada/iniciales; la manual suma: el importe, la fecha y el
-- concepto se corrigen en el propio fajo mientras la fila no se escribió (así Compras nace corregida), y
-- por la cola `detalle` de la fila —buscada por FILA, no por clave— una vez escrita.
create or replace function public.editar_rendicion_efectivo(
  p_rendicion uuid, p_monto numeric, p_entrega uuid, p_fecha date default null, p_concepto text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._efectivo_exigir_administracion();
  r public.efectivo_rendicion;
  s record;
  f record;
  v_concepto text := nullif(btrim(coalesce(p_concepto, '')), '');
  v_nombre text;
  v_celdas jsonb := '{}'::jsonb;
  v_previo jsonb := '{}'::jsonb;
  v_items jsonb;
  v_texto text;
begin
  select * into r from public.efectivo_rendicion where id = p_rendicion for update;
  if r.id is null then raise exception 'esa rendición ya no existe' using errcode = 'P0001'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'el importe tiene que ser mayor que cero' using errcode = 'P0001'; end if;
  if to_jsonb(r) ->> 'adelanto_persona_id' is not null
     and (round(p_monto, 2) <> r.monto or (p_entrega is not null and p_entrega <> r.entrega_id)
          or p_fecha is not null or v_concepto is not null) then
    raise exception 'un adelanto de sueldo está sumado en Liquidación: se corrige quitándolo («Quitar») y cargándolo de nuevo' using errcode = 'P0001';
  end if;
  if p_entrega is not null and p_entrega <> r.entrega_id then
    if r.comprobante_id is not null then
      perform public._efectivo_mover_comprobante(r.comprobante_id, p_entrega);
    else
      if not exists (select 1 from public.efectivo_entrega where id = p_entrega and anulada_en is null) then
        raise exception 'la entrega de destino no existe o está anulada' using errcode = 'P0001';
      end if;
      update public.efectivo_rendicion set entrega_id = p_entrega where id = p_rendicion;
    end if;
  end if;
  update public.efectivo_rendicion set monto = round(p_monto, 2) where id = p_rendicion;

  if r.origen = 'manual' then
    perform public._efectivo_resolver_filas_manuales();
    select fila into r.fila from public.efectivo_rendicion where id = p_rendicion;
    update public.efectivo_rendicion
       set fecha = coalesce(p_fecha, fecha), concepto = coalesce(v_concepto, concepto)
     where id = p_rendicion;
    select r2.fecha, r2.concepto, r2.proveedor into s from public.efectivo_rendicion r2 where r2.id = p_rendicion;
    if r.fila is null then
      select estado, items into f from comunicacion.comprobante_fajos where id = r.fajo_id for update;
      if f.estado = 'confirmado' then
        raise exception 'esa rendición se está escribiendo en Compras ahora mismo: esperá un minuto y volvé a intentar' using errcode = 'P0001';
      end if;
      if f.estado in ('cargado', 'encolado') then
        raise exception 'el gasto ya salió hacia Compras y su fila todavía no volvió al espejo: esperá el próximo sync (minutos) y corregila desde ahí' using errcode = 'P0001';
      end if;
      -- La fila no existe: se corrige el ítem del fajo y, si había fallado, vuelve a la cola.
      v_texto := s.concepto || case when s.proveedor is not null then ' · ' || s.proveedor else '' end || ' · sin comprobante';
      v_items := f.items;
      v_items := jsonb_set(v_items, '{0,comprobante,total}', to_jsonb(round(p_monto, 2)));
      v_items := jsonb_set(v_items, '{0,comprobante,pagado}', to_jsonb(round(p_monto, 2)));
      v_items := jsonb_set(v_items, '{0,comprobante,fecha}', to_jsonb(to_char(s.fecha, 'DD/MM/YYYY')));
      v_items := jsonb_set(v_items, '{0,comprobante,concepto}', to_jsonb(v_texto));
      update comunicacion.comprobante_fajos
         set items = v_items, estado = 'reintento', error = null, proximo_intento_at = now(), ultimo_at = now()
       where id = r.fajo_id;
      return;
    end if;
    if p_fecha is null and v_concepto is null then return; end if;
    select fila, sheet_id, fecha, concepto, anulada into s from public.compra_sheet where fila = r.fila limit 1;
    if s.fila is null then
      raise exception 'la fila % de Compras todavía no está en el espejo: esperá el próximo sync (minutos) y volvé a intentar', r.fila using errcode = 'P0001';
    end if;
  else
    if p_fecha is null and v_concepto is null then return; end if;
    -- Que la fila sea «A rendir» (la escribió el bot, no una persona) lo verifica el worker contra el Sheet vivo.
    select fila, sheet_id, fecha, concepto, anulada into s from public.compra_sheet where clave = r.compra_clave limit 1;
    if s.fila is null then
      raise exception 'la fila de Compras del comprobante % todavía no está en el espejo: esperá el próximo sync (minutos) y volvé a intentar', r.compra_clave
        using errcode = 'P0001';
    end if;
  end if;
  if coalesce(s.anulada, false) then raise exception 'la fila de Compras está cancelada: no se corrige' using errcode = 'P0001'; end if;
  if p_fecha is not null and p_fecha is distinct from s.fecha then
    v_celdas := v_celdas || jsonb_build_object('fecha', p_fecha);
    v_previo := v_previo || jsonb_build_object('fecha', s.fecha);
  end if;
  if v_concepto is not null and v_concepto is distinct from s.concepto then
    v_celdas := v_celdas || jsonb_build_object('concepto', v_concepto);
    v_previo := v_previo || jsonb_build_object('concepto', s.concepto);
  end if;
  if v_celdas = '{}'::jsonb then return; end if;   -- ya decía eso: no se encola un cambio vacío
  -- Dos correcciones pendientes de la misma fila se pisarían en el orden en que el worker las tome.
  if exists (select 1 from public.compra_obra_cambio
              where fila = s.fila and tipo = 'detalle' and estado in ('pendiente', 'procesando')) then
    raise exception 'esa fila ya tiene una corrección esperando al Sheet: esperá a que se aplique' using errcode = 'P0001';
  end if;
  select nombre into v_nombre from public.perfiles where id = v_usr;
  insert into public.compra_obra_cambio
    (fila, clave, sheet_id, pestana, tipo, celdas, previo, valor_anterior, valor_nuevo, origen, pedido_por, pedido_por_nombre)
  values
    (s.fila, r.compra_clave, s.sheet_id, 'Compras', 'detalle', v_celdas, v_previo, v_previo::text, v_celdas::text, 'app', v_usr, v_nombre);
end $$;

-- ── EL SYNC DE COMPRAS TAMBIÉN ATA LAS MANUALES ────────────────────────────────────────────────────────────
create or replace function public.vincular_rendiciones_pendientes()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
  m integer := 0;
  i record;
  v_fila integer;
begin
  -- (0) las manuales cuya fila ya escribió el cargador (20261001T0010).
  m := m + coalesce(public._efectivo_resolver_filas_manuales(), 0);

  -- (a) los tickets del canal Efectivo y de la app: IGUAL que la 20260922T1500.
  insert into efectivo_rendicion (entrega_id, compra_clave, monto, imputada_por, comprobante_id)
  select distinct on (cc.clave) c.entrega_id, cc.clave, round(cc.total::numeric, 2),
         coalesce(c.enviado_por, e.entregada_por), c.id
    from efectivo_comprobante c
    join efectivo_entrega e on e.id = c.entrega_id and e.anulada_en is null
    left join comprobante_entrada ce on ce.id = c.entrada_id
    join comunicacion.comprobantes_cargados cc
      on (c.mm_post_id is not null and cc.plataforma = 'mattermost' and cc.post_id = c.mm_post_id)
      or (ce.id is not null and exists (
            select 1 from comunicacion.comprobante_fajos f
             where f.id = cc.fajo_id and f.plataforma = 'web' and f.channel_id = ce.lote::text))
   where c.descartado_en is null and cc.clave is not null and coalesce(cc.total, 0) > 0
   order by cc.clave, c.enviado_en
  on conflict (compra_clave) do nothing;
  get diagnostics n = row_count;

  -- (b) lo que el bot cargó «A rendir» por las iniciales: ya está escrito así, sólo falta el vínculo.
  for i in
    select ei.id, ei.entrega_id, ei.clave, ei.enviado_por, e.entregada_por, round(cc.total::numeric, 2) as total
      from efectivo_iniciales ei
      join efectivo_entrega e on e.id = ei.entrega_id and e.anulada_en is null
      join lateral (select total from comunicacion.comprobantes_cargados c2
                     where c2.clave = ei.clave and c2.fajo_id = ei.fajo_id order by c2.creado_at desc limit 1) cc on true
     where ei.estado = 'auto' and ei.vinculado_en is null and coalesce(cc.total, 0) > 0
  loop
    insert into efectivo_rendicion (entrega_id, compra_clave, monto, imputada_por, origen, tipo_pago_anterior)
    values (i.entrega_id, i.clave, i.total, coalesce(i.enviado_por, i.entregada_por), 'iniciales', 'Efectivo')
    on conflict (compra_clave) do nothing;
    update efectivo_iniciales set vinculado_en = now() where id = i.id;
    m := m + 1;
  end loop;

  -- (c) los «sí» contestados: la fila se cargó «Efectivo», así que se imputa por la cola de Compras,
  -- cuando el espejo ya la tiene. Aislado: un «sí» que no se puede aplicar queda en `error` con su motivo.
  for i in
    select ei.id, ei.entrega_id, ei.clave, coalesce(ei.respondido_por, ei.enviado_por) as usr
      from efectivo_iniciales ei
     where ei.estado = 'si' and ei.vinculado_en is null and ei.entrega_id is not null
  loop
    select fila into v_fila from compra_sheet where clave = i.clave order by fila limit 1;
    continue when v_fila is null;
    begin
      perform public._efectivo_imputar_fila(i.entrega_id, v_fila, i.clave, i.usr, 'iniciales');
      update efectivo_iniciales set vinculado_en = now() where id = i.id;
      m := m + 1;
    exception when others then
      if sqlerrm not like '%ya tiene un pago esperando%' then
        update efectivo_iniciales set estado = 'error', motivo = sqlerrm where id = i.id;
      end if;
    end;
  end loop;
  return n + m;
end $$;
