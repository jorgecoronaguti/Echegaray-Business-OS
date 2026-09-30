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
