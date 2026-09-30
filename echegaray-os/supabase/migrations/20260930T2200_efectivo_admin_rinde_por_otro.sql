-- EFECTIVO · Dirección y Administración rinden, confirman y rehacen el ticket POR OTRA PERSONA (dueño 30/09/2026:
-- «hoy en día no puedo cargarle rendiciones a nadie»).
--
-- POR QUÉ: las cuatro funciones del circuito del teléfono dejaban pasar «quien recibió el efectivo, o
-- `es_administracion()`». `es_administracion()` incluye al Jefe de obra desde el 19/08 (mismo error que
-- corrigieron 20260922T2700 y 20260924T1900 en la lectura y en la gestión): un Jefe podía cargar un gasto en la
-- caja de cualquier persona. La regla correcta es la de la gestión del efectivo: Dirección y Administración
-- (`ve_economia()`), o la propia persona. La pantalla no tenía además ninguna puerta para usar ese permiso.
--
-- El cuerpo de cada función es el vigente, letra por letra, salvo la condición de la persona.
-- Los archivos siguen subiéndose a la carpeta de QUIEN CARGA (`auth.uid()/rendicion`): la policy de storage no
-- se toca, y `enviado_por` del comprobante queda con quien lo cargó: esa es la huella de «cargado por
-- Administración a nombre de X».

create or replace function public._efectivo_actua_por(p_persona uuid) returns boolean
language sql stable security definer set search_path = public as $$
  -- coalesce: con `mi_persona_id()` NULL (un usuario sin persona) la comparación da NULL, `NULL or false` da NULL y
  -- `if not NULL` no levanta la excepción: la puerta quedaba ABIERTA justo para quien no tiene persona.
  select coalesce(p_persona = public.mi_persona_id(), false) or coalesce(public.ve_economia(), false)
$$;
revoke all on function public._efectivo_actua_por(uuid) from public, anon;
grant execute on function public._efectivo_actua_por(uuid) to authenticated;

create or replace function public.rendir_comprobante(
  p_entrega uuid, p_storage_path text, p_nombre text, p_media_type text, p_bytes bigint, p_lote uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare e efectivo_entrega; v_entrada uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  select * into e from efectivo_entrega where id = p_entrega;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
  if not public._efectivo_actua_por(e.persona_id) then
    raise exception 'sólo rinde quien recibió el efectivo, o Dirección/Administración' using errcode = '42501';
  end if;
  if e.anulada_en is not null or e.cerrada_en is not null then
    raise exception '% está %: no recibe comprobantes', e.codigo, case when e.anulada_en is not null then 'anulada' else 'cerrada' end using errcode = 'P0001';
  end if;
  if split_part(p_storage_path, '/', 1) <> auth.uid()::text or split_part(p_storage_path, '/', 2) <> 'rendicion' then
    raise exception 'el archivo tiene que estar en tu carpeta de rendiciones' using errcode = '42501';
  end if;
  insert into comprobante_entrada (origen, storage_path, lote, nombre_archivo, media_type, bytes, subido_por)
  values ('rendicion', p_storage_path, coalesce(p_lote, gen_random_uuid()), p_nombre, p_media_type, p_bytes, auth.uid())
  returning id into v_entrada;
  insert into efectivo_comprobante (entrega_id, entrada_id, canal, enviado_por)
  values (p_entrega, v_entrada, 'app', auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.responder_observacion_rendicion(p_comprobante uuid, p_dato text) returns void
language plpgsql security definer set search_path = public as $$
declare c efectivo_comprobante; v_persona uuid;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  select * into c from efectivo_comprobante where id = p_comprobante for update;
  if c.id is null then raise exception 'el comprobante no existe' using errcode = 'P0001'; end if;
  select persona_id into v_persona from efectivo_entrega where id = c.entrega_id;
  if not public._efectivo_actua_por(v_persona) then
    raise exception 'contesta quien mandó el ticket, o Dirección/Administración' using errcode = '42501';
  end if;
  if nullif(trim(p_dato), '') is null then raise exception 'falta el dato' using errcode = 'P0001'; end if;
  update efectivo_comprobante set respuesta = trim(p_dato), respondido_en = now() where id = p_comprobante;
end $$;

create or replace function public.confirmar_lectura_rendicion(p_comprobante uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c efectivo_comprobante; e efectivo_entrega;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  select * into c from efectivo_comprobante where id = p_comprobante for update;
  if c.id is null then raise exception 'ese ticket no existe' using errcode = 'P0001'; end if;
  select * into e from efectivo_entrega where id = c.entrega_id;
  if not public._efectivo_actua_por(e.persona_id) then
    raise exception 'lo que se leyó lo confirma quien mandó el ticket' using errcode = '42501';
  end if;
  if c.descartado_en is not null then raise exception 'ese ticket está descartado' using errcode = 'P0001'; end if;
  if c.confirmado_en is not null then return; end if;   -- idempotente: dos toques no son dos tickets
  update efectivo_comprobante set confirmado_en = now(), confirmado_por = auth.uid() where id = p_comprobante;
  update comprobante_entrada
     set estado = 'pendiente', motivo = null, tomado_at = null, cerrado_at = null
   where id = c.entrada_id and estado = 'en_espera';
end $$;

create or replace function public.rehacer_foto_rendicion(p_comprobante uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c efectivo_comprobante; e efectivo_entrega; v_rendida int;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  select * into c from efectivo_comprobante where id = p_comprobante for update;
  if c.id is null then raise exception 'ese ticket no existe' using errcode = 'P0001'; end if;
  select * into e from efectivo_entrega where id = c.entrega_id;
  if not public._efectivo_actua_por(e.persona_id) then
    raise exception 'la foto la vuelve a sacar quien mandó el ticket' using errcode = '42501';
  end if;
  select count(*) into v_rendida from efectivo_rendicion where comprobante_id = p_comprobante;
  if v_rendida > 0 then
    raise exception 'ese ticket ya entró a Compras: pedile a Administración que lo corrija' using errcode = 'P0001';
  end if;
  if c.descartado_en is not null then return; end if;
  update efectivo_comprobante
     set descartado_en = now(), descartado_motivo = 'la persona la sacó de nuevo', rehecho_en = now()
   where id = p_comprobante;
  update comprobante_entrada
     set estado = 'rechazado', motivo = 'la persona sacó la foto de nuevo', cerrado_at = now()
   where id = c.entrada_id and estado in ('pendiente', 'en_espera', 'error');
end $$;

-- ═══ LA FOTO DE OTRA PERSONA SE VE (dueño 30/09: «editar por completo») ═════════════════════════════
-- Hasta acá sólo leía `<uid>/rendicion/…` el que subió la foto; Administración y Dirección, que cargan y
-- corrigen por otro, recibían «No pude abrir la foto». `comprobantes_lee_administracion` (20260926T0001) ya
-- cubre el bucket entero para ve_economia(), pero depender de que esa migración esté aplicada y de que nadie
-- la acote después es frágil: esta política es propia de las rendiciones y dice lo mismo acotado a la carpeta
-- `rendicion`, al lado de la escritura por otro que la necesita. El Jefe de obra NO entra: ve_economia() lo
-- excluye, igual que en la escritura.
drop policy if exists comprobantes_lee_rendicion_economia on storage.objects;
create policy comprobantes_lee_rendicion_economia on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes' and (storage.foldername(name))[2] = 'rendicion' and (select public.ve_economia()));

-- ═══ EDITAR FECHA Y CONCEPTO DE UNA RENDICIÓN: viajan a la fila de Compras por la cola ══════════════
-- Un tipo nuevo de cambio, `detalle`: sus valores nuevos viven en `celdas` ({fecha, concepto}) y los de antes
-- en `previo`. El worker (bisturí `bisturi-compras-detalle`) escribe SÓLO «Fecha factura» y «Concepto» de esa
-- fila y sólo si es «A rendir» (la escribió el bot, no una persona).
--
-- EL PROVEEDOR NO SE EDITA ACÁ, y no es un olvido: la clave de la fila (`compra_clave`) es el CUIT que la
-- pestaña deduce del Proveedor (o el Proveedor mismo si no hay CUIT). Cambiarlo cambia la clave, y la
-- rendición quedaría apuntando a una fila que ya no existe con esa clave: el ticket dejaría de rendir. El
-- importe tampoco: «La fila de Compras no cambia» sigue valiendo para el monto que rinde la entrega.
alter table public.compra_obra_cambio drop constraint if exists compra_obra_cambio_tipo_chk;
alter table public.compra_obra_cambio add constraint compra_obra_cambio_tipo_chk
  check (tipo in ('obra', 'pago', 'anular', 'detalle'));
alter table public.compra_obra_cambio drop constraint if exists compra_obra_cambio_detalle_con_celdas;
alter table public.compra_obra_cambio add constraint compra_obra_cambio_detalle_con_celdas
  check (tipo <> 'detalle' or (jsonb_typeof(celdas) = 'object' and celdas <> '{}'::jsonb));
comment on column public.compra_obra_cambio.tipo is
  'obra = la celda Obra. pago = celdas de los tramos de pago (celdas, array). anular = Estado ← Cancelado de una '
  'fila que escribió una rendición. detalle = Fecha factura y/o Concepto de una fila A rendir (celdas, objeto).';

-- Se reemplaza la firma de tres parámetros por la de cinco: dejar las dos haría ambigua la llamada por nombre.
drop function if exists public.editar_rendicion_efectivo(uuid, numeric, uuid);
create or replace function public.editar_rendicion_efectivo(
  p_rendicion uuid, p_monto numeric, p_entrega uuid, p_fecha date default null, p_concepto text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._efectivo_exigir_administracion();
  r public.efectivo_rendicion;
  s record;
  v_concepto text := nullif(btrim(coalesce(p_concepto, '')), '');
  v_nombre text;
  v_celdas jsonb := '{}'::jsonb;
  v_previo jsonb := '{}'::jsonb;
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

  if p_fecha is null and v_concepto is null then return; end if;
  -- Que la fila sea «A rendir» (la escribió el bot, no una persona) lo verifica el worker contra el Sheet vivo.
  select fila, sheet_id, fecha, concepto, anulada into s from public.compra_sheet where clave = r.compra_clave limit 1;
  if s.fila is null then
    raise exception 'la fila de Compras del comprobante % todavía no está en el espejo: esperá el próximo sync (minutos) y volvé a intentar', r.compra_clave
      using errcode = 'P0001';
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
comment on function public.editar_rendicion_efectivo(uuid, numeric, uuid, date, text) is
  'Administración corrige cuánto rinde una fila de Compras, a qué entrega y su fecha y concepto (estos dos viajan '
  'al Sheet por la cola, tipo detalle). El proveedor no: es parte de la clave de la fila.';
revoke all on function public.editar_rendicion_efectivo(uuid, numeric, uuid, date, text) from public, anon;
grant execute on function public.editar_rendicion_efectivo(uuid, numeric, uuid, date, text) to authenticated;

notify pgrst, 'reload schema';
